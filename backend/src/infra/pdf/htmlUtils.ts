/**
 * 파일: backend/src/infra/pdf/htmlUtils.js
 * 역할: PDF 렌더링에 쓰이는 HTML 관련 유틸.
 *       escapeHtml, textToHtml, contentDisposition, filenameSafe.
 *
 * 연관 파일:
 *   - infra/pdf/chromeRenderer.js                      : 같은 레이어
 *   - modules/weekly-report/services/reportRenderer.js : escapeHtml, textToHtml 사용
 *   - modules/weekly-report/routes/reportRoutes.js     : contentDisposition, filenameSafe 사용
 */

/**
 * HTML 특수문자 이스케이프.
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 개행 포함 평문을 HTML 단락으로 변환.
 * @param {string} text
 * @returns {string}
 */
export function textToHtml(text) {
  return String(text ?? '')
    .split(/\n{2,}/)
    .map(para => `<p>${escapeHtml(para.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/**
 * Content-Disposition 헤더값 생성 (ASCII fallback + RFC 5987 UTF-8).
 * @param {string} filename
 * @returns {string}
 */
export function contentDisposition(filename) {
  const asciiFallback = filename
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '')
    .trim() || 'report.pdf';
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * 파일명에 사용 불가한 문자를 대시로 치환.
 * @param {string} value
 * @returns {string}
 */
export function filenameSafe(value) {
  return String(value || 'report')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'report';
}
