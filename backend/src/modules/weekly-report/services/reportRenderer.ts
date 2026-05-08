/**
 * 파일: backend/src/modules/weekly-report/services/reportRenderer.js
 * 역할: 주간업무보고 PDF HTML 생성 로직.
 *       buildMasterReportHtml — 마스터 템플릿 기반 고급 내역서
 *       buildReportHtml       — 기본 내역서 (체크리스트/서명 포함)
 *       generateSvgCharts     — SVG 도넛+바 차트 (인라인, 외부 CDN 불필요)
 *
 * 연관 파일:
 *   - services/reportHtmlTemplates.js                       : DEFAULT HTML/CSS 상수
 *   - infra/pdf/htmlUtils.js                                : escapeHtml, textToHtml
 *   - infra/pdf/chromeRenderer.js                          : renderPdfWithChrome
 *   - modules/weekly-report/routes/reportRoutes.js          : buildMasterReportHtml 호출
 *   - modules/settings/report-templates/repository/         : DB 템플릿(templateSnapshot)
 */

import { randomUUID } from 'node:crypto';
import { escapeHtml, textToHtml } from '../../../infra/pdf/htmlUtils.js';
import { DEFAULT_MASTER_REPORT_HTML, DEFAULT_MASTER_REPORT_CSS } from './reportHtmlTemplates.js';

// ── 마스터 템플릿 기반 내역서 ─────────────────────────────────────────────────

