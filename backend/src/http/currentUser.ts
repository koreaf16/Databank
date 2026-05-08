/**
 * 파일: backend/src/http/currentUser.ts
 * 역할: 요청 헤더의 Bearer 토큰으로 현재 로그인 사용자 ID를 추출하는 헬퍼.
 */

import { getSession } from '../modules/auth/routes/authRoutes.js';

export function getCurrentUserIdFromToken(token: string | null | undefined): number | null {
  if (!token) return null;
  const user = getSession(token);
  return user?.id ? Number(user.id) : null;
}

export function getCurrentUserId(req: any): number | null {
  const auth = (req.headers.authorization || '') as string;
  if (auth.startsWith('Bearer ')) return getCurrentUserIdFromToken(auth.slice(7));
  return getCurrentUserIdFromToken(req.query?.token);
}
