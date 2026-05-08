/**
 * 파일: backend/src/scripts/syncOrgCustomers.ts
 * 역할: 인사/고객사 CSV 데이터를 Oracle DB로 동기화하는 CLI 스크립트.
 */

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeOraclePool } from '../infra/oracle/pool.js';
import { withOracleConnection } from '../infra/oracle/withConnection.js';
import { syncOrgCustomers } from '../orgCustomerSync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

async function main() {
  const args: any = {};
  process.argv.slice(2).forEach(val => {
    const [k, v] = val.split('=');
    if (k.startsWith('--')) args[k.slice(2)] = v;
  });

  const userCsvPath = path.resolve(args.users || path.join(repoRoot, '_user__202605041416.csv'));
  const customerCsvPath = path.resolve(args.customers || path.join(repoRoot, 'customer_202605041417.csv'));
  const sourceEncoding = args.encoding || 'cp949';
  const rootDepartmentName = args.root || '데이타뱅크시스템즈';

  console.log(`[sync] userCsv=${userCsvPath}`);
  console.log(`[sync] customerCsv=${customerCsvPath}`);

  await withOracleConnection(async conn => {
    await syncOrgCustomers(conn, {
      userCsvPath,
      customerCsvPath,
      sourceEncoding,
      rootDepartmentName
    });
  });

  console.log(`[sync] Completed successfully`);
}

main()
  .catch(err => {
    console.error('[sync] Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeOraclePool();
  });
