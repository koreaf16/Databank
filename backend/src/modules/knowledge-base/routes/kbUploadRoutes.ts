/**
 * 파일: backend/src/modules/knowledge-base/routes/kbUploadRoutes.ts
 * 역할: 파일 업로드 HTTP 라우트.
 *       POST /api/kb/upload          — 단일 파일 (docId 필요)
 *       POST /api/kb/upload/multi    — 다중 파일 (docIds 또는 categoryId로 자동생성)
 *       GET  /api/kb/probe-url       — URL HTML에서 파일 링크 목록 추출
 *       POST /api/kb/register-urls   — URL 목록 다운로드 → 문서 자동생성 → 인덱싱
 *       GET  /api/kb/files/:fileId/download — 원본 다운로드
 *       GET  /api/kb/files/:docId/list      — 문서별 파일 목록
 */

import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { asyncHandler } from '../../../http/asyncHandler.js';
import { ok, created } from '../../../http/apiResponse.js';
import { requireOracle } from '../../../http/errorHandler.js';
import { withOracleTransaction } from '../../../infra/oracle/withTransaction.js';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { validationError } from '../../../infra/oracle/helpers.js';
import { env } from '../../../config/env.js';
import { createDocument } from '../repository/kbDocumentRepository.js';
import {
  insertFile,
  listFilesByDoc,
  findFileById,
  findFileByNameAndSha256,
} from '../repository/kbFileRepository.js';
import { enqueueJob } from '../repository/kbJobRepository.js';
import { writeBlob, readBlob } from '../services/storage/lobStorage.js';

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'text/plain',
  'text/markdown',
]);

const ALLOWED_EXTS = new Set([
  '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.md',
]);

const MAX_BYTES = env.KB_MAX_FILE_SIZE_MB * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 50 },
});

export const kbUploadRouter = Router();

async function validateFile(buffer: Buffer, originalName: string) {
  const detected = await fileTypeFromBuffer(buffer);
  const mime = detected?.mime ?? 'application/octet-stream';
  const extMatch = originalName.toLowerCase().match(/\.[^.]+$/);
  const ext = extMatch ? extMatch[0] : '';
  if (!ALLOWED_EXTS.has(ext) && !ALLOWED_MIMES.has(mime)) {
    throw validationError(`허용되지 않는 파일 형식입니다: ${ext || mime}`);
  }
  return { mimeType: mime, ext };
}

async function sha256hex(buffer: Buffer): Promise<string> {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ── GET /probe-url ─────────────────────────────────────────────────────────────
// URL HTML에서 PDF/DOCX 등 다운로드 가능한 파일 링크 목록을 추출해 반환한다.

kbUploadRouter.get('/probe-url', asyncHandler(async (req, res) => {
  const url = String(req.query.url ?? '').trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'http:// 또는 https://로 시작하는 주소를 입력하세요' } });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html,*/*' },
    });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    const base = new URL(url);
    const seen = new Set<string>();
    const links: Array<{ href: string; name: string; ext: string }> = [];
    const FILE_RE = /href=["']([^"'#?]*\.(pdf|docx?|xlsx?|pptx?|txt|md))(\?[^"']*)?["']/gi;
    for (const m of html.matchAll(FILE_RE)) {
      try {
        const href = new URL(m[1], base).href;
        if (!seen.has(href)) {
          seen.add(href);
          const name = decodeURIComponent(href.split('/').pop()?.split('?')[0] ?? 'file');
          links.push({ href, name, ext: (m[2] ?? '').toLowerCase() });
        }
      } catch { /* invalid URL */ }
    }
    ok(res, links, undefined);
  } catch (err: any) {
    clearTimeout(timer);
    return res.status(502).json({
      ok: false,
      error: {
        code: err.name === 'AbortError' ? 'TIMEOUT' : 'PROBE_FAILED',
        message: err.name === 'AbortError' ? '응답 없음 (10초 초과)' : `연결 실패: ${err.message}`,
      },
    });
  }
}));

// ── POST /register-urls ────────────────────────────────────────────────────────
// URL 목록을 download_url 잡으로 큐잉하고 즉시 응답한다.
// 실제 다운로드·파싱·청킹·임베딩은 jobWorker가 담당한다.

