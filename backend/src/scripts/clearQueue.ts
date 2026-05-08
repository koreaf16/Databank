import 'dotenv/config';
import oracledb from 'oracledb';

async function run() {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      connectString: (process.env.DATABASE_URL || '').replace('oracle://', '')
    });
    
    // 1. 큐 비우기 (작업 모두 삭제)
    const delJobs = await conn.execute(`DELETE FROM KB_INDEX_JOBS`);
    console.log(`${delJobs.rowsAffected}개의 작업을 큐에서 완전히 삭제했습니다.`);

    // 2. 인덱싱이 끝나지 않은(running, queued 등) 문서들을 '실패(취소)' 상태로 변경하여 무한 로딩 방지
    const updDocs = await conn.execute(
      `UPDATE KB_DOCUMENTS 
       SET INDEX_STATUS = 'failed', 
           INDEX_STAGE = 'failed', 
           STATUS = 'failed',
           INDEX_PROGRESS = 0,
           INDEX_MESSAGE = '큐 전체 초기화(강제 취소)됨'
       WHERE INDEX_STATUS NOT IN ('done', 'ready', 'failed')`
    );
    console.log(`${updDocs.rowsAffected}개의 문서 상태를 강제 취소로 업데이트했습니다.`);

    await conn.commit();
    console.log('인덱싱 큐 전체 초기화가 완료되었습니다.');
  } catch (err) {
    console.error(err);
    if (conn) {
      try { await conn.rollback(); } catch(e) {}
    }
  } finally {
    if (conn) {
      try { await conn.close(); } catch(e) {}
    }
  }
}
run();