/**
 * 파일: backend/src/infra/oracle/withTransaction.ts
 * 역할: 트랜잭션(커밋/롤백) 자동화 래퍼.
 */

import { getOraclePool } from './pool.js';

/**
 * 트랜잭션을 시작하고 로직을 실행한다. 성공 시 커밋, 오류 시 롤백.
 */
export async function withOracleTransaction<T>(fn: (conn: any) => Promise<T>): Promise<T> {
  const pool = await getOraclePool();
  const connection = await pool.getConnection();
  try {
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError: any) {
      console.error('[oracle] Rollback failed:', rollbackError.message);
    }
    throw error;
  } finally {
    try {
      await connection.close();
    } catch (closeError: any) {
      console.error('[oracle] Connection close failed:', closeError.message);
    }
  }
}