kbUploadRouter.post('/register-urls', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const { urls, categoryId: catIdRaw, tags: tagsRaw, docType: docTypeRaw, productId: productIdRaw, productName: productNameRaw, versions: versionsRaw, vendor: vendorRaw, osPlatform: osPlatformRaw, versionRange: versionRangeRaw } = req.body ?? {};
  if (!Array.isArray(urls) || urls.length === 0) {
    throw validationError('urls 파라미터가 필요합니다');
  }
  const catId = String(catIdRaw ?? '').trim();
  const tags = String(tagsRaw ?? '').split(',').map((t: string) => t.trim()).filter(Boolean);
  const docType = String(docTypeRaw || 'vendor_manual');
  const productId = String(productIdRaw || '').trim() || undefined;
  const productName = String(productNameRaw || '').trim() || undefined;
  const productVersions: string[] = Array.isArray(versionsRaw) ? versionsRaw : typeof versionsRaw === 'string' && versionsRaw ? versionsRaw.split(',').map((v: string) => v.trim()).filter(Boolean) : [];
  const vendor = String(vendorRaw || '').trim() || undefined;
  const osPlatform = String(osPlatformRaw || '').trim() || undefined;
  const versionRange = String(versionRangeRaw || '').trim() || undefined;

  const results: Array<{ url: string; name: string; jobId: string }> = [];

  await withOracleTransaction(async (conn) => {
    for (const fileUrl of urls) {
      const name = decodeURIComponent(String(fileUrl).split('/').pop()?.split('?')[0] ?? 'file');
      const jobId = await enqueueJob(conn, 'download_url', null, {
        url: fileUrl,
        categoryId: catId || undefined,
        docType,
        productId,
        productName,
        productVersions,
        tags,
        vendor,
        osPlatform,
        versionRange,
      });
      results.push({ url: fileUrl, name, jobId });
    }
  });

  ok(res, { count: results.length, results, jobIds: results.map(r => r.jobId) }, undefined);
}));

// ── POST /upload (단일) ───────────────────────────────────────────────────────

kbUploadRouter.post(
  '/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!requireOracle(res)) return;
    const file = (req as any).file;
    if (!file) throw validationError('파일이 없습니다');
    const { docId } = req.body ?? {};
    if (!docId) throw validationError('docId 파라미터가 필요합니다');
    const { mimeType } = await validateFile(file.buffer, file.originalname);
    const sha = await sha256hex(file.buffer);

    const existing = await withOracleConnection((conn) => findFileByNameAndSha256(conn, file.originalname, sha));
    if (existing) {
      return res.status(409).json({
        ok: false,
        error: {
          code: 'DUPLICATE_FILE',
          message: `동일한 파일이 이미 등록되어 있습니다 (문서 ID: ${existing.docId}, 파일명: ${existing.fileName})`,
          existing: { fileId: existing.id, docId: existing.docId, fileName: existing.fileName },
        },
      });
    }

    const { fileId, jobId } = await withOracleTransaction(async (conn) => {
      const fid = await insertFile(conn, { docId, fileName: file.originalname, mimeType, sizeBytes: file.buffer.length, sha256: sha });
      await writeBlob(conn, fid, file.buffer);
      const jid = await enqueueJob(conn, 'parse', docId, { fileId: fid, docId, fileName: file.originalname, mimeType });
      return { fileId: fid, jobId: jid };
    });

    created(res, { fileId, jobId, fileName: file.originalname, sizeBytes: file.buffer.length });
  }),
);

// ── POST /upload/multi (다중) ─────────────────────────────────────────────────
// docIds 있으면 기존 문서에 파일 첨부. 없으면 categoryId로 문서 자동 생성.

