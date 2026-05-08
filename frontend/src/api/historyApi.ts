/**
 * 파일: frontend/src/api/historyApi.ts
 * 역할: 지원이력(SUPPORT_HISTORIES) 조회 래퍼.
 *       query 파라미터는 camelCase: customerId, engineerId, from, to.
 *
 * 연관 파일:
 *   - shared/api/apiClient.ts                              : apiGet
 *   - backend/modules/support-history/routes              : GET /api/support-history
 *   - components/Workspace.tsx                            : 채널별 이력 조회
 *   - components/common/CommandK.tsx                      : 전체 이력 검색
 */

import { apiGet } from '../shared/api/apiClient.js';

export interface HistoryFilter {
  customerId?: number | string;
  engineerId?: number | string;
  from?: string;
  to?: string;
  limit?: number;
}

export async function listHistories(filter: HistoryFilter = {}): Promise<any[]> {
  const query: Record<string, string> = {};
  if (filter.customerId != null) query.customerId = String(filter.customerId);
  if (filter.engineerId != null) query.engineerId = String(filter.engineerId);
  if (filter.from)                query.from        = filter.from;
  if (filter.to)                  query.to          = filter.to;
  if (filter.limit != null)       query.limit       = String(filter.limit);
  const rows = await apiGet('/api/support-history', query);
  return Array.isArray(rows) ? rows : (rows?.items ?? []);
}
