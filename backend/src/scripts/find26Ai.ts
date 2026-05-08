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
    
    // Check categories for 26ai
    const cats = await conn.execute("SELECT CATEGORY_ID, NAME FROM KB_CATEGORIES");
    console.log('Categories:', cats.rows);

    const docs = await conn.execute("SELECT DOC_ID, TITLE, CATEGORY_ID FROM KB_DOCUMENTS WHERE UPPER(TITLE) LIKE '%26AI%' OR UPPER(PRODUCT_NAME) LIKE '%26AI%'");
    console.log('Docs to delete (by title/product_name):', docs.rows);

    await conn.close();
  } catch (err) {
    console.error(err);
  }
}
run();