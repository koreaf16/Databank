/**
 * 파일: backend/src/modules/home/routes/homeRoutes.ts
 * 역할: 홈 대시보드 집계 API. /api/home 경로.
 *       별도 테이블 없음 — EVENTS·SUPPORT_HISTORIES·CUSTOMERS 집계.
 *
 * 엔드포인트:
 *   GET /api/home/summary       — 오늘 일정 수, 이번 주 지원이력 수, 미완료 점검 수
 *   GET /api/home/today-events  — 오늘 일정 목록 (5건 이하)
 *   GET /api/home/recent-history — 최근 지원이력 (5건)
 *
 * 연관 파일:
 *   - modules/calendar/schema/calendarSchema.ts       : EVENTS
 *   - modules/support-history/schema/supportHistorySchema.ts : SUPPORT_HISTORIES
 *   - infra/oracle/withConnection.ts                  : 읽기 전용 커넥션
 */

import { Router } from 'express';
import oracledb from 'oracledb';
import { asyncHandler } from '../../../http/asyncHandler.js';
import { ok } from '../../../http/apiResponse.js';
import { requireOracle } from '../../../http/errorHandler.js';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';

export const homeRouter = Router();

// GET /api/home/summary
homeRouter.get('/summary', asyncHandler(async (_req, res) => {
  if (!requireOracle(res)) return;

  const summary = await withOracleConnection(async (conn) => {
    const [eventsRes, histRes, pendingRes] = await Promise.all([
      // 오늘 일정 수
      conn.execute(
        `SELECT COUNT(*) AS "count" FROM EVENTS
         WHERE TRUNC(START_AT) = TRUNC(SYSDATE) AND ENABLED = 1`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      ),
      // 이번 주 지원이력 수
      conn.execute(
        `SELECT COUNT(*) AS "count" FROM SUPPORT_HISTORIES
         WHERE SUPPORT_STARTED_AT >= TRUNC(SYSDATE, 'IW')`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      ),
      // 처리중(pending) 지원이력 수
      conn.execute(
        `SELECT COUNT(*) AS "count" FROM SUPPORT_HISTORIES WHERE STATUS = 'pending'`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      ),
    ]);

    return {
      todayEventCount:   (eventsRes.rows?.[0] as any)?.count ?? 0,
      weekHistoryCount:  (histRes.rows?.[0]  as any)?.count ?? 0,
      pendingWorkCount:  (pendingRes.rows?.[0] as any)?.count ?? 0,
    };
  });

  ok(res, summary);
}));

// GET /api/home/today-events?userId=
homeRouter.get('/today-events', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;

  const userId = req.query.userId ? Number(req.query.userId) : null;

  const rows = await withOracleConnection(async (conn) => {
    const binds: Record<string, unknown> = {};
    let userJoin = '';

    if (userId) {
      userJoin = `
        JOIN EVENT_PARTICIPANTS ep
          ON ep.EVENT_ID = e.EVENT_ID AND ep.USER_ID = :user_id
      `;
      binds.user_id = userId;
    }

    const result = await conn.execute(
      `
        SELECT
          e.EVENT_ID    AS "id",
          e.TITLE       AS "title",
          e.EVENT_TYPE  AS "eventType",
          e.START_AT    AS "startAt",
          e.END_AT      AS "endAt",
          e.METHOD      AS "method",
          c.CUSTOMER_MAIN AS "customerName"
        FROM EVENTS e
        ${userJoin}
        LEFT JOIN CUSTOMERS c ON c.CUSTOMER_ID = e.CUSTOMER_ID
        WHERE TRUNC(e.START_AT) = TRUNC(SYSDATE)
          AND e.ENABLED = 1
        ORDER BY e.START_AT
        FETCH FIRST 10 ROWS ONLY
      `,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    return (result.rows || []).map((r: any) => ({
      id:           r.id,
      title:        r.title,
      eventType:    r.eventType,
      startAt:      r.startAt ? new Date(r.startAt).toISOString() : null,
      endAt:        r.endAt   ? new Date(r.endAt).toISOString()   : null,
      method:       r.method,
      customerName: r.customerName ?? null,
    }));
  });

  ok(res, rows);
}));

// GET /api/home/recent-history?userId=
homeRouter.get('/recent-history', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;

  const userId = req.query.userId ? Number(req.query.userId) : null;

  const rows = await withOracleConnection(async (conn) => {
    const binds: Record<string, unknown> = {};
    let userJoin = '';

    if (userId) {
      userJoin = `
        JOIN SUPPORT_HISTORY_PARTICIPANTS shp
          ON shp.HISTORY_ID = sh.HISTORY_ID AND shp.USER_ID = :user_id
      `;
      binds.user_id = userId;
    }

    const result = await conn.execute(
      `
        SELECT
          sh.HISTORY_ID           AS "id",
          sh.HISTORY_TYPE         AS "historyType",
          sh.STATUS               AS "status",
          sh.SUMMARY              AS "summary",
          sh.SUPPORT_STARTED_AT   AS "startedAt",
          sh.SUPPORT_ENDED_AT     AS "endedAt",
          c.CUSTOMER_MAIN         AS "customerName"
        FROM SUPPORT_HISTORIES sh
        ${userJoin}
        LEFT JOIN CUSTOMERS c ON c.CUSTOMER_ID = sh.CUSTOMER_ID
        ORDER BY sh.SUPPORT_STARTED_AT DESC
        FETCH FIRST 10 ROWS ONLY
      `,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    return (result.rows || []).map((r: any) => ({
      id:           r.id,
      historyType:  r.historyType,
      status:       r.status,
      summary:      r.summary ?? '',
      startedAt:    r.startedAt ? new Date(r.startedAt).toISOString() : null,
      endedAt:      r.endedAt   ? new Date(r.endedAt).toISOString()   : null,
      customerName: r.customerName ?? null,
    }));
  });

  ok(res, rows);
}));
