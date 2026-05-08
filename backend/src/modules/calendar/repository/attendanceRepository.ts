/**
 * 파일: backend/src/modules/calendar/repository/attendanceRepository.ts
 * 역할: ATTENDANCE_NOTICES 테이블 CRUD (직출·직퇴 알림).
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import oracledb from 'oracledb';
import {
  clobFetchHandler,
  requiredText,
  nullableText,
  toInt,
  toFlag,
  has,
  validationError,
  notFoundError,
  loadSql,
} from '../../../infra/oracle/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

const VALID_KINDS    = new Set(['direct_start', 'direct_end']);

export async function listAttendanceNotices(connection: any, options: {
  date?: string;
  from?: string;
  to?: string;
  staffUserId?: number;
  kind?: string;
  status?: string;
} = {}) {
  const conditions: string[] = [];
  const binds: Record<string, unknown> = {};

  if (options.date) {
    conditions.push(`TRUNC(ATTEND_DATE) = TO_DATE(:attend_date, 'YYYY-MM-DD')`);
    binds.attend_date = options.date;
  } else if (options.from || options.to) {
    if (options.from) {
      conditions.push(`TRUNC(ATTEND_DATE) >= TO_DATE(:date_from, 'YYYY-MM-DD')`);
      binds.date_from = options.from;
    }
    if (options.to) {
      conditions.push(`TRUNC(ATTEND_DATE) <= TO_DATE(:date_to, 'YYYY-MM-DD')`);
      binds.date_to = options.to;
    }
  }
  if (options.staffUserId) {
    conditions.push('STAFF_USER_ID = :staff_id');
    binds.staff_id = options.staffUserId;
  }
  if (options.kind) {
    conditions.push('KIND = :kind');
    binds.kind = options.kind;
  }
  if (options.status) {
    conditions.push('STATUS = :status');
    binds.status = options.status;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const fullSql = `${sql('selectAttendance.sql')} ${where} ORDER BY ATTEND_DATE DESC, EFFECTIVE_TIME DESC`;

  const result = await connection.execute(fullSql, binds, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    fetchTypeHandler: clobFetchHandler,
  });

  return (result.rows || []).map(normalizeRow);
}

export async function findAttendanceNoticeById(connection: any, noticeId: string) {
  const id = String(noticeId || '').trim();
  if (!id) throw validationError('noticeId가 유효하지 않습니다');

  const fullSql = `${sql('selectAttendance.sql')} WHERE NOTICE_ID = :id`;
  const result = await connection.execute(fullSql, { id }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    fetchTypeHandler: clobFetchHandler,
  });
  const row = result.rows?.[0] || null;
  return row ? normalizeRow(row) : null;
}

export async function createAttendanceNotice(connection: any, payload: any = {}) {
  const kind        = validateKind(requiredText(payload.kind, 'kind'));
  const staffUserId = toInt(payload.staffUserId);
  if (!staffUserId) throw validationError('staffUserId가 필요합니다');

  const location         = extractLocation(payload.location);
  const manualText       = nullableText(payload.manualLocationText);
  const memo             = nullableText(payload.memo);

  if (!location && !manualText && !memo) {
    throw validationError('GPS 불가 시 manualLocationText 또는 memo가 필요합니다');
  }

  const noticeId      = String(payload.id || `att-${randomUUID()}`).trim();
  const attendDate    = nullableText(payload.date) || new Date().toISOString().slice(0, 10);
  const effectiveTime = normalizeTime(payload.effectiveTime) || timeNow();

  await connection.execute(sql('insertAttendance.sql'), {
    notice_id:    noticeId,
    staff_id:     staffUserId,
    kind,
    attend_date:  attendDate,
    effective_time: effectiveTime,
    customer_id:  toInt(payload.customerId) ?? null,
    site_name:    nullableText(payload.siteName) || '현장 미입력',
    work_title:   nullableText(payload.workTitle),
    memo:         memo ?? null,
    manual_text:  manualText ?? null,
    lat:          location?.lat ?? null,
    lng:          location?.lng ?? null,
    accuracy:     location?.accuracy ?? null,
    captured_at:  location ? (location.capturedAt ? new Date(location.capturedAt) : new Date()) : null,
    consent:      location ? toFlag(location.consent) : null,
  });

  return await findAttendanceNoticeById(connection, noticeId);
}

export async function patchAttendanceNotice(connection: any, noticeId: string, payload: any = {}, actorUserId: number | null = null) {
  const current = await findAttendanceNoticeById(connection, noticeId);
  if (!current) throw notFoundError('직출·직퇴 알림을 찾을 수 없습니다');

  // 취소 처리 — 인증된 사용자가 본인 알림만 취소 가능
  if (payload.cancel === true) {
    if (!actorUserId || actorUserId !== current.staffUserId) {
      const err: any = new Error('본인의 알림만 취소할 수 있습니다');
      err.statusCode = 403;
      throw err;
    }
    await connection.execute(sql('cancelAttendance.sql'), { id: noticeId });
    return await findAttendanceNoticeById(connection, noticeId);
  }

  if (current.status === 'cancelled') {
    throw validationError('취소된 알림은 수정할 수 없습니다');
  }

  // 관리자 검토 처리
  const managerMemo = has(payload, 'managerMemo')
    ? nullableText(payload.managerMemo)
    : current.managerMemo;
  const needsCorrection = has(payload, 'needsCorrection')
    ? Boolean(payload.needsCorrection)
    : current.status === 'needs_correction';
  const newStatus = needsCorrection ? 'needs_correction' : 'recorded';

  await connection.execute(sql('reviewAttendance.sql'), {
    id: noticeId,
    status: newStatus,
    manager_memo: managerMemo ?? null,
    manager_user_id: actorUserId ?? null,
  });

  return await findAttendanceNoticeById(connection, noticeId);
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

function normalizeRow(row: any) {
  const hasGps = row.gpsLat != null && row.gpsLng != null;
  const location = hasGps ? {
    lat:        row.gpsLat,
    lng:        row.gpsLng,
    accuracy:   row.gpsAccuracy ?? null,
    capturedAt: row.gpsCapturedAt ? new Date(row.gpsCapturedAt).toISOString() : null,
    consent:    row.gpsConsent === 1,
  } : null;

  return {
    id:                 row.id,
    staffUserId:        row.staffUserId,
    kind:               row.kind,
    date:               row.attendDate ? formatDate(row.attendDate) : null,
    effectiveTime:      row.effectiveTime,
    customerId:         row.customerId ?? null,
    siteName:           row.siteName ?? '',
    workTitle:          row.workTitle ?? '',
    memo:               row.memo ?? '',
    manualLocationText: row.manualLocationText ?? '',
    location,
    attentionLevel:     !location && !row.manualLocationText ? 'missing_location' : null,
    status:             row.status,
    managerUserId:      row.managerUserId ?? null,
    managerSeenAt:      row.managerSeenAt ? new Date(row.managerSeenAt).toISOString() : null,
    managerMemo:        row.managerMemo ?? '',
    createdAt:          row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt:          row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

function extractLocation(loc: any) {
  if (!loc || typeof loc !== 'object') return null;
  const lat = Number(loc.lat || loc.latitude);
  const lng = Number(loc.lng || loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    accuracy:   Number(loc.accuracy) || null,
    capturedAt: loc.capturedAt || null,
    consent:    loc.consent === true,
  };
}

function normalizeTime(value: any) {
  const s = String(value ?? '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function timeNow() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDate(val: any) {
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function validateKind(v: string) {
  if (!VALID_KINDS.has(v)) throw validationError('kind는 direct_start 또는 direct_end여야 합니다');
  return v;
}
