/**
 * 파일: frontend/src/api/userApi.ts
 * 역할: 인증된 현재 사용자 정보 조회 래퍼.
 *
 * 연관 파일:
 *   - shared/api/apiClient.ts    : apiGet
 *   - contexts/UserContext.tsx   : 결과를 Context에 주입
 *   - backend/modules/auth/routes/authRoutes.ts : GET /api/auth/me
 */

import { apiGet } from '../shared/api/apiClient.js';

export async function getMe(): Promise<any> {
  return apiGet('/api/auth/me');
}
