/**
 * 파일: backend/src/modules/audit/routes/auditRoutes.ts
 * 역할: 감사 로그 조회 HTTP 라우트. /api/audit 경로.
 *
 * 엔드포인트:
 *   GET /api/audit/logs — 최근 감사 로그 목록 (entityType, action, from, to, limit 필터)
 */

import { Router } from 'express';
import { asyncHandler } from '../../../http/asyncHandler.js';
import { ok } from '../../../http/apiResponse.js';
import { requireOracle } from '../../../http/errorHandler.js';
import { requirePermission } from '../../../http/rbac.js';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { listAuditLogs } from '../repository/auditRepository.js';

export const auditRouter = Router();

auditRouter.get('/logs', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  if (!await requirePermission(req, res, 'sys.audit')) return;
  const { entityType, action, from, to, limit, userId } = req.query as Record<string, string>;
  const rows = await withOracleConnection(conn => listAuditLogs(conn, {
    entityType: entityType || undefined,
    action: action || undefined,
    from: from || undefined,
    to: to || undefined,
    limit: limit ? Number(limit) : 100,
    userId: userId ? Number(userId) : undefined,
  }));
  ok(res, rows);
}));
