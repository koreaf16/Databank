import 'dotenv/config';
import oracledb from 'oracledb';
import { deleteDocument } from '../modules/knowledge-base/repository/kbDocumentRepository.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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
    if (catIds.length === 0) { console.log('No Oracle 26Ai categories found.'); return; }

    const binds: Record<string, string> = {};
    const placeholders = catIds.map((id: string, i: number) => { binds[`cat${i}`] = id; return `:cat${i}`; }).join(',');
    
    const docsResult = await conn.execute(`SELECT DOC_ID FROM KB_DOCUMENTS WHERE CATEGORY_ID IN (${placeholders})`, binds);
    const docIds = (docsResult.rows || []).map((row: any) => row[0]);

    if (docIds.length === 0) {
      console.log('No documents left to delete.');
      await conn.execute(`DELETE FROM KB_CATEGORIES WHERE CATEGORY_ID IN (${placeholders})`, binds);
      await conn.commit();
      return;
    }

    console.log(`Dropping index IDX_KBC_VEC...`);
    let dropped = false;
    for (let i = 0; i < 5; i++) {
      try {
        await conn.execute(`DROP INDEX IDX_KBC_VEC`);
        dropped = true;
        console.log('Index dropped successfully.');
        break;
      } catch (e: any) {
        if (e.errorNum === 1418) { // Index does not exist
          dropped = true;
          console.log('Index already dropped.');
          break;
        }
        console.log(`Drop failed (${e.errorNum}), retrying in 2s...`);
        await sleep(2000);
      }
    }

    if (!dropped) {
      console.log('Could not drop index. Will attempt to delete anyway.');
    }

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

    if (success === docIds.length) {
      await conn.execute(`DELETE FROM KB_CATEGORIES WHERE CATEGORY_ID IN (${placeholders})`, binds);
      await conn.commit();
      console.log('Categories deleted.');
    }

    console.log('Recreating vector index...');
    try {
      await conn.execute(`
        CREATE VECTOR INDEX IDX_KBC_VEC ON KB_DOCUMENT_CHUNKS (EMBEDDING)
        ORGANIZATION INMEMORY NEIGHBOR GRAPH
        DISTANCE COSINE
        WITH TARGET ACCURACY 90
        PARAMETERS (TYPE HNSW, NEIGHBORS 32, EFCONSTRUCTION 200)
      `);
      console.log('Index recreated.');
    } catch(e: any) {
      if (e.errorNum === 955) console.log('Index already exists.');
      else console.error('Failed to recreate index:', e.message);
    }
  } catch (err) {
    console.error(err);
  } finally {
    if (conn) {
      try { await conn.close(); } catch(e) {}
    }
  }
}
run();