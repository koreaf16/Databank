// @ts-nocheck
/**
 * 파일: backend/src/modules/calendar/routes/calendarRoutes.js
 * 역할: 일정관리(EVENTS + EVENT_PARTICIPANTS) CRUD HTTP 라우트. /api/calendar/events 경로.
 *
 * 연관 파일:
 *   - modules/calendar/repository/eventsRepository.js : DB 쿼리
 *   - infra/oracle/withTransaction.js                 : commit 자동
 *   - http/asyncHandler.js                            : 예외 → errorHandler
 *   - http/apiResponse.js                             : ok/created envelope
 *   - http/errorHandler.js                            : requireOracle guard
 *   - http/validators/primitives.js                   : toNumber
 */

import { Router } from 'express';
import { asyncHandler } from '../../../http/asyncHandler.js';
import { ok, created } from '../../../http/apiResponse.js';
import { requireOracle } from '../../../http/errorHandler.js';
import { toNumber } from '../../../http/validators/primitives.js';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../infra/oracle/withTransaction.js';
import {
  listEvents,
  findEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  editEventOccurrence,
  deleteEventOccurrence,
} from '../repository/eventsRepository.js';
import { logAudit } from '../../audit/repository/auditRepository.js';
import { getCurrentUserId } from '../../../http/currentUser.js';

export const calendarRouter = Router();

calendarRouter.get('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const rows = await withOracleConnection(conn => listEvents(conn, req.query));
  ok(res, rows);
}));

calendarRouter.get('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleConnection(conn => findEventById(conn, toNumber(req.params.id)));
  if (!row) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '일정을 찾을 수 없습니다' } });
  ok(res, row);
}));

calendarRouter.post('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const userId = getCurrentUserId(req);
  const row = await withOracleTransaction(async conn => {
    const result = await createEvent(conn, { ...(req.body || {}), createdBy: req.body?.createdBy ?? userId });
    await logAudit(conn, { action: 'create', entityType: 'event', entityId: String(result.id), userId, summary: `일정 "${result.title}" 생성`, detail: { title: result.title, startAt: result.startAt, endAt: result.endAt }, ipAddr: req.ip });
    return result;
  });
  created(res, row);
}));

calendarRouter.patch('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const id = toNumber(req.params.id);
  const row = await withOracleTransaction(async conn => {
    const result = await updateEvent(conn, id, req.body || {});
    await logAudit(conn, { userId: getCurrentUserId(req), action: 'update', entityType: 'event', entityId: String(id), summary: `일정 ID ${id} 수정`, detail: req.body, ipAddr: req.ip });
    return result;
  });
  ok(res, row);
}));

calendarRouter.delete('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const id = toNumber(req.params.id);
  const result = await withOracleTransaction(async conn => {
    const r = await deleteEvent(conn, id);
    await logAudit(conn, { userId: getCurrentUserId(req), action: 'delete', entityType: 'event', entityId: String(id), summary: `일정 ID ${id} 삭제`, ipAddr: req.ip });
    return r;
  });
  ok(res, result);
}));

calendarRouter.post('/:id/occurrences/edit', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const id = toNumber(req.params.id);
  const userId = getCurrentUserId(req);
  const row = await withOracleTransaction(async conn => {
    const result = await editEventOccurrence(conn, id, {
      ...(req.body || {}),
      changes: { ...(req.body?.changes || {}), createdBy: req.body?.changes?.createdBy ?? userId },
    });
    await logAudit(conn, { userId, action: 'update', entityType: 'event_occurrence', entityId: String(id), summary: `반복 일정 ID ${id} occurrence 수정`, detail: req.body, ipAddr: req.ip });
    return result;
  });
  ok(res, row);
}));

calendarRouter.post('/:id/occurrences/delete', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const id = toNumber(req.params.id);
  const userId = getCurrentUserId(req);
  const result = await withOracleTransaction(async conn => {
    const r = await deleteEventOccurrence(conn, id, req.body || {});
    await logAudit(conn, { userId, action: 'delete', entityType: 'event_occurrence', entityId: String(id), summary: `반복 일정 ID ${id} occurrence 삭제`, detail: req.body, ipAddr: req.ip });
    return r;
  });
  ok(res, result);
}));

