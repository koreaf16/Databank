import 'dotenv/config';
import oracledb from 'oracledb';
import { bulkDeleteDocuments } from '../modules/knowledge-base/repository/kbDocumentRepository.js';

async function run() {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      connectString: (process.env.DATABASE_URL || '').replace('oracle://', '')
    });
    
    // 1. Find all categories related to 'Oracle 26Ai'
    const catsResult = await conn.execute("SELECT CATEGORY_ID FROM KB_CATEGORIES WHERE UPPER(NAME) LIKE '%26AI%'");
    const catIds = (catsResult.rows || []).map((row: any) => row[0]);
    
    if (catIds.length === 0) {
      console.log('No Oracle 26Ai categories found.');
      return;
    }

    // 2. Find all documents in these categories
    const binds: Record<string, string> = {};
    const placeholders = catIds.map((id: string, i: number) => { binds[`cat${i}`] = id; return `:cat${i}`; }).join(',');
    
    const docsResult = await conn.execute(
      `SELECT DOC_ID FROM KB_DOCUMENTS WHERE CATEGORY_ID IN (${placeholders})`,
      binds
    );
    const docIds = (docsResult.rows || []).map((row: any) => row[0]);

    console.log(`Found ${docIds.length} documents in Oracle 26Ai categories.`);

    // 3. Delete documents using bulkDeleteDocuments to clean up chunks, jobs, files, etc.
    if (docIds.length > 0) {
      // bulkDeleteDocuments handles KB_INDEX_JOBS, KB_DOCUMENT_CHUNKS, KB_DOCUMENTS
      // But we should also make sure we delete files if needed, or cascading takes care of it.
      // KB_DOCUMENT_FILES is cascaded by FK_KDF_DOC according to schema.
      await bulkDeleteDocuments(conn, docIds);
      console.log(`Successfully deleted ${docIds.length} documents.`);
    }

    // 4. Delete the categories
    await conn.execute(`DELETE FROM KB_CATEGORIES WHERE CATEGORY_ID IN (${placeholders})`, binds);
    console.log(`Successfully deleted ${catIds.length} categories.`);

    await conn.commit();
    console.log('Cleanup completed.');
  } catch (err) {
    console.error('Error during cleanup:', err);
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