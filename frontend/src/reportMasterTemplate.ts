export const REPORT_MASTER_TEMPLATE_EVENT = 'databank:report-master-template';

export const DEFAULT_REPORT_MASTER_TEMPLATE = {
  id: 'report-master-template',
  customerId: null,
  name: 'DATABANK Executive 내역서 Master',
  version: 'v2.0',
  updatedAt: '2026.05.03',
  llmPrompt: [
    '고객사, 업무, 기간, 점검/지원 이력, 체크 결과, 채널 대화 데이터를 근거로 고객에게 바로 공유할 수 있는 내역서 본문을 작성한다.',
    '본문은 1) 목적/범위, 2) 핵심 결과, 3) 조치/확인 사항, 4) 리스크와 권고, 5) 후속 일정 순서로 정리한다.',
    '정상/주의/장애 판단은 근거 수치와 함께 쓰고, 근거가 부족한 내용은 "확인 필요" 항목으로 분리한다.',
    '계정, 비밀번호, 내부 IP 전체값, 민감 로그 원문은 노출하지 말고 고객 공유 가능한 수준으로 요약한다.',
    '문체는 과장 없이 단정하게 유지하며, 고객이 서명 전에 확인해야 할 결론을 첫 단락에서 명확히 제시한다.',
  ].join('\n'),
  html: [
    '<main class="report-doc">',
    '  <header class="report-hero">',
    '    <div class="report-kicker">DATABANK SYSTEMS · IT-SCO SERVICE REPORT</div>',
    '    <div class="report-title-row">',
    '      <h1>{{title}}</h1>',
    '      <span class="report-status">{{meta.status}}</span>',
    '    </div>',
    '    <p class="report-subtitle">{{meta.customer}} · {{meta.service}} · {{meta.period}}</p>',
    '    <dl class="report-doc-info">',
    '      <div><dt>문서번호</dt><dd>{{documentNo}}</dd></div>',
    '      <div><dt>작성일시</dt><dd>{{generatedAt}}</dd></div>',
    '      <div><dt>템플릿</dt><dd>{{templateName}} {{templateVersion}}</dd></div>',
    '    </dl>',
    '  </header>',
    '  <section class="report-control-band">',
    '    <div><span>Customer</span><b>{{meta.customer}}</b></div>',
    '    <div><span>Service</span><b>{{meta.service}}</b></div>',
    '    <div><span>Owner</span><b>{{meta.owner}}</b></div>',
    '    <div><span>Method</span><b>{{meta.method}}</b></div>',
    '  </section>',
    '  <section class="report-meta">{{metaRows}}</section>',
    '  <section class="report-section report-summary-section">',
    '    <div class="report-section-head">',
    '      <span>01</span>',
    '      <div><h2>운영 요약 지표</h2><p>자동 산출된 상태/성능 지표를 기준으로 점검 결과를 빠르게 확인합니다.</p></div>',
    '    </div>',
    '    <div class="report-chart-frame">{{chartsHtml}}</div>',
    '  </section>',
    '  <section class="report-section report-body-section">',
    '    <div class="report-section-head">',
    '      <span>02</span>',
    '      <div><h2>고객 공유 본문</h2><p>엔지니어 검토 후 고객에게 전달되는 핵심 내역입니다.</p></div>',
    '    </div>',
    '    <div class="report-body">{{bodyHtml}}</div>',
    '  </section>',
    '  <section class="report-review-note">',
    '    <b>검토 기준</b>',
    '    <span>본문의 수치, 조치 결과, 후속 일정은 원천 이력과 대조 후 확정합니다. 불확실한 항목은 고객 전달 전 확인 필요로 유지합니다.</span>',
    '  </section>',
    '  {{signatureBlock}}',
    '  <footer class="report-footer">',
    '    <span>{{templateName}} {{templateVersion}}</span>',
    '    <span>DATABANK SYSTEMS · CONFIDENTIAL · {{generatedAt}}</span>',
    '  </footer>',
    '</main>',
  ].join('\n'),
  css: [
    '@page { size: A4; margin: 13mm 12mm 14mm; }',
    '* { box-sizing: border-box; }',
    'body { margin: 0; font-family: "Malgun Gothic", "맑은 고딕", Arial, sans-serif; color: #172033; font-size: 11.5px; line-height: 1.62; background: #ffffff; }',
    '.report-doc { position: relative; width: 100%; min-height: 100%; padding-top: 2px; }',
    '.report-doc::before { content: ""; display: block; height: 5px; margin-bottom: 18px; border-radius: 999px; background: linear-gradient(90deg, #0f2a44 0%, #176b87 48%, #4fb3a3 100%); }',
    '.report-hero { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 22px; align-items: start; padding-bottom: 18px; border-bottom: 1px solid #cfd7e3; margin-bottom: 14px; }',
    '.report-kicker { grid-column: 1 / -1; color: #176b87; font-size: 10px; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; }',
    '.report-title-row { min-width: 0; display: flex; align-items: flex-start; gap: 12px; }',
    'h1 { flex: 1; margin: 0; color: #0f172a; font-size: 26px; line-height: 1.22; letter-spacing: -.02em; font-weight: 900; word-break: keep-all; }',
    '.report-status { display: inline-flex; align-items: center; min-height: 24px; padding: 4px 11px; border-radius: 999px; background: #e9f8f5; color: #0f766e; border: 1px solid #b7e4dc; font-size: 11px; font-weight: 900; white-space: nowrap; }',
    '.report-subtitle { margin: 8px 0 0; color: #64748b; font-weight: 700; }',
    '.report-doc-info { margin: 0; display: grid; gap: 6px; color: #475569; font-size: 10.5px; }',
    '.report-doc-info div { display: grid; grid-template-columns: 66px minmax(0, 1fr); gap: 10px; align-items: baseline; }',
    '.report-doc-info dt { color: #0f172a; font-weight: 900; }',
    '.report-doc-info dd { margin: 0; text-align: right; overflow-wrap: anywhere; }',
    '.report-control-band { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 14px; }',
    '.report-control-band div { min-height: 58px; padding: 10px 12px; border-radius: 12px; background: #f7fafc; border: 1px solid #dbe4ee; }',
    '.report-control-band span { display: block; margin-bottom: 3px; color: #64748b; font-size: 9.5px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }',
    '.report-control-band b { display: block; color: #0f172a; font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }',
    '.report-meta { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid #cfd7e3; border-radius: 12px; overflow: hidden; margin-bottom: 18px; }',
    '.report-meta-cell { min-height: 50px; padding: 9px 11px; border-right: 1px solid #d8e0ea; border-bottom: 1px solid #d8e0ea; background: #fff; }',
    '.report-meta-cell:nth-child(4n) { border-right: 0; }',
    '.report-meta-cell:nth-last-child(-n + 4) { border-bottom: 0; }',
    '.report-meta-cell span { display: block; margin-bottom: 4px; font-size: 9.5px; font-weight: 900; color: #64748b; text-transform: uppercase; letter-spacing: .06em; }',
    '.report-meta-cell b { display: block; font-size: 12px; color: #0f172a; line-height: 1.35; overflow-wrap: anywhere; }',
    '.report-section { margin-bottom: 19px; page-break-inside: avoid; }',
    '.report-section-head { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 10px; align-items: start; margin-bottom: 10px; }',
    '.report-section-head > span { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; background: #0f2a44; color: #ffffff; font-size: 11px; font-weight: 900; }',
    'h2 { margin: 0; color: #111827; font-size: 15px; line-height: 1.25; font-weight: 900; }',
    '.report-section-head p { margin: 3px 0 0; color: #64748b; font-size: 10.5px; }',
    '.report-chart-frame { padding: 12px; border: 1px solid #d8e0ea; border-radius: 14px; background: linear-gradient(180deg, #f8fbfd 0%, #ffffff 100%); }',
    '.report-chart-frame h3 { color: #172033 !important; }',
    '.report-body { min-height: 245px; padding: 18px 20px; border: 1px solid #cfd7e3; border-radius: 14px; background: #ffffff; color: #1f2937; word-break: keep-all; box-shadow: inset 4px 0 0 #176b87; }',
    '.report-body b, .report-body strong { color: #0f172a; }',
    '.report-review-note { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 12px; align-items: start; padding: 12px 14px; border: 1px solid #d8e0ea; border-radius: 12px; background: #f8fafc; color: #475569; margin: 6px 0 18px; page-break-inside: avoid; }',
    '.report-review-note b { color: #0f172a; font-size: 11px; font-weight: 900; }',
    '.report-signature { margin-top: 20px; page-break-inside: avoid; }',
    '.report-signature h2 { margin: 0 0 10px; padding-bottom: 7px; border-bottom: 1px solid #cfd7e3; }',
    '.report-signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }',
    '.report-signature-box { min-height: 118px; padding: 12px 14px; border: 1px solid #b8c4d3; border-radius: 12px; background: #fff; }',
    '.report-signature-box span { display: block; color: #64748b; font-size: 10px; font-weight: 900; letter-spacing: .05em; }',
    '.report-signature-box b { display: block; margin-top: 4px; color: #0f172a; font-size: 13px; }',
    '.report-signature-line { height: 44px; margin: 10px 0 7px; border-bottom: 1px solid #94a3b8; }',
    '.report-footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #cfd7e3; display: flex; justify-content: space-between; gap: 12px; color: #94a3b8; font-size: 9.5px; font-weight: 800; letter-spacing: .04em; }',
  ].join('\n'),
};

