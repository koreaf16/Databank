/**
 * 파일: frontend/src/features/metrics/api/metricsApi.ts
 * 역할: /api/metrics 백엔드 API 클라이언트.
 * 연관 파일: features/messaging/parts/ChannelTrend.tsx
 */

import { apiGet, apiPost, apiPut } from '../../../shared/api/apiClient.js';

export function listDefinitions(params: { systemType?: string; includeDisabled?: boolean } = {}) {
  const q: Record<string, string> = {};
  if (params.systemType)     q.systemType     = params.systemType;
  if (params.includeDisabled) q.includeDisabled = '1';
  return apiGet('/api/metrics/definitions', Object.keys(q).length ? q : undefined);
}

export function listTargets(params: { customerId?: number | string; systemType?: string; status?: string } = {}) {
  const q: Record<string, string> = {};
  if (params.customerId != null) q.customerId = String(params.customerId);
  if (params.systemType)        q.systemType  = params.systemType;
  if (params.status)            q.status      = params.status;
  return apiGet('/api/metrics/targets', Object.keys(q).length ? q : undefined);
}

export function getSamples(params: { targetId: number | string; metricId?: string; dimensionKey?: string; dimensionValue?: string; from?: string; to?: string; limit?: number }) {
  const q: Record<string, string> = { targetId: String(params.targetId) };
  if (params.metricId)       q.metricId       = params.metricId;
  if (params.dimensionKey)   q.dimensionKey   = params.dimensionKey;
  if (params.dimensionValue) q.dimensionValue = params.dimensionValue;
  if (params.from)           q.from           = params.from;
  if (params.to)             q.to             = params.to;
  if (params.limit)          q.limit          = String(params.limit);
  return apiGet('/api/metrics/samples', q);
}

export function getRisk(params: { customerId?: number | string; limit?: number } = {}) {
  const q: Record<string, string> = {};
  if (params.customerId != null) q.customerId = String(params.customerId);
  if (params.limit)              q.limit      = String(params.limit);
  return apiGet('/api/metrics/risk', Object.keys(q).length ? q : undefined);
}

export function getLatestMetrics(params: { customerId?: number | string; targetId?: number | string; limit?: number } = {}) {
  const q: Record<string, string> = {};
  if (params.customerId != null) q.customerId = String(params.customerId);
  if (params.targetId != null)   q.targetId   = String(params.targetId);
  if (params.limit)              q.limit      = String(params.limit);
  return apiGet('/api/metrics/latest', Object.keys(q).length ? q : undefined);
}

export function submitManual(payload: { targetId: number; metricId: string; value: number; collectedAt?: string; sourceRef?: string }) {
  return apiPost('/api/metrics/manual', payload);
}

export function upsertOverride(targetId: number, metricId: string, payload: { warnThreshold?: number | null; critThreshold?: number | null; reason?: string }) {
  return apiPut(`/api/metrics/overrides/${targetId}/${metricId}`, payload);
}
