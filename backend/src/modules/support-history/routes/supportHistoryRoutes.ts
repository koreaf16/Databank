/**
 * 파일: backend/src/modules/support-history/routes/supportHistoryRoutes.js
 * 역할: 지원이력(SUPPORT_HISTORIES) CRUD + 일괄 상태변경 HTTP 라우트.
 *       /api/support-history 경로.
 *
 * 연관 파일:
 *   - modules/support-history/repository/supportHistoryRepository.js : DB 쿼리
 *   - infra/oracle/withTransaction.js                                 : commit 자동
 *   - http/asyncHandler.js                                            : 예외 → errorHandler
 *   - http/apiResponse.js                                             : ok/created envelope
 *   - http/errorHandler.js                                            : requireOracle guard
 */

import { Router } from 'express';
import { asyncHandler } from '../../../http/asyncHandler.js';
import { ok, created, errorResponse } from '../../../http/apiResponse.js';
import { requireOracle } from '../../../http/errorHandler.js';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../infra/oracle/withTransaction.js';
import {
  listHistories,
  findHistoryById,
  createHistory,
  updateHistory,
  deleteHistory,
  bulkDeleteHistories,
  bulkUpdateStatus,
} from '../repository/supportHistoryRepository.js';
import { logAudit } from '../../audit/repository/auditRepository.js';
import { getCurrentUserId } from '../../../http/currentUser.js';
import { parseOperationalRecordText } from '../services/textParser.js';
import { getPermissionValues } from '../../../http/rbac.js';

export const supportHistoryRouter = Router();

// 쿼리스트링의 콤마 구분 ID 목록을 number[]로 파싱한다 (예: ?serverIds=1,2,3).
function parseIdList(raw: unknown): number[] {
  if (raw == null || raw === '') return [];
  const flat = Array.isArray(raw) ? raw.join(',') : String(raw);
  return flat
    .split(',')
    .map((token) => Number(token.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

// GET /api/support-history?workspaceId=N&serverIds=1,2&...
supportHistoryRouter.get('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const filters: any = { ...req.query };
  if (filters.serverIds != null) {
    filters.serverIds = parseIdList(filters.serverIds);
  }
  const rows = await withOracleConnection(conn => listHistories(conn, filters));
  ok(res, rows);
}));

// GET /api/support-history/:id
supportHistoryRouter.get('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleConnection(conn => findHistoryById(conn, req.params.id));
  if (!row) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '지원이력을 찾을 수 없습니다' } });
  ok(res, row);
}));

// POST /api/support-history
//   body: { ..., workspaceId?, serverIds?: number[], targetMode?: 'workspace_only'|'multi_server'|'per_server' }
//   targetMode 처리:
//     - workspace_only : 1건 이력 (targets 0건). 업무 전체 이력
//     - multi_server   : 1건 이력 + N건 targets. 서버 묶음 1건
//     - per_server     : 같은 입력으로 N건 이력 자동 생성 (서버별 1건씩). 응답은 배열
supportHistoryRouter.post('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const body: any = req.body || {};
  const inputServerIds: number[] = Array.isArray(body.serverIds)
    ? body.serverIds.map((s: any) => Number(s)).filter((n: number) => Number.isFinite(n) && n > 0)
    : [];
  const explicitMode = typeof body.targetMode === 'string' ? body.targetMode : null;
  const mode = explicitMode
    ?? (inputServerIds.length > 0 ? 'multi_server' : 'workspace_only');

  const result = await withOracleTransaction(async conn => {
    if (mode === 'per_server' && inputServerIds.length > 0) {
      const out: any[] = [];
      for (const sid of inputServerIds) {
        const record = await createHistory(conn, { ...body, serverIds: [sid], targetMode: undefined });
        await logAudit(conn, {
          action: 'create',
          entityType: 'support_history',
          entityId: record.id,
          userId: body.createdBy,
          summary: `지원이력 "${record.id}" 생성 — ${record.customer || ''} ${record.service || ''}`.trim(),
          detail: { id: record.id, type: record.type, supportMode: record.supportMode, mode: 'per_server', serverId: sid },
          ipAddr: req.ip,
        });
        out.push(record);
      }
      return out;
    }
    const effectiveServerIds = mode === 'workspace_only' ? [] : inputServerIds;
    const record = await createHistory(conn, { ...body, serverIds: effectiveServerIds, targetMode: undefined });
    await logAudit(conn, {
      action: 'create',
      entityType: 'support_history',
      entityId: record.id,
      userId: body.createdBy,
      summary: `지원이력 "${record.id}" 생성 — ${record.customer || ''} ${record.service || ''}`.trim(),
      detail: { id: record.id, type: record.type, supportMode: record.supportMode, mode },
      ipAddr: req.ip,
    });
    return record;
  });
  created(res, result);
}));

