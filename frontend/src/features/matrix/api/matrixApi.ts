/**
 * 파일: frontend/src/features/matrix/api/matrixApi.js
 * 역할: 작업현황표(ROUTINE_PLANS + ROUTINE_PLAN_CELLS) 백엔드 API 호출.
 *
 * 연관 파일:
 *   - shared/api/apiClient.js
 *   - features/matrix/components/MatrixPage.jsx
 *   - backend/src/modules/matrix/routes/matrixRoutes.js
 */

import { apiGet, apiPost, apiPatch, apiDelete } from '../../../shared/api/apiClient.js';

export function getMatrix(params = {}) {
  const query = {};
  if (params.year)   query.year   = String(params.year);
  if (params.half)   query.half   = String(params.half);
  if (params.scope)  query.scope  = params.scope;
  if (params.userId) query.userId = String(params.userId);
  return apiGet('/api/matrix', Object.keys(query).length ? query : undefined);
}

export function createPlan(payload) {
  return apiPost('/api/matrix/plans', payload);
}

export function updatePlan(id, payload) {
  return apiPatch(`/api/matrix/plans/${id}`, payload);
}

export function deletePlan(id) {
  return apiDelete(`/api/matrix/plans/${id}`);
}

export function updateCell(planId, month, payload) {
  return apiPatch(`/api/matrix/cells/${planId}/${month}`, payload);
}
