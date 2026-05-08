import 'dotenv/config';
import oracledb from 'oracledb';
import { deleteDocument } from '../modules/knowledge-base/repository/kbDocumentRepository.js';

async function run() {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      connectString: (process.env.DATABASE_URL || '').replace('oracle://', '')
    });
    
    const catsResult = await conn.execute("SELECT CATEGORY_ID FROM KB_CATEGORIES WHERE UPPER(NAME) LIKE '%26AI%'");
    const catIds = (catsResult.rows || []).map((row: any) => row[0]);
    
    if (catIds.length === 0) {
      console.log('No Oracle 26Ai categories found.');
      return;
    }

    const binds: Record<string, string> = {};
    const placeholders = catIds.map((id: string, i: number) => { binds[`cat${i}`] = id; return `:cat${i}`; }).join(',');
    
    const docsResult = await conn.execute(
      `SELECT DOC_ID FROM KB_DOCUMENTS WHERE CATEGORY_ID IN (${placeholders})`,
      binds
    );
    const docIds = (docsResult.rows || []).map((row: any) => row[0]);

    console.log(`Found ${docIds.length} documents. Deleting one by one...`);

    let success = 0;
    for (const docId of docIds) {
      try {
        await deleteDocument(conn, docId);
        await conn.commit();
        success++;
        console.log(`Deleted ${docId}`);
      } catch (err: any) {
        console.error(`Failed to delete ${docId}:`, err.message);
        await conn.rollback();
      }
    }

    // Try to delete categories
    if (success === docIds.length) {
      await conn.execute(`DELETE FROM KB_CATEGORIES WHERE CATEGORY_ID IN (${placeholders})`, binds);
      await conn.commit();
      console.log(`Successfully deleted ${catIds.length} categories.`);
    }

    console.log(`Deleted ${success} / ${docIds.length} documents.`);
  } catch (err) {
    console.error(err);
  } finally {
    if (conn) {
      try { await conn.close(); } catch(e) {}
    }
  }
}
run();