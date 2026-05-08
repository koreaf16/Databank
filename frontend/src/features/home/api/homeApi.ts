/**
 * 파일: frontend/src/features/home/api/homeApi.js
 * 역할: 홈 대시보드 집계 API 호출.
 *
 * 연관 파일:
 *   - shared/api/apiClient.js
 *   - components/Dashboard.jsx
 *   - backend/src/modules/home/routes/homeRoutes.ts
 */

import { apiGet } from '../../../shared/api/apiClient.js';

export function getHomeSummary() {
  return apiGet('/api/home/summary');
}

export function getTodayEvents(userId?: number) {
  return apiGet('/api/home/today-events', userId ? { userId: String(userId) } : undefined);
}

export function getRecentHistory(userId?: number) {
  return apiGet('/api/home/recent-history', userId ? { userId: String(userId) } : undefined);
}
