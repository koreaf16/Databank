/**
 * 파일: backend/src/oracle.ts
 * 역할: [레거시 호환] Oracle Connection Pool 취득 및 유틸.
 *       기능 대부분이 infra/oracle로 이전되었으며, 이 파일은 점진적으로 제거한다.
 */

import oracledb from 'oracledb';
import { env } from './config/env.js';
import { getOraclePool, closeOraclePool, hasOracleConfig } from './infra/oracle/pool.js';

/**
 * 커넥션을 빌려 로직을 실행한 후 반드시 해제한다.
 */
export async function withOracleConnection<T>(fn: (conn: any) => Promise<T>): Promise<T> {
  const pool = await getOraclePool();
  const connection = await pool.getConnection();
  try {
    return await fn(connection);
  } finally {
    try { await connection.close(); } catch (_) {}
  }
}

export function getOracleConnectString(): string {
  const raw = env.DATABASE_URL;
  const value = String(raw ?? '').trim();
  if (!value) return '';
  return value.replace(/^oracle(?:\+thin)?:\/\//i, '');
}

export { getOraclePool, closeOraclePool, hasOracleConfig };
