/**
 * 파일: backend/src/scripts/resetPasswords.ts
 * 역할: 전체 사용자 비밀번호를 1234(sha256)로 일괄 초기화.
 *       실행: npx tsx src/scripts/resetPasswords.ts
 */

import 'dotenv/config';
import crypto from 'crypto';
import { closeOraclePool, getOracleConnectString, withOracleConnection } from '../oracle.js';

const HASH_1234 = crypto.createHash('sha256').update('1234').digest('hex');

async function main() {
  if (!getOracleConnectString()) throw new Error('DATABASE_URL is missing');

  const result = await withOracleConnection(async conn => {
    const r = await conn.execute(
      `UPDATE USERS SET PASSWORD_HASH = :hash, UPDATED_AT = SYSTIMESTAMP`,
      { hash: HASH_1234 },
    );
    await conn.commit();
    return r;
  });

  const count = (result as any).rowsAffected ?? 0;
  console.log(`✅ 비밀번호 초기화 완료 — ${count}명 (sha256("1234"))`);
}

main()
  .catch(err => {
    console.error('[resetPasswords] 실패:', err.message);
    process.exitCode = 1;
  })
  .finally(() => closeOraclePool());
