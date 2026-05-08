import 'dotenv/config';
import oracledb from 'oracledb';
import { enqueueJob } from '../modules/knowledge-base/repository/kbJobRepository.js';
import { env } from '../config/env.js';

async function run() {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      connectString: (process.env.DATABASE_URL || '').replace('oracle://', '')
    });
    
    // Find orphaned documents (status is not done/failed, but no jobs in queue)
    const docs = await conn.execute(
      `SELECT d.DOC_ID 
       FROM KB_DOCUMENTS d
       WHERE d.INDEX_STATUS NOT IN ('done', 'failed')
         AND d.INDEX_STATUS IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM KB_INDEX_JOBS j WHERE j.DOC_ID = d.DOC_ID
         )`
    );

    console.log(`Found ${docs.rows.length} orphaned documents. Fixing...`);

    for (const row of docs.rows) {
      const docId = row[0];
      
      // Get file info
      const files = await conn.execute(
        `SELECT FILE_ID, MIME_TYPE FROM KB_DOCUMENT_FILES WHERE DOC_ID = :did ORDER BY CREATED_AT DESC FETCH FIRST 1 ROWS ONLY`,
        { did: docId }
      );

      if (files.rows && files.rows.length > 0) {
        const fileId = files.rows[0][0];
        const mimeType = files.rows[0][1] || 'application/octet-stream';

        // Enqueue reindex job
        await enqueueJob(conn, 'reindex', docId, {
          fileId,
          docId,
          mimeType
        });
        
        // Reset document status
        await conn.execute(
          `UPDATE KB_DOCUMENTS 
           SET INDEX_STATUS = 'queued', 
               INDEX_STAGE = 'queued', 
               STATUS = 'indexing',
               INDEX_PROGRESS = 0,
               INDEX_MESSAGE = '큐 유실로 인한 강제 재시작'
           WHERE DOC_ID = :did`,
          { did: docId },
          { autoCommit: false }
        );
        console.log(`Re-enqueued doc: ${docId}`);
      } else {
        // No file found, mark as failed
        await conn.execute(
          `UPDATE KB_DOCUMENTS 
           SET INDEX_STATUS = 'failed', 
               INDEX_STAGE = 'failed', 
               STATUS = 'failed',
               INDEX_MESSAGE = '파일을 찾을 수 없습니다'
           WHERE DOC_ID = :did`,
          { did: docId },
          { autoCommit: false }
        );
        console.log(`Marked as failed (no file): ${docId}`);
      }
    }

    await conn.commit();
    console.log('Fixed orphaned documents.');
  } catch (err) {
    console.error(err);
    if (conn) {
      try {
        await conn.rollback();
      } catch(e) {}
    }
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch (err) {}
    }
  }
}
run();