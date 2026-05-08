/**
 * 파일: frontend/src/features/settings/api/settingsApi.js
 * 역할: 관리설정 도메인 API 클라이언트. AI 모델, 서비스 마스터 CRUD.
 *
 * 연관 파일:
 *   - shared/api/apiClient.js                       : fetch 기반 공통 레이어
 *   - backend/modules/settings/ai-models/routes     : /api/ai-models
 *   - backend/modules/settings/service-masters/routes : /api/service-masters
 */

import { apiGet, apiPost, apiPatch, apiDelete } from '../../../shared/api/apiClient.js';

// ── RBAC ───────────────────────────────────────────────────────────────────────

export function getRbacRoles() {
  return apiGet('/api/rbac/roles');
}

export function getRbacPermissions() {
  return apiGet('/api/rbac/permissions');
}

export function getRbacMatrix() {
  return apiGet('/api/rbac/matrix');
}

export function updateRbacMatrix(roleId: string, permId: string, value: string) {
  return apiPatch(`/api/rbac/matrix/${roleId}/${permId}`, { value });
}

// ── AI 모델 ────────────────────────────────────────────────────────────────────

export function probeAiEndpoint(baseUrl: string, provider = 'ollama') {
  return apiGet('/api/ai-models/probe', { baseUrl, provider });
}

export function getAiModels() {
  return apiGet('/api/ai-models');
}

export function createAiModel(payload) {
  return apiPost('/api/ai-models', payload);
}

export function updateAiModel(id, payload) {
  return apiPatch(`/api/ai-models/${id}`, payload);
}

export function deleteAiModel(id) {
  return apiDelete(`/api/ai-models/${id}`);
}

// ── 감사 로그 ─────────────────────────────────────────────────────────────────

export function getAuditLogs(params?: Record<string, string>) {
  return apiGet('/api/audit/logs', params);
}

// ── 조직 & 직원 ─────────────────────────────────────────────────────────────

export function getDepartments(includeDisabled = false) {
  return apiGet('/api/org/departments', includeDisabled ? { includeDisabled: '1' } : undefined);
}

export function createDepartment(payload) {
  return apiPost('/api/org/departments', payload);
}

export function updateDepartment(id, payload) {
  return apiPatch(`/api/org/departments/${id}`, payload);
}

export function deleteDepartment(id) {
  return apiDelete(`/api/org/departments/${id}`);
}

export function getUsers(params: { deptId?: number; includeDisabled?: boolean } = {}) {
  const q: any = {};
  if (params.deptId) q.deptId = String(params.deptId);
  if (params.includeDisabled) q.includeDisabled = '1';
  return apiGet('/api/org/users', Object.keys(q).length ? q : undefined);
}

export function createUser(payload) {
  return apiPost('/api/org/users', payload);
}

export function updateUser(id, payload) {
  return apiPatch(`/api/org/users/${id}`, payload);
}

export function deleteUser(id) {
  return apiDelete(`/api/org/users/${id}`);
}

export function getPositions(includeDisabled = false) {
  return apiGet('/api/org/positions', includeDisabled ? { includeDisabled: '1' } : undefined);
}

// ── 리포트 템플릿 ─────────────────────────────────────────────────────────────

export function getReportTemplates(params: { includeDisabled?: boolean } = {}) {
  return apiGet('/api/report-templates', params.includeDisabled ? { includeDisabled: '1' } : undefined);
}

export function createReportTemplate(payload) {
  return apiPost('/api/report-templates', payload);
}

export function updateReportTemplate(id: string, payload) {
  return apiPatch(`/api/report-templates/${id}`, payload);
}

export function deleteReportTemplate(id: string) {
  return apiDelete(`/api/report-templates/${id}`);
}
