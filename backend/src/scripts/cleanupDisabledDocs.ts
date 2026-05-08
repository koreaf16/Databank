/**
 * ENABLED=0 으로 소프트 삭제된 문서를 DB에서 완전히 제거한다.
 * 실행: cd backend && npx tsx src/scripts/cleanupDisabledDocs.ts
 */
import 'dotenv/config';
import oracledb from 'oracledb';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

function normalizeConnectString(raw: string) {
  return raw.trim().replace(/^oracle(?:\+thin)?:\/\//i, '');
}

async function main() {
  const conn = await oracledb.getConnection({
    user: process.env.DATABASE_USER || process.env.ORACLE_USER || '',
    password: process.env.DATABASE_PASSWORD || process.env.ORACLE_PASSWORD || '',
    connectString: normalizeConnectString(
      process.env.DATABASE_URL || process.env.ORACLE_CONNECT_STRING || '',
    ),
  });

  try {
    // 삭제 대상 확인
    const countRes = await conn.execute<any>(
      `SELECT COUNT(*) AS cnt FROM KB_DOCUMENTS WHERE ENABLED = 0`,
    );
    const total = Number(countRes.rows![0]['CNT']);
    console.log(`ENABLED=0 문서: ${total}건`);
    if (total === 0) { console.log('정리할 내용 없음'); return; }

    const listRes = await conn.execute<any>(
      `SELECT DOC_ID, TITLE FROM KB_DOCUMENTS WHERE ENABLED = 0 ORDER BY CREATED_AT`,
    );
    for (const row of listRes.rows!) {
      console.log(`  - ${row['DOC_ID']}  ${row['TITLE']}`);
    }

    // 배치 처리: 50건씩 나눠서 삭제
    const docIds: string[] = listRes.rows!.map((r: any) => r['DOC_ID']);
    const BATCH = 50;
    let deletedJobs = 0, deletedDocs = 0;

    for (let i = 0; i < docIds.length; i += BATCH) {
      const batch = docIds.slice(i, i + BATCH);
      const placeholders = batch.map((_, j) => `:d${j}`).join(',');
      const binds: Record<string, string> = {};
      batch.forEach((id, j) => { binds[`d${j}`] = id; });

      // 잡 삭제 (FK 없음)
      const jr = await conn.execute<any>(
        `DELETE FROM KB_INDEX_JOBS WHERE DOC_ID IN (${placeholders})`, binds,
      );
      deletedJobs += jr.rowsAffected ?? 0;

      // 청크 먼저 삭제 (대용량 → 먼저 지워서 CASCADE 부하 줄임)
      await conn.execute(
        `DELETE FROM KB_DOCUMENT_CHUNKS WHERE DOC_ID IN (${placeholders})`, binds,
      );

      // 문서 삭제 → 남은 CASCADE(파일·태그·버전) 처리
      const dr = await conn.execute<any>(
        `DELETE FROM KB_DOCUMENTS WHERE DOC_ID IN (${placeholders})`, binds,
      );
      deletedDocs += dr.rowsAffected ?? 0;

      await conn.commit();
      process.stdout.write(`  ${Math.min(i + BATCH, docIds.length)}/${docIds.length} 완료\r`);
    }

    console.log(`\nKB_INDEX_JOBS 삭제: ${deletedJobs}건`);
    console.log(`KB_DOCUMENTS 삭제: ${deletedDocs}건 (파일·청크·잡 포함)`);
    console.log('\n정리 완료');
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

main().catch((err) => {
  console.error('오류:', err.message);
  process.exit(1);
});
