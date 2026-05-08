import 'dotenv/config';
import oracledb from 'oracledb';

async function verify() {
  const conn = await oracledb.getConnection({
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    connectString: process.env.DATABASE_URL,
  });

  try {
    const result = await conn.execute(
      `SELECT PRE_NAME FROM CTX_USER_PREFERENCES WHERE PRE_NAME = 'KB_KOREAN_LEXER'`
    );
    if (result.rows && result.rows.length > 0) {
      console.log('✅ KB_KOREAN_LEXER 프리퍼런스가 성공적으로 생성되었습니다.');
    } else {
      console.log('❌ 프리퍼런스를 찾을 수 없습니다. 서버 재시작이 필요할 수 있습니다.');
    }
  } catch (err: any) {
    console.error('❌ 확인 중 오류 발생:', err.message);
  } finally {
    await conn.close();
  }
}

verify();
