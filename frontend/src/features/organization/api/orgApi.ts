/**
 * 파일: frontend/src/features/organization/api/orgApi.js
 * 역할: 조직도(DEPARTMENTS + USERS) 백엔드 API 호출.
 *       shared/api/apiClient.js를 사용해 envelope 자동 파싱.
 *
 * 연관 파일:
 *   - shared/api/apiClient.js                                     : fetch + envelope 파싱
 *   - features/organization/components/OrganizationPage.jsx       : 주 사용처
 *   - backend/src/modules/organization/routes/departmentRoutes.js : /api/org/departments
 *   - backend/src/modules/organization/routes/userRoutes.js       : /api/org/users
 */

import { apiGet, apiPost, apiPatch, apiDelete } from '../../../shared/api/apiClient.js';

// ── 부서 ──────────────────────────────────────────────────────────────────────

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

// ── 사용자 ────────────────────────────────────────────────────────────────────

export function getUsers(params = {}) {
  const query = {};
  if (params.includeDisabled) query.includeDisabled = '1';
  if (params.deptId != null && params.deptId !== '') query.deptId = String(params.deptId);
  if (params.q) query.q = params.q;
  return apiGet('/api/org/users', Object.keys(query).length ? query : undefined);
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

// ── 직급 ──────────────────────────────────────────────────────────────────────

export function getPositions(includeDisabled = false) {
  return apiGet('/api/org/positions', includeDisabled ? { includeDisabled: '1' } : undefined);
}

export function createPosition(payload) {
  return apiPost('/api/org/positions', payload);
}

export function updatePosition(id, payload) {
  return apiPatch(`/api/org/positions/${id}`, payload);
}

export function deletePosition(id) {
  return apiDelete(`/api/org/positions/${id}`);
}
