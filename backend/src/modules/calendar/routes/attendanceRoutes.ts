/**
 * 파일: backend/src/modules/calendar/routes/attendanceRoutes.ts
 * 역할: ATTENDANCE_NOTICES CRUD HTTP 라우트. /api/attendance/notices 경로.
 *       기존 attendanceMock.ts 인메모리 라우트를 Oracle 기반으로 전환.
 *
 * 연관 파일:
 *   - repository/attendanceRepository.ts : DB 쿼리
 *   - infra/oracle/withConnection.ts     : 읽기 전용 커넥션
 *   - infra/oracle/withTransaction.ts    : 쓰기 트랜잭션
 *   - http/asyncHandler.ts               : 예외 → errorHandler
 *   - http/apiResponse.ts                : ok/created envelope
 *   - http/errorHandler.ts               : requireOracle guard
 */

import { Router } from 'express';
import { asyncHandler } from '../../../http/asyncHandler.js';
import { ok, created } from '../../../http/apiResponse.js';
import { requireOracle } from '../../../http/errorHandler.js';
import { toNumber } from '../../../http/validators/primitives.js';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../infra/oracle/withTransaction.js';
import { getCurrentUserId } from '../../../http/currentUser.js';
import {
  listAttendanceNotices,
  findAttendanceNoticeById,
  createAttendanceNotice,
  patchAttendanceNotice,
} from '../repository/attendanceRepository.js';

export const attendanceRouter = Router();

// GET /api/attendance/notices?date=YYYY-MM-DD&staffUserId=&kind=&status=
attendanceRouter.get('/notices', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const rows = await withOracleConnection(conn => listAttendanceNotices(conn, {
    date:        req.query.date as string | undefined,
    from:        req.query.from as string | undefined,
    to:          req.query.to as string | undefined,
    staffUserId: toNumber(req.query.staffUserId) || undefined,
    kind:        req.query.kind as string | undefined,
    status:      req.query.status as string | undefined,
  }));
  ok(res, rows);
}));

// GET /api/attendance/notices/:id
attendanceRouter.get('/notices/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleConnection(conn => findAttendanceNoticeById(conn, req.params.id));
  if (!row) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '알림을 찾을 수 없습니다' } });
  ok(res, row);
}));

// POST /api/attendance/notices
attendanceRouter.post('/notices', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(conn => createAttendanceNotice(conn, req.body || {}));
  created(res, row);
}));

// PATCH /api/attendance/notices/:id
attendanceRouter.patch('/notices/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(
    conn => patchAttendanceNotice(conn, req.params.id, req.body || {}, getCurrentUserId(req)),
  );
  ok(res, row);
}));
