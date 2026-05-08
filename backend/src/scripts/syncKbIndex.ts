import 'dotenv/config';
import oracledb from 'oracledb';

async function syncIndex() {
  const conn = await oracledb.getConnection({
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    connectString: process.env.DATABASE_URL,
  });

  try {
    console.log('1. 기존 인덱스 삭제 시도...');
    try {
      await conn.execute(`DROP INDEX IDX_KBC_TEXT`);
      console.log('✅ 기존 인덱스 IDX_KBC_TEXT 삭제 완료');
    } catch (e: any) {
      console.log('ℹ️ 기존 인덱스가 없거나 삭제할 수 없습니다 (무시 가능):', e.message);
    }

    console.log('2. 새로운 한국어 렉서 적용 인덱스 생성...');
    await conn.execute(`
      CREATE INDEX IDX_KBC_TEXT ON KB_DOCUMENT_CHUNKS (CONTENT_TEXT)
      INDEXTYPE IS CTXSYS.CONTEXT
      PARAMETERS ('LEXER KB_KOREAN_LEXER SYNC (ON COMMIT)')
    `);
    console.log('✅ IDX_KBC_TEXT 생성 성공 (KB_KOREAN_LEXER 적용)');

    console.log('3. 인덱스 동기화 수행...');
    await conn.execute(`BEGIN CTX_DDL.SYNC_INDEX('IDX_KBC_TEXT'); END;`);
    console.log('✅ 인덱스 동기화 완료');

  } catch (err: any) {
    console.error('❌ 작업 실패:', err.message);
  } finally {
    await conn.close();
  }
}

syncIndex();
