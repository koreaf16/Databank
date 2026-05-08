/**
 * 파일: backend/src/modules/settings/checklists/routes/checklistRoutes.ts
 * 역할: CHECKLIST_TEMPLATES CRUD HTTP 라우트. /api/checklists 경로.
 *
 * 연관 파일:
 *   - repository/checklistRepository.ts : DB 쿼리
 *   - infra/oracle/withConnection.ts    : 읽기 전용 커넥션
 *   - infra/oracle/withTransaction.ts   : 쓰기 트랜잭션
 *   - http/asyncHandler.ts              : 예외 → errorHandler
 *   - http/apiResponse.ts               : ok/created envelope
 *   - http/errorHandler.ts              : requireOracle guard
 */

import { Router } from 'express';
import { asyncHandler } from '../../../../http/asyncHandler.js';
import { ok, created } from '../../../../http/apiResponse.js';
import { requireOracle } from '../../../../http/errorHandler.js';
import { withOracleConnection } from '../../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../../infra/oracle/withTransaction.js';
import {
  listChecklists,
  findChecklistById,
  createChecklist,
  updateChecklist,
  deleteChecklist,
} from '../repository/checklistRepository.js';

export const checklistRouter = Router();

// GET /api/checklists?status=active&kind=routine&serviceMasterId=...&customerId=...
checklistRouter.get('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const rows = await withOracleConnection(conn => listChecklists(conn, {
    status:          req.query.status as string | undefined,
    kind:            req.query.kind as string | undefined,
    serviceMasterId: req.query.serviceMasterId as string | undefined,
    customerId:      req.query.customerId ? Number(req.query.customerId) : undefined,
    enabledOnly:     req.query.enabledOnly !== 'false',
  }));
  ok(res, rows);
}));

// GET /api/checklists/:id
checklistRouter.get('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleConnection(conn => findChecklistById(conn, req.params.id));
  if (!row) {
    return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '체크리스트 템플릿을 찾을 수 없습니다' } });
  }
  ok(res, row);
}));

// POST /api/checklists
checklistRouter.post('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(conn => createChecklist(conn, req.body || {}));
  created(res, row);
}));

// PATCH /api/checklists/:id
checklistRouter.patch('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(
    conn => updateChecklist(conn, req.params.id, req.body || {}),
  );
  ok(res, row);
}));

// DELETE /api/checklists/:id
checklistRouter.delete('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(
    conn => deleteChecklist(conn, req.params.id),
  );
  ok(res, row);
}));
