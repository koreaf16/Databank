/**
 * 파일: frontend/src/api/reportApi.ts
 * 역할: 주간보고(WEEKLY_REPORTS) 조회 래퍼.
 *       teamId는 실제로 DEPARTMENTS.DEPT_ID FK.
 *
 * 연관 파일:
 *   - shared/api/apiClient.ts                             : apiGet
 *   - backend/modules/weekly-report/routes               : GET /api/weekly-reports
 *   - features/messaging/parts/ChannelReports.tsx        : 채널 보고서 목록
 */

import { apiGet } from '../shared/api/apiClient.js';

export interface TeamReportFilter {
  weekStart?: string;
  teamId?: number | string;
  customerId?: number | string;
}

export async function listTeamReports(filter: TeamReportFilter = {}): Promise<any[]> {
  const query: Record<string, string> = {};
  if (filter.weekStart)          query.weekStart  = filter.weekStart;
  if (filter.teamId != null)     query.teamId     = String(filter.teamId);
  if (filter.customerId != null) query.customerId = String(filter.customerId);
  const rows = await apiGet('/api/weekly-reports', query);
  return Array.isArray(rows) ? rows : (rows?.items ?? []);
}
