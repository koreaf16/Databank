/**
 * 파일: backend/src/modules/customers/routes/customerRoutes.ts
 * 역할: 고객사(CUSTOMERS + CUSTOMER_ALIASES + CUSTOMER_ASSIGNMENTS) CRUD HTTP 라우트.
 */

import { Router } from 'express';
import { asyncHandler } from '../../../http/asyncHandler.js';
import { ok, created, errorResponse } from '../../../http/apiResponse.js';
import { requireOracle } from '../../../http/errorHandler.js';
import { toNumber, toBoolean } from '../../../http/validators/primitives.js';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../infra/oracle/withTransaction.js';
import {
  listCustomers,
  findCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  addAlias,
  removeAlias,
  listAssignments,
  addAssignment,
  removeAssignment,
} from '../repository/customerRepository.js';
import { logAudit } from '../../audit/repository/auditRepository.js';
import { getCurrentUserId } from '../../../http/currentUser.js';

export const customerRouter = Router();

// ── 목록 ──────────────────────────────────────────────────────────────────────
customerRouter.get('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const enabledOnly = !toBoolean(req.query.includeDisabled);
  const rows = await withOracleConnection(conn => listCustomers(conn, {
    enabledOnly,
    q: req.query.q,
    limit: req.query.limit,
    assignedTo: req.query.assignedTo ?? req.query.assignedUserId,
  }));
  ok(res, rows);
}));

// ── 단건 상세 ─────────────────────────────────────────────────────────────────
customerRouter.get('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const id = toNumber(req.params.id);
  if (id == null) return errorResponse(res, { message: '유효하지 않은 고객사 ID입니다' }, 400);
  const row = await withOracleConnection(conn => findCustomerById(conn, id));
  if (!row) return errorResponse(res, { message: '고객사를 찾을 수 없습니다' }, 404);
  ok(res, row);
}));

// ── 생성 ──────────────────────────────────────────────────────────────────────
customerRouter.post('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(async conn => {
    const result = await createCustomer(conn, req.body || {});
    await logAudit(conn, { userId: getCurrentUserId(req), action: 'create', entityType: 'customer', entityId: String(result.id), summary: `고객사 "${result.customerMain}" 생성`, detail: { customerMain: result.customerMain }, ipAddr: req.ip });
    return result;
  });
  created(res, row);
}));

// ── 수정 ──────────────────────────────────────────────────────────────────────
customerRouter.patch('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const id = toNumber(req.params.id);
  if (id == null) return errorResponse(res, { message: '유효하지 않은 고객사 ID입니다' }, 400);
  const row = await withOracleTransaction(async conn => {
    const result = await updateCustomer(conn, id, req.body || {});
    await logAudit(conn, { userId: getCurrentUserId(req), action: 'update', entityType: 'customer', entityId: String(id), summary: `고객사 ID ${id} 수정`, detail: req.body, ipAddr: req.ip });
    return result;
  });
  ok(res, row);
}));

// ── 비활성화 ──────────────────────────────────────────────────────────────────
customerRouter.delete('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const id = toNumber(req.params.id);
  if (id == null) return errorResponse(res, { message: '유효하지 않은 고객사 ID입니다' }, 400);
  const row = await withOracleTransaction(async conn => {
    const result = await deleteCustomer(conn, id);
    await logAudit(conn, { userId: getCurrentUserId(req), action: 'delete', entityType: 'customer', entityId: String(id), summary: `고객사 ID ${id} 비활성화`, ipAddr: req.ip });
    return result;
  });
  ok(res, row);
}));

// ── 별칭 서브 라우트 ─────────────────────────────────────────────────────────
customerRouter.get('/:id/aliases', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const id = toNumber(req.params.id);
  if (id == null) return errorResponse(res, { message: '유효하지 않은 고객사 ID입니다' }, 400);
  const customer = await withOracleConnection(conn => findCustomerById(conn, id));
  if (!customer) return errorResponse(res, { message: '고객사를 찾을 수 없습니다' }, 404);
  ok(res, customer.aliases);
}));

customerRouter.post('/:id/aliases', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const id = toNumber(req.params.id);
  if (id == null) return errorResponse(res, { message: '유효하지 않은 고객사 ID입니다' }, 400);
  const aliases = await withOracleTransaction(conn => addAlias(conn, id, req.body?.name));
  created(res, aliases);
}));

customerRouter.delete('/:customerId/aliases/:aliasId', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const { customerId, aliasId } = req.params;
  const cid = toNumber(customerId);
  const aid = toNumber(aliasId);
  if (cid == null || aid == null) return errorResponse(res, { message: '유효하지 않은 파라미터입니다' }, 400);
  const aliases = await withOracleTransaction(
    conn => removeAlias(conn, cid, aid),
  );
  ok(res, aliases);
}));

// ── 담당자 서브 라우트 ───────────────────────────────────────────────────────
customerRouter.get('/:id/assignments', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const id = toNumber(req.params.id);
  if (id == null) return errorResponse(res, { message: '유효하지 않은 고객사 ID입니다' }, 400);
  const rows = await withOracleConnection(conn => listAssignments(conn, id));
  ok(res, rows);
}));

customerRouter.post('/:id/assignments', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const id = toNumber(req.params.id);
  if (id == null) return errorResponse(res, { message: '유효하지 않은 고객사 ID입니다' }, 400);
  const row = await withOracleTransaction(conn => addAssignment(conn, id, req.body || {}));
  created(res, row);
}));

customerRouter.delete('/:customerId/assignments/:assignmentId', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const { customerId, assignmentId } = req.params;
  const cid = toNumber(customerId);
  const aid = toNumber(assignmentId);
  if (cid == null || aid == null) return errorResponse(res, { message: '유효하지 않은 파라미터입니다' }, 400);
  const result = await withOracleTransaction(
    conn => removeAssignment(conn, cid, aid),
  );
  ok(res, result);
}));
