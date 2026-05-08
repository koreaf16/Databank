/**
 * 파일: backend/src/modules/audit/repository/auditRepository.ts
 * 역할: AUDIT_LOGS 기록 + 조회.
 *       logAudit()은 다른 모듈 트랜잭션 안에서 호출해 함께 커밋된다.
 *
 * 연관 파일:
 *   - schema/auditSchema.ts         : 테이블 DDL
 *   - routes/auditRoutes.ts         : 조회 HTTP 라우트
 *   - 각 도메인 라우트              : write 시점에 logAudit 호출
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { clobFetchHandler, nullableText, nullableClob, loadSql } from '../../../infra/oracle/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  userId?: number | null;
  summary?: string | null;
  detail?: any;
  ipAddr?: string | null;
}

export async function logAudit(connection: any, entry: AuditEntry): Promise<void> {
  const { action, entityType, entityId, userId, summary, detail, ipAddr } = entry;
  const detailJson = detail != null ? JSON.stringify(detail) : null;
  await connection.execute(sql('insertAudit.sql'), {
    action: String(action).slice(0, 50),
    entity_type: String(entityType).slice(0, 100),
    entity_id: entityId ? String(entityId).slice(0, 200) : null,
    user_id: userId || null,
    summary: summary ? String(summary).slice(0, 500) : null,
    detail: nullableClob(detailJson),
    ip_addr: ipAddr ? String(ipAddr).slice(0, 50) : null,
  });
}

export async function listAuditLogs(connection: any, filters: {
  entityType?: string;
  action?: string;
  userId?: number;
  from?: string;
  to?: string;
  limit?: number;
} = {}): Promise<any[]> {
  const conditions: string[] = [];
  const binds: Record<string, any> = {};

  if (filters.entityType) { conditions.push('ENTITY_TYPE = :entity_type'); binds.entity_type = filters.entityType; }
  if (filters.action)     { conditions.push('ACTION = :action');           binds.action = filters.action; }
  if (filters.userId)     { conditions.push('USER_ID = :user_id');         binds.user_id = Number(filters.userId); }
  if (filters.from) {
    conditions.push(`CREATED_AT >= TO_TIMESTAMP(:from_dt, 'YYYY-MM-DD"T"HH24:MI:SS')`);
    binds.from_dt = filters.from;
  }
  if (filters.to) {
    conditions.push(`CREATED_AT < TO_TIMESTAMP(:to_dt, 'YYYY-MM-DD"T"HH24:MI:SS') + 1`);
    binds.to_dt = filters.to;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Number(filters.limit) || 100, 500);

  const fullSql = `${sql('selectAudit.sql')} ${where} ORDER BY l.CREATED_AT DESC FETCH FIRST :lim ROWS ONLY`;

  const result = await connection.execute(fullSql, { ...binds, lim: limit }, { fetchTypeHandler: clobFetchHandler });

  return (result.rows || []).map((row: any) => ({
    ...row,
    detail: row.detail
      ? (() => { try { return JSON.parse(row.detail); } catch { return row.detail; } })()
      : null,
  }));
}
