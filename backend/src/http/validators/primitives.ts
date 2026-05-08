/**
 * 파일: backend/src/http/validators/primitives.js
 * 역할: query string / params 등 HTTP 입력값을 JS 타입으로 변환하는 유틸.
 *       Repository 레이어의 helpers.js와 역할이 다르다 — 여기는 req 파싱용.
 *
 * 연관 파일:
 *   - modules/<도메인>/routes/*.js : req.query.* 변환에 사용
 *   - http/errorHandler.js  : 변환 실패 시 던진 ValidationError를 캐치
 */

/**
 * query string 값을 정수로 변환. 파싱 불가 시 null 반환.
 * @param {string | string[] | undefined} value
 * @returns {number | null}
 */
export function toNumber(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * query string 값을 boolean으로 변환.
 * '1', 'true', 'yes', 'y' → true, 나머지 → false.
 * @param {string | string[] | undefined} value
 * @returns {boolean}
 */
export function toBoolean(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return text === '1' || text === 'true' || text === 'yes' || text === 'y';
}

/**
 * 정렬 방향 문자열을 'ASC' | 'DESC'로 정규화.
 * 유효하지 않으면 fallback(기본 'ASC').
 * @param {string | undefined} value
 * @param {'ASC' | 'DESC'} fallback
 * @returns {'ASC' | 'DESC'}
 */
export function toSortDir(value, fallback = 'ASC') {
  const v = String(value ?? '').trim().toUpperCase();
  return v === 'DESC' ? 'DESC' : fallback;
}

/**
 * 페이지네이션 파라미터 파싱.
 * @param {{ page?: string, pageSize?: string }} query
 * @returns {{ page: number, pageSize: number, offset: number }}
 */
export function parsePagination(query) {
  const page = Math.max(1, toNumber(query.page) ?? 1);
  const pageSize = Math.min(200, Math.max(1, toNumber(query.pageSize) ?? 50));
  return { page, pageSize, offset: (page - 1) * pageSize };
}
