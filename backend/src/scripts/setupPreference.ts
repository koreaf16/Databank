import 'dotenv/config';
import oracledb from 'oracledb';

async function setup() {
  const conn = await oracledb.getConnection({
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    connectString: process.env.DATABASE_URL,
  });

  try {
    await conn.execute(`
      BEGIN
        BEGIN CTX_DDL.DROP_PREFERENCE('KB_KOREAN_LEXER'); EXCEPTION WHEN OTHERS THEN NULL; END;
        CTX_DDL.CREATE_PREFERENCE('KB_KOREAN_LEXER', 'KOREAN_MORPH_LEXER');
      END;
    `);
    console.log('✅ KB_KOREAN_LEXER 프리퍼런스가 생성되었습니다. (기본 설정)');
  } catch (err: any) {
    console.error('❌ 생성 실패:', err.message);
  } finally {
    await conn.close();
  }
}

setup();
