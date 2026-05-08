import 'dotenv/config';
import { closeOraclePool, getOracleConnectString, withOracleConnection } from '../oracle.js';
import { ensureReportTemplateSchema } from '../modules/settings/report-templates/schema/reportTemplateSchema.js';

async function main() {
  if (!getOracleConnectString()) {
    throw new Error('DATABASE_URL is missing');
  }

  await withOracleConnection(async connection => {
    await ensureReportTemplateSchema(connection);
  });

  console.log('Oracle schema is ready: REPORT_MASTER_TEMPLATES');
}

main()
  .catch(error => {
    console.error('[init:report-template-schema] failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeOraclePool();
  });
