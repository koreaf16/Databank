/**
 * 파일: backend/src/modules/knowledge-base/services/jobs/jobHandlers.ts
 * 역할: 잡 KIND별 처리 로직. parse/chunk/embed/reindex 핸들러.
 *       각 핸들러는 connection을 받아 작업 후 commit하지 않음(워커 책임).
 *
 * 연관 파일:
 *   - services/parsers/parserRegistry.ts   : getParser
 *   - services/chunker/structuralChunker   : splitByHeadings
 *   - services/chunker/tokenChunker        : toFinalChunks
 *   - services/embedder/batchEmbedder      : embedAndSaveChunks
 *   - repository/kbChunkRepository.ts      : insertChunks, deleteChunksByDoc
 *   - repository/kbFileRepository.ts       : markExtracted
 *   - repository/kbJobRepository.ts        : enqueueJob, updateProgress, markDone, markFailed
 *   - services/storage/lobStorage.ts       : readBlob
 */

import crypto from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { getParser } from '../parsers/parserRegistry.js';
// 파서 등록을 위한 side-effect import
import '../parsers/pdfParser.js';
import '../parsers/docxParser.js';
import '../parsers/xlsxParser.js';
import '../parsers/textParser.js';

import { splitByHeadings } from '../chunker/structuralChunker.js';
import { toFinalChunks } from '../chunker/tokenChunker.js';
import { embedAndSaveChunks } from '../embedder/batchEmbedder.js';
import { readBlob, writeBlob } from '../storage/lobStorage.js';
import { markExtracted, insertFile, findFileByNameAndSha256 } from '../../repository/kbFileRepository.js';
import {
  insertChunks,
  deleteChunksByDoc,
  countChunksByDoc,
  countEmbeddedChunksByDoc,
  listChunksByDoc,
} from '../../repository/kbChunkRepository.js';
import {
  enqueueJob,
  updateProgress,
} from '../../repository/kbJobRepository.js';
import type { JobRecord } from '../../repository/kbJobRepository.js';
import { createDocument, updateDocumentProgress } from '../../repository/kbDocumentRepository.js';
import { env } from '../../../../config/env.js';

// ── parse 핸들러 ──────────────────────────────────────────────────────────────

/**
 * 원본 파일을 읽어 텍스트를 추출하고, chunk 잡을 이어서 enqueue한다.
 */
export async function handleParse(connection: any, job: JobRecord): Promise<void> {
  const payload = JSON.parse(job.payloadJson ?? '{}');
  const { fileId, docId, mimeType } = payload as {
    fileId: string;
    docId: string;
    mimeType: string;
    fileName: string;
  };

  await updateProgress(connection, job.id, 10, 'reading_blob');
  await updateDocumentProgress(connection, docId, 'running', 5, 'parsing', '파일 읽는 중');

  const buffer = await readBlob(connection, fileId);
  if (!buffer) throw new Error(`BLOB을 찾을 수 없습니다 (fileId: ${fileId})`);

  await updateProgress(connection, job.id, 30, 'parsing');
  await updateDocumentProgress(connection, docId, 'running', 15, 'parsing', '텍스트 추출 중');

  const parser = getParser(mimeType ?? 'application/octet-stream');
  if (!parser) throw new Error(`지원하지 않는 MIME 타입: ${mimeType}`);

  const parsed = await parser.parse(buffer, payload.fileName ?? 'file');

  await updateProgress(connection, job.id, 70, 'saving_preview');
  await updateDocumentProgress(connection, docId, 'running', 25, 'parsed', '청킹 준비 중');

  const preview = parsed.text.slice(0, 500);
  await markExtracted(connection, fileId, parsed.pageCount ?? null, parser.constructor.name || 'parser', preview);

  await updateProgress(connection, job.id, 90, 'enqueue_chunk');

  await enqueueJob(connection, 'chunk', docId, {
    fileId,
    docId,
    blocks: parsed.blocks,
    pageCount: parsed.pageCount,
    mimeType,
  });
}

// ── chunk 핸들러 ──────────────────────────────────────────────────────────────

/**
 * ParseResult 블록을 청크로 분할하고 DB에 insert. 이후 embed 잡 enqueue.
 */
