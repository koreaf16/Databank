/**
 * 파일: backend/src/modules/organization/routes/positionRoutes.ts
 * 역할: POSITIONS CRUD HTTP 라우트.
 */

import { Router } from 'express';
import { asyncHandler } from '../../../http/asyncHandler.js';
import { ok, created, errorResponse } from '../../../http/apiResponse.js';
import { requireOracle } from '../../../http/errorHandler.js';
import { toNumber, toBoolean } from '../../../http/validators/primitives.js';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../infra/oracle/withTransaction.js';
import {
  listPositions,
  createPosition,
  updatePosition,
  deletePosition,
} from '../repository/positionRepository.js';

export const positionRouter = Router();

positionRouter.get('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const enabledOnly = !toBoolean(req.query.includeDisabled);
  const rows = await withOracleConnection(conn => listPositions(conn, { enabledOnly }));
  ok(res, rows);
}));

positionRouter.post('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(conn => createPosition(conn, req.body || {}));
  created(res, row);
}));

positionRouter.patch('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const id = toNumber(req.params.id);
  if (id == null) return errorResponse(res, { message: '유효하지 않은 직급 ID입니다' }, 400);
  const row = await withOracleTransaction(conn => updatePosition(conn, id, req.body || {}));
  ok(res, row);
}));

positionRouter.delete('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const id = toNumber(req.params.id);
  if (id == null) return errorResponse(res, { message: '유효하지 않은 직급 ID입니다' }, 400);
  const row = await withOracleTransaction(conn => deletePosition(conn, id));
  ok(res, row);
}));
