/**
 * 파일: backend/src/infra/oracle/withConnection.ts
 * 역할: 단일 커넥션 취득·해제 자동화 래퍼.
 */

import { getOraclePool } from './pool.js';

/**
 * 커넥션을 빌려 로직을 실행한 후 반드시 해제한다.
 */
export async function withOracleConnection<T>(fn: (conn: any) => Promise<T>): Promise<T> {
  const pool = await getOraclePool();
  const connection = await pool.getConnection();
  try {
    return await fn(connection);
  } finally {
    try {
      await connection.close();
    } catch (err: any) {
      console.error('[oracle] Error closing connection:', err.message);
    }
  }
}
