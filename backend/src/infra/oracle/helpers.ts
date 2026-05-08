/**
 * 파일: backend/src/infra/oracle/helpers.ts
 * 역할: 모든 Repository에서 공통으로 쓰는 Oracle 바인드/변환/에러 생성 유틸.
 */

import oracledb from 'oracledb';
import fs from 'node:fs';
import path from 'node:path';
import { isUniqueError as _isUniqueError } from './errorCodes.js';

export { isUniqueError, isAlreadyExists, isChildRecordError } from './errorCodes.js';

const SQL_CACHE = new Map<string, string>();

/**
 * SQL 파일을 로드하고 메모리에 캐싱합니다.
 */
export function loadSql(sqlPath: string, baseDir: string): string {
  const fullPath = path.resolve(baseDir, sqlPath);
  if (SQL_CACHE.has(fullPath)) return SQL_CACHE.get(fullPath)!;

  try {
    const content = fs.readFileSync(fullPath, 'utf8').trim();
    SQL_CACHE.set(fullPath, content);
    return content;
  } catch (err: any) {
    throw new Error(`SQL 파일을 읽을 수 없습니다: ${fullPath} (${err.message})`);
  }
}

// ── CLOB ─────────────────────────────────────────────────────────────────────

export function clobFetchHandler({ dbType }: any) {
  if (dbType === oracledb.DB_TYPE_CLOB) {
    return { type: oracledb.STRING };
  }
}

// ── 필드 유틸 ────────────────────────────────────────────────────────────────

export function requiredText(val: any, fieldName: string): string {
  const text = String(val ?? '').trim();
  if (!text) throw validationError(`${fieldName}이(가) 필요합니다`);
  return text;
}

export function nullableText(val: any): string | null {
  const text = String(val ?? '').trim();
  return text || null;
}

export function nullableClob(val: any): string | null {
  return nullableText(val);
}

export function requiredId(val: any, message?: string): number {
  const id = Number.parseInt(String(val), 10);
  if (!Number.isFinite(id)) throw validationError(message || '유효하지 않은 ID입니다');
  return id;
}

export function toInt(val: any): number | null {
  if (val == null || val === '') return null;
  const n = Number.parseInt(String(val), 10);
  return Number.isFinite(n) ? n : null;
}

export function toNullableInt(val: any): number | null {
  return toInt(val);
}

export function toFlag(val: any, defaultVal = false): number {
  if (val === true || val === 1 || val === '1') return 1;
  if (val === false || val === 0 || val === '0') return 0;
  return defaultVal ? 1 : 0;
}

export function toNullableFlag(val: any): number | null {
  if (val == null || val === '') return null;
  return toFlag(val) ? 1 : 0;
}

export function has(obj: any, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function toOptional(payload: any, key: string, currentVal: any) {
  return has(payload, key) ? nullableText(payload[key]) : currentVal;
}

export function toOptionalFlag(payload: any, key: string, currentVal: any) {
  return has(payload, key) ? toFlag(payload[key]) : currentVal;
}

// ── 에러 생성 유틸 ──────────────────────────────────────────────────────────

interface EnhancedError extends Error {
  statusCode?: number;
  code?: string;
}

export function validationError(message = '입력값이 올바르지 않습니다'): EnhancedError {
  const error: EnhancedError = new Error(message);
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  return error;
}

export function notFoundError(message = '항목을 찾을 수 없습니다'): EnhancedError {
  const error: EnhancedError = new Error(message);
  error.statusCode = 404;
  error.code = 'NOT_FOUND';
  return error;
}

export function conflictError(message = '이미 존재하는 항목입니다'): EnhancedError {
  const error: EnhancedError = new Error(message);
  error.statusCode = 409;
  error.code = 'CONFLICT';
  return error;
}

export function internalError(message = '서버 오류가 발생했습니다'): EnhancedError {
  const error: EnhancedError = new Error(message);
  error.statusCode = 500;
  error.code = 'INTERNAL';
  return error;
}
