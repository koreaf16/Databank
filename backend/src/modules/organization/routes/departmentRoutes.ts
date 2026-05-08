/**
 * 파일: backend/src/modules/organization/routes/departmentRoutes.ts
 * 역할: DEPARTMENTS CRUD HTTP 라우트.
 */

import { Router } from 'express';
import { asyncHandler } from '../../../http/asyncHandler.js';
import { ok, created, errorResponse } from '../../../http/apiResponse.js';
import { requireOracle } from '../../../http/errorHandler.js';
import { toNumber, toBoolean } from '../../../http/validators/primitives.js';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../infra/oracle/withTransaction.js';
import {
  listDepartments,
  findDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from '../repository/departmentRepository.js';
import { logAudit } from '../../audit/repository/auditRepository.js';
import { getCurrentUserId } from '../../../http/currentUser.js';

export const departmentRouter = Router();

departmentRouter.get('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const enabledOnly = !toBoolean(req.query.includeDisabled);
  const rows = await withOracleConnection(conn => listDepartments(conn, { enabledOnly }));
  ok(res, rows);
}));

departmentRouter.get('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const id = toNumber(req.params.id);
  if (id == null) return errorResponse(res, { message: '유효하지 않은 부서 ID입니다' }, 400);
  const row = await withOracleConnection(conn => findDepartmentById(conn, id));
  if (!row) return errorResponse(res, { message: '부서를 찾을 수 없습니다' }, 404);
  ok(res, row);
}));

departmentRouter.post('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(async conn => {
    const result = await createDepartment(conn, req.body || {});
    await logAudit(conn, { userId: getCurrentUserId(req), action: 'create', entityType: 'department', entityId: String(result.id), summary: `부서 "${result.name}" 생성`, detail: { name: result.name }, ipAddr: req.ip });
    return result;
  });
  created(res, row);
}));

departmentRouter.patch('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const id = toNumber(req.params.id);
  if (id == null) return errorResponse(res, { message: '유효하지 않은 부서 ID입니다' }, 400);
  const row = await withOracleTransaction(async conn => {
    const result = await updateDepartment(conn, id, req.body || {});
    await logAudit(conn, { userId: getCurrentUserId(req), action: 'update', entityType: 'department', entityId: String(id), summary: `부서 "${result.name}" 수정`, detail: req.body, ipAddr: req.ip });
    return result;
  });
  ok(res, row);
}));

departmentRouter.delete('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const id = toNumber(req.params.id);
  if (id == null) return errorResponse(res, { message: '유효하지 않은 부서 ID입니다' }, 400);
  const row = await withOracleTransaction(async conn => {
    const result = await deleteDepartment(conn, id);
    await logAudit(conn, { userId: getCurrentUserId(req), action: 'delete', entityType: 'department', entityId: String(id), summary: `부서 ID ${id} 비활성화`, ipAddr: req.ip });
    return result;
  });
  ok(res, row);
}));
