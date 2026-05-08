/**
 * IDX_KBC_TEXT Oracle Text 인덱스를 SYNC(MANUAL)로 전환하며 REBUILD한다.
 * 실행: cd backend && npx tsx src/scripts/rebuildTextIndex.ts
 *
 * 주의: 데이터 양에 따라 수 분 소요. 사용량 적은 시간대에 실행 권장.
 *       실행 중 텍스트 검색은 기존 인덱스 그대로 서비스됨(REBUILD는 Online).
 */
import 'dotenv/config';
import oracledb from 'oracledb';

function normalizeConnectString(raw: string) {
  return raw.trim().replace(/^oracle(?:\+thin)?:\/\//i, '');
}

async function main() {
  const conn = await oracledb.getConnection({
    user:          process.env.DATABASE_USER     || process.env.ORACLE_USER            || '',
    password:      process.env.DATABASE_PASSWORD || process.env.ORACLE_PASSWORD        || '',
    connectString: normalizeConnectString(
      process.env.DATABASE_URL || process.env.ORACLE_CONNECT_STRING || '',
    ),
  });

  try {
    // 현재 SYNC 설정 확인 (CTX_USER_INDEXES: 현재 사용자 소유 인덱스)
    const before = await conn.execute<any>(
      `SELECT IDX_SYNC_TYPE FROM CTX_USER_INDEXES WHERE IDX_NAME = 'IDX_KBC_TEXT'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const currentSync = before.rows?.[0]?.['IDX_SYNC_TYPE'] ?? '(조회 불가)';
    console.log(`현재 SYNC 모드: ${currentSync}`);

    if (currentSync === 'MANUAL') {
      console.log('이미 SYNC(MANUAL) — 작업 불필요.');
      return;
    }

    // 청크 수 확인 (소요 시간 예측용)
    const cntRes = await conn.execute<any>(
      `SELECT COUNT(*) AS CNT FROM KB_DOCUMENT_CHUNKS`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const chunkCount = Number(cntRes.rows?.[0]?.['CNT'] ?? 0);
    console.log(`KB_DOCUMENT_CHUNKS 행 수: ${chunkCount.toLocaleString()}건`);
    // SYNC 모드는 ALTER/REBUILD로 변경 불가 — DROP 후 재생성 필요
    console.log('IDX_KBC_TEXT DROP 후 SYNC(MANUAL)로 재생성 시작...');
    console.log('(재생성 중 텍스트 검색 불가 — 빠르게 완료됩니다)');

    const start = Date.now();

    await conn.execute(`DROP INDEX IDX_KBC_TEXT`);
    console.log('  DROP 완료');

    await conn.execute(`
      CREATE INDEX IDX_KBC_TEXT ON KB_DOCUMENT_CHUNKS (CONTENT_TEXT)
        INDEXTYPE IS CTXSYS.CONTEXT
        PARAMETERS ('LEXER KB_KOREAN_LEXER SYNC (MANUAL)')
    `);
    console.log('  CREATE 완료');

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    // 전환 결과 확인
    const after = await conn.execute<any>(
      `SELECT IDX_SYNC_TYPE FROM CTX_USER_INDEXES WHERE IDX_NAME = 'IDX_KBC_TEXT'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const newSync = after.rows?.[0]?.['IDX_SYNC_TYPE'] ?? '(조회 불가)';
    console.log(`완료 (${elapsed}초) — SYNC 모드: ${currentSync} → ${newSync}`);
  } finally {
    await conn.close();
  }
}

main().catch((err) => {
  console.error('오류:', err.message);
  process.exit(1);
});
