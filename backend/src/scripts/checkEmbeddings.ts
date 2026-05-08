/**
 * 임베딩 상태 진단 스크립트
 * 실행: cd backend && npx tsx src/scripts/checkEmbeddings.ts
 */
import 'dotenv/config';
import oracledb from 'oracledb';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

function normalizeConnectString(raw: string) {
  return raw.trim().replace(/^oracle(?:\+thin)?:\/\//i, '');
}

async function main() {
  const connectString = normalizeConnectString(
    process.env.DATABASE_URL || process.env.ORACLE_CONNECT_STRING || '',
  );
  const conn = await oracledb.getConnection({
    user: process.env.DATABASE_USER || process.env.ORACLE_USER || '',
    password: process.env.DATABASE_PASSWORD || process.env.ORACLE_PASSWORD || '',
    connectString,
  });

  try {
    // 1. 청크 임베딩 현황
    const chunkRes = await conn.execute<any>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN EMBEDDING IS NOT NULL THEN 1 ELSE 0 END) AS embedded,
         SUM(CASE WHEN EMBEDDING IS NULL THEN 1 ELSE 0 END) AS not_embedded
       FROM KB_DOCUMENT_CHUNKS`,
    );
    const r = chunkRes.rows![0];
    console.log('=== KB_DOCUMENT_CHUNKS 임베딩 현황 ===');
    console.log(`  전체 청크: ${r['TOTAL']}`);
    console.log(`  임베딩 있음: ${r['EMBEDDED']}`);
    console.log(`  임베딩 없음: ${r['NOT_EMBEDDED']}`);

    // 2. 잡 큐 현황
    const jobRes = await conn.execute<any>(
      `SELECT STATUS, KIND, COUNT(*) AS cnt
       FROM KB_INDEX_JOBS
       GROUP BY STATUS, KIND
       ORDER BY STATUS, KIND`,
    );
    console.log('\n=== KB_INDEX_JOBS 현황 ===');
    for (const row of jobRes.rows!) {
      console.log(`  ${row['STATUS']} / ${row['KIND']}: ${row['CNT']}건`);
    }

    // 3. 최근 잡 5개
    const recentRes = await conn.execute<any>(
      `SELECT JOB_ID, KIND, STATUS, ATTEMPTS, PROGRESS, STAGE, ERROR_MSG,
              TO_CHAR(ENQUEUED_AT, 'MM-DD HH24:MI:SS') AS enqueued
       FROM KB_INDEX_JOBS
       ORDER BY ENQUEUED_AT DESC
       FETCH FIRST 5 ROWS ONLY`,
      {},
      { fetchTypeHandler: (col: any) => col.dbType === oracledb.DB_TYPE_CLOB ? { type: oracledb.STRING } : undefined },
    );
    console.log('\n=== 최근 잡 5개 ===');
    for (const row of recentRes.rows!) {
      const err = row['ERROR_MSG'] ? ` ERR=${String(row['ERROR_MSG']).slice(0, 80)}` : '';
      console.log(`  [${row['ENQUEUED']}] ${row['JOB_ID']} kind=${row['KIND']} status=${row['STATUS']} attempts=${row['ATTEMPTS']} progress=${row['PROGRESS']}% stage=${row['STAGE']}${err}`);
    }

    // 4. AI_MODELS embedding 설정
    const modelRes = await conn.execute<any>(
      `SELECT NAME, ENDPOINT, PROVIDER, STATUS, IS_DEFAULT
       FROM AI_MODELS
       WHERE MODEL_TYPE = 'embedding'`,
    );
    console.log('\n=== AI_MODELS (embedding) ===');
    if (modelRes.rows!.length === 0) {
      console.log('  등록된 임베딩 모델 없음!');
    }
    for (const row of modelRes.rows!) {
      console.log(`  name=${row['NAME']} endpoint=${row['ENDPOINT'] || '(없음)'} provider=${row['PROVIDER']} status=${row['STATUS']} default=${row['IS_DEFAULT']}`);
    }

  } finally {
    await conn.close();
  }
}

main().catch((err) => {
  console.error('오류:', err.message);
  process.exit(1);
});
