/**
 * 파일: backend/src/modules/settings/rbac/routes/rbacRoutes.ts
 * 역할: RBAC 조회·수정 HTTP 라우트. /api/rbac 경로.
 *
 * 엔드포인트:
 *   GET  /api/rbac/roles        — 역할 목록
 *   GET  /api/rbac/permissions  — 권한 그룹 + 항목
 *   GET  /api/rbac/matrix       — 전체 매트릭스
 *   PATCH /api/rbac/matrix/:roleId/:permId — 단일 항목 수정
 *
 * 연관 파일:
 *   - repository/rbacRepository.ts : DB 쿼리
 *   - infra/oracle/withConnection.ts / withTransaction.ts
 *   - http/asyncHandler.ts, apiResponse.ts, errorHandler.ts
 */

import { Router } from 'express';
import { asyncHandler } from '../../../../http/asyncHandler.js';
import { ok } from '../../../../http/apiResponse.js';
import { requireOracle } from '../../../../http/errorHandler.js';
import { getCurrentUserId } from '../../../../http/currentUser.js';
import { requirePermission } from '../../../../http/rbac.js';
import { withOracleConnection } from '../../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../../infra/oracle/withTransaction.js';
import { logAudit } from '../../../audit/repository/auditRepository.js';
import {
  listRoles,
  listPermissionGroups,
  getMatrix,
  updateMatrixEntry,
} from '../repository/rbacRepository.js';

export const rbacRouter = Router();

// GET /api/rbac/roles
rbacRouter.get('/roles', asyncHandler(async (_req, res) => {
  if (!requireOracle(res)) return;
  if (!await requirePermission(_req, res, 'sys.policy')) return;
  const rows = await withOracleConnection(listRoles);
  ok(res, rows);
}));

// GET /api/rbac/permissions
rbacRouter.get('/permissions', asyncHandler(async (_req, res) => {
  if (!requireOracle(res)) return;
  if (!await requirePermission(_req, res, 'sys.policy')) return;
  const groups = await withOracleConnection(listPermissionGroups);
  ok(res, groups);
}));

// GET /api/rbac/matrix
rbacRouter.get('/matrix', asyncHandler(async (_req, res) => {
  if (!requireOracle(res)) return;
  if (!await requirePermission(_req, res, 'sys.policy')) return;
  const matrix = await withOracleConnection(getMatrix);
  ok(res, matrix);
}));

// PATCH /api/rbac/matrix/:roleId/:permId  — body: { value: 'true'|'false'|'self' }
rbacRouter.patch('/matrix/:roleId/:permId', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  if (!await requirePermission(req, res, 'sys.policy')) return;
  const { roleId, permId } = req.params;
  const value = String(req.body?.value ?? '').trim();
  const result = await withOracleTransaction(async conn => {
    const updated = await updateMatrixEntry(conn, roleId, permId, value);
    await logAudit(conn, {
      userId: getCurrentUserId(req),
      action: 'update',
      entityType: 'rbac',
      entityId: `${roleId}:${permId}`,
      summary: `권한 ${roleId} / ${permId} 변경`,
      detail: { roleId, permId, value },
      ipAddr: req.ip,
    });
    return updated;
  });
  ok(res, result);
}));