export function buildMasterReportHtml(payload) {
  const meta = payload.documentMeta || {};
  const template = normalizeMasterTemplate(payload.templateSnapshot || {});
  const signature = payload.signature || {};
  const body = String(payload.editedBody || payload.generatedBody || '');
  const metrics = parseMetrics(body);
  const documentNo = meta.documentNo || makeDocumentNo(payload.reportId);
  const signaturePolicy = meta.signaturePolicy || (signature.required ? '고객 서명 필수' : '서명 선택');
  const generatedAt = new Date().toLocaleString('ko-KR');

  const replacements = {
    title: escapeHtml(payload.title || '내역서'),
    documentNo: escapeHtml(documentNo),
    templateName: escapeHtml(template.name),
    templateVersion: escapeHtml(template.version),
    generatedAt: escapeHtml(generatedAt),
    css: template.css,
    bodyHtml: textToHtml(body),
    metaRows: buildMetaRows(masterMetaItems({ ...meta, signaturePolicy })),
    chartsHtml: generateSvgCharts(metrics),
    signatureBlock: signature.required ? buildSignatureBlock(signature, meta) : '',
  };

  Object.entries({ ...meta, documentNo, signaturePolicy }).forEach(([k, v]) => {
    replacements[`meta.${k}`] = escapeHtml(v || '-');
  });

  const rendered = renderTemplate(template.html, replacements);
  if (/<html[\s>]/i.test(rendered)) return injectCss(rendered, template.css);

  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><title>${escapeHtml(payload.title || '내역서')}</title>
<style>${template.css}</style></head>
<body>${rendered}</body></html>`;
}

function normalizeMasterTemplate(t) {
  return {
    name: String(t.name || 'DATABANK Executive 내역서 Master'),
    version: String(t.version || 'v2.0'),
    html: String(t.html || DEFAULT_MASTER_REPORT_HTML),
    css: String(t.css || DEFAULT_MASTER_REPORT_CSS),
  };
}

function masterMetaItems(meta) {
  return [
    ['고객사', meta.customer], ['업무/서비스', meta.service],
    ['인스턴스', meta.instance], ['기간', meta.period],
    ['작성자', meta.owner], ['작성일', meta.createdAt],
    ['방문방법', meta.method], ['서명 정책', meta.signaturePolicy],
  ];
}

function buildMetaRows(items) {
  return items.map(([label, value]) =>
    `<div class="report-meta-cell"><span>${escapeHtml(label)}</span><b>${escapeHtml(value || '-')}</b></div>`,
  ).join('');
}

function buildSignatureBlock(signature, meta) {
  return [
    '<section class="report-signature"><h2>고객 확인 및 서명</h2><div class="report-signature-grid">',
    `<div class="report-signature-box"><span>고객 담당자</span><b>${escapeHtml(signature.signer || '고객 담당자')}</b><div class="report-signature-line"></div><span>서명</span></div>`,
    `<div class="report-signature-box"><span>데이터뱅크 담당자</span><b>${escapeHtml(meta.owner || '')}</b><div class="report-signature-line"></div><span>확인</span></div>`,
    '</div></section>',
  ].join('');
}

function renderTemplate(source, replacements) {
  return String(source || '').replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g,
    (_m, key) => replacements[key] ?? '');
}

function injectCss(html, css) {
  if (html.includes('{{css}}')) return html.replaceAll('{{css}}', css);
  if (/<style[\s>]/i.test(html)) return html;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `<style>${css}</style></head>`);
  return html;
}

// ── 기본 내역서 ───────────────────────────────────────────────────────────────

export function buildReportHtml(payload) {
  const meta = payload.documentMeta || {};
  const template = payload.templateSnapshot || {};
  const signature = payload.signature || {};
  const body = String(payload.editedBody || payload.generatedBody || '');
  const metrics = parseMetrics(body);
  const checklist = payload.checklistTemplateSnapshot || {};
  const checklistResults = Array.isArray(payload.checklistResults) ? payload.checklistResults : [];
  const shellBlocks = (Array.isArray(template.shellBlocks) && template.shellBlocks.length > 0)
    ? template.shellBlocks : ['문서 헤더', '본문', '고객 확인/서명'];
  const documentNo = meta.documentNo || makeDocumentNo(payload.reportId);
  const signaturePolicy = meta.signaturePolicy || (template.signatureRequired ? '고객 서명 필수' : '서명 선택');
  const docInfo = [
    ['문서번호', documentNo],
    ['템플릿', `${template.name || '기본 껍데기'} ${template.version || ''}`.trim()],
    ['상태', meta.status || '확정'],
  ];
  const metaItems = [
    ['고객사', meta.customer], ['업무/시스템', meta.service],
    ['인스턴스', meta.instance], ['기간', meta.period],
    ['작성자', meta.owner], ['작성일', meta.createdAt],
    ['방문방법', meta.method || '방문/원격'], ['서명 정책', signaturePolicy],
  ];

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<title>${escapeHtml(payload.title || '내역서')}</title>
<style>
  @page{size:A4;margin:15mm 13mm}*{box-sizing:border-box}
  body{margin:0;font-family:"Malgun Gothic","맑은 고딕",Arial,sans-serif;color:#111827;font-size:12px;line-height:1.55;background:#fff}
  .topline{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1f2937;padding-bottom:14px;margin-bottom:18px}
  .brand{font-size:12px;font-weight:700;letter-spacing:.04em;color:#374151}
  h1{margin:8px 0 0;font-size:25px;line-height:1.25}
  .doc-no{display:grid;gap:3px;min-width:210px;max-width:280px;color:#4b5563;font-size:11px}
  .doc-no div{display:grid;grid-template-columns:58px minmax(0,1fr);gap:8px;align-items:baseline}
  .doc-no span{text-align:right;overflow-wrap:anywhere}
  .meta-grid{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #d1d5db;margin-bottom:16px}
  .meta-cell{min-height:48px;padding:8px 10px;border-right:1px solid #d1d5db;border-bottom:1px solid #d1d5db}
  .meta-cell:nth-child(4n){border-right:0}.meta-cell:nth-last-child(-n+4){border-bottom:0}
  .label{display:block;font-size:10px;font-weight:700;color:#6b7280;margin-bottom:4px}
  .value{font-size:12.5px;font-weight:700;color:#111827;word-break:keep-all}
  .section{margin-top:16px;page-break-inside:avoid}
  .section h2{margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #9ca3af;font-size:15px}
  .body-box{min-height:360px;border:1px solid #d1d5db;padding:14px 16px;white-space:pre-wrap;word-break:keep-all}
  .footer{margin-top:22px;padding-top:10px;border-top:1px solid #d1d5db;display:flex;justify-content:space-between;color:#6b7280;font-size:10px}
  .signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}
  .signature-box{border:1px solid #9ca3af;min-height:116px;padding:10px}
  .signature-line{height:46px;border-bottom:1px solid #9ca3af;margin-top:18px}
  .checklist-table{width:100%;border-collapse:collapse;border:1px solid #d1d5db;font-size:11px}
  .checklist-table th{background:#f3f4f6;color:#4b5563;text-align:left;padding:6px 8px;border-bottom:1px solid #d1d5db}
  .checklist-table td{padding:6px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}
  .status-ok{color:#047857;font-weight:700}.status-warn{color:#b45309;font-weight:700}.status-crit{color:#b91c1c;font-weight:700}
</style></head><body><main>
<div class="topline">
  <div><div class="brand">DATABANK SYSTEMS · IT-SCO</div><h1>${escapeHtml(payload.title || '내역서')}</h1></div>
  <div class="doc-no">${docInfo.map(([l, v]) => `<div><b>${escapeHtml(l)}</b><span>${escapeHtml(v || '-')}</span></div>`).join('')}</div>
</div>
<div class="meta-grid">${metaItems.map(([l, v]) => `<div class="meta-cell"><span class="label">${escapeHtml(l)}</span><div class="value">${escapeHtml(v || '-')}</div></div>`).join('')}</div>
<section class="section"><h2>요약 리포트</h2>${generateSvgCharts(metrics)}</section>
${generateChecklistHtml(checklist, checklistResults)}
<section class="section"><h2>LLM 작성 본문</h2><div class="body-box">${escapeHtml(body)}</div></section>
<section class="section"><h2>고객 확인 및 서명</h2>
<div class="signature-grid">
  <div class="signature-box"><span class="label">고객 담당자</span><div class="value">${escapeHtml(signature.signer || '고객 담당자')}</div><div class="signature-line"></div><div class="label">서명</div></div>
  <div class="signature-box"><span class="label">데이터뱅크 담당자</span><div class="value">${escapeHtml(meta.owner || '')}</div><div class="signature-line"></div><div class="label">확인</div></div>
</div></section>
<div class="footer"><span>Generated by IT-SCO</span><span>${escapeHtml(new Date().toLocaleString('ko-KR'))}</span></div>
</main></body></html>`;
}

