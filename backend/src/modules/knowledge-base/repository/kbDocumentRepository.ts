/**
 * 파일: backend/src/modules/knowledge-base/repository/kbDocumentRepository.ts
 * 역할: KB_DOCUMENTS + KB_DOCUMENT_TAGS + KB_DOCUMENT_VERSIONS 테이블 CRUD.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  requiredText,
  nullableText,
  nullableClob,
  toNullableInt,
  clobFetchHandler,
  notFoundError,
  loadSql,
  has,
} from '../../../infra/oracle/helpers.js';
import { listFilesByDoc } from './kbFileRepository.js';
import { enqueueJob } from './kbJobRepository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

function normalizeDoc(row: any) {
  const {
    tagsRaw, versionsRaw,
    indexStatus, indexProgress, indexStage, indexModel, indexMessage, indexUpdatedAt,
    ...rest
  } = row;
  return {
    ...rest,
    tags: tagsRaw ? tagsRaw.split(',').filter(Boolean) : [],
    productVersions: versionsRaw ? versionsRaw.split(',').filter(Boolean) : ['all'],
    index: {
      status:    indexStatus    || 'queued',
      progress:  Number(indexProgress) || 0,
      stage:     indexStage     || 'queued',
      model:     indexModel     || 'text-embedding-3-large',
      updatedAt: indexUpdatedAt || '-',
      message:   indexMessage   || '',
    },
  };
}

function generateDocId() {
  return `kb-doc-${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

async function replaceTags(connection: any, docId: string, tags: string[]) {
  await connection.execute(sql('deleteDocTags.sql'), { did: docId });
  for (const tag of [...new Set(tags.filter(Boolean))]) {
    await connection.execute(sql('insertDocTag.sql'), { did: docId, tag: String(tag).trim().slice(0, 100) });
  }
}

async function updateVersionRange(connection: any, docId: string, productId: string) {
  await connection.execute(sql('updateDocVersionRange.sql'), { pid: productId, did: docId });
}

async function replaceVersions(connection: any, docId: string, versions: string[]) {
  await connection.execute(sql('deleteDocVersions.sql'), { did: docId });
  for (const ver of [...new Set(versions.filter(Boolean))]) {
    await connection.execute(sql('insertDocVersion.sql'), { did: docId, ver: String(ver).trim().slice(0, 50) });
  }
}

// ── 목록 조회 ─────────────────────────────────────────────────────────────────

export async function listDocuments(connection: any, filters: any = {}) {
  const conditions = ['d.ENABLED = 1'];
  const binds: any = {};

  if (filters.categoryId) {
    conditions.push(
      `d.CATEGORY_ID IN (SELECT CATEGORY_ID FROM KB_CATEGORIES
         START WITH CATEGORY_ID = :cat_id
         CONNECT BY PRIOR CATEGORY_ID = PARENT_ID AND ENABLED = 1)`,
    );
    binds.cat_id = String(filters.categoryId);
  }
  if (filters.serviceMasterId && filters.serviceMasterId !== 'all') {
    conditions.push('d.SERVICE_MASTER_ID = :svc_id');
    binds.svc_id = String(filters.serviceMasterId);
  }
  if (filters.status && filters.status !== 'all') {
    conditions.push('(d.STATUS = :status OR d.INDEX_STATUS = :status)');
    binds.status = String(filters.status);
  }
  if (filters.docType && filters.docType !== 'all') {
    conditions.push('d.DOC_TYPE = :doc_type');
    binds.doc_type = String(filters.docType);
  }
  if (filters.q) {
    // Oracle Text (IDX_KBD_TEXT) 사용 — TITLE, SUMMARY 동시 검색
    conditions.push(
      `(CONTAINS(d.TITLE, :q, 1) > 0
         OR EXISTS (SELECT 1 FROM KB_DOCUMENT_TAGS kt WHERE kt.DOC_ID = d.DOC_ID AND UPPER(kt.TAG) LIKE UPPER(:q_raw)))`,
    );
    // 특수문자 이스케이프 및 AND 조건 결합 (간이 구현)
    const escaped = String(filters.q).replace(/[{}()|!,&;~$%^*?\-\\]/g, (ch) => `{${ch}}`);
    binds.q = escaped;
    binds.q_raw = `%${filters.q}%`;
  }

  const where = conditions.join(' AND ');
  const fullSql = `${sql('selectDoc.sql')} WHERE ${where} ORDER BY d.CREATED_AT DESC`;

  const result = await connection.execute(fullSql, binds, { fetchTypeHandler: clobFetchHandler });
  return (result.rows || []).map(normalizeDoc);
}

// ── 단건 조회 ─────────────────────────────────────────────────────────────────

export async function findDocumentById(connection: any, docId: string) {
  const fullSql = `${sql('selectDoc.sql')} WHERE d.DOC_ID = :did AND d.ENABLED = 1`;
  const result = await connection.execute(fullSql, { did: String(docId) }, { fetchTypeHandler: clobFetchHandler });
  const row = result.rows?.[0];
  return row ? normalizeDoc(row) : null;
}

// ── 생성 ──────────────────────────────────────────────────────────────────────

export async function createDocument(connection: any, payload: any = {}) {
  const title      = requiredText(payload.title, '등록명');
  const categoryId = requiredText(payload.categoryId, '카테고리');
  const docType    = nullableText(payload.docType) || 'check_item';
  const docId      = payload.id && String(payload.id).startsWith('kb-') ? String(payload.id) : generateDocId();

  await connection.execute(sql('insertDoc.sql'), {
    did:       docId,
    title,
    cat_id:    categoryId,
    doc_type:  docType,
    svc_id:    nullableText(payload.serviceMasterId),
    prod_id:   nullableText(payload.productId),
    prod_name: nullableText(payload.productName),
    ver_range: nullableText(payload.versionRange),
    os_plat:   nullableText(payload.osPlatform),
    vendor:    nullableText(payload.vendor),
    author:    nullableText(payload.author),
    author_id: toNullableInt(payload.authorUserId),
    summary:   nullableText(payload.summary),
    content:   nullableClob(payload.content),
    status:    nullableText(payload.status) || 'indexing',
    chunks:    toNullableInt(payload.chunks) ?? 0,
    idx_status:nullableText(payload.index?.status) || 'queued',
    idx_prog:  toNullableInt(payload.index?.progress) ?? 8,
    idx_stage: nullableText(payload.index?.stage) || 'extracting',
    idx_model: nullableText(payload.index?.model) || 'text-embedding-3-large',
    idx_msg:   nullableText(payload.index?.message) || '등록됨',
    idx_upd:   nullableText(payload.index?.updatedAt) || '방금',
    reviewed:  nullableText(payload.reviewedAt) || '미검토',
    src_type:  nullableText(payload.source?.type) || 'text',
    src_url:   nullableText(payload.source?.url),
  });

  const tags     = Array.isArray(payload.tags)           ? payload.tags           : [];
  const versions = Array.isArray(payload.productVersions)? payload.productVersions: ['all'];
  await replaceTags(connection, docId, tags);
  await replaceVersions(connection, docId, versions);
  if (payload.productId) await updateVersionRange(connection, docId, String(payload.productId));

  return findDocumentById(connection, docId);
}

// ── 수정 ──────────────────────────────────────────────────────────────────────

export async function updateDocument(connection: any, docId: string, payload: any = {}) {
  const current = await findDocumentById(connection, String(docId));
  if (!current) throw notFoundError('문서를 찾을 수 없습니다');

  const t = (k: string, cur: any) => has(payload, k) ? payload[k] : cur;

  await connection.execute(sql('updateDoc.sql'), {
    did:       String(docId),
    title:     nullableText(t('title', current.title)) || current.title,
    cat_id:    nullableText(t('categoryId', current.categoryId)) || current.categoryId,
    doc_type:  nullableText(t('docType', current.docType)) || current.docType,
    svc_id:    nullableText(t('serviceMasterId', current.serviceMasterId)),
    prod_id:   nullableText(t('productId', current.productId)),
    prod_name: nullableText(t('productName', current.productName)),
    ver_range: nullableText(t('versionRange', current.versionRange)),
    os_plat:   nullableText(t('osPlatform', current.osPlatform)),
    vendor:    nullableText(t('vendor', current.vendor)),
    author:    nullableText(t('author', current.author)),
    author_id: toNullableInt(t('authorUserId', current.authorUserId)),
    summary:   nullableText(t('summary', current.summary)),
    status:    nullableText(t('status', current.status)) || 'indexing',
    chunks:    toNullableInt(t('chunks', current.chunks)) ?? 0,
    vectors:   toNullableInt(has(payload, 'index') ? payload.index?.vectors : current.vectors) ?? 0,
    idx_status:nullableText(has(payload, 'index') ? payload.index?.status   : current.index?.status)   || 'queued',
    idx_prog:  toNullableInt(has(payload, 'index') ? payload.index?.progress: current.index?.progress) ?? 0,
    idx_stage: nullableText(has(payload, 'index') ? payload.index?.stage    : current.index?.stage),
    idx_model: nullableText(has(payload, 'index') ? payload.index?.model    : current.index?.model)    || 'text-embedding-3-large',
    idx_msg:   nullableText(has(payload, 'index') ? payload.index?.message  : current.index?.message),
    idx_upd:   nullableText(has(payload, 'index') ? payload.index?.updatedAt: current.index?.updatedAt)|| '-',
  });

  if (has(payload, 'tags'))           await replaceTags(connection, String(docId), payload.tags);
  if (has(payload, 'productVersions'))await replaceVersions(connection, String(docId), payload.productVersions);

  const effectiveProductId = nullableText(has(payload, 'productId') ? payload.productId : current.productId);
  if (effectiveProductId && (has(payload, 'productVersions') || has(payload, 'productId'))) {
    await updateVersionRange(connection, String(docId), effectiveProductId);
  }

  return findDocumentById(connection, String(docId));
}

// ── 삭제 (청크·파일·잡 포함 완전 삭제) ──────────────────────────────────────

export async function deleteDocument(connection: any, docId: string) {
  const current = await findDocumentById(connection, String(docId));
  if (!current) throw notFoundError('문서를 찾을 수 없습니다');
  const did = String(docId);
  await connection.execute(`DELETE FROM KB_INDEX_JOBS       WHERE DOC_ID = :did`, { did });
  await connection.execute(`DELETE FROM KB_DOCUMENT_CHUNKS  WHERE DOC_ID = :did`, { did });
  await connection.execute(`DELETE FROM KB_DOCUMENTS        WHERE DOC_ID = :did`, { did });
  return { id: did, deleted: true };
}

// ── 벌크 삭제 — 여러 문서를 IN 절로 한 번에 삭제 ──────────────────────────────
// 청크/잡을 먼저 IN 절로 일괄 삭제해 HNSW·Text 인덱스 갱신을 배치로 처리,
// 이후 KB_DOCUMENTS 삭제 시 나머지 자식(FILES/TAGS/VERSIONS)은 CASCADE 처리.

export async function bulkDeleteDocuments(connection: any, ids: string[]) {
  if (!ids.length) return { deleted: 0 };
  const binds: Record<string, string> = {};
  const placeholders = ids.map((id, i) => { binds[`id${i}`] = id; return `:id${i}`; }).join(',');
  await connection.execute(`DELETE FROM KB_INDEX_JOBS      WHERE DOC_ID IN (${placeholders})`, binds);
  await connection.execute(`DELETE FROM KB_DOCUMENT_CHUNKS WHERE DOC_ID IN (${placeholders})`, binds);
  const result = await connection.execute(`DELETE FROM KB_DOCUMENTS WHERE DOC_ID IN (${placeholders})`, binds);
  return { deleted: result.rowsAffected ?? ids.length };
}

// ── 재인덱싱 시작 ─────────────────────────────────────────────────────────────

export async function reindexDocument(connection: any, docId: string) {
  const did = String(docId);
  const current = await findDocumentById(connection, did);
  if (!current) throw notFoundError('문서를 찾을 수 없습니다');

  const files = await listFilesByDoc(connection, did);
  const file = files[0];
  if (!file) throw notFoundError('재인덱싱할 파일을 찾을 수 없습니다');

  await connection.execute(sql('reindexDoc.sql'), { did });
  await enqueueJob(connection, 'reindex', did, {
    fileId:   file.id,
    docId:    did,
    mimeType: file.mimeType ?? 'application/octet-stream',
  });

  return findDocumentById(connection, did);
}

// ── 인덱싱 진행률 갱신 ────────────────────────────────────────────────────────

/**
 * KB_DOCUMENTS.INDEX_* 컬럼을 갱신한다.
 */
export async function updateDocumentProgress(
  connection: any,
  docId: string,
  status: string,
  progress: number,
  stage: string,
  message?: string,
): Promise<void> {
  await connection.execute(sql('updateDocProgress.sql'), {
    status,
    prog:   Math.min(100, Math.max(0, Math.round(progress))),
    stage,
    msg:    message ?? stage,
    did:    docId,
  }, { autoCommit: true });
}

// ── 인덱싱 상태 조회 ──────────────────────────────────────────────────────────

export async function getIndexingStatus(connection: any, docId: string) {
  const doc = await findDocumentById(connection, String(docId));
  if (!doc) throw notFoundError('문서를 찾을 수 없습니다');
  return {
    docId:    doc.id,
    chunks:   doc.chunks,
    vectors:  doc.vectors,
    ...doc.index,
  };
}