const STORAGE_KEY = 'databank.report.masterTemplate';
const LIST_STORAGE_KEY = 'databank.report.masterTemplates';

export function getReportMasterTemplates() {
  if (typeof window === 'undefined') return [{ ...DEFAULT_REPORT_MASTER_TEMPLATE }];
  try {
    const listSaved = window.localStorage.getItem(LIST_STORAGE_KEY);
    if (listSaved) {
      const parsed = JSON.parse(listSaved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(normalizeReportMasterTemplate);
    }
    const legacySaved = window.localStorage.getItem(STORAGE_KEY);
    if (legacySaved) {
      const legacyParsed = JSON.parse(legacySaved);
      return [normalizeReportMasterTemplate(legacyParsed)];
    }
    return [normalizeReportMasterTemplate(DEFAULT_REPORT_MASTER_TEMPLATE)];
  } catch {
    return [normalizeReportMasterTemplate(DEFAULT_REPORT_MASTER_TEMPLATE)];
  }
}

export function getReportMasterTemplate(customerId = null) {
  const templates = getReportMasterTemplates();
  if (customerId) {
    const specific = templates.find(t => String(t.customerId) === String(customerId));
    if (specific) return specific;
  }
  return templates.find(t => !t.customerId) || templates[0];
}

export function saveReportMasterTemplates(templates) {
  const next = templates.map(normalizeReportMasterTemplate);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(next));
    publishReportMasterTemplates(next);
  }
  return next;
}

