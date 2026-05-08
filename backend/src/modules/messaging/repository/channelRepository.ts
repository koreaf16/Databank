/**
 * 파일: backend/src/modules/messaging/repository/channelRepository.ts
 * 역할: CHANNELS + CHANNEL_MEMBERS CRUD.
 *       고객사 채널은 CUSTOMERS 조인, 팀 채널은 DEPARTMENTS 조인.
 *       채널 목록 API: kind 별 분류 + 미읽은 수(CLIENT 계산) 반환.
 *
 * 연관 파일:
 *   - schema/messagingSchema.ts      : DDL
 *   - routes/messagingRoutes.ts      : HTTP 라우트
 *   - infra/oracle/helpers.ts        : requiredText 등
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import oracledb from 'oracledb';
import {
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

const VALID_KINDS     = new Set(['customer', 'team', 'incident', 'announcement', 'dm']);
const VALID_STATUSES  = new Set(['active', 'archived', 'resolved']);
const VALID_SEVERITIES = new Set(['info', 'warn', 'crit']);

export async function listChannels(connection: any, options: {
  kind?: string;
  status?: string;
  userId?: number;
} = {}): Promise<any[]> {
  const conditions: string[] = [];
  const binds: Record<string, unknown> = {};

  if (options.kind) {
    conditions.push('c.KIND = :kind');
    binds.kind = options.kind;
  }
  if (options.status) {
    conditions.push('c.STATUS = :status');
    binds.status = options.status;
  }

  let memberJoin = '';
  if (options.userId) {
    memberJoin = `JOIN CHANNEL_MEMBERS cm ON cm.CHANNEL_ID = c.CHANNEL_ID AND cm.USER_ID = :user_id`;
    binds.user_id = options.userId;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const fullSql = `
    ${sql('selectChannel.sql')}
    ${memberJoin}
    ${where}
    ORDER BY c.IS_PINNED DESC, c.KIND, c.NAME
  `;

  const result = await connection.execute(fullSql, binds, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
  });

  return (result.rows || []).map(normalizeRow);
}

export async function findChannelById(connection: any, channelId: any): Promise<any | null> {
  const id = toInt(channelId);
  if (!id) throw validationError('channelId가 유효하지 않습니다');

  const fullSql = `${sql('selectChannel.sql')} WHERE c.CHANNEL_ID = :id`;
  const result = await connection.execute(fullSql, { id }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
  });
  const row = result.rows?.[0] || null;
  return row ? normalizeRow(row) : null;
}

export async function createChannel(connection: any, payload: any = {}): Promise<any> {
  const kind = validateKind(requiredText(payload.kind, 'kind'));
  const name = requiredText(payload.name, 'name');

  const result = await connection.execute(sql('insertChannel.sql'), {
    kind,
    name,
    topic:       nullableText(payload.topic),
    customer_id: toInt(payload.customerId) ?? null,
    dept_id:     toInt(payload.deptId) ?? null,
    severity:    payload.severity ? validateSeverity(String(payload.severity)) : null,
    status:      'active',
    is_pinned:   toFlag(payload.isPinned),
    is_read_only: toFlag(payload.isReadOnly),
    icon:        nullableText(payload.icon),
    color:       nullableText(payload.color),
    created_by:  toInt(payload.createdBy) ?? null,
    out_id:      { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
  });

  return await findChannelById(connection, result.outBinds.out_id[0]);
}

export async function updateChannel(connection: any, channelId: any, payload: any = {}): Promise<any> {
  const id = toInt(channelId);
  if (!id) throw validationError('channelId가 유효하지 않습니다');
  const current = await findChannelById(connection, id);
  if (!current) throw notFoundError('채널을 찾을 수 없습니다');

  const newStatus = has(payload, 'status')
    ? validateStatus(String(payload.status))
    : current.status;

  await connection.execute(sql('updateChannel.sql'), {
    id,
    name:        has(payload, 'name')       ? requiredText(payload.name, 'name') : current.name,
    topic:       has(payload, 'topic')      ? nullableText(payload.topic)        : current.topic,
    severity:    has(payload, 'severity')   ? (payload.severity ? validateSeverity(String(payload.severity)) : null) : current.severity,
    status:      newStatus,
    is_pinned:   has(payload, 'isPinned')   ? toFlag(payload.isPinned)   : (current.isPinned ? 1 : 0),
    is_read_only: has(payload, 'isReadOnly') ? toFlag(payload.isReadOnly) : (current.isReadOnly ? 1 : 0),
  });

  return await findChannelById(connection, id);
}

export async function getChannelMemberCount(connection: any, channelId: any) {
  const id = toInt(channelId);
  const result = await connection.execute(sql('getChannelMemberCount.sql'), { id }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
  });
  return (result.rows?.[0] as any)?.count ?? 0;
}

export async function addChannelMember(connection: any, channelId: any, userId: any) {
  const cid = toInt(channelId);
  const uid = toInt(userId);
  if (!cid || !uid) throw validationError('channelId, userId가 필요합니다');

  try {
    await connection.execute(sql('addChannelMember.sql'), { cid, usrId: uid });
  } catch (err: any) {
    if (err.errorNum === 1) return { channelId: cid, userId: uid, alreadyMember: true };
    throw err;
  }
  return { channelId: cid, userId: uid };
}

export async function removeChannelMember(connection: any, channelId: any, userId: any) {
  const cid = toInt(channelId);
  const uid = toInt(userId);
  await connection.execute(sql('removeChannelMember.sql'), { cid, usrId: uid });
  return { channelId: cid, userId: uid, removed: true };
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

function normalizeRow(row: any) {
  const displayName = row.customerName || row.name || row.deptName || '';
  return {
    id:           row.id,
    kind:         row.kind,
    name:         row.name,
    topic:        row.topic ?? null,
    customerId:   row.customerId ?? null,
    customerName: row.customerName ?? null,
    deptId:       row.deptId ?? null,
    deptName:     row.deptName ?? null,
    severity:     row.severity ?? null,
    status:       row.status,
    isPinned:     row.isPinned === 1,
    pinned:       row.isPinned === 1,
    starred:      row.isPinned === 1,
    isReadOnly:   row.isReadOnly === 1,
    icon:         row.icon ?? null,
    color:        row.color ?? null,
    initial:      displayName[0] || '#',
    unread:       0,
    mentioned:    false,
    members:      0,
    createdBy:    row.createdBy ?? null,
    createdAt:    row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt:    row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

function validateKind(v: string) {
  if (!VALID_KINDS.has(v)) throw validationError('kind는 customer·team·incident·announcement·dm 중 하나여야 합니다');
  return v;
}
function validateStatus(v: string) {
  if (!VALID_STATUSES.has(v)) throw validationError('status는 active·archived·resolved 중 하나여야 합니다');
  return v;
}
function validateSeverity(v: string) {
  if (!VALID_SEVERITIES.has(v)) throw validationError('severity는 info·warn·crit 중 하나여야 합니다');
  return v;
}
