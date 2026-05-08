/**
 * 임베딩 누락 문서 복구 스크립트
 * 역할: KB_DOCUMENTS 중 CHUNKS > VECTORS 인 문서를 찾아 reindex 잡을 생성합니다.
 * 실행: cd backend && npx tsx src/scripts/fixMissingEmbeddings.ts
 */
import 'dotenv/config';
import oracledb from 'oracledb';
import { enqueueJob } from '../modules/knowledge-base/repository/kbJobRepository.js';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function main() {
  const conn = await oracledb.getConnection({
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    connectString: (process.env.DATABASE_URL || '').replace('oracle://', ''),
  });

  try {
    // 1. 임베딩이 누락된 문서 조회
    // VECTORS < CHUNKS 이거나, 실제로 CHUNKS 테이블에 임베딩 없는 데이터가 있는 경우
    const res = await conn.execute<any>(
      `SELECT d.DOC_ID, d.TITLE, d.CHUNKS, d.VECTORS, f.FILE_ID, f.MIME_TYPE
       FROM KB_DOCUMENTS d
       JOIN KB_DOCUMENT_FILES f ON d.DOC_ID = f.DOC_ID
       WHERE d.CHUNKS > d.VECTORS
          OR EXISTS (
            SELECT 1 FROM KB_DOCUMENT_CHUNKS c
            WHERE c.DOC_ID = d.DOC_ID AND c.EMBEDDING IS NULL
          )`
    );

    const docs = res.rows || [];
    console.log(`대상 문서 수: ${docs.length}건`);

    for (const doc of docs) {
      const docId = doc['DOC_ID'];
      const title = doc['TITLE'];
      const fileId = doc['FILE_ID'];
      const mimeType = doc['MIME_TYPE'];

      console.log(`[복구 예약] ${title} (${docId})`);

      // reindex 잡 생성 (parse -> chunk -> embed 전체 재실행)
      await enqueueJob(conn, 'reindex', docId, {
        docId,
        fileId,
        mimeType
      });

      // 문서 상태를 indexing으로 변경
      await conn.execute(
        `UPDATE KB_DOCUMENTS
         SET STATUS = 'indexing', INDEX_STATUS = 'queued', INDEX_PROGRESS = 0,
             INDEX_STAGE = 'repair', INDEX_MESSAGE = '임베딩 누락 복구 예약됨'
         WHERE DOC_ID = :did`,
        { did: docId }
      );
    }

    await conn.commit();
    console.log('모든 복구 작업이 큐에 등록되었습니다.');

  } catch (err: any) {
    await conn.rollback();
    console.error('오류:', err.message);
  } finally {
    await conn.close();
  }
}

main();
