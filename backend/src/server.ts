import app from './app.ts';
import { env } from './config/env.ts';
import { hasOracleConfig, closeOraclePool } from './infra/oracle/pool.js';
import { withOracleConnection } from './infra/oracle/withConnection.js';
import { ensureOrgSchema } from './modules/organization/schema/orgSchema.ts';
import { ensureCustomerSchema } from './modules/customers/schema/customerSchema.js';
import { ensureCalendarSchema } from './modules/calendar/schema/calendarSchema.js';
import { ensureSupportHistorySchema } from './modules/support-history/schema/supportHistorySchema.js';
import { ensureKbSchema } from './modules/knowledge-base/schema/kbSchema.js';
import { ensureKbChunkSchema } from './modules/knowledge-base/schema/kbChunkSchema.js';
import { ensureKbProductSchema } from './modules/knowledge-base/schema/kbProductSchema.js';
import { startWorker } from './modules/knowledge-base/services/jobs/jobWorker.js';
import { ensureMatrixSchema } from './modules/matrix/schema/matrixSchema.js';
import { ensureReportTemplateSchema } from './modules/settings/report-templates/schema/reportTemplateSchema.js';
import { ensureServiceMasterSchema } from './modules/settings/service-masters/schema/serviceMasterSchema.js';
import { ensureAiModelSchema } from './modules/settings/ai-models/schema/aiModelSchema.js';
import { ensureChecklistSchema } from './modules/settings/checklists/schema/checklistSchema.js';
import { ensureWeeklyReportSchema } from './modules/weekly-report/schema/weeklyReportSchema.js';
import { ensureMetricSchema } from './modules/metrics/schema/metricSchema.js';
import { ensureRbacSchema } from './modules/settings/rbac/schema/rbacSchema.js';
import { ensureMessagingSchema } from './modules/messaging/schema/messagingSchema.js';
import { ensureWorkspaceSchema } from './modules/messaging/schema/workspaceSchema.js';
import { ensureAuditSchema } from './modules/audit/schema/auditSchema.js';
import { ensureNotificationSchema } from './modules/notifications/schema/notificationSchema.js';
import { startNotificationWorker } from './modules/notifications/services/notificationWorker.js';

// ── 글로벌 예외 처리 ────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// ── 서버 기동 ───────────────────────────────────────────────────────────────
async function startServer() {
  const server = app.listen(env.PORT, '127.0.0.1', () => {
    console.log(`DATABANK backend → http://127.0.0.1:${env.PORT} (${env.NODE_ENV})`);
  });

  if (hasOracleConfig()) {
    // 스키마 초기화는 백그라운드에서 수행 (서버 기동 차단 방지)
    (async () => {
      try {
        await withOracleConnection(async (connection: any) => {
          const schemas = [
            { name: 'Organization', fn: ensureOrgSchema },
            { name: 'Customer', fn: ensureCustomerSchema },
            { name: 'Calendar', fn: ensureCalendarSchema },
            { name: 'SupportHistory', fn: ensureSupportHistorySchema },
            { name: 'KB', fn: ensureKbSchema },
            { name: 'KBChunk', fn: ensureKbChunkSchema },
            { name: 'KBProduct', fn: ensureKbProductSchema },
            { name: 'Matrix', fn: ensureMatrixSchema },
            { name: 'ReportTemplate', fn: ensureReportTemplateSchema },
            { name: 'ServiceMaster', fn: ensureServiceMasterSchema },
            { name: 'AiModel', fn: ensureAiModelSchema },
            { name: 'Checklist', fn: ensureChecklistSchema },
            { name: 'WeeklyReport', fn: ensureWeeklyReportSchema },
            { name: 'Metric', fn: ensureMetricSchema },
            { name: 'RBAC', fn: ensureRbacSchema },
            { name: 'Messaging', fn: ensureMessagingSchema },
            { name: 'Workspace', fn: ensureWorkspaceSchema },
            { name: 'Audit', fn: ensureAuditSchema },
            { name: 'Notification', fn: ensureNotificationSchema },
          ];

          for (const schema of schemas) {
            try {
              console.log(`[schema] Checking ${schema.name}...`);
              await schema.fn(connection);
            } catch (err: any) {
              console.warn(`[schema] ${schema.name} 초기화 실패 (무시):`, err.message);
            }
          }
          await connection.commit();
        });
        console.log('[schema] Oracle 스키마 초기화 완료');
      } catch (err: any) {
        console.error('[schema] 스키마 초기화 중 치명적 오류:', err.message);
      }
    })();
  }

  // KB 인덱싱 워커 (Oracle 연결 확인 후 기동)
  startWorker();
  startNotificationWorker();

  const shutdown = () => {
    console.log('Shutting down server...');
    server.close(() => {
      closeOraclePool().finally(() => {
        console.log('Oracle pool closed. Process exit.');
        process.exit(0);
      });
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

function gracefulShutdown() {
  // 간단한 구현, 필요시 확장
  closeOraclePool().finally(() => process.exit(1));
}

startServer();
