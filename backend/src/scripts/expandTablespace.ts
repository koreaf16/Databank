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
    
    // 테이블스페이스 확장 (일반 사용자 권한으로 안될 수 있으나 시도)
    const sql = "ALTER TABLESPACE DATABANK ADD DATAFILE 'DATABANK_02.dbf' SIZE 1G AUTOEXTEND ON NEXT 512M MAXSIZE UNLIMITED";
    const result = await conn.execute(sql);
    console.log('Tablespace expanded successfully:', result);
    
  } catch (err: any) {
    console.error('Error expanding tablespace:', err.message);
  } finally {
    if (conn) {
      try { await conn.close(); } catch(e) {}
    }
  }
}
run();
