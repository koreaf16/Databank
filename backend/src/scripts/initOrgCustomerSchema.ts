import 'dotenv/config';
import { closeOraclePool, getOracleConnectString } from '../infra/oracle/pool.js';
import { withOracleConnection } from '../infra/oracle/withConnection.js';
import { ensureOrgSchema } from '../modules/organization/schema/orgSchema.ts';
import { ensureCustomerSchema } from '../modules/customers/schema/customerSchema.ts';

async function main() {
  if (!getOracleConnectString()) {
    throw new Error('DATABASE_URL is missing');
  }

  await withOracleConnection(async connection => {
    await ensureOrgSchema(connection);
    await ensureCustomerSchema(connection);
  });

  console.log('Oracle schema is ready: DEPARTMENTS, USERS, CUSTOMERS, POSITIONS, ALIASES');
}

main()
  .catch(error => {
    console.error('[init:schema] failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeOraclePool();
  });
