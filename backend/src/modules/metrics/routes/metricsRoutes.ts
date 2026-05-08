/**
 * 파일: backend/src/modules/metrics/routes/metricsRoutes.ts
 * 역할: 메트릭 정의/대상/샘플/위험 HTTP 라우트. /api/metrics
 * 연관 파일: repository/metricRepository.ts, services/ingestService.ts, server.ts
 */

import { Router } from 'express';
import { asyncHandler } from '../../../http/asyncHandler.js';
import { ok, created, errorResponse } from '../../../http/apiResponse.js';
import { requireOracle } from '../../../http/errorHandler.js';
import { toNumber } from '../../../http/validators/primitives.js';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../infra/oracle/withTransaction.js';
import { getCurrentUserId } from '../../../http/currentUser.js';
import {
  listDefinitions, findDefinition, upsertDefinition, softDeleteDefinition,
  listTargets, insertTarget, updateTarget, deleteTarget,
  getSamples, getRisk, getLatestMetrics, upsertOverride,
} from '../repository/metricRepository.js';
import { ingestSamples } from '../services/ingestService.js';
import { logAudit } from '../../audit/repository/auditRepository.js';
import { generateTrendInsight } from '../services/trendInsight.js';

export const metricsRouter = Router();

const INGEST_TOKEN = process.env.METRIC_INGEST_TOKEN || '';

// ── METRIC_DEFINITIONS ────────────────────────────────────────────────────────

metricsRouter.get('/definitions', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const rows = await withOracleConnection(conn =>
    listDefinitions(conn, {
      systemType: req.query.systemType as string | undefined,
      enabledOnly: req.query.includeDisabled !== '1',
    }),
  );
  ok(res, rows);
}));

metricsRouter.post('/definitions', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const { metricId } = req.body;
  if (!metricId) return errorResponse(res, { message: 'metricId는 필수입니다' }, 400);
  await withOracleTransaction(async conn => {
    await upsertDefinition(conn, req.body);
    await logAudit(conn, { action: 'metric_def_upsert', entityType: 'METRIC_DEFINITIONS', entityId: metricId, userId: getCurrentUserId(req) });
  });
  created(res, await withOracleConnection(conn => findDefinition(conn, metricId)));
}));

metricsRouter.put('/definitions/:metricId', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const { metricId } = req.params;
  await withOracleTransaction(async conn => {
    await upsertDefinition(conn, { ...req.body, metricId });
    await logAudit(conn, { action: 'metric_def_update', entityType: 'METRIC_DEFINITIONS', entityId: metricId, userId: getCurrentUserId(req) });
  });
  ok(res, await withOracleConnection(conn => findDefinition(conn, metricId)));
}));

metricsRouter.delete('/definitions/:metricId', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const { metricId } = req.params;
  await withOracleTransaction(async conn => {
    await softDeleteDefinition(conn, metricId);
    await logAudit(conn, { action: 'metric_def_delete', entityType: 'METRIC_DEFINITIONS', entityId: metricId, userId: getCurrentUserId(req) });
  });
  ok(res, { deleted: true });
}));

// ── MONITOR_TARGETS ───────────────────────────────────────────────────────────

metricsRouter.get('/targets', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const customerId = toNumber(req.query.customerId);
  const rows = await withOracleConnection(conn =>
    listTargets(conn, {
      customerId: customerId ?? undefined,
      systemType: req.query.systemType as string | undefined,
      status: req.query.status as string | undefined,
    }),
  );
  ok(res, rows);
}));

metricsRouter.post('/targets', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const body = req.body;
  if (!body.name || !body.systemType) return errorResponse(res, { message: 'name, systemType 필수' }, 400);
  let targetId: number | null = null;
  await withOracleTransaction(async conn => {
    targetId = await insertTarget(conn, { ...body, createdBy: getCurrentUserId(req), status: body.status || 'active' });
    await logAudit(conn, { action: 'target_create', entityType: 'MONITOR_TARGETS', entityId: String(targetId), userId: getCurrentUserId(req) });
  });
  ok(res, { targetId });
}));

metricsRouter.put('/targets/:targetId', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const targetId = toNumber(req.params.targetId);
  if (targetId == null) return errorResponse(res, { message: '유효하지 않은 대상 ID' }, 400);
  await withOracleTransaction(async conn => {
    await updateTarget(conn, targetId, req.body);
    await logAudit(conn, { action: 'target_update', entityType: 'MONITOR_TARGETS', entityId: String(targetId), userId: getCurrentUserId(req) });
  });
  ok(res, { updated: true });
}));

metricsRouter.delete('/targets/:targetId', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const targetId = toNumber(req.params.targetId);
  if (targetId == null) return errorResponse(res, { message: '유효하지 않은 대상 ID' }, 400);
  await withOracleTransaction(async conn => {
    await deleteTarget(conn, targetId);
    await logAudit(conn, { action: 'target_retire', entityType: 'MONITOR_TARGETS', entityId: String(targetId), userId: getCurrentUserId(req) });
  });
  ok(res, { retired: true });
}));

