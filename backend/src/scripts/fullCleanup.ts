/**
 * 파일: backend/src/scripts/fullCleanup.ts
 * 역할: DB 내 모든 지식베이스 관련 데이터(문서, 청크, 파일, 잡)를 삭제하거나 초기화한다.
 */

import 'dotenv/config';
import { closeOraclePool } from '../infra/oracle/pool.js';
import { withOracleConnection } from '../infra/oracle/withConnection.js';

async function main() {
  const mode = process.argv.includes('--reset') ? 'reset' : 'delete';

  await withOracleConnection(async (c: any) => {
    // 1. 모든 DOC_ID 추출
    const docsRes = await c.execute(`SELECT DOC_ID FROM KB_DOCUMENTS`);
    const docIds = (docsRes.rows || []).map((r: any) => r[0] || r.DOC_ID);

    console.log(`Found ${docIds.length} documents. Mode: ${mode}`);

    if (mode === 'delete') {
      // 1. DOC_ID가 없는 고아 잡 먼저 삭제 (예: 등록 중 실패한 download_url 잡)
      const rJobs = await c.execute(`DELETE FROM KB_INDEX_JOBS WHERE DOC_ID IS NULL`);
      if (rJobs.rowsAffected) console.log(`[KB_INDEX_JOBS] Deleted ${rJobs.rowsAffected} orphaned jobs (DOC_ID IS NULL)`);

      if (docIds.length > 0) {
        // 순차 삭제 (FK 고려)
        const tables = [
          'KB_INDEX_JOBS',
          'KB_DOCUMENT_CHUNKS',
          'KB_DOCUMENT_FILES',
          'KB_DOCUMENT_TAGS',
          'KB_DOCUMENT_VERSIONS',
          'KB_DOCUMENTS'
        ];

        for (const table of tables) {
          // 배치 삭제 (Oracle IN 절 제한 1000개 고려해 500개씩)
          for (let i = 0; i < docIds.length; i += 500) {
            const chunk = docIds.slice(i, i + 500);
            const ph = chunk.map((_: any, idx: number) => `:id${idx}`).join(',');
            const binds: any = {};
            chunk.forEach((id: string, idx: number) => { binds[`id${idx}`] = id; });

            const r = await c.execute(`DELETE FROM ${table} WHERE DOC_ID IN (${ph})`, binds);
            console.log(`[${table}] Deleted ${r.rowsAffected} rows`);
          }
        }
      }
    } else {
      // Reset 모드: 상태만 초기화
      if (docIds.length > 0) {
        for (let i = 0; i < docIds.length; i += 500) {
          const chunk = docIds.slice(i, i + 500);
          const ph = chunk.map((_: any, idx: number) => `:id${idx}`).join(',');
          const binds: any = {};
          chunk.forEach((id: string, idx: number) => { binds[`id${idx}`] = id; });

          await c.execute(`UPDATE KB_DOCUMENTS SET STATUS='draft', CHUNKS=0, VECTORS=0 WHERE DOC_ID IN (${ph})`, binds);
          await c.execute(`DELETE FROM KB_INDEX_JOBS WHERE DOC_ID IN (${ph})`, binds);
          await c.execute(`DELETE FROM KB_DOCUMENT_CHUNKS WHERE DOC_ID IN (${ph})`, binds);
        }
        console.log('Reset completed.');
      }
    }

    await c.commit();
  });
}

main()
  .catch(err => {
    console.error('Cleanup failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeOraclePool();
  });