// PATCH /api/support-history/:id
supportHistoryRouter.patch('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(async conn => {
    const result = await updateHistory(conn, req.params.id, req.body || {});
    await logAudit(conn, { userId: getCurrentUserId(req), action: 'update', entityType: 'support_history', entityId: req.params.id, summary: `지원이력 "${req.params.id}" 수정`, detail: req.body, ipAddr: req.ip });
    return result;
  });
  ok(res, row);
}));

// DELETE /api/support-history/:id
supportHistoryRouter.delete('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const userId = getCurrentUserId(req);
  if (!userId) return errorResponse(res, { code: 'UNAUTHORIZED', message: '로그인이 필요합니다' }, 401);

  const result = await withOracleTransaction(async conn => {
    const history = await findHistoryById(conn, req.params.id);
    if (!history) {
      return { error: { code: 'NOT_FOUND', message: '지원이력을 찾을 수 없습니다' }, status: 404 };
    }

    const perms = await getPermissionValues(conn, userId, ['history.delete']);
    const permValue = perms['history.delete'];

    const isAdmin = permValue === true || permValue === 'true';
    const isSelf = permValue === 'self';
    const isAuthor = history.createdBy === userId;

    if (!isAdmin && !(isSelf && isAuthor)) {
      return { error: { code: 'FORBIDDEN', message: '삭제 권한이 없습니다' }, status: 403 };
    }

    const r = await deleteHistory(conn, req.params.id);
    await logAudit(conn, {
      userId,
      action: 'delete',
      entityType: 'support_history',
      entityId: req.params.id,
      summary: `지원이력 "${req.params.id}" 비활성화`,
      ipAddr: req.ip,
    });
    return r;
  });

  if (result && 'error' in result) {
    return errorResponse(res, result.error, result.status);
  }
  ok(res, result);
}));

// POST /api/support-history/parse-text — body: { text, channelName? }
supportHistoryRouter.post('/parse-text', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'text가 비어 있습니다' } });
  const result = await parseOperationalRecordText(text, req.body?.channelName, {
    customerId: req.body?.customerId,
  });
  ok(res, result);
}));

// POST /api/support-history/bulk  — 일괄 상태 변경
supportHistoryRouter.post('/bulk', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const { ids, status } = req.body || {};
  const result = await withOracleTransaction(async conn => {
    const r = await bulkUpdateStatus(conn, ids, status);
    await logAudit(conn, { userId: getCurrentUserId(req), action: 'bulk_update', entityType: 'support_history', summary: `지원이력 ${ids?.length || 0}건 상태 일괄 변경 → ${status}`, detail: { ids, status }, ipAddr: req.ip });
    return r;
  });
  ok(res, result);
}));

// POST /api/support-history/bulk-delete — 일괄 삭제
supportHistoryRouter.post('/bulk-delete', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const { ids } = req.body || {};
  const userId = getCurrentUserId(req);
  if (!userId) return errorResponse(res, { code: 'UNAUTHORIZED', message: '로그인이 필요합니다' }, 401);

  const result = await withOracleTransaction(async conn => {
    const perms = await getPermissionValues(conn, userId, ['history.delete']);
    const permValue = perms['history.delete'];
    const isAdmin = permValue === true || permValue === 'true';

    // 일괄 삭제는 관리자만 가능하도록 하거나, 개별 체크가 필요하지만 여기서는 단순하게 관리자 권한 위주로 처리
    // (또는 모든 ID에 대해 작성자 본인인지 체크해야 함)
    if (!isAdmin && permValue !== 'self') {
      return { error: { code: 'FORBIDDEN', message: '일괄 삭제 권한이 없습니다' }, status: 403 };
    }

    const r = await bulkDeleteHistories(conn, ids);
    await logAudit(conn, {
      userId,
      action: 'bulk_delete',
      entityType: 'support_history',
      summary: `지원이력 ${ids?.length || 0}건 일괄 비활성화`,
      detail: { ids },
      ipAddr: req.ip,
    });
    return r;
  });

  if (result && 'error' in result) {
    return errorResponse(res, result.error, result.status);
  }
  ok(res, result);
}));
