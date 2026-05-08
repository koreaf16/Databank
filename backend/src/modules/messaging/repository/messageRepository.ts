/**
 * 파일: backend/src/modules/messaging/repository/messageRepository.ts
 * 역할: CHANNEL_MESSAGES + MESSAGE_REACTIONS CRUD.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import oracledb from 'oracledb';
import {
  clobFetchHandler,
  requiredText,
  nullableText,
  toInt,
  toFlag,
  validationError,
  notFoundError,
  loadSql,
} from '../../../infra/oracle/helpers.js';
import {
  setMessageTargets,
  fetchTargetsForMessages,
  listMessageTargets,
} from './messageTargetRepository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

const VALID_MSG_TYPES = new Set(['text', 'system', 'bot']);

export async function listMessages(connection: any, channelId: number | string, options: {
  before?: string;
  limit?: number;
  parentId?: number | null;
  workspaceId?: number | null;
  serverIds?: ReadonlyArray<number>;
} = {}) {
  const cid = toInt(channelId);
  if (!cid) throw validationError('channelId가 유효하지 않습니다');

  const limit  = Math.min(options.limit ?? 50, 200);
  const binds: Record<string, unknown> = { cid, limit };
  const conds: string[] = ['m.CHANNEL_ID = :cid', 'm.ENABLED = 1'];

  if (options.parentId != null) {
    conds.push('m.PARENT_ID = :parent_id');
    binds.parent_id = options.parentId;
  } else {
    conds.push('m.PARENT_ID IS NULL');
  }

  if (options.before) {
    conds.push(`m.SENT_AT < TO_TIMESTAMP(:before, 'YYYY-MM-DD"T"HH24:MI:SS')`);
    binds.before = options.before.replace('Z', '');
  }

  if (options.workspaceId != null) {
    conds.push('m.WORKSPACE_ID = :workspace_id');
    binds.workspace_id = options.workspaceId;
  }

  if (Array.isArray(options.serverIds) && options.serverIds.length > 0) {
    const placeholders = options.serverIds.map((_, i) => `:srv${i}`).join(', ');
    options.serverIds.forEach((sid, i) => { binds[`srv${i}`] = sid; });
    conds.push(`EXISTS (
      SELECT 1 FROM CHANNEL_MESSAGE_TARGETS t
       WHERE t.MESSAGE_ID = m.MESSAGE_ID
         AND t.SERVER_ID IN (${placeholders})
    )`);
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const fullSql = `
    ${sql('selectMessage.sql')}
    ${where}
    ORDER BY m.SENT_AT DESC
    FETCH FIRST :limit ROWS ONLY
  `;

  const result = await connection.execute(fullSql, binds, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    fetchTypeHandler: clobFetchHandler,
  });

  const messages = ((result.rows || []) as any[]).reverse().map(normalizeMsg);

  if (messages.length > 0) {
    const targetsMap = await fetchTargetsForMessages(connection, messages.map((m) => m.id));
    for (const msg of messages) {
      msg.targets = targetsMap.get(msg.id) || [];
    }
  }

  const dayMap = new Map<string, any[]>();
  for (const msg of messages) {
    const day = msg.sentAt ? msg.sentAt.slice(0, 10) : 'unknown';
    if (!dayMap.has(day)) dayMap.set(day, []);
    dayMap.get(day)!.push(msg);
  }

  return Array.from(dayMap.entries()).map(([date, msgs]) => ({ date, messages: msgs }));
}

export async function findMessageById(connection: any, messageId: number | string) {
  const id = toInt(messageId);
  if (!id) throw validationError('messageId가 유효하지 않습니다');

  const fullSql = `${sql('selectMessage.sql')} WHERE m.MESSAGE_ID = :id AND m.ENABLED = 1`;
  const result = await connection.execute(fullSql, { id }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    fetchTypeHandler: clobFetchHandler,
  });
  const row = result.rows?.[0] || null;
  if (!row) return null;
  const msg = normalizeMsg(row);
  msg.targets = await listMessageTargets(connection, id);
  return msg;
}

export async function createMessage(connection: any, channelId: number | string, payload: any = {}) {
  const cid = toInt(channelId);
  if (!cid) throw validationError('channelId가 유효하지 않습니다');

  const msgType     = validateMsgType(String(payload.msgType ?? 'text'));
  const content     = nullableText(payload.content);
  const authorId    = toInt(payload.authorUserId) ?? null;
  const isBot       = toFlag(payload.isBot);
  const botName     = nullableText(payload.botName);
  const parentId    = toInt(payload.parentId) ?? null;
  const workspaceId = toInt(payload.workspaceId) ?? null;
  const serverIds   = Array.isArray(payload.serverIds)
    ? payload.serverIds
    : (Array.isArray(payload.targets) ? payload.targets.map((t: any) => t?.serverId ?? t) : []);

  if (!content && !payload.attachmentJson) {
    throw validationError('content 또는 attachmentJson이 필요합니다');
  }

  const attachJson = payload.attachmentJson
    ? (typeof payload.attachmentJson === 'string' ? payload.attachmentJson : JSON.stringify(payload.attachmentJson))
    : null;

  const result = await connection.execute(sql('insertMessage.sql'), {
    cid,
    workspace_id: workspaceId,
    author_id:    authorId,
    is_bot:       isBot,
    bot_name:     botName,
    msg_type:     msgType,
    content:      content ?? null,
    attach_json:  attachJson,
    parent_id:    parentId,
    out_id:       { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
  });

  const newId = result.outBinds.out_id[0];

  if (serverIds.length > 0) {
    await setMessageTargets(connection, newId, serverIds);
  }

  if (parentId) {
    await connection.execute(sql('incrementThreadCount.sql'), { pid: parentId });
  }

  return await findMessageById(connection, newId);
}

export async function deleteMessage(connection: any, messageId: number | string, userId?: number | string) {
  const id  = toInt(messageId);
  if (!id) throw validationError('messageId가 유효하지 않습니다');
  const row = await findMessageById(connection, id);
  if (!row) throw notFoundError('메시지를 찾을 수 없습니다');

  await connection.execute(sql('deleteMessage.sql'), { id });
  return { id, deleted: true };
}

// ── 리액션 ──────────────────────────────────────────────────────────────────

export async function listReactions(connection: any, messageId: number | string) {
  const mid = toInt(messageId);
  const result = await connection.execute(sql('listReactions.sql'), { mid }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  return (result.rows || []).map((r: any) => ({ emoji: r.emoji, count: r.count }));
}

export async function toggleReaction(connection: any, messageId: number | string, userId: number | string, emoji: string) {
  const mid = toInt(messageId);
  const uid = toInt(userId);
  const e   = String(emoji || '').trim();
  if (!e) throw validationError('emoji가 필요합니다');

  const existing = await connection.execute(sql('checkReactionExists.sql'), { mid, usrId: uid, e }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

  if ((existing.rows?.length ?? 0) > 0) {
    await connection.execute(sql('deleteReaction.sql'), { mid, usrId: uid, e });
    return { messageId: mid, emoji: e, action: 'removed' };
  } else {
    await connection.execute(sql('insertReaction.sql'), { mid, usrId: uid, e });
    return { messageId: mid, emoji: e, action: 'added' };
  }
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

function normalizeMsg(row: any) {
  return {
    ...row,
    isBot:      row.isBot === 1,
    sentAt:     row.sentAt ? new Date(row.sentAt).toISOString() : null,
    updatedAt:  row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    attachment: row.attachmentJson ? JSON.parse(row.attachmentJson) : null,
  };
}

function validateMsgType(v: string) {
  if (!VALID_MSG_TYPES.has(v)) throw validationError('msgType은 text·system·bot 중 하나여야 합니다');
  return v;
}
