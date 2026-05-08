/**
 * 파일: backend/src/modules/settings/report-templates/routes/reportTemplateRoutes.ts
 * 역할: REPORT_MASTER_TEMPLATES CRUD HTTP 라우트.
 */

import { Router } from 'express';
import { asyncHandler } from '../../../../http/asyncHandler.js';
import { ok, created, errorResponse } from '../../../../http/apiResponse.js';
import { requireOracle } from '../../../../http/errorHandler.js';
import { toBoolean } from '../../../../http/validators/primitives.js';
import { withOracleConnection } from '../../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../../infra/oracle/withTransaction.js';
import {
  listReportTemplates,
  findReportTemplateById,
  createReportTemplate,
  updateReportTemplate,
  deleteReportTemplate,
} from '../repository/reportTemplateRepository.js';
import { logAudit } from '../../../audit/repository/auditRepository.js';
import { getCurrentUserId } from '../../../../http/currentUser.js';

export const reportTemplateRouter = Router();

reportTemplateRouter.get('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const enabledOnly = !toBoolean(req.query.includeDisabled);
  const rows = await withOracleConnection(conn => listReportTemplates(conn, { enabledOnly }));
  ok(res, rows);
}));

reportTemplateRouter.get('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleConnection(conn => findReportTemplateById(conn, req.params.id));
  if (!row) return errorResponse(res, { message: '템플릿을 찾을 수 없습니다' }, 404);
  ok(res, row);
}));

reportTemplateRouter.post('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(async conn => {
    const result = await createReportTemplate(conn, req.body || {});
    if (result) {
      await logAudit(conn, {
        userId: getCurrentUserId(req),
        action: 'create',
        entityType: 'report_template',
        entityId: String(result.id),
        summary: `내역서 템플릿 "${result.name}" 생성`,
        detail: { id: result.id, customerId: result.customerId, name: result.name, version: result.version },
        ipAddr: req.ip
      });
    }
    return result;
  });
  created(res, row);
}));

reportTemplateRouter.patch('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(async conn => {
    const result = await updateReportTemplate(conn, req.params.id, req.body || {});
    if (result) {
      await logAudit(conn, {
        userId: getCurrentUserId(req),
        action: 'update',
        entityType: 'report_template',
        entityId: String(result.id),
        summary: `내역서 템플릿 "${result.name}" 수정`,
        detail: { id: result.id, customerId: result.customerId, name: result.name, version: result.version },
        ipAddr: req.ip
      });
    }
    return result;
  });
  ok(res, row);
}));

reportTemplateRouter.delete('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(async conn => {
    const result = await deleteReportTemplate(conn, req.params.id);
    if (result) {
      await logAudit(conn, {
        userId: getCurrentUserId(req),
        action: 'delete',
        entityType: 'report_template',
        entityId: String(result.id),
        summary: `내역서 템플릿 "${result.name}" 비활성화`,
        ipAddr: req.ip
      });
    }
    return result;
  });
  ok(res, row);
}));
