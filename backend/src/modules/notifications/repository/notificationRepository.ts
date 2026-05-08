// @ts-nocheck
/**
 * 파일: backend/src/modules/notifications/repository/notificationRepository.ts
 * 역할: 앱 내부 알림 CRUD.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'crypto';
import { isUniqueError, loadSql } from '../../../infra/oracle/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

export async function listNotifications(connection: any, filters: any = {}) {
  const userId = Number(filters.userId);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 50));
  const conditions = ['ENABLED = 1', 'USER_ID = :user_id'];
  const binds: any = { user_id: userId, limit };

  if (filters.unreadOnly) conditions.push('READ_AT IS NULL');

  const fullSql = `
    SELECT * FROM (
      ${sql('selectNotifications.sql')}
      WHERE ${conditions.join(' AND ')}
      ORDER BY CREATED_AT DESC
    )
    WHERE ROWNUM <= :limit
  `;

  const result = await connection.execute(fullSql, binds);
  return result.rows || [];
}

export async function createNotification(connection: any, payload: any = {}) {
  const row = {
    id: payload.id || `notif-${crypto.randomUUID()}`,
    userId: Number(payload.userId),
    category: String(payload.category || 'system'),
    title: String(payload.title || '').trim(),
    message: payload.message == null ? null : String(payload.message),
    entityType: payload.entityType == null ? null : String(payload.entityType),
    entityId: payload.entityId == null ? null : String(payload.entityId),
    dedupeKey: payload.dedupeKey == null ? null : String(payload.dedupeKey),
  };

  if (!Number.isFinite(row.userId) || !row.title) return null;

  try {
    await connection.execute(sql('insertNotification.sql'), {
      id: row.id,
      user_id: row.userId,
      category: row.category,
      title: row.title,
      message: row.message,
      entity_type: row.entityType,
      entity_id: row.entityId,
      dedupeKey: row.dedupeKey,
    });
    return {
      ...row,
      readAt: null,
      createdAt: new Date().toISOString().slice(0, 16),
    };
  } catch (err: any) {
    if (isUniqueError(err)) return null;
    throw err;
  }
}

export async function markNotificationRead(connection: any, userId: number, notificationId: string) {
  await connection.execute(sql('markRead.sql'), { id: notificationId, user_id: userId });
  return { id: notificationId, read: true };
}

export async function markAllNotificationsRead(connection: any, userId: number) {
  await connection.execute(sql('markAllRead.sql'), { user_id: userId });
  return { read: true };
}

