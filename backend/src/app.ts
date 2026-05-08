import cors from 'cors';
import express from 'express';
import morgan from 'morgan';

import { env } from './config/env.ts';
import { errorHandler } from './http/errorHandler.js';
import { departmentRouter } from './modules/organization/routes/departmentRoutes.js';
import { userRouter } from './modules/organization/routes/userRoutes.js';
import { positionRouter } from './modules/organization/routes/positionRoutes.js';
import { customerRouter } from './modules/customers/routes/customerRoutes.js';
import { calendarRouter } from './modules/calendar/routes/calendarRoutes.js';
import { attendanceRouter } from './modules/calendar/routes/attendanceRoutes.js';
import { supportHistoryRouter } from './modules/support-history/routes/supportHistoryRoutes.js';
import { kbRouter } from './modules/knowledge-base/routes/kbRoutes.js';
import { kbUploadRouter } from './modules/knowledge-base/routes/kbUploadRoutes.js';
import { kbSearchRouter } from './modules/knowledge-base/routes/kbSearchRoutes.js';
import { kbStreamRouter } from './modules/knowledge-base/routes/kbStreamRoutes.js';
import { kbProductRouter } from './modules/knowledge-base/routes/kbProductRoutes.js';
import { matrixRouter } from './modules/matrix/routes/matrixRoutes.js';
import { reportTemplateRouter } from './modules/settings/report-templates/routes/reportTemplateRoutes.js';
import { aiModelRouter } from './modules/settings/ai-models/routes/aiModelRoutes.js';
import { serviceMasterRouter } from './modules/settings/service-masters/routes/serviceMasterRoutes.js';
import { checklistRouter } from './modules/settings/checklists/routes/checklistRoutes.js';
import { rbacRouter } from './modules/settings/rbac/routes/rbacRoutes.js';
import { messagingRouter } from './modules/messaging/routes/messagingRoutes.js';
import { homeRouter } from './modules/home/routes/homeRoutes.js';
import { weeklyReportRouter } from './modules/weekly-report/routes/weeklyReportRoutes.js';
import { auditRouter } from './modules/audit/routes/auditRoutes.js';
import { authRouter } from './modules/auth/routes/authRoutes.js';
import { notificationRouter } from './modules/notifications/routes/notificationRoutes.js';
import { metricsRouter } from './modules/metrics/routes/metricsRoutes.js';

const app = express();

// ── 미들웨어 ────────────────────────────────────────────────────────────────
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

// ── 헬스 체크 ────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'databank-backend', timestamp: new Date().toISOString() });
});

// ── 도메인 라우트 ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/org/departments', departmentRouter);
app.use('/api/org/users', userRouter);
app.use('/api/org/positions', positionRouter);
app.use('/api/customers', customerRouter);
app.use('/api/calendar/events', calendarRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/support-history', supportHistoryRouter);
app.use('/api/kb', kbRouter);
app.use('/api/kb', kbUploadRouter);
app.use('/api/kb', kbSearchRouter);
app.use('/api/kb', kbStreamRouter);
app.use('/api/kb', kbProductRouter);
app.use('/api/matrix', matrixRouter);
app.use('/api/weekly-reports', weeklyReportRouter);
app.use('/api/report-templates', reportTemplateRouter);
app.use('/api/ai-models', aiModelRouter);
app.use('/api/service-master', serviceMasterRouter);
app.use('/api/checklists', checklistRouter);
app.use('/api/home', homeRouter);
app.use('/api/rbac', rbacRouter);
app.use('/api/channels', messagingRouter);
app.use('/api/audit', auditRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/metrics', metricsRouter);

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '요청한 경로가 없습니다' } });
});

// ── 전역 에러 핸들러 (반드시 마지막) ──────────────────────────────────────────
// @ts-ignore - JS errorHandler compatibility
app.use(errorHandler);

export default app;