// ── SVG 차트 생성 ─────────────────────────────────────────────────────────────

export function generateSvgCharts({ cpu, mem, disk, normal, warning, error }) {
  const total = normal + warning + error || 1;
  const bar = (label, val, color) => `
    <div style="margin-top:10px;">
      <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:bold;margin-bottom:3px;color:#4b5563;">
        <span>${label}</span><span>${val}%</span></div>
      <svg width="100%" height="12" style="background:#e5e7eb;border-radius:6px;">
        <rect width="${Math.min(100, Math.max(0, val))}%" height="12" fill="${color}" rx="6"/>
      </svg>
    </div>`;
  const col = v => v > 85 ? '#ef4444' : v > 70 ? '#f59e0b' : '#10b981';
  const r = 40, sz = 120, cx = sz / 2, cy = sz / 2, circ = 2 * Math.PI * r;
  const nD = (normal / total) * circ, wD = (warning / total) * circ, eD = (error / total) * circ;

  return `<div style="display:flex;gap:20px;margin-bottom:20px;page-break-inside:avoid;">
    <div style="flex:1;border:1px solid #d1d5db;padding:12px;border-radius:6px;">
      <h3 style="margin-top:0;font-size:13px;color:#374151;border-bottom:1px solid #d1d5db;padding-bottom:4px;">시스템 자원</h3>
      ${bar('CPU Usage', cpu, col(cpu))}${bar('Memory', mem, col(mem))}${bar('Disk', disk, col(disk))}
    </div>
    <div style="flex:1;border:1px solid #d1d5db;padding:12px;border-radius:6px;">
      <h3 style="margin-top:0;font-size:13px;color:#374151;border-bottom:1px solid #d1d5db;padding-bottom:4px;">점검 결과</h3>
      <div style="display:flex;align-items:center;gap:16px;margin-top:12px;">
        <svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="transparent" stroke="#e5e7eb" stroke-width="16"/>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="transparent" stroke="#10b981" stroke-width="16" stroke-dasharray="${nD} ${circ}" transform="rotate(-90 ${cx} ${cy})"/>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="transparent" stroke="#f59e0b" stroke-width="16" stroke-dasharray="${wD} ${circ}" stroke-dashoffset="${-nD}" transform="rotate(-90 ${cx} ${cy})"/>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="transparent" stroke="#ef4444" stroke-width="16" stroke-dasharray="${eD} ${circ}" stroke-dashoffset="${-(nD + wD)}" transform="rotate(-90 ${cx} ${cy})"/>
        </svg>
        <div style="font-size:12px;line-height:1.8;">
          <div><span style="color:#10b981;font-weight:bold;">■</span> 정상: ${normal}</div>
          <div><span style="color:#f59e0b;font-weight:bold;">■</span> 주의: ${warning}</div>
          <div><span style="color:#ef4444;font-weight:bold;">■</span> 장애: ${error}</div>
        </div>
      </div>
    </div>
  </div>`;
}

// ── 내부 유틸 ─────────────────────────────────────────────────────────────────

export function makeDocumentNo(reportId) {
  return `DB-${new Date().getFullYear()}-${String(reportId || randomUUID()).slice(-8).toUpperCase()}`;
}

function parseMetrics(body) {
  const n = (re, def) => { const m = body.match(re); return m ? parseInt(m[1], 10) : def; };
  return {
    cpu: n(/CPU.*?(\d+)\s*%/i, 65),
    mem: n(/(?:Memory|메모리).*?(\d+)\s*%/i, 82),
    disk: n(/(?:Disk|디스크).*?(\d+)\s*%/i, 45),
    normal: n(/정상.*?(\d+)/, 18),
    warning: n(/주의.*?(\d+)/, 3),
    error: n(/장애.*?(\d+)/, 1),
  };
}

function generateChecklistHtml(checklist, results) {
  if (!checklist?.name || !results.length) return '';
  const warnCount = results.filter(i => i.status === 'warn').length;
  const critCount = results.filter(i => i.status === 'crit').length;
  return `<section class="section"><h2>점검 체크리스트 결과</h2>
    <table class="checklist-table">
      <thead><tr><th>섹션</th><th>항목</th><th>결과</th><th>판정</th></tr></thead>
      <tbody>${results.slice(0, 24).map(item =>
        `<tr><td>${escapeHtml(item.section || '-')}</td><td>${escapeHtml(item.label || '-')}</td>
         <td>${escapeHtml(item.value || '-')}</td>
         <td class="status-${escapeHtml(item.status || 'ok')}">${escapeHtml(item.statusLabel || '정상')}</td></tr>`,
      ).join('')}</tbody>
    </table></section>`;
}
