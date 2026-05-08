/**
 * 파일: frontend/src/features/knowledge-base/api/kbApi.js
 * 역할: 지식베이스(KB_CATEGORIES + KB_DOCUMENTS) 백엔드 API 호출.
 *       shared/api/apiClient.js를 사용해 envelope 자동 파싱.
 *
 * 연관 파일:
 *   - shared/api/apiClient.js                                   : fetch + envelope 파싱
 *   - features/knowledge-base/components/KnowledgeBasePage.jsx  : 주 사용처
 *   - backend/src/modules/knowledge-base/routes/kbRoutes.js     : /api/kb
 */

import { apiGet, apiPost, apiPatch, apiDelete } from '../../../shared/api/apiClient.js';

// ── 카테고리 ──────────────────────────────────────────────────────────────────

export function getCategories() {
  return apiGet('/api/kb/categories');
}

export function createCategory(payload) {
  return apiPost('/api/kb/categories', payload);
}

export function updateCategory(id, payload) {
  return apiPatch(`/api/kb/categories/${id}`, payload);
}

export function deleteCategory(id) {
  return apiDelete(`/api/kb/categories/${id}`);
}

// ── 문서 ──────────────────────────────────────────────────────────────────────

export function getDocuments(params = {}) {
  const query = {};
  if (params.categoryId)                              query.categoryId = String(params.categoryId);
  if (params.serviceMasterId && params.serviceMasterId !== 'all') query.serviceMasterId = String(params.serviceMasterId);
  if (params.status && params.status !== 'all')       query.status = String(params.status);
  if (params.docType && params.docType !== 'all')     query.docType = String(params.docType);
  if (params.q)                                       query.q = String(params.q);
  return apiGet('/api/kb/documents', Object.keys(query).length ? query : undefined);
}

export function getDocument(id) {
  return apiGet(`/api/kb/documents/${id}`);
}

export function createDocument(payload) {
  return apiPost('/api/kb/documents', payload);
}

export function updateDocument(id, payload) {
  return apiPatch(`/api/kb/documents/${id}`, payload);
}

export function deleteDocument(id) {
  return apiDelete(`/api/kb/documents/${id}`);
}

export function bulkDeleteDocuments(ids: string[]) {
  return apiPost('/api/kb/documents/bulk-delete', { ids });
}

export function bulkUpdateStatus(ids, status) {
  return apiPost('/api/kb/documents/bulk-status', { ids, status });
}

export function reindexDocument(id) {
  return apiPost(`/api/kb/documents/${id}/reindex`);
}

export function getIndexingStatus(id) {
  return apiGet(`/api/kb/documents/${id}/indexing`);
}
