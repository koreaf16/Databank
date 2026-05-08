/**
 * 파일: backend/src/modules/auth/repository/authRepository.ts
 * 역할: 인증용 사용자 조회. PASSWORD_HASH 포함 조회 전용.
 *
 * 연관 파일:
 *   - modules/auth/routes/authRoutes.ts : 본 모듈 호출
 *   - modules/organization/repository/userRepository.ts : listUsers (비밀번호 제외)
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'crypto';
import { loadSql } from '../../../infra/oracle/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name: string) => loadSql(`sql/${name}`, __dirname);

export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export async function findUserForAuth(connection: any, username: string): Promise<any | null> {
  const result = await connection.execute(sql('findUserForAuth.sql'), { username });
  return result.rows?.[0] || null;
}

export function verifyPassword(inputPassword: string, storedHash: string | null): boolean {
  if (!storedHash) return true;
  return sha256(inputPassword) === storedHash;
}
