/**
 * 파일: frontend/src/features/support-history/api/historyApi.js
 * 역할: 지원이력(SUPPORT_HISTORIES) 백엔드 API 호출 + 응답 정규화.
 *       participants에 color/initial 추가, timeline 객체 구성.
 *       가동률 계산은 프론트(supportHistory.js) 책임이므로 여기서는 raw 변환만 수행.
 *
 * 연관 파일:
 *   - shared/api/apiClient.js                                             : fetch + envelope 파싱
 *   - features/support-history/components/SupportHistoryPage.jsx          : 주 사용처
 *   - backend/src/modules/support-history/routes/supportHistoryRoutes.js  : /api/support-history
 *   - frontend/src/supportHistory.js                                       : normalizeSupportHistoryList
 */

import { apiGet, apiPost, apiPatch, apiDelete } from '../../../shared/api/apiClient.js';

// 엔지니어 아바타 색상 — USER_ID 기반 결정적 배정
const AVATAR_COLORS = [
  '#7c5cff', '#2563eb', '#dc2626', '#16a34a',
  '#ca8a04', '#db2777', '#0891b2', '#9333ea',
];

function avatarColor(id) {
  return AVATAR_COLORS[(Math.abs(Number(id) || 0)) % AVATAR_COLORS.length];
}

function enrichParticipant(p) {
  return {
    ...p,
    initial: (p.name || '?')[0],
    color:   avatarColor(p.id),
    isManager: Boolean(p.isManager),
  };
}

// API 응답 → frontend normalizeSupportHistoryList 입력 형태로 변환
export function normalizeHistoryRow(row) {
  const participants = (row.participants || []).map(enrichParticipant);
  const manager      = participants.find(p => p.isManager) || participants[0] || null;
  return {
    ...row,
    customerColor: avatarColor(row.customerId),
    participants,
    manager,
  };
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export function getHistories(params = {}) {
  const query = {};
  if (params.customerId)  query.customerId  = String(params.customerId);
  if (params.engineerId)  query.engineerId  = String(params.engineerId);
  if (params.from)        query.from        = params.from;
  if (params.to)          query.to          = params.to;
  if (params.type)        query.type        = params.type;
  if (params.supportMode) query.supportMode = params.supportMode;
  if (params.status)      query.status      = params.status;
  if (params.q)           query.q           = params.q;
  if (params.workspaceId) query.workspaceId = String(params.workspaceId);
  if (Array.isArray(params.serverIds) && params.serverIds.length > 0) {
    query.serverIds = params.serverIds.join(',');
  }
  return apiGet('/api/support-history', Object.keys(query).length ? query : undefined)
    .then(rows => (Array.isArray(rows) ? rows : []).map(normalizeHistoryRow));
}

export function getHistory(id) {
  return apiGet(`/api/support-history/${id}`).then(normalizeHistoryRow);
}

export function createHistory(payload) {
  const body = buildApiPayload(payload);
  return apiPost('/api/support-history', body).then(normalizeHistoryRow);
}

export function updateHistory(id, payload) {
  return apiPatch(`/api/support-history/${id}`, buildApiPayload(payload)).then(normalizeHistoryRow);
}

export function deleteHistory(id) {
  return apiDelete(`/api/support-history/${id}`);
}

export function bulkUpdateStatus(ids, status) {
  return apiPost('/api/support-history/bulk', { ids, status });
}

export function bulkDeleteHistory(ids: string[]) {
  return apiPost('/api/support-history/bulk-delete', { ids });
}

export function parseHistoryText(payload: { text: string; channelName?: string; customerId?: number | string | null }) {
  return apiPost('/api/support-history/parse-text', payload);
}

// ── 내부 유틸 ─────────────────────────────────────────────────────────────────

function buildApiPayload(payload) {
  const participants = (payload.participants || []).map(p =>
    typeof p === 'object' ? { id: p.id, isManager: Boolean(p.isManager) } : { id: p, isManager: false },
  );
  const managerId = payload.managerId
    ?? payload.manager?.id
    ?? participants.find(p => p.isManager)?.id
    ?? null;

  // serverIds: targets[].serverId 또는 직접 serverIds 배열 둘 다 허용
  const serverIds = Array.isArray(payload.serverIds)
    ? payload.serverIds.map(Number).filter(n => Number.isFinite(n) && n > 0)
    : (Array.isArray(payload.targets)
        ? payload.targets.map(t => Number(t?.serverId ?? t)).filter(n => Number.isFinite(n) && n > 0)
        : []);

  return {
    id:         payload.id,
    customerId: payload.customerId,
    service:    payload.service || payload.serviceName,
    type:       payload.type    || payload.historyType,
    supportMode:payload.supportMode,
    status:     payload.status  || 'draft',
    priority:   payload.priority || 'p3',
    documentKind: payload.documentKind,
    aiConfidence: payload.aiConfidence,
    summary:    payload.summary,
    workDetail: payload.workDetail,
    finding:    payload.finding,
    action:     payload.action  || payload.actionResult,
    parsedJson: payload.parsedJson,
    metricCandidates: payload.metricCandidates,
    timeline:   payload.timeline || {},
    participants,
    managerId,
    createdBy:  payload.createdBy,
    // 업무·서버 N:M 연결
    workspaceId: payload.workspaceId ?? null,
    serverIds,
    targetMode: payload.targetMode, // 'workspace_only' | 'multi_server' | 'per_server'
  };
}
