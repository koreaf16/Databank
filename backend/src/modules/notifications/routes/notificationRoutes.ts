// @ts-nocheck
/**
 * 파일: backend/src/modules/notifications/routes/notificationRoutes.ts
 * 역할: 앱 내부 알림 조회/읽음/SSE 라우트.
 */

import { Router } from 'express';
import { asyncHandler } from '../../../http/asyncHandler.js';
import { ok, errorResponse } from '../../../http/apiResponse.js';
import { requireOracle } from '../../../http/errorHandler.js';
import { getCurrentUserId } from '../../../http/currentUser.js';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../infra/oracle/withTransaction.js';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../repository/notificationRepository.js';
import { subscribeNotifications } from '../services/notificationHub.js';

export const notificationRouter = Router();

function requireUser(req: any, res: any): number | null {
  const userId = getCurrentUserId(req);
  if (!userId) {
    errorResponse(res, { code: 'UNAUTHORIZED', message: '로그인이 필요합니다' }, 401);
    return null;
  }
  return userId;
}

notificationRouter.get('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const userId = requireUser(req, res);
  if (!userId) return;
  const rows = await withOracleConnection(conn => listNotifications(conn, {
    userId,
    unreadOnly: req.query.unreadOnly === '1' || req.query.unreadOnly === 'true',
    limit: req.query.limit,
  }));
  ok(res, rows);
}));

notificationRouter.patch('/:id/read', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const userId = requireUser(req, res);
  if (!userId) return;
  const row = await withOracleTransaction(conn => markNotificationRead(conn, userId, String(req.params.id)));
  ok(res, row);
}));

notificationRouter.post('/read-all', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const userId = requireUser(req, res);
  if (!userId) return;
  const row = await withOracleTransaction(conn => markAllNotificationsRead(conn, userId));
  ok(res, row);
}));

notificationRouter.get('/stream', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.flushHeaders?.();

  const unsubscribe = subscribeNotifications(userId, res);
  const keepAlive = setInterval(() => {
    res.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

