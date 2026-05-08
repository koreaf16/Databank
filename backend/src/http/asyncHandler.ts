/**
 * 파일: backend/src/http/asyncHandler.js
 * 역할: async 라우트 핸들러의 미처리 예외를 Express errorHandler로 전달하는 래퍼.
 *       try/catch를 라우트마다 쓰지 않아도 되도록 한다.
 *       에러 처리 로직은 errorHandler.js에서 일괄 담당.
 *
 * 연관 파일:
 *   - http/errorHandler.js       : next(err)를 받아 envelope 응답
 *   - modules/<도메인>/routes/*.js : 모든 라우트 핸들러를 wrap
 *
 * 사용 예:
 *   router.get('/items', asyncHandler(async (req, res) => {
 *     const rows = await listItems(connection);
 *     ok(res, rows);
 *   }));
 */

/**
 * async 함수를 Express 라우트로 감싼다.
 * @param {(req, res, next) => Promise<void>} fn
 * @returns {(req, res, next) => void}
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
