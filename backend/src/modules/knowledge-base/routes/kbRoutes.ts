/**
 * 파일: backend/src/modules/knowledge-base/routes/kbRoutes.js
 * 역할: 지식베이스(KB_CATEGORIES + KB_DOCUMENTS) CRUD HTTP 라우트.
 *       /api/kb/categories, /api/kb/documents 경로.
 *
 * 연관 파일:
 *   - repository/kbCategoryRepository.js : 카테고리 DB 쿼리
 *   - repository/kbDocumentRepository.js : 문서 DB 쿼리
 *   - infra/oracle/withTransaction.js    : commit 자동
 *   - http/asyncHandler.js              : 예외 → errorHandler
 *   - http/apiResponse.js               : ok/created envelope
 *   - http/errorHandler.js              : requireOracle guard
 */

import { Router } from 'express';
import { asyncHandler } from '../../../http/asyncHandler.js';
import { ok, created } from '../../../http/apiResponse.js';
import { requireOracle } from '../../../http/errorHandler.js';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../infra/oracle/withTransaction.js';
import {
  listCategories,
  findCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../repository/kbCategoryRepository.js';
import {
  listDocuments,
  findDocumentById,
  createDocument,
  updateDocument,
  deleteDocument,
  bulkDeleteDocuments,
  reindexDocument,
  getIndexingStatus,
} from '../repository/kbDocumentRepository.js';
import { syncTextIndex } from '../repository/kbChunkRepository.js';

export const kbRouter = Router();

// ── 카테고리 ──────────────────────────────────────────────────────────────────

kbRouter.get('/categories', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const rows = await withOracleConnection(conn => listCategories(conn));
  ok(res, rows);
}));

kbRouter.post('/categories', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(conn => createCategory(conn, req.body || {}));
  created(res, row);
}));

kbRouter.patch('/categories/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(conn => updateCategory(conn, req.params.id, req.body || {}));
  ok(res, row);
}));

kbRouter.delete('/categories/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const result = await withOracleTransaction(conn => deleteCategory(conn, req.params.id));
  ok(res, result);
}));

// ── 문서 ──────────────────────────────────────────────────────────────────────

kbRouter.get('/documents', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const rows = await withOracleConnection(conn => listDocuments(conn, req.query));
  ok(res, rows);
}));

// POST /api/kb/documents/bulk-status — 일괄 상태 변경 (정적 경로 먼저)
kbRouter.post('/documents/bulk-status', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const { ids, status } = req.body || {};
  if (!Array.isArray(ids) || !status) return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'ids 배열과 status가 필요합니다' } });
  const results: any[] = [];
  for (const id of ids) {
    const doc = await withOracleTransaction(conn => updateDocument(conn, id, { status }));
    results.push(doc);
  }
  ok(res, results);
}));

kbRouter.get('/documents/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleConnection(conn => findDocumentById(conn, req.params.id));
  if (!row) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '문서를 찾을 수 없습니다' } });
  ok(res, row);
}));

kbRouter.post('/documents', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(conn => createDocument(conn, req.body || {}));
  created(res, row);
}));

kbRouter.patch('/documents/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(conn => updateDocument(conn, req.params.id, req.body || {}));
  ok(res, row);
}));

kbRouter.delete('/documents/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const result = await withOracleTransaction(conn => deleteDocument(conn, req.params.id));
  // 커밋 후 Text 인덱스 동기화 — 응답을 블로킹하지 않음
  withOracleConnection(conn => syncTextIndex(conn)).catch(err =>
    console.warn('[kb] Text 인덱스 sync 실패 (delete):', err.message)
  );
  ok(res, result);
}));

kbRouter.post('/documents/bulk-delete', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const ids: string[] = (req.body?.ids ?? []).map(String).filter(Boolean);
  if (!ids.length) return ok(res, { deleted: 0 });
  const result = await withOracleTransaction(conn => bulkDeleteDocuments(conn, ids));
  // 커밋 후 Text 인덱스 동기화 — 응답을 블로킹하지 않음
  withOracleConnection(conn => syncTextIndex(conn)).catch(err =>
    console.warn('[kb] Text 인덱스 sync 실패 (bulk-delete):', err.message)
  );
  ok(res, result);
}));

kbRouter.get('/documents/:id/indexing', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const status = await withOracleConnection(conn => getIndexingStatus(conn, req.params.id));
  ok(res, status);
}));

kbRouter.post('/documents/:id/reindex', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(conn => reindexDocument(conn, req.params.id));
  ok(res, row);
}));
