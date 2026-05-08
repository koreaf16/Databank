/**
 * 파일: backend/src/modules/organization/routes/userRoutes.ts
 * 역할: USERS CRUD HTTP 라우트.
 */

import { Router } from 'express';
import { asyncHandler } from '../../../http/asyncHandler.js';
import { ok, created, errorResponse } from '../../../http/apiResponse.js';
import { requireOracle } from '../../../http/errorHandler.js';
import { toNumber, toBoolean } from '../../../http/validators/primitives.js';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../infra/oracle/withTransaction.js';
import {
  listUsers,
  findUserById,
  createUser,
  updateUser,
  deleteUser,
} from '../repository/userRepository.js';
import { logAudit } from '../../audit/repository/auditRepository.js';
import { getCurrentUserId } from '../../../http/currentUser.js';

export const userRouter = Router();

userRouter.get('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const includeDisabled = toBoolean(req.query.includeDisabled);
  const deptId = toNumber(req.query.deptId);
  const rows = await withOracleConnection(conn => listUsers(conn, { enabledOnly: !includeDisabled, deptId }));
  ok(res, rows);
}));

userRouter.get('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const id = toNumber(req.params.id);
  if (id == null) return errorResponse(res, { message: '유효하지 않은 사용자 ID입니다' }, 400);
  const row = await withOracleConnection(conn => findUserById(conn, id));
  if (!row) return errorResponse(res, { message: '사용자를 찾을 수 없습니다' }, 404);
  ok(res, row);
}));

userRouter.post('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(async conn => {
    const result = await createUser(conn, req.body || {});
    await logAudit(conn, { userId: getCurrentUserId(req), action: 'create', entityType: 'user', entityId: String(result.id), summary: `사용자 "${result.name}" 생성`, detail: { username: result.username }, ipAddr: req.ip });
    return result;
  });
  created(res, row);
}));

userRouter.patch('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const id = toNumber(req.params.id);
  if (id == null) return errorResponse(res, { message: '유효하지 않은 사용자 ID입니다' }, 400);
  const row = await withOracleTransaction(async conn => {
    const result = await updateUser(conn, id, req.body || {});
    await logAudit(conn, { userId: getCurrentUserId(req), action: 'update', entityType: 'user', entityId: String(id), summary: `사용자 "${result.name}" 수정`, detail: req.body, ipAddr: req.ip });
    return result;
  });
  ok(res, row);
}));

userRouter.delete('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const id = toNumber(req.params.id);
  if (id == null) return errorResponse(res, { message: '유효하지 않은 사용자 ID입니다' }, 400);
  const row = await withOracleTransaction(async conn => {
    const result = await deleteUser(conn, id);
    await logAudit(conn, { userId: getCurrentUserId(req), action: 'delete', entityType: 'user', entityId: String(id), summary: `사용자 "${result.name}" 비활성화`, ipAddr: req.ip });
    return result;
  });
  ok(res, row);
}));