// ── METRIC_SAMPLES ────────────────────────────────────────────────────────────

metricsRouter.get('/samples', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const targetId = toNumber(req.query.targetId);
  if (targetId == null) return errorResponse(res, { message: 'targetId 필수' }, 400);
  const from = req.query.from ? new Date(req.query.from as string) : undefined;
  const to   = req.query.to   ? new Date(req.query.to   as string) : undefined;
  const rows = await withOracleConnection(conn =>
    getSamples(conn, {
      targetId,
      metricId: req.query.metricId as string | undefined,
      dimensionKey: req.query.dimensionKey as string | undefined,
      dimensionValue: req.query.dimensionValue as string | undefined,
      from,
      to,
      limit: toNumber(req.query.limit) ?? 500,
    }),
  );
  ok(res, rows);
}));

metricsRouter.post('/manual', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const { targetId, metricId, value, collectedAt, sourceRef } = req.body;
  if (targetId == null || !metricId || value == null) {
    return errorResponse(res, { message: 'targetId, metricId, value 필수' }, 400);
  }
  const result = await ingestSamples([{
    targetId, metricId, value,
    dimensionKey: req.body?.dimensionKey ?? null,
    dimensionValue: req.body?.dimensionValue ?? null,
    rawLabel: req.body?.rawLabel ?? null,
    collectedAt: collectedAt ? new Date(collectedAt) : new Date(),
    source: 'manual',
    sourceRef: sourceRef ?? null,
  }], getCurrentUserId(req));
  ok(res, result);
}));

metricsRouter.post('/ingest', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization || '';
  if (!INGEST_TOKEN || authHeader !== `Bearer ${INGEST_TOKEN}`) {
    return errorResponse(res, { message: '인증 실패' }, 401);
  }
  const { samples } = req.body;
  if (!Array.isArray(samples) || !samples.length) {
    return errorResponse(res, { message: 'samples 배열 필수' }, 400);
  }
  const parsed = samples.map((s: any) => ({
    targetId:    Number(s.targetId),
    metricId:    String(s.metricId),
    dimensionKey: s.dimensionKey ?? null,
    dimensionValue: s.dimensionValue ?? null,
    rawLabel: s.rawLabel ?? null,
    collectedAt: new Date(s.collectedAt || Date.now()),
    value:       Number(s.value),
    source:      (s.source || 'agent') as 'agent' | 'manual' | 'report-parse',
    sourceRef:   s.sourceRef ?? null,
  }));
  const result = await ingestSamples(parsed, null);
  ok(res, result);
}));

// ── RISK ──────────────────────────────────────────────────────────────────────

metricsRouter.get('/risk', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const customerId = toNumber(req.query.customerId);
  const rows = await withOracleConnection(conn =>
    getRisk(conn, { customerId: customerId ?? undefined, limit: toNumber(req.query.limit) ?? 50 }),
  );
  ok(res, rows);
}));

metricsRouter.get('/latest', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const customerId = toNumber(req.query.customerId);
  const targetId = toNumber(req.query.targetId);
  const rows = await withOracleConnection(conn =>
    getLatestMetrics(conn, {
      customerId: customerId ?? undefined,
      targetId: targetId ?? undefined,
      limit: toNumber(req.query.limit) ?? 200,
    }),
  );
  ok(res, rows);
}));

// ── AI 인사이트 ───────────────────────────────────────────────────────────────

// GET /api/metrics/insights?customerId=
metricsRouter.get('/insights', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const customerId = toNumber(req.query.customerId);
  if (!customerId) return errorResponse(res, { message: 'customerId 필수' }, 400);
  const result = await generateTrendInsight({ customerId });
  ok(res, result);
}));

// GET /api/metrics/insights/:targetId
metricsRouter.get('/insights/:targetId', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const targetId = toNumber(req.params.targetId);
  if (!targetId) return errorResponse(res, { message: '유효하지 않은 대상 ID' }, 400);
  const result = await generateTrendInsight({ targetId });
  ok(res, result);
}));

// ── OVERRIDES ─────────────────────────────────────────────────────────────────

metricsRouter.put('/overrides/:targetId/:metricId', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const targetId = toNumber(req.params.targetId);
  const { metricId } = req.params;
  if (targetId == null) return errorResponse(res, { message: '유효하지 않은 대상 ID' }, 400);
  await withOracleTransaction(async conn => {
    await upsertOverride(conn, targetId, metricId, { ...req.body, updatedBy: getCurrentUserId(req) });
    await logAudit(conn, { action: 'metric_override_upsert', entityType: 'TARGET_METRIC_OVERRIDES', entityId: `${targetId}/${metricId}`, userId: getCurrentUserId(req) });
  });
  ok(res, { updated: true });
}));
