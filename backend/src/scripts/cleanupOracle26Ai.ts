import 'dotenv/config';
import oracledb from 'oracledb';

const NAME_PATTERN = '%26AI%';
const DOC_BATCH_SIZE = 200;
const IN_LIST_LIMIT = 500;

function normalizeConnectString(raw: string) {
  return String(raw ?? '').trim().replace(/^oracle(?:\+thin)?:\/\//i, '');
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function buildInClause(ids: string[], prefix: string, binds: Record<string, string>): string {
  return ids
    .map((id, index) => {
      binds[`${prefix}${index}`] = id;
      return `:${prefix}${index}`;
    })
    .join(', ');
}

async function countRows(conn: any, sql: string, binds: Record<string, string> = {}): Promise<number> {
  const result = await conn.execute(sql, binds);
  return Number(result.rows?.[0]?.[0] ?? 0);
}

async function fetchIds(conn: any, sql: string, binds: Record<string, string> = {}): Promise<string[]> {
  const result = await conn.execute(sql, binds);
  return (result.rows ?? [])
    .map((row: any) => String(row[0] ?? '').trim())
    .filter(Boolean);
}

async function deleteWhereIn(
  conn: any,
  table: string,
  column: string,
  ids: string[],
): Promise<number> {
  let deleted = 0;
  for (const batch of chunk(ids, IN_LIST_LIMIT)) {
    if (batch.length === 0) continue;
    const binds: Record<string, string> = {};
    const placeholders = buildInClause(batch, 'id', binds);
    const result = await conn.execute(
      `DELETE FROM ${table} WHERE ${column} IN (${placeholders})`,
      binds,
      { autoCommit: false },
    );
    deleted += Number(result.rowsAffected ?? 0);
  }
  return deleted;
}

async function dropVectorIndex(conn: any): Promise<boolean> {
  try {
    await conn.execute(`DROP INDEX IDX_KBC_VEC`);
    console.log('[cleanup] Dropped IDX_KBC_VEC');
    return true;
  } catch (err: any) {
    if (err?.errorNum === 1418 || /does not exist/i.test(String(err?.message ?? ''))) {
      console.log('[cleanup] IDX_KBC_VEC was not present');
      return false;
    }
    console.warn(`[cleanup] Failed to drop IDX_KBC_VEC: ${err?.message ?? err}`);
    return false;
  }
}

async function syncTextIndex(conn: any): Promise<void> {
  try {
    await conn.execute(`BEGIN CTX_DDL.SYNC_INDEX('IDX_KBC_TEXT'); END;`);
    console.log('[cleanup] Synced IDX_KBC_TEXT');
  } catch (err: any) {
    console.warn(`[cleanup] Failed to sync IDX_KBC_TEXT: ${err?.message ?? err}`);
  }
}

async function recreateVectorIndex(conn: any): Promise<void> {
  try {
    await conn.execute(`
      CREATE VECTOR INDEX IDX_KBC_VEC ON KB_DOCUMENT_CHUNKS (EMBEDDING)
      ORGANIZATION INMEMORY NEIGHBOR GRAPH
      DISTANCE COSINE
      WITH TARGET ACCURACY 90
      PARAMETERS (TYPE HNSW, NEIGHBORS 32, EFCONSTRUCTION 200)
    `);
    console.log('[cleanup] Recreated IDX_KBC_VEC');
  } catch (err: any) {
    if (err?.errorNum === 955 || /already exists/i.test(String(err?.message ?? ''))) {
      console.log('[cleanup] IDX_KBC_VEC already exists');
      return;
    }
    console.warn(`[cleanup] Failed to recreate IDX_KBC_VEC: ${err?.message ?? err}`);
  }
}

async function runCleanup(conn: any) {
    const categoryTreeSql = `
      SELECT CATEGORY_ID
      FROM KB_CATEGORIES
      START WITH UPPER(NAME) LIKE :pattern
      CONNECT BY PRIOR CATEGORY_ID = PARENT_ID
    `;
    const docScopeSql = `SELECT DOC_ID FROM KB_DOCUMENTS WHERE CATEGORY_ID IN (${categoryTreeSql})`;
    const jobScopeSql = `SELECT JOB_ID FROM KB_INDEX_JOBS WHERE DOC_ID IN (${docScopeSql})`;

    const stats = {
      categories: await countRows(conn, `SELECT COUNT(*) FROM (${categoryTreeSql}) t`, { pattern: NAME_PATTERN }),
      documents: await countRows(conn, `SELECT COUNT(*) FROM (${docScopeSql}) t`, { pattern: NAME_PATTERN }),
      files: await countRows(conn, `SELECT COUNT(*) FROM KB_DOCUMENT_FILES WHERE DOC_ID IN (${docScopeSql})`, { pattern: NAME_PATTERN }),
      chunks: await countRows(conn, `SELECT COUNT(*) FROM KB_DOCUMENT_CHUNKS WHERE DOC_ID IN (${docScopeSql})`, { pattern: NAME_PATTERN }),
      tags: await countRows(conn, `SELECT COUNT(*) FROM KB_DOCUMENT_TAGS WHERE DOC_ID IN (${docScopeSql})`, { pattern: NAME_PATTERN }),
      versions: await countRows(conn, `SELECT COUNT(*) FROM KB_DOCUMENT_VERSIONS WHERE DOC_ID IN (${docScopeSql})`, { pattern: NAME_PATTERN }),
      jobs: await countRows(conn, `SELECT COUNT(*) FROM KB_INDEX_JOBS WHERE DOC_ID IN (${docScopeSql})`, { pattern: NAME_PATTERN }),
      candidates: await countRows(conn, `SELECT COUNT(*) FROM KB_CRAWL_CANDIDATES WHERE JOB_ID IN (${jobScopeSql})`, { pattern: NAME_PATTERN }),
    };

    console.log(
      `[cleanup] Scope check: categories=${stats.categories}, documents=${stats.documents}, files=${stats.files}, chunks=${stats.chunks}, tags=${stats.tags}, versions=${stats.versions}, jobs=${stats.jobs}, candidates=${stats.candidates}`,
    );

    if (stats.documents === 0) {
      console.log('[cleanup] No Oracle 26Ai documents found. Nothing to delete.');
      return;
    }

    const docIds = await fetchIds(conn, docScopeSql, { pattern: NAME_PATTERN });
    console.log(`[cleanup] Deleting ${docIds.length} documents from the Oracle 26Ai category tree...`);

    const vectorIndexDropped = await dropVectorIndex(conn);
    const deletedTotals = {
      candidates: 0,
      jobs: 0,
      chunks: 0,
      files: 0,
      tags: 0,
      versions: 0,
      documents: 0,
    };

    const batches = chunk(docIds, DOC_BATCH_SIZE);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const binds: Record<string, string> = {};
      const placeholders = buildInClause(batch, 'doc', binds);

      try {
        const jobIds = await fetchIds(
          conn,
          `SELECT JOB_ID FROM KB_INDEX_JOBS WHERE DOC_ID IN (${placeholders})`,
          binds,
        );

        deletedTotals.candidates += await deleteWhereIn(conn, 'KB_CRAWL_CANDIDATES', 'JOB_ID', jobIds);
        deletedTotals.jobs += await deleteWhereIn(conn, 'KB_INDEX_JOBS', 'DOC_ID', batch);
        deletedTotals.chunks += await deleteWhereIn(conn, 'KB_DOCUMENT_CHUNKS', 'DOC_ID', batch);
        deletedTotals.files += await deleteWhereIn(conn, 'KB_DOCUMENT_FILES', 'DOC_ID', batch);
        deletedTotals.tags += await deleteWhereIn(conn, 'KB_DOCUMENT_TAGS', 'DOC_ID', batch);
        deletedTotals.versions += await deleteWhereIn(conn, 'KB_DOCUMENT_VERSIONS', 'DOC_ID', batch);
        deletedTotals.documents += await deleteWhereIn(conn, 'KB_DOCUMENTS', 'DOC_ID', batch);

        await conn.commit();
        console.log(`[cleanup] Batch ${i + 1}/${batches.length} committed (${batch.length} docs)`);
      } catch (err) {
        try {
          await conn.rollback();
        } catch {}
        throw err;
      }
    }

    await syncTextIndex(conn);
    if (vectorIndexDropped) {
      await recreateVectorIndex(conn);
    }

    const remaining = {
      documents: await countRows(conn, `SELECT COUNT(*) FROM (${docScopeSql}) t`, { pattern: NAME_PATTERN }),
      files: await countRows(conn, `SELECT COUNT(*) FROM KB_DOCUMENT_FILES WHERE DOC_ID IN (${docScopeSql})`, { pattern: NAME_PATTERN }),
      chunks: await countRows(conn, `SELECT COUNT(*) FROM KB_DOCUMENT_CHUNKS WHERE DOC_ID IN (${docScopeSql})`, { pattern: NAME_PATTERN }),
      tags: await countRows(conn, `SELECT COUNT(*) FROM KB_DOCUMENT_TAGS WHERE DOC_ID IN (${docScopeSql})`, { pattern: NAME_PATTERN }),
      versions: await countRows(conn, `SELECT COUNT(*) FROM KB_DOCUMENT_VERSIONS WHERE DOC_ID IN (${docScopeSql})`, { pattern: NAME_PATTERN }),
      jobs: await countRows(conn, `SELECT COUNT(*) FROM KB_INDEX_JOBS WHERE DOC_ID IN (${docScopeSql})`, { pattern: NAME_PATTERN }),
      candidates: await countRows(conn, `SELECT COUNT(*) FROM KB_CRAWL_CANDIDATES WHERE JOB_ID IN (${jobScopeSql})`, { pattern: NAME_PATTERN }),
    };

    console.log(
      `[cleanup] Deleted totals: documents=${deletedTotals.documents}, files=${deletedTotals.files}, chunks=${deletedTotals.chunks}, tags=${deletedTotals.tags}, versions=${deletedTotals.versions}, jobs=${deletedTotals.jobs}, candidates=${deletedTotals.candidates}`,
    );
    console.log(
      `[cleanup] Remaining after cleanup: documents=${remaining.documents}, files=${remaining.files}, chunks=${remaining.chunks}, tags=${remaining.tags}, versions=${remaining.versions}, jobs=${remaining.jobs}, candidates=${remaining.candidates}`,
    );

    if (
      remaining.documents !== 0 ||
      remaining.files !== 0 ||
      remaining.chunks !== 0 ||
      remaining.tags !== 0 ||
      remaining.versions !== 0 ||
      remaining.jobs !== 0 ||
      remaining.candidates !== 0
    ) {
      throw new Error('Oracle 26Ai cleanup finished with leftover related rows.');
    }
}

async function main() {
  const conn = await oracledb.getConnection({
    user: process.env.DATABASE_USER || process.env.ORACLE_USER || '',
    password: process.env.DATABASE_PASSWORD || process.env.ORACLE_PASSWORD || '',
    connectString: normalizeConnectString(
      process.env.DATABASE_URL || process.env.ORACLE_CONNECT_STRING || '',
    ),
  });

  try {
    await runCleanup(conn);
  } finally {
    try {
      await conn.close();
    } catch {}
  }
}

void main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('[cleanup] Failed:', err?.message ?? err);
    process.exit(1);
  });
