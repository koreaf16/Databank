import 'dotenv/config';
import oracledb from 'oracledb';

async function run() {
  try {
    const conn = await oracledb.getConnection({
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      connectString: (process.env.DATABASE_URL || '').replace('oracle://', '')
    });
    
    console.log('--- KB_DOCUMENTS (not done) ---');
    const docs = await conn.execute("SELECT DOC_ID, TITLE, INDEX_STATUS, INDEX_STAGE, STATUS FROM KB_DOCUMENTS WHERE INDEX_STATUS NOT IN ('done') AND INDEX_STATUS IS NOT NULL");
    console.log(docs.rows);

    console.log('--- KB_INDEX_JOBS ---');
    const jobs = await conn.execute("SELECT JOB_ID, DOC_ID, KIND, STATUS FROM KB_INDEX_JOBS");
    console.log(jobs.rows);

    // If there are docs in indexing state without jobs, let's fix them.
    await conn.close();
  } catch (err) {
    console.error(err);
  }
}
run();