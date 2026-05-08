/**
 * 파일: backend/src/modules/auth/routes/authRoutes.ts
 * 역할: 인증 HTTP 라우트. /api/auth 경로.
 *
 *   POST /api/auth/login  — 로그인 (username + password)
 *   POST /api/auth/logout — 로그아웃 (토큰 파기)
 *   GET  /api/auth/me     — 현재 세션 사용자 조회
 *
 * 세션: 메모리 Map (재시작 시 초기화). 토큰 TTL 24시간.
 *
 * 연관 파일:
 *   - modules/auth/repository/authRepository.ts : 사용자 조회 + 비밀번호 검증
 *   - infra/oracle/withConnection.ts             : DB 연결
 *   - http/asyncHandler.ts, apiResponse.ts       : 응답 패턴
 */

import { Router } from 'express';
import crypto from 'crypto';
import { asyncHandler } from '../../../http/asyncHandler.js';
import { ok, errorResponse } from '../../../http/apiResponse.js';
import { requireOracle } from '../../../http/errorHandler.js';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { findUserForAuth, verifyPassword } from '../repository/authRepository.js';

export const authRouter = Router();

// ── 세션 스토어 (토큰 → 사용자 정보) ───────────────────────────────────────────
const TTL_MS = 24 * 60 * 60 * 1000; // 24시간

interface Session {
  user: Record<string, unknown>;
  expiresAt: number;
}

const sessions = new Map<string, Session>();

function createSession(user: Record<string, unknown>): string {
  const token = crypto.randomUUID();
  sessions.set(token, { user, expiresAt: Date.now() + TTL_MS });
  return token;
}

export function getSession(token: string): Record<string, unknown> | null {
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session.user;
}

function extractToken(req: any): string | null {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

// ── POST /api/auth/login ────────────────────────────────────────────────────
authRouter.post('/login', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;

  const { username, password } = req.body || {};
  if (!username) {
    errorResponse(res, { code: 'VALIDATION_ERROR', message: '사번을 입력하세요' }, 400);
    return;
  }

  const user = await withOracleConnection(conn => findUserForAuth(conn, String(username).trim()));

  if (!user) {
    errorResponse(res, { code: 'UNAUTHORIZED', message: '사용자명 또는 비밀번호가 틀렸습니다' }, 401);
    return;
  }

  const valid = verifyPassword(String(password ?? ''), user.passwordHash);
  if (!valid) {
    errorResponse(res, { code: 'UNAUTHORIZED', message: '사용자명 또는 비밀번호가 틀렸습니다' }, 401);
    return;
  }

  const { passwordHash: _pw, ...safeUser } = user;
  const token = createSession(safeUser);
  ok(res, { token, user: safeUser });
}));

// ── POST /api/auth/logout ───────────────────────────────────────────────────
authRouter.post('/logout', (req, res) => {
  const token = extractToken(req);
  if (token) sessions.delete(token);
  ok(res, { message: '로그아웃 되었습니다' });
});

// ── GET /api/auth/me ────────────────────────────────────────────────────────
authRouter.get('/me', (req, res) => {
  const token = extractToken(req);
  if (!token) {
    errorResponse(res, { code: 'UNAUTHORIZED', message: '로그인이 필요합니다' }, 401);
    return;
  }
  const user = getSession(token);
  if (!user) {
    errorResponse(res, { code: 'UNAUTHORIZED', message: '세션이 만료되었습니다. 다시 로그인하세요' }, 401);
    return;
  }
  ok(res, user);
});
