import 'dotenv/config';
import oracledb from 'oracledb';

async function run() {
  try {
    const conn = await oracledb.getConnection({
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      connectString: (process.env.DATABASE_URL || '').replace('oracle://', '')
    });
    
    // 1. 진행 중 멈춘 잡, 또는 실패한 잡을 대기 상태로 되돌리고 시도 횟수 초기화
    const result1 = await conn.execute(
      "UPDATE KB_INDEX_JOBS SET STATUS = 'queued', ATTEMPTS = 0 WHERE STATUS IN ('failed', 'running')"
    );
    console.log(`${result1.rowsAffected}개의 실패/멈춤 잡(Job)을 큐에 다시 등록했습니다.`);

    // 2. 해당 잡과 연관된 문서의 상태도 다시 인덱싱 대기로 변경
    const result2 = await conn.execute(
      `UPDATE KB_DOCUMENTS 
       SET INDEX_STATUS = 'queued', 
           INDEX_STAGE = 'queued', 
           STATUS = 'indexing',
           INDEX_PROGRESS = 0,
           INDEX_MESSAGE = '재시작됨'
       WHERE DOC_ID IN (SELECT DOC_ID FROM KB_INDEX_JOBS WHERE STATUS = 'queued')`
    );
    console.log(`${result2.rowsAffected}개의 문서 상태를 인덱싱 대기로 초기화했습니다.`);

    await conn.commit();
    await conn.close();
    console.log('초기화가 성공적으로 완료되었습니다.');
  } catch (err) {
    console.error('초기화 중 오류 발생:', err);
  }
}
run();