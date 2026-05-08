/**
 * 파일: backend/src/infra/oracle/pool.ts
 * 역할: Oracle Connection Pool 초기화·취득·종료.
 */

import oracledb from 'oracledb';
import { env } from '../../config/env.js';

let pool: oracledb.Pool | null = null;

/**
 * ENV 설정 여부 확인 (라우트 guard용)
 */
export function hasOracleConfig(): boolean {
  return !!(env.DATABASE_URL && env.DATABASE_USER && env.DATABASE_PASSWORD);
}

/**
 * 싱글턴 풀 취득 (최초 호출 시 생성)
 */
export async function getOraclePool(): Promise<oracledb.Pool> {
  if (pool) return pool;

  if (!hasOracleConfig()) {
    throw new Error('Oracle DB 설정이 없습니다. ENV를 확인하세요.');
  }

  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

  pool = await oracledb.createPool({
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    connectString: normalizeConnectString(env.DATABASE_URL),
    poolMin: 1,
    poolMax: 4,
    poolIncrement: 1,
    poolTimeout: 60,
  });

  console.log('[pool] Oracle connection pool created');
  return pool;
}

/**
 * 풀 종료
 */
export async function closeOraclePool(): Promise<void> {
  if (!pool) return;
  try {
    await pool.close(5);
    pool = null;
    console.log('[pool] Oracle connection pool closed');
  } catch (err: any) {
    console.error('[pool] Error closing pool:', err.message);
  }
}

/**
 * 환경 변수에서 Oracle 연결 문자열을 취득합니다.
 */
export function getOracleConnectString(): string {
  return normalizeConnectString(env.DATABASE_URL);
}

function normalizeConnectString(raw: string | undefined): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  return value.replace(/^oracle(?:\+thin)?:\/\//i, '');
}