kbUploadRouter.post(
  '/upload/multi',
  upload.array('files', 50),
  asyncHandler(async (req, res) => {
    if (!requireOracle(res)) return;
    const files = (req as any).files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) throw validationError('파일이 없습니다');

    const { docIds: docIdsRaw, categoryId: catIdRaw, tags: tagsRaw, docType: docTypeRaw, productId: productIdRaw, productName: productNameRaw, versions: versionsRaw, vendor: vendorRaw, osPlatform: osPlatformRaw, versionRange: versionRangeRaw } = req.body ?? {};
    const docIds: string[] = (() => {
      try {
        const parsed = JSON.parse(docIdsRaw ?? '[]');
        if (Array.isArray(parsed)) return parsed;
      } catch { /* skip */ }
      const single = String(docIdsRaw ?? '').trim();
      return single ? Array(files.length).fill(single) : [];
    })();

    const results: Array<{ fileName: string; docId: string; fileId: string; jobId: string }> = [];
    const duplicates: Array<{ fileName: string; existingDocId: string; existingFileId: string }> = [];

    if (docIds.length === 0) {
      // 자동 생성 모드: categoryId로 파일마다 문서 생성
      const catId = String(catIdRaw ?? '').trim();
      if (!catId) throw validationError('docIds 또는 categoryId 파라미터가 필요합니다');
      const tags = String(tagsRaw ?? '').split(',').map((t: string) => t.trim()).filter(Boolean);
      const fileDocType = String(docTypeRaw || 'vendor_manual');
      const fileProductId = String(productIdRaw || '').trim() || undefined;
      const fileProductName = String(productNameRaw || '').trim() || undefined;
      const fileVendor = String(vendorRaw || '').trim() || undefined;
      const fileOsPlatform = String(osPlatformRaw || '').trim() || undefined;
      const fileVersionRange = String(versionRangeRaw || '').trim() || undefined;
      const fileVersionsRaw = versionsRaw;
      const fileProductVersions: string[] = Array.isArray(fileVersionsRaw) ? fileVersionsRaw : typeof fileVersionsRaw === 'string' && fileVersionsRaw ? fileVersionsRaw.split(',').map((v: string) => v.trim()).filter(Boolean) : [];

      for (const f of files) {
        const { mimeType } = await validateFile(f.buffer, f.originalname);
        const sha = await sha256hex(f.buffer);
        const dup = await withOracleConnection((conn) => findFileByNameAndSha256(conn, f.originalname, sha));
        if (dup) {
          duplicates.push({ fileName: f.originalname, existingDocId: dup.docId, existingFileId: dup.id });
          continue;
        }
        const { docId, fileId, jobId } = await withOracleTransaction(async (conn) => {
          const doc = await createDocument(conn, {
            title: f.originalname.replace(/\.[^.]+$/, ''),
            categoryId: catId,
            docType: fileDocType,
            productId: fileProductId,
            productName: fileProductName,
            productVersions: fileProductVersions.length ? fileProductVersions : undefined,
            vendor: fileVendor,
            osPlatform: fileOsPlatform,
            versionRange: fileVersionRange,
            tags,
            status: 'indexing',
            source: { type: 'file', url: '' },
          });
          const fid = await insertFile(conn, { docId: doc.id, fileName: f.originalname, mimeType, sizeBytes: f.buffer.length, sha256: sha });
          await writeBlob(conn, fid, f.buffer);
          const jid = await enqueueJob(conn, 'parse', doc.id, { fileId: fid, docId: doc.id, fileName: f.originalname, mimeType });
          return { docId: doc.id, fileId: fid, jobId: jid };
        });
        results.push({ fileName: f.originalname, docId, fileId, jobId });
      }
    } else {
      // 기존 문서에 파일 첨부
      if (docIds.length !== 1 && docIds.length !== files.length) {
        throw validationError('docIds 수가 파일 수와 맞지 않습니다');
      }
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const docId = docIds.length === 1 ? docIds[0] : docIds[i];
        const { mimeType } = await validateFile(f.buffer, f.originalname);
        const sha = await sha256hex(f.buffer);
        const dup = await withOracleConnection((conn) => findFileByNameAndSha256(conn, f.originalname, sha));
        if (dup) {
          duplicates.push({ fileName: f.originalname, existingDocId: dup.docId, existingFileId: dup.id });
          continue;
        }
        const { fileId, jobId } = await withOracleTransaction(async (conn) => {
          const fid = await insertFile(conn, { docId, fileName: f.originalname, mimeType, sizeBytes: f.buffer.length, sha256: sha });
          await writeBlob(conn, fid, f.buffer);
          const jid = await enqueueJob(conn, 'parse', docId, { fileId: fid, docId, fileName: f.originalname, mimeType });
          return { fileId: fid, jobId: jid };
        });
        results.push({ fileName: f.originalname, docId, fileId, jobId });
      }
    }

    ok(res, { count: results.length, files: results, jobIds: results.map(r => r.jobId), duplicates }, undefined);
  }),
);

// ── GET /files/:fileId/download ───────────────────────────────────────────────

kbUploadRouter.get('/files/:fileId/download', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const { meta, buffer } = await withOracleConnection(async (conn) => {
    const m = await findFileById(conn, req.params.fileId);
    const b = await readBlob(conn, req.params.fileId);
    return { meta: m, buffer: b };
  });
  if (!buffer) {
    res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '파일을 찾을 수 없습니다' } });
    return;
  }
  res.set({
    'Content-Type': meta.mimeType ?? 'application/octet-stream',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`,
    'Content-Length': String(buffer.length),
  });
  res.end(buffer);
}));

// ── GET /files/:docId/list ────────────────────────────────────────────────────

kbUploadRouter.get('/files/:docId/list', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const rows = await withOracleConnection(conn => listFilesByDoc(conn, req.params.docId));
  ok(res, rows, undefined);
}));
