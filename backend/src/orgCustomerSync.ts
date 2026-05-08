/**
 * 파일: backend/src/orgCustomerSync.ts
 * 역할: 인사/고객사 CSV 데이터를 Oracle DB로 동기화.
 */

import fs from 'node:fs/promises';
import iconv from 'iconv-lite';
import { parse as parseCsv } from 'csv-parse/sync';
import { ensureOrgSchema } from './modules/organization/schema/orgSchema.js';
import { ensureCustomerSchema } from './modules/customers/schema/customerSchema.js';

const TIMESTAMP_FORMAT = 'YYYY-MM-DD HH24:MI:SS';

export async function syncOrgCustomers(connection: any, options: any = {}) {
  const userCsvPath = mustPath(options.userCsvPath, 'userCsvPath');
  const customerCsvPath = mustPath(options.customerCsvPath, 'customerCsvPath');
  const sourceEncoding = clean(options.sourceEncoding || 'cp949');
  const rootDepartmentName = clean(options.rootDepartmentName || '데이타뱅크시스템즈');

  await ensureOrgSchema(connection);
  await ensureCustomerSchema(connection);

  const userRows = await readCsvRows(userCsvPath, sourceEncoding);
  const customerRows = await readCsvRows(customerCsvPath, sourceEncoding);

  // 1. 부서 트리 구축
  const deptMap = new Map<string, any>();
  deptMap.set(rootDepartmentName, { id: null, name: rootDepartmentName });

  userRows.forEach((row: any) => {
    const deptPath = clean(row['遺']).split('>').map(clean);
    let parent = rootDepartmentName;
    deptPath.forEach(name => {
      if (!name) return;
      if (!deptMap.has(name)) deptMap.set(name, { name, parent });
      parent = name;
    });
  });

  // 2. 부서 MERGE
  for (const dept of deptMap.values()) {
    if (dept.name === rootDepartmentName && dept.id === null) {
      await connection.execute(
        `MERGE INTO DEPARTMENTS target
         USING (SELECT :name AS DEPT_NAME FROM DUAL) source
         ON (target.DEPT_NAME = source.DEPT_NAME)
         WHEN NOT MATCHED THEN
           INSERT (DEPT_NAME, PARENT_DEPT_ID, SORT_ORDER, ENABLED, CREATED_AT, UPDATED_AT)
           VALUES (source.DEPT_NAME, NULL, 0, 1, SYSTIMESTAMP, SYSTIMESTAMP)`,
        { name: dept.name }
      );
    } else {
      await connection.execute(
        `MERGE INTO DEPARTMENTS target
         USING (
           SELECT :name AS DEPT_NAME,
                  (SELECT DEPT_ID FROM DEPARTMENTS WHERE DEPT_NAME = :pname) AS PARENT_ID
           FROM DUAL
         ) source
         ON (target.DEPT_NAME = source.DEPT_NAME)
         WHEN MATCHED THEN
           UPDATE SET target.PARENT_DEPT_ID = source.PARENT_ID, target.UPDATED_AT = SYSTIMESTAMP
         WHEN NOT MATCHED THEN
           INSERT (DEPT_NAME, PARENT_DEPT_ID, SORT_ORDER, ENABLED, CREATED_AT, UPDATED_AT)
           VALUES (source.DEPT_NAME, source.PARENT_ID, 10, 1, SYSTIMESTAMP, SYSTIMESTAMP)`,
        { name: dept.name, pname: dept.parent }
      );
    }
  }

  // 3. 사용자 MERGE
  for (const row of userRows) {
    const username = clean(row['щ']);
    const name = clean(row['대']);
    const deptName = clean(row['遺']).split('>').pop() || rootDepartmentName;

    if (!username || !name) continue;

    await connection.execute(
      `MERGE INTO USERS target
       USING (
         SELECT :usrId AS USER_ID, :uname AS USERNAME, :dname AS DISPLAY_NAME,
                (SELECT DEPT_ID FROM DEPARTMENTS WHERE DEPT_NAME = :dept) AS DEPT_ID
         FROM DUAL
       ) source
       ON (target.USER_ID = source.USER_ID)
       WHEN MATCHED THEN
         UPDATE SET target.DISPLAY_NAME = source.DISPLAY_NAME, target.DEPT_ID = source.DEPT_ID, target.UPDATED_AT = SYSTIMESTAMP
       WHEN NOT MATCHED THEN
         INSERT (USER_ID, USERNAME, DISPLAY_NAME, DEPT_ID, ENABLED, CREATED_AT, UPDATED_AT)
         VALUES (source.USER_ID, source.USERNAME, source.DISPLAY_NAME, source.DEPT_ID, 1, SYSTIMESTAMP, SYSTIMESTAMP)`,
      { usrId: username, uname: username.toLowerCase(), dname: name, dept: deptName }
    );
  }

  // 4. 고객사 MERGE
  for (const row of customerRows) {
    const id = clean(row['怨媛щID']);
    const name = clean(row['怨媛щ']);
    if (!id || !name) continue;

    await connection.execute(
      `MERGE INTO CUSTOMERS target
       USING (SELECT :id AS CUSTOMER_ID, :name AS CUSTOMER_MAIN FROM DUAL) source
       ON (target.CUSTOMER_ID = source.CUSTOMER_ID)
       WHEN MATCHED THEN
         UPDATE SET target.CUSTOMER_MAIN = source.CUSTOMER_MAIN, target.UPDATED_AT = SYSTIMESTAMP
       WHEN NOT MATCHED THEN
         INSERT (CUSTOMER_ID, CUSTOMER_MAIN, ENABLED, CREATED_AT, UPDATED_AT)
         VALUES (source.CUSTOMER_ID, source.CUSTOMER_MAIN, 1, SYSTIMESTAMP, SYSTIMESTAMP)`,
      { id, name }
    );
  }

  console.log(`[sync] Completed: ${userRows.length} users, ${customerRows.length} customers`);
}

async function readCsvRows(path: string, encoding: string) {
  const buffer = await fs.readFile(path);
  const text = iconv.decode(buffer, encoding);
  return parseCsv(text, { columns: true, skip_empty_lines: true });
}

function clean(value: any): string {
  return String(value ?? '').trim();
}

function mustPath(value: any, fieldName: string): string {
  const out = clean(value);
  if (!out) {
    throw new Error(`${fieldName} is required`);
  }
  return out;
}
