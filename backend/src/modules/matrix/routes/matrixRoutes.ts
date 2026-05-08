/**
 * 파일: backend/src/modules/matrix/routes/matrixRoutes.js
 * 역할: 작업현황표(ROUTINE_PLANS + ROUTINE_PLAN_CELLS) HTTP 라우트.
 *       /api/matrix  경로.
 *
 * 연관 파일:
 *   - repository/matrixRepository.js
 *   - infra/oracle/withTransaction.js
 *   - http/asyncHandler.js, apiResponse.js, errorHandler.js
 */

import { Router } from 'express';
import { asyncHandler } from '../../../http/asyncHandler.js';
import { ok, created } from '../../../http/apiResponse.js';
import { requireOracle } from '../../../http/errorHandler.js';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../infra/oracle/withTransaction.js';
import {
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  updateCell,
} from '../repository/matrixRepository.js';

export const matrixRouter = Router();

// GET /api/matrix?year=&half=&scope=me|all&userId=
matrixRouter.get('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const { year, half, scope, userId } = req.query;
  const rows = await withOracleConnection(conn =>
    listPlans(conn, { year, half, scope, userId }),
  );
  ok(res, rows);
}));

// POST /api/matrix/plans
matrixRouter.post('/plans', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(conn => createPlan(conn, req.body || {}));
  created(res, row);
}));

// PATCH /api/matrix/plans/:id
matrixRouter.patch('/plans/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(conn => updatePlan(conn, req.params.id, req.body || {}));
  ok(res, row);
}));

// DELETE /api/matrix/plans/:id
matrixRouter.delete('/plans/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const result = await withOracleTransaction(conn => deletePlan(conn, req.params.id));
  ok(res, result);
}));

// PATCH /api/matrix/cells/:planId/:month
matrixRouter.patch('/cells/:planId/:month', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(conn =>
    updateCell(conn, req.params.planId, req.params.month, req.body || {}),
  );
  ok(res, row);
}));
