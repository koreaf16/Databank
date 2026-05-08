/**
 * 파일: frontend/src/features/customers/api/customersApi.js
 * 역할: 고객사(CUSTOMERS + CUSTOMER_ALIASES + CUSTOMER_ASSIGNMENTS) 백엔드 API 호출.
 *       shared/api/apiClient.js를 사용해 envelope 자동 파싱.
 *
 * 연관 파일:
 *   - shared/api/apiClient.js                                  : fetch + envelope 파싱
 *   - features/customers/components/CustomerMgmtPage.jsx       : 주 사용처
 *   - backend/src/modules/customers/routes/customerRoutes.js   : 엔드포인트
 */

import { apiGet, apiPost, apiPatch, apiDelete } from '../../../shared/api/apiClient.js';

// ── 고객사 ────────────────────────────────────────────────────────────────────

export function getCustomers(includeDisabled = false) {
  return apiGet('/api/customers', includeDisabled ? { includeDisabled: '1' } : undefined);
}

export function getCustomer(id) {
  return apiGet(`/api/customers/${id}`);
}

export function createCustomer(payload) {
  return apiPost('/api/customers', payload);
}

export function updateCustomer(id, payload) {
  return apiPatch(`/api/customers/${id}`, payload);
}

export function deleteCustomer(id) {
  return apiDelete(`/api/customers/${id}`);
}

// ── 별칭 ──────────────────────────────────────────────────────────────────────

export function getAliases(customerId) {
  return apiGet(`/api/customers/${customerId}/aliases`);
}

export function addAlias(customerId, name) {
  return apiPost(`/api/customers/${customerId}/aliases`, { name });
}

export function removeAlias(customerId, aliasId) {
  return apiDelete(`/api/customers/${customerId}/aliases/${aliasId}`);
}

// ── 담당자 배정 ───────────────────────────────────────────────────────────────

export function getAssignments(customerId) {
  return apiGet(`/api/customers/${customerId}/assignments`);
}

export function addAssignment(customerId, payload) {
  return apiPost(`/api/customers/${customerId}/assignments`, payload);
}

export function removeAssignment(customerId, assignmentId) {
  return apiDelete(`/api/customers/${customerId}/assignments/${assignmentId}`);
}
