
import oracledb from 'oracledb';
import { withOracleConnection } from '../oracle.ts';

async function main() {
  await withOracleConnection(async (conn) => {
    const customerId = 347;
    const channelId = 21;
    const userId = 10;
    
    // Get user's dept for weekly reports
    const userRes = await conn.execute(
      `SELECT DEPT_ID FROM USERS WHERE USER_ID = :id`,
      [userId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const deptId = userRes.rows[0]?.DEPT_ID || 1;

    console.log(`Using Customer: ${customerId}, Channel: ${channelId}, User: ${userId}, Dept: ${deptId}`);

    // 1. Chat Messages
    console.log('Inserting Chat Messages...');
    const messages = [
      '안녕하세요, iM뱅크 지원 채널입니다.',
      '금일 정기 점검 예정입니다.',
      'DB 성능 모니터링 중 특이사항 발견되었습니다.',
      '백업 프로세스 정상 완료 확인되었습니다.',
      '추가 지원이 필요하시면 말씀해 주세요.'
    ];

    for (const content of messages) {
      await conn.execute(
        `INSERT INTO CHANNEL_MESSAGES (CHANNEL_ID, AUTHOR_USER_ID, CONTENT, SENT_AT)
         VALUES (:1, :2, :3, SYSTIMESTAMP)`,
        [channelId, userId, content]
      );
    }

    // 2. Support Histories
    console.log('Inserting Support Histories...');
    for (let i = 1; i <= 5; i++) {
      const historyId = `H${Date.now().toString().slice(-8)}${i}${Math.floor(Math.random()*100)}`;
      try {
        await conn.execute(
          `INSERT INTO SUPPORT_HISTORIES (
            HISTORY_ID, CUSTOMER_ID, SERVICE_NAME, HISTORY_TYPE, SUPPORT_MODE, 
            STATUS, PRIORITY, SUMMARY, CREATED_BY, SUPPORT_STARTED_AT, SUPPORT_ENDED_AT
          ) VALUES (
            :1, :2, :3, :4, :5, 
            'completed', 'p3', :6, :7, SYSTIMESTAMP - 1/24, SYSTIMESTAMP
          )`,
          [
            historyId,
            customerId,
            'iM뱅크 코어뱅킹 DB',
            'maintenance',
            'remote',
            `iM뱅크 정기 점검 및 튜닝 작업 ${i}`,
            userId
          ]
        );
      } catch (e: any) {
        if (e.errorNum === 1) console.log(`History ${historyId} already exists, skipping.`);
        else throw e;
      }
    }

    // 3. Trend Data (Monitor Targets + Metric Samples)
    console.log('Inserting Trend Data...');
    let targetId;
    const existingTarget = await conn.execute(
        `SELECT TARGET_ID FROM MONITOR_TARGETS WHERE CUSTOMER_ID = :1 AND NAME = :2`,
        [customerId, 'iM뱅크 운영 DB'],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (existingTarget.rows.length > 0) {
        targetId = existingTarget.rows[0].TARGET_ID;
        console.log(`Using existing target: ${targetId}`);
    } else {
        const targetRes = await conn.execute(
          `INSERT INTO MONITOR_TARGETS (NAME, SYSTEM_TYPE, CUSTOMER_ID, STATUS, CREATED_BY)
           VALUES (:1, 'oracle', :2, 'active', :3)
           RETURNING TARGET_ID INTO :targetId`,
          {
            1: 'iM뱅크 운영 DB',
            2: customerId,
            3: userId,
            targetId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
          }
        );
        targetId = targetRes.outBinds.targetId[0];
        console.log(`Created new target: ${targetId}`);
    }

    const metrics = ['oracle.tablespace.usage', 'oracle.archive.usage'];
    for (const metricId of metrics) {
      for (let i = 0; i < 10; i++) {
        await conn.execute(
          `INSERT INTO METRIC_SAMPLES (TARGET_ID, METRIC_ID, COLLECTED_AT, VALUE, STATUS, SOURCE)
           VALUES (:1, :2, SYSTIMESTAMP - :3/24, :4, 'normal', 'manual')`,
          [targetId, metricId, i, Math.floor(Math.random() * 40) + 40]
        );
      }
    }

    // 4. Weekly Reports
    console.log('Inserting Weekly Reports...');
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
    weekStart.setHours(0,0,0,0);

    let reportId;
    const existingReport = await conn.execute(
        `SELECT REPORT_ID FROM WEEKLY_REPORTS WHERE TEAM_ID = :1 AND WEEK_START = :2`,
        [deptId, weekStart],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (existingReport.rows.length > 0) {
        reportId = existingReport.rows[0].REPORT_ID;
        console.log(`Using existing report: ${reportId}`);
    } else {
        const reportRes = await conn.execute(
          `INSERT INTO WEEKLY_REPORTS (TEAM_ID, WEEK_START, WEEK_END, STATUS, CREATED_BY)
           VALUES (:1, :2, :3, 'published', :4)
           RETURNING REPORT_ID INTO :reportId`,
          {
            1: deptId,
            2: weekStart,
            3: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000),
            4: userId,
            reportId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
          }
        );
        reportId = reportRes.outBinds.reportId[0];
        console.log(`Created new report: ${reportId}`);
    }

    // 2. Support Histories (More Variety)
    console.log('Inserting More Support Histories...');
    const historyVariations = [
      { type: 'incident', mode: 'emergency', priority: 'p1', summary: 'iM뱅크 접속 지연 장애 대응' },
      { type: 'request', mode: 'remote', priority: 'p3', summary: 'iM뱅크 사용자 권한 변경 요청' },
      { type: 'maintenance', mode: 'onsite', priority: 'p2', summary: 'iM뱅크 센터 방문 하드웨어 점검' },
      { type: 'incident', mode: 'remote', priority: 'p2', summary: 'iM뱅크 쿼리 타임아웃 분석' },
      { type: 'request', mode: 'remote', priority: 'p3', summary: 'iM뱅크 스키마 변경 지원' }
    ];

    for (let i = 0; i < historyVariations.length; i++) {
      const v = historyVariations[i];
      const historyId = `H${Date.now().toString().slice(-8)}V${i}${Math.floor(Math.random()*100)}`;
      await conn.execute(
        `INSERT INTO SUPPORT_HISTORIES (
          HISTORY_ID, CUSTOMER_ID, SERVICE_NAME, HISTORY_TYPE, SUPPORT_MODE, 
          STATUS, PRIORITY, SUMMARY, CREATED_BY, SUPPORT_STARTED_AT, SUPPORT_ENDED_AT
        ) VALUES (
          :1, :2, :3, :4, :5, 
          'completed', :6, :7, :8, SYSTIMESTAMP - :9/24, SYSTIMESTAMP - :10/24
        )`,
        [historyId, customerId, 'iM뱅크 운영 시스템', v.type, v.mode, v.priority, v.summary, userId, i + 2, i + 1]
      );
    }

    // 3. Trend Data (More Metrics)
    console.log('Inserting More Trend Data (CPU/Memory)...');
    const extraMetrics = ['oracle.cpu.usage', 'oracle.memory.usage'];
    for (const metricId of extraMetrics) {
      for (let i = 0; i < 24; i++) {
        await conn.execute(
          `INSERT INTO METRIC_SAMPLES (TARGET_ID, METRIC_ID, COLLECTED_AT, VALUE, STATUS, SOURCE)
           VALUES (:1, :2, SYSTIMESTAMP - :3/24, :4, 'normal', 'manual')`,
          [targetId, metricId, i, Math.floor(Math.random() * 30) + 20] // 20-50%
        );
      }
    }

    // 4. Weekly Reports (Previous Weeks)
    console.log('Inserting Previous Weekly Reports...');
    for (let weekOffset = 1; weekOffset <= 2; weekOffset++) {
      const prevWeekStart = new Date(weekStart.getTime() - weekOffset * 7 * 24 * 60 * 60 * 1000);
      const prevWeekEnd = new Date(prevWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000);

      const existingPrev = await conn.execute(
        `SELECT REPORT_ID FROM WEEKLY_REPORTS WHERE TEAM_ID = :1 AND WEEK_START = :2`,
        [deptId, prevWeekStart],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (existingPrev.rows.length === 0) {
        const reportRes = await conn.execute(
          `INSERT INTO WEEKLY_REPORTS (TEAM_ID, WEEK_START, WEEK_END, STATUS, CREATED_BY)
           VALUES (:1, :2, :3, 'published', :4)
           RETURNING REPORT_ID INTO :reportId`,
          {
            1: deptId,
            2: prevWeekStart,
            3: prevWeekEnd,
            4: userId,
            reportId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
          }
        );
        const prevReportId = reportRes.outBinds.reportId[0];
        
        await conn.execute(
          `INSERT INTO WEEKLY_REPORT_ITEMS (REPORT_ID, ENGINEER_USER_ID, ITEM_TYPE, PAYLOAD)
           VALUES (:1, :2, :3, :4)`,
          [prevReportId, userId, 'highlight', JSON.stringify({ content: `iM뱅크 ${weekOffset}주 전 주간 보고 내용` })]
        );
      }
    }

    await conn.commit();
    console.log('Done!');
  });
}

main().catch(async (err) => {
    console.error(err);
});