export async function handleChunk(connection: any, job: JobRecord): Promise<void> {
  const payload = JSON.parse(job.payloadJson ?? '{}');
  const { fileId, docId, blocks, pageCount } = payload as {
    fileId: string;
    docId: string;
    parsedText: string;
    blocks: any[];
    pageCount?: number;
    mimeType: string;
  };

  await updateProgress(connection, job.id, 10, 'splitting');
  await updateDocumentProgress(connection, docId, 'running', 30, 'chunking', '청크 분할 중');

  await deleteChunksByDoc(connection, docId);

  const rawChunks = splitByHeadings({ text: '', blocks: blocks ?? [], meta: {} });
  const finalChunks = toFinalChunks(rawChunks);

  await updateProgress(connection, job.id, 40, 'inserting_chunks');

  const chunkIds = await insertChunks(
    connection,
    finalChunks.map((fc, i) => ({
      docId,
      fileId: fileId ?? null,
      ordinal: i,
      headingPath: fc.headingPath || null,
      pageFrom: fc.pageFrom,
      pageTo: fc.pageTo,
      tokenCount: fc.tokenCount,
      contentText: fc.contentText,
    })),
  );

  await updateProgress(connection, job.id, 80, 'enqueue_embed');
  await updateDocumentProgress(connection, docId, 'running', 55, 'chunked', '임베딩 대기 중');

  await enqueueJob(connection, 'embed', docId, { docId, chunkIds });

  await updateProgress(connection, job.id, 100, 'done');
}

// ── embed 핸들러 ─────────────────────────────────────────────────────────────

/**
 * docId의 임베딩 없는 청크에 벡터를 계산하고 저장한다.
 */
export async function handleEmbed(connection: any, job: JobRecord): Promise<void> {
  const payload = JSON.parse(job.payloadJson ?? '{}');
  const { docId } = payload as { docId: string; chunkIds?: string[] };

  const chunks = await listChunksByDoc(connection, docId);

  if (chunks.length === 0) {
    await updateProgress(connection, job.id, 100, 'done');
    await updateDocumentProgress(connection, docId, 'done', 100, 'done', '인덱싱 완료');
    return;
  }

  await updateDocumentProgress(connection, docId, 'running', 60, 'embedding', '임베딩 계산 중');

  // 임베딩 진행률: 60→100%
  await embedAndSaveChunks(
    connection,
    job.id,
    chunks.map((c) => ({ id: c.id, contentText: c.contentText, contextPrefix: c.contextPrefix })),
    60,
    100,
  );

  const totalCount = await countChunksByDoc(connection, docId);
  const embedCount = await countEmbeddedChunksByDoc(connection, docId);

  if (totalCount > embedCount) {
    throw new Error(`임베딩 누락 발생: 전체 ${totalCount}개 중 ${embedCount}개만 완료됨`);
  }

  await connection.execute(
    `UPDATE KB_DOCUMENTS
     SET VECTORS = :ecnt, CHUNKS = :tcnt, STATUS = 'active',
         EMBEDDING_MODEL_USED = :emodel,
         INDEX_STATUS = 'done', INDEX_PROGRESS = 100,
         INDEX_STAGE = 'done', INDEX_MESSAGE = '인덱싱 완료',
         INDEX_UPDATED_AT = TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
     WHERE DOC_ID = :did`,
    { ecnt: embedCount, tcnt: totalCount, emodel: env.KB_EMBED_MODEL, did: docId },
    { autoCommit: false },
  );
}

// ── reindex 핸들러 ───────────────────────────────────────────────────────────

export async function handleReindex(connection: any, job: JobRecord): Promise<void> {
  const payload = JSON.parse(job.payloadJson ?? '{}');
  const { fileId, docId, mimeType } = payload;
  
  // 데이터 중복 방지: 재인덱싱 시작 전 기존 청크 삭제
  await deleteChunksByDoc(connection, docId);
  
  // reindex = parse → chunk → embed 순서로 재실행
  await handleParse(connection, { ...job, payloadJson: JSON.stringify({ fileId, docId, mimeType }) });
}

// ── download_url 핸들러 ──────────────────────────────────────────────────────

/**
 * URL에서 파일을 다운로드하고 파싱·청킹·임베딩까지 한 잡에서 처리한다.
 * register-urls 라우트가 즉시 응답하기 위해 이 핸들러로 실제 작업을 위임한다.
 */
