/**
 * 파일: backend/src/http/errorHandler.js
 * 역할: Express 전역 에러 핸들러. asyncHandler가 next(err)로 전달한 에러를
 *       { ok: false, error: { code, message } } envelope로 변환해 응답한다.
 *       app.js에서 모든 라우트 등록 후 마지막에 use()한다.
 *
 * 연관 파일:
 *   - http/asyncHandler.js   : 라우트 예외를 next(err)로 전달
 *   - http/apiResponse.js    : errorResponse() 헬퍼
 *   - http/errors.js         : ApiError 구조(statusCode + code)
 *   - app.js                 : app.use(errorHandler) 등록
 *   - infra/oracle/pool.js   : hasOracleConfig() — requireOracle guard
 */

import { hasOracleConfig } from '../infra/oracle/pool.js';
import { errorResponse } from './apiResponse.js';

const CODE_MAP = {
  400: 'VALIDATION_ERROR',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  503: 'ORACLE_UNAVAILABLE',
};

/**
 * Express 4-arg 전역 에러 핸들러. 모든 라우트 등록 후 마지막에 use().
 */
export function errorHandler(err, req, res, _next) {
  const statusCode = Number(err?.statusCode) || 500;
  const code = err?.code || CODE_MAP[statusCode] || 'INTERNAL';
  const message = err?.message || '서버 오류가 발생했습니다';
  const detail = statusCode >= 500 ? err?.message : undefined;

  console.error(`[${req.method} ${req.path}]`, err);

  errorResponse(res, { code, message, detail }, statusCode);
}

/**
 * Oracle 미설정 시 503 응답을 보내고 false를 반환하는 라우트 guard.
 * 라우트 핸들러 진입 직후에 호출한다.
 *
 * 사용 예:
 *   if (!requireOracle(res)) return;
 *
 * @param {import('express').Response} res
 * @returns {boolean} 설정됐으면 true
 */
export function requireOracle(res) {
  if (hasOracleConfig()) return true;
  errorResponse(
    res,
    {
      code: 'ORACLE_UNAVAILABLE',
      message: 'Oracle DB가 설정되지 않았습니다. DATABASE_URL, DATABASE_USER, DATABASE_PASSWORD를 확인하세요.',
    },
    503,
  );
  return false;
}