export function saveReportMasterTemplate(template) {
  const templates = getReportMasterTemplates();
  const next = normalizeReportMasterTemplate(template);
  const index = templates.findIndex(t => t.id === next.id);
  if (index >= 0) {
    templates[index] = next;
  } else {
    templates.push(next);
  }
  saveReportMasterTemplates(templates);
  return next;
}

export function subscribeReportMasterTemplate(callback) {
  if (typeof window === 'undefined') return () => {};
  const handler = event => callback(event.detail || getReportMasterTemplates());
  window.addEventListener(REPORT_MASTER_TEMPLATE_EVENT, handler);
  return () => window.removeEventListener(REPORT_MASTER_TEMPLATE_EVENT, handler);
}

export function normalizeReportMasterTemplate(template = {}) {
  return {
    ...DEFAULT_REPORT_MASTER_TEMPLATE,
    ...template,
    id: template.id || `tpl-${Date.now()}-${Math.floor(Math.random()*1000)}`,
    customerId: template.customerId || null,
    name: String(template.name || DEFAULT_REPORT_MASTER_TEMPLATE.name).trim() || DEFAULT_REPORT_MASTER_TEMPLATE.name,
    version: String(template.version || DEFAULT_REPORT_MASTER_TEMPLATE.version).trim() || DEFAULT_REPORT_MASTER_TEMPLATE.version,
    html: String(template.html || DEFAULT_REPORT_MASTER_TEMPLATE.html),
    css: String(template.css || DEFAULT_REPORT_MASTER_TEMPLATE.css),
    llmPrompt: String(template.llmPrompt || DEFAULT_REPORT_MASTER_TEMPLATE.llmPrompt),
    updatedAt: template.updatedAt || nowLabel(),
  };
}

export function snapshotReportMasterTemplate(template = getReportMasterTemplate()) {
  const normalized = normalizeReportMasterTemplate(template);
  return {
    id: normalized.id,
    customerId: normalized.customerId,
    name: normalized.name,
    version: normalized.version,
    html: normalized.html,
    css: normalized.css,
    llmPrompt: normalized.llmPrompt,
  };
}

export function publishReportMasterTemplates(templates) {
  const next = templates.map(normalizeReportMasterTemplate);
  if (typeof window !== 'undefined') {
    installWindowTemplates(next);
    window.dispatchEvent(new CustomEvent(REPORT_MASTER_TEMPLATE_EVENT, { detail: next }));
  }
  return next;
}

function installWindowTemplates(templates) {
  if (typeof window !== 'undefined') {
    window.REPORT_MASTER_TEMPLATES = templates;
  }
}

function nowLabel() {
  return new Date().toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

if (typeof window !== 'undefined') {
  installWindowTemplates(getReportMasterTemplates());
}
