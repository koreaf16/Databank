/**
 * 파일: backend/src/modules/knowledge-base/routes/kbProductRoutes.ts
 * 역할: 제품 카탈로그 HTTP 라우트.
 *       GET  /api/kb/products           — 제품 검색 (?q=oracle)
 *       GET  /api/kb/products/:id/versions — 버전 목록
 *       POST /api/kb/products           — 새 제품 등록
 *       POST /api/kb/products/:id/versions — 버전 추가
 */

import { Router } from 'express';
import { asyncHandler } from '../../../http/asyncHandler.js';
import { ok, created } from '../../../http/apiResponse.js';
import { requireOracle } from '../../../http/errorHandler.js';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../infra/oracle/withTransaction.js';
import {
  searchProducts,
  getProductById,
  listVersionsByProduct,
  createProduct,
  createVersion,
} from '../repository/kbProductRepository.js';

export const kbProductRouter = Router();

// GET /api/kb/products?q=oracle
kbProductRouter.get('/products', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const q = String(req.query.q ?? '').trim();
  const rows = await withOracleConnection(conn => searchProducts(conn, q || undefined));
  ok(res, rows);
}));

// GET /api/kb/products/:id/versions
kbProductRouter.get('/products/:id/versions', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const rows = await withOracleConnection(conn => listVersionsByProduct(conn, req.params.id));
  ok(res, rows);
}));

// POST /api/kb/products
kbProductRouter.post('/products', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(conn => createProduct(conn, req.body ?? {}));
  created(res, row);
}));

// POST /api/kb/products/:id/versions
kbProductRouter.post('/products/:id/versions', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  await withOracleConnection(conn => getProductById(conn, req.params.id)); // 존재 확인
  const row = await withOracleTransaction(conn => createVersion(conn, req.params.id, req.body ?? {}));
  created(res, row);
}));