export async function handleDownloadUrl(connection: any, job: JobRecord): Promise<void> {
  const { url, categoryId, docType, productId, productName, productVersions, tags, vendor, osPlatform, versionRange } = JSON.parse(job.payloadJson ?? '{}');
  const name = decodeURIComponent(String(url).split('/').pop()?.split('?')[0] ?? 'file');

  // 1. 다운로드
  await updateProgress(connection, job.id, 5, 'downloading');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let buf: Buffer;
  try {
    const resp = await fetch(String(url), { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    buf = Buffer.from(await resp.arrayBuffer());
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }

  // 2. 파일 유형 검사 및 해시
  await updateProgress(connection, job.id, 20, 'validating');
  const MAX_BYTES = env.KB_MAX_FILE_SIZE_MB * 1024 * 1024;
  if (buf.length > MAX_BYTES) throw new Error(`파일이 너무 큽니다 (최대 ${env.KB_MAX_FILE_SIZE_MB}MB)`);
  const detected = await fileTypeFromBuffer(buf);
  const mimeType = detected?.mime ?? 'application/octet-stream';
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

  const dupFile = await findFileByNameAndSha256(connection, name, sha256);
  if (dupFile && dupFile.docId !== job.docId) {
    throw new Error(`동일한 파일이 이미 등록되어 있습니다 (문서 ID: ${dupFile.docId}, 파일명: ${dupFile.fileName})`);
  }

  // 3. 문서 + 파일 저장
  await updateProgress(connection, job.id, 30, 'saving');
  const tagList: string[] = Array.isArray(tags) ? tags : String(tags ?? '').split(',').map((t: string) => t.trim()).filter(Boolean);
  const verList: string[] = Array.isArray(productVersions) ? productVersions : [];
  
  let docId = job.docId;
  if (!docId) {
    const doc = await createDocument(connection, {
      title: name.replace(/\.[^.]+$/, ''),
      categoryId,
      docType: docType || 'vendor_manual',
      productId: productId || undefined,
      productName: productName || undefined,
      productVersions: verList.length ? verList : undefined,
      vendor: vendor || undefined,
      osPlatform: osPlatform || undefined,
      versionRange: versionRange || undefined,
      tags: tagList,
      status: 'indexing',
      source: { type: 'url', url },
    });
    docId = doc.id;
    // 재시도 시 인지할 수 있도록 잡 레코드에 docId 기록 (커밋은 jobWorker에서 수행)
    await connection.execute(
      `UPDATE KB_INDEX_JOBS SET DOC_ID = :did WHERE JOB_ID = :jid`,
      { did: docId, jid: job.id },
      { autoCommit: false }
    );
  }

  let fid: string;
  if (dupFile && dupFile.docId === docId) {
    fid = dupFile.id;
  } else {
    fid = await insertFile(connection, { docId: docId as string, fileName: name, mimeType, sizeBytes: buf.length, sha256 });
    await writeBlob(connection, fid, buf);
  }
  
  await updateDocumentProgress(connection, docId as string, 'running', 30, 'saving', '문서 저장 중');

  // 4. 파싱
  await updateProgress(connection, job.id, 40, 'parsing');
  await updateDocumentProgress(connection, docId as string, 'running', 40, 'parsing', '텍스트 추출 중');
  const parser = getParser(mimeType);
  if (!parser) throw new Error(`지원하지 않는 MIME 타입: ${mimeType}`);
  const parsed = await parser.parse(buf, name);
  await markExtracted(connection, fid, parsed.pageCount ?? null, 'parser', parsed.text.slice(0, 500));

  // 5. 청킹
  await updateProgress(connection, job.id, 60, 'chunking');
  await updateDocumentProgress(connection, docId as string, 'running', 60, 'chunking', '청크 분할 중');
  await deleteChunksByDoc(connection, docId as string);
  const rawChunks = splitByHeadings({ text: '', blocks: parsed.blocks ?? [], meta: {} });
  const finalChunks = toFinalChunks(rawChunks);
  await insertChunks(connection, finalChunks.map((fc, i) => ({
    docId: docId as string,
    fileId: fid,
    ordinal: i,
    headingPath: fc.headingPath || null,
    pageFrom: fc.pageFrom,
    pageTo: fc.pageTo,
    tokenCount: fc.tokenCount,
    contentText: fc.contentText,
  })));

  // 6. 임베딩 — 75→100% 범위로 스케일
  await updateProgress(connection, job.id, 75, 'embedding');
  await updateDocumentProgress(connection, docId as string, 'running', 75, 'embedding', '임베딩 계산 중');
  const chunks = await listChunksByDoc(connection, docId as string);
  if (chunks.length > 0) {
    await embedAndSaveChunks(
      connection,
      job.id,
      chunks.map(c => ({ id: c.id, contentText: c.contentText, contextPrefix: c.contextPrefix })),
      75,
      100,
    );
  }

  // 7. 문서 상태 완료 처리
  const totalCount = await countChunksByDoc(connection, docId as string);
  const embedCount = await countEmbeddedChunksByDoc(connection, docId as string);

  if (totalCount > embedCount) {
    throw new Error(`임베딩 누락 발생: 전체 ${totalCount}개 중 ${embedCount}개만 완료됨`);
  }

  await connection.execute(
    `UPDATE KB_DOCUMENTS
     SET VECTORS = :ecnt, CHUNKS = :tcnt, STATUS = 'active',
         EMBEDDING_MODEL_USED = :emodel,
         INDEX_STATUS = 'done', INDEX_PROGRESS = 100,
         INDEX_STAGE = 'done', INDEX_MESSAGE = '인덱싱 완료',
         INDEX_UPDATED_AT = TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
     WHERE DOC_ID = :did`,
    { ecnt: embedCount, tcnt: totalCount, emodel: env.KB_EMBED_MODEL, did: docId },
    { autoCommit: false },
  );
}
