/**
 * 파일: backend/src/modules/settings/service-masters/routes/serviceMasterRoutes.js
 * 역할: SERVICE_MASTERS CRUD HTTP 라우트. /api/service-masters 경로.
 *
 * 연관 파일:
 *   - repository/serviceMasterRepository.js : DB 쿼리
 *   - infra/oracle/withConnection.js        : 읽기 전용 커넥션
 *   - infra/oracle/withTransaction.js       : 쓰기 트랜잭션
 *   - http/asyncHandler.js                  : 예외 → errorHandler
 *   - http/apiResponse.js                   : ok/created envelope
 *   - http/errorHandler.js                  : requireOracle guard
 *   - http/validators/primitives.js         : toBoolean
 */

import { Router } from 'express';
import { asyncHandler } from '../../../../http/asyncHandler.js';
import { ok, created } from '../../../../http/apiResponse.js';
import { requireOracle } from '../../../../http/errorHandler.js';
import { toBoolean } from '../../../../http/validators/primitives.js';
import { withOracleConnection } from '../../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../../infra/oracle/withTransaction.js';
import {
  listServiceMasters,
  findServiceMasterById,
  createServiceMaster,
  updateServiceMaster,
  deleteServiceMaster,
} from '../repository/serviceMasterRepository.js';

export const serviceMasterRouter = Router();

serviceMasterRouter.get('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const enabledOnly = !toBoolean(req.query.includeDisabled);
  const rows = await withOracleConnection(conn => listServiceMasters(conn, { enabledOnly }));
  ok(res, rows);
}));

serviceMasterRouter.get('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleConnection(conn => findServiceMasterById(conn, req.params.id));
  if (!row) {
    return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '서비스 마스터를 찾을 수 없습니다' } });
  }
  ok(res, row);
}));

serviceMasterRouter.post('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(conn => createServiceMaster(conn, req.body || {}));
  created(res, row);
}));

serviceMasterRouter.patch('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(
    conn => updateServiceMaster(conn, req.params.id, req.body || {}),
  );
  ok(res, row);
}));

serviceMasterRouter.delete('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(
    conn => deleteServiceMaster(conn, req.params.id),
  );
  ok(res, row);
}));
