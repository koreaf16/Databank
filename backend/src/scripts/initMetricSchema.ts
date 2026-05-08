/**
 * 파일: backend/src/scripts/initMetricSchema.ts
 * 역할: 메트릭 4-테이블 스키마 초기화.
 *       npm run init:metric-schema 로 실행.
 */
import 'dotenv/config';
import { closeOraclePool, getOracleConnectString } from '../infra/oracle/pool.js';
import { withOracleConnection } from '../infra/oracle/withConnection.js';
import { ensureMetricSchema } from '../modules/metrics/schema/metricSchema.js';

async function main() {
  if (!getOracleConnectString()) {
    throw new Error('DATABASE_URL is missing');
  }

  await withOracleConnection(async connection => {
    await ensureMetricSchema(connection);
  });

  console.log('Metric schema ready: METRIC_DEFINITIONS, MONITOR_TARGETS, METRIC_SAMPLES, TARGET_METRIC_OVERRIDES');
}

main()
  .catch(error => {
    console.error('[init:metric-schema] failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeOraclePool();
  });
