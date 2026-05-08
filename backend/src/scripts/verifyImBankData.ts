
import oracledb from 'oracledb';
import { withOracleConnection } from '../oracle.ts';

async function main() {
  await withOracleConnection(async (conn) => {
    const customerId = 347;
    const channelId = 21;

    console.log('--- Verification for iMBank (ID: 347) ---');

    // 1. Chat Messages
    const chatCount = await conn.execute(
      `SELECT COUNT(*) as CNT FROM CHANNEL_MESSAGES WHERE CHANNEL_ID = :1`,
      [channelId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log(`Chat Messages: ${chatCount.rows[0].CNT}`);

    // 2. Support Histories
    const histCount = await conn.execute(
      `SELECT COUNT(*) as CNT FROM SUPPORT_HISTORIES WHERE CUSTOMER_ID = :1`,
      [customerId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log(`Support Histories: ${histCount.rows[0].CNT}`);

    // 3. Monitor Targets & Samples
    const targetRes = await conn.execute(
      `SELECT TARGET_ID, NAME FROM MONITOR_TARGETS WHERE CUSTOMER_ID = :1`,
      [customerId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log(`Monitor Targets: ${targetRes.rows.length}`);
    for (const target of targetRes.rows) {
        const sampleCount = await conn.execute(
            `SELECT COUNT(*) as CNT FROM METRIC_SAMPLES WHERE TARGET_ID = :1`,
            [target.TARGET_ID],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        console.log(`  - Samples for ${target.NAME} (ID: ${target.TARGET_ID}): ${sampleCount.rows[0].CNT}`);
    }

    // 4. Weekly Reports
    const userRes = await conn.execute(
      `SELECT DEPT_ID FROM USERS WHERE USER_ID = 10`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const deptId = userRes.rows[0]?.DEPT_ID;
    
    const reportCount = await conn.execute(
      `SELECT COUNT(*) as CNT FROM WEEKLY_REPORTS WHERE TEAM_ID = :1`,
      [deptId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log(`Weekly Reports for Dept ${deptId}: ${reportCount.rows[0].CNT}`);

    const itemCount = await conn.execute(
        `SELECT COUNT(*) as CNT FROM WEEKLY_REPORT_ITEMS wri 
         JOIN WEEKLY_REPORTS wr ON wri.REPORT_ID = wr.REPORT_ID 
         WHERE wr.TEAM_ID = :1`,
        [deptId],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log(`Weekly Report Items: ${itemCount.rows[0].CNT}`);
  });
}

main().catch(console.error);
