/**
 * 파일: backend/src/modules/weekly-report/routes/weeklyReportRoutes.js
 * 역할: 주간업무보고(WEEKLY_REPORTS) CRUD HTTP 라우트.
 *       /api/weekly-reports 경로.
 *
 * 연관 파일:
 *   - modules/weekly-report/repository/weeklyReportRepository.js : DB 쿼리
 *   - infra/oracle/withTransaction.js                            : commit 자동
 *   - http/asyncHandler.js                                       : 예외 → errorHandler
 *   - http/apiResponse.js                                        : ok/created envelope
 *   - http/errorHandler.js                                       : requireOracle guard
 */

import { Router } from 'express';
import { asyncHandler } from '../../../http/asyncHandler.js';
import { ok, created } from '../../../http/apiResponse.js';
import { requireOracle } from '../../../http/errorHandler.js';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../infra/oracle/withTransaction.js';
import {
  listReports,
  findReportById,
  createReport,
  updateReport,
  createReportFromHistory,
} from '../repository/weeklyReportRepository.js';

export const weeklyReportRouter = Router();

// GET /api/weekly-reports
weeklyReportRouter.get('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const { weekStart, teamId } = req.query;
  const rows = await withOracleConnection(conn => listReports(conn, { weekStart, teamId }));
  ok(res, rows);
}));

// GET /api/weekly-reports/:id
weeklyReportRouter.get('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleConnection(conn => findReportById(conn, req.params.id));
  if (!row) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '보고서를 찾을 수 없습니다' } });
  ok(res, row);
}));

// POST /api/weekly-reports
weeklyReportRouter.post('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(conn => createReport(conn, req.body || {}));
  created(res, row);
}));

// POST /api/weekly-reports/from-history
weeklyReportRouter.post('/from-history', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(conn => createReportFromHistory(conn, req.body || {}));
  created(res, row);
}));

// PATCH /api/weekly-reports/:id
weeklyReportRouter.patch('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(conn => updateReport(conn, req.params.id, req.body || {}));
  ok(res, row);
}));
