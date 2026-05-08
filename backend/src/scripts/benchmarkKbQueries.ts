import oracledb from 'oracledb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const dbConfig = {
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  connectString: process.env.DATABASE_URL,
};

async function runBenchmark() {
  let connection;
  try {
    console.log('DB Config Check:', { 
      user: dbConfig.user, 
      connectString: dbConfig.connectString,
      hasPassword: !!dbConfig.password 
    });
    connection = await oracledb.getConnection(dbConfig);
    console.log('Connected to Oracle Database');

    const queries = [
      {
        name: 'List Documents (Standard)',
        sql: fs.readFileSync(path.join(__dirname, '../modules/knowledge-base/repository/sql/selectDoc.sql'), 'utf8') + 
             ' WHERE d.ENABLED = 1 ORDER BY d.CREATED_AT DESC FETCH FIRST 20 ROWS ONLY',
        binds: {}
      },
      {
        name: 'Search Documents (Oracle Text)',
        sql: fs.readFileSync(path.join(__dirname, '../modules/knowledge-base/repository/sql/selectDoc.sql'), 'utf8') + 
             ' WHERE CONTAINS(d.TITLE, :q, 1) > 0 ORDER BY d.CREATED_AT DESC',
        binds: { q: 'Oracle' }
      },
      {
        name: 'Vector Search (Top-K)',
        sql: `SELECT CHUNK_ID AS "id", DOC_ID AS "docId",
                     VECTOR_DISTANCE(EMBEDDING, TO_VECTOR(:qvec, 1024, FLOAT32), COSINE) AS "score"
              FROM KB_DOCUMENT_CHUNKS
              WHERE EMBEDDING IS NOT NULL
              ORDER BY VECTOR_DISTANCE(EMBEDDING, TO_VECTOR(:qvec, 1024, FLOAT32), COSINE)
              FETCH FIRST :topk ROWS ONLY`,
        binds: { qvec: JSON.stringify(new Array(1024).fill(0).map(() => Math.random())), topk: 5 }
      }
    ];

    for (const q of queries) {
      console.log(`\n--- Testing: ${q.name} ---`);
      
      // 실행 계획 확인
      try {
        await connection.execute(`EXPLAIN PLAN FOR ${q.sql}`, q.binds);
        const plan = await connection.execute(`SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY)`);
        console.log('Execution Plan:');
        plan.rows.forEach(row => console.log(row[0]));
      } catch (err: any) {
        console.log('Could not generate plan:', err.message);
      }

      // 실제 실행 시간 측정
      const start = performance.now();
      const result = await connection.execute(q.sql, q.binds);
      const end = performance.now();
      console.log(`Execution Time: ${(end - start).toFixed(2)}ms`);
      console.log(`Rows fetched: ${result.rows?.length || 0}`);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

runBenchmark();
