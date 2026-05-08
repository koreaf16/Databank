/**
 * 파일: frontend/src/api/serviceMasterApi.ts
 * 역할: 서비스 마스터(SERVICE_MASTERS) 목록 조회 래퍼.
 *       경로는 단수형 /api/service-master 유지.
 *
 * 연관 파일:
 *   - shared/api/apiClient.ts                              : apiGet
 *   - backend/modules/settings/service-masters/routes     : GET /api/service-master
 *   - contexts/MasterDataContext.tsx                      : 초기 로드
 */

import { apiGet } from '../shared/api/apiClient.js';

export async function listServiceMasters(): Promise<any[]> {
  const rows = await apiGet('/api/service-master');
  return Array.isArray(rows) ? rows : (rows?.items ?? []);
}
