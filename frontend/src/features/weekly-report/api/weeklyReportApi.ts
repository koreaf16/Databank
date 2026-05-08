/**
 * 파일: frontend/src/features/weekly-report/api/weeklyReportApi.js
 * 역할: 주간업무보고(WEEKLY_REPORTS) 백엔드 API 호출.
 *       shared/api/apiClient.js를 사용해 envelope 자동 파싱.
 *
 * 연관 파일:
 *   - shared/api/apiClient.js                                           : fetch + envelope 파싱
 *   - features/weekly-report/components/ReportPage.jsx                  : 주 사용처
 *   - backend/src/modules/weekly-report/routes/weeklyReportRoutes.js    : /api/weekly-reports
 */

import { apiGet, apiPost, apiPatch } from '../../../shared/api/apiClient.js';

export function getReports(params = {}) {
  const query = {};
  if (params.weekStart) query.weekStart = params.weekStart;
  if (params.teamId != null) query.teamId = String(params.teamId);
  return apiGet('/api/weekly-reports', Object.keys(query).length ? query : undefined);
}

export function getReport(id) {
  return apiGet(`/api/weekly-reports/${id}`);
}

export function createReport(payload) {
  return apiPost('/api/weekly-reports', payload);
}

export function createReportFromHistory(payload) {
  return apiPost('/api/weekly-reports/from-history', payload);
}

export function updateReport(id, payload) {
  return apiPatch(`/api/weekly-reports/${id}`, payload);
}
