
import { withOracleConnection } from '../oracle.ts';

async function main() {
  console.log('Connecting to Oracle...');
  await withOracleConnection(async (conn) => {
    const customerId = 347;

    console.log('--- Channels for iMBank ---');
    const chanRes = await conn.execute(
      `SELECT CHANNEL_ID, NAME, KIND FROM CHANNELS WHERE CUSTOMER_ID = :id`,
      [customerId],
      { outFormat: 4002 }
    );
    console.log(JSON.stringify(chanRes.rows, null, 2));

    console.log('--- Monitor Targets for iMBank ---');
    const targetRes = await conn.execute(
      `SELECT TARGET_ID, NAME, SYSTEM_TYPE FROM MONITOR_TARGETS WHERE CUSTOMER_ID = :id`,
      [customerId],
      { outFormat: 4002 }
    );
    console.log(JSON.stringify(targetRes.rows, null, 2));

    console.log('--- Metric Definitions ---');
    const metricRes = await conn.execute(
        `SELECT METRIC_ID, NAME FROM METRIC_DEFINITIONS FETCH FIRST 5 ROWS ONLY`,
        [],
        { outFormat: 4002 }
    );
    console.log(JSON.stringify(metricRes.rows, null, 2));
  });
}

main().catch(console.error);
