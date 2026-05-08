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
    
    // 완료된 잡(done, failed, cancelled) 일괄 삭제
    const result = await conn.execute(
      `DELETE FROM KB_INDEX_JOBS 
       WHERE STATUS IN ('done', 'failed', 'cancelled')`
    );
    
    await conn.commit();
    console.log(`${result.rowsAffected}개의 완료된 작업을 큐에서 삭제했습니다.`);
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
