import 'dotenv/config';
import oracledb from 'oracledb';

const conn = await oracledb.getConnection({
  user: process.env.DATABASE_USER || '',
  password: process.env.DATABASE_PASSWORD || '',
  connectString: (process.env.DATABASE_URL || '').trim().replace(/^oracle(?:\+thin)?:\/\//i, ''),
});

const tables = [
  'KB_CRAWL_CANDIDATES',
  'KB_SEARCH_QUERIES',
  'KB_INDEX_JOBS',
  'KB_DOCUMENT_CHUNKS',
  'KB_DOCUMENT_FILES',
  'KB_DOCUMENT_TAGS',
  'KB_DOCUMENT_VERSIONS',
  'KB_DOCUMENTS',
];

for (const t of tables) {
  try {
    const r = await conn.execute(`DELETE FROM ${t}`);
    await conn.commit();
    console.log(`DELETE ${t}: ${r.rowsAffected}건`);
  } catch (e: any) {
    console.error(`${t} 오류: ${e.message}`);
  }
}

await conn.close();
console.log('완료');
