import React from 'react';
import { Icon } from './Icon.jsx';
import { useMasterData } from '../contexts/MasterDataContext.js';
import {
  DEFAULT_REPORT_MASTER_TEMPLATE,
  normalizeReportMasterTemplate,
  publishReportMasterTemplates,
} from '../reportMasterTemplate.js';
import {
  createReportTemplate,
  deleteReportTemplate as deleteReportTemplateApi,
  getReportTemplates,
  updateReportTemplate,
} from '../features/settings/api/settingsApi.js';

const REPORT_API_BASE = typeof window !== 'undefined' && window.DATABANK_API_BASE
  ? window.DATABANK_API_BASE
  : '';

const REQUIRED_PLACEHOLDERS = ['title', 'metaRows', 'bodyHtml'];

const PLACEHOLDER_GROUPS = [
  { label: '문서', items: ['title', 'documentNo', 'generatedAt', 'templateName', 'templateVersion'] },
  { label: '본문/블록', items: ['metaRows', 'chartsHtml', 'bodyHtml', 'signatureBlock'] },
  { label: '메타', items: ['meta.customer', 'meta.service', 'meta.instance', 'meta.period', 'meta.owner', 'meta.createdAt', 'meta.status', 'meta.method', 'meta.signaturePolicy'] },
];

export function ReportTemplates() {
  const initialTemplates = React.useMemo(() => [normalizeReportMasterTemplate(DEFAULT_REPORT_MASTER_TEMPLATE)], []);
  const [templates, setTemplates] = React.useState(() => initialTemplates);
  const [persistedIds, setPersistedIds] = React.useState(() => new Set());
  const [activeId, setActiveId] = React.useState(() => initialTemplates[0].id);
  const [template, setTemplate] = React.useState(() => initialTemplates[0]);
  const [savedAt, setSavedAt] = React.useState(template.updatedAt);
  const [loading, setLoading] = React.useState(false);
  const [saveError, setSaveError] = React.useState(null);
  const [pdfUrl, setPdfUrl] = React.useState(null);
  const [isRendering, setIsRendering] = React.useState(false);
  const [renderError, setRenderError] = React.useState(null);
  const [previewMode, setPreviewMode] = React.useState('pdf');
  const [activeEditor, setActiveEditor] = React.useState('html');

  const promptRef = React.useRef(null);
  const htmlRef = React.useRef(null);
  const cssRef = React.useRef(null);

  const { customers: myCustomers } = useMasterData();
  const savedTemplate = templates.find(t => t.id === activeId);
  const isUnsavedNew = !persistedIds.has(activeId);
  const isDirty = isTemplateDirty(savedTemplate, template);
  const optionTemplates = templates.some(t => t.id === activeId) ? templates : [template, ...templates];
  const scopeLabel = getScopeLabel(template, myCustomers);
  const stats = React.useMemo(() => getTemplateStats(template), [template]);
  const localPreviewHtml = React.useMemo(() => buildLocalPreviewHtml(template), [template]);
  const showPdf = previewMode === 'pdf' && Boolean(pdfUrl);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setSaveError(null);
    getReportTemplates()
      .then(rows => {
        if (!active) return;
        const list = Array.isArray(rows) && rows.length > 0
          ? rows.map(normalizeReportMasterTemplate)
          : initialTemplates;
        setTemplates(list);
        publishReportMasterTemplates(list);
        setPersistedIds(new Set((Array.isArray(rows) ? rows : []).map(row => row.id)));
        setActiveId(list[0].id);
        setTemplate(list[0]);
        setSavedAt(list[0].updatedAt);
      })
      .catch(err => {
        if (active) setSaveError(err.message || '템플릿을 불러오지 못했습니다');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [initialTemplates]);

  React.useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setIsRendering(true);
      setRenderError(null);
      try {
        const payload = {
          reportId: 'preview-report-id',
          title: '삼성전자 ERP 백업 시스템 점검내역서',
          generatedBody: '',
          editedBody: [
            '1. 점검 목적',
            '- ERP 백업 시스템의 안정성 및 데이터 정합성 확인',
            '',
            '2. 주요 점검 결과',
            '- 백업 스케줄 정상 동작 확인 완료',
            '- 스토리지 사용률 양호 (현재 45%)',
            '- 아카이브 로그 및 백업 데이터 정합성 검증 완료',
            '',
            '3. 특이사항 및 조치',
            '- 4.28 백업 실패 건(inc-2026-0039) 조치 후 정상화 완료',
            '- 추가적인 네트워크 대역폭 확보 권고'
          ].join('\n'),
          templateSnapshot: normalizeReportMasterTemplate(template),
          signature: {
            required: true,
            signer: '고객 담당자',
            status: 'signed',
            signedAt: '2026.05.01 09:00',
          },
          documentMeta: {
            customer: '삼성전자',
            service: 'ERP 백업 시스템',
            instance: 'SEC-ERP-DB01',
            period: '2026.04',
            owner: '이민호',
            createdAt: '2026.05.01',
            status: '완료',
            method: '방문/원격',
            signaturePolicy: '고객 서명 필수',
          },
        };
        const response = await fetch(`${REPORT_API_BASE}/api/reports/render-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`PDF render failed (${response.status})`);
        const blob = await response.blob();
        if (active) {
          const url = URL.createObjectURL(blob);
          setPdfUrl(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        }
      } catch (e) {
        if (active) {
          setRenderError(e.message || 'PDF render failed');
          setPreviewMode('html');
        }
        console.error(e);
      } finally {
        if (active) setIsRendering(false);
      }
    }, 500);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [template]);

  React.useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  function setField(key, value) {
    setTemplate(current => ({ ...current, [key]: value }));
  }

  async function save() {
    const nextDraft = normalizeReportMasterTemplate(template);
    setLoading(true);
    setSaveError(null);
    try {
      const saved = persistedIds.has(nextDraft.id)
        ? await updateReportTemplate(nextDraft.id, nextDraft)
        : await createReportTemplate(nextDraft);
      const next = normalizeReportMasterTemplate(saved);
      const nextList = upsertTemplateList(templates, next);
      setTemplates(nextList);
      publishReportMasterTemplates(nextList);
      setPersistedIds(ids => new Set([...ids, next.id]));
      setTemplate(next);
      setActiveId(next.id);
      setSavedAt(next.updatedAt);
    } catch (err) {
      setSaveError(err.message || '템플릿 저장에 실패했습니다');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    if (!window.confirm('현재 템플릿을 v2 기본안으로 덮어쓸까요? 고객사 적용 대상은 유지됩니다.')) return;
    const next = normalizeReportMasterTemplate({
      ...DEFAULT_REPORT_MASTER_TEMPLATE,
      id: template.id,
      customerId: template.customerId,
      updatedAt: new Date().toLocaleString('ko-KR'),
    });
    setTemplate(next);
  }

  async function deleteTemplate() {
    if (isUnsavedNew) {
      const fallback = templates[0];
      setActiveId(fallback.id);
      setTemplate(fallback);
      setSavedAt(fallback.updatedAt);
      return;
    }
    if (templates.length <= 1) {
      alert('최소 1개의 템플릿이 필요합니다.');
      return;
    }
    if (!window.confirm('이 템플릿을 삭제하시겠습니까?')) return;
    setLoading(true);
    setSaveError(null);
    try {
      await deleteReportTemplateApi(activeId);
      const nextList = templates.filter(t => t.id !== activeId);
      const fallbackList = nextList.length ? nextList : initialTemplates;
      setTemplates(fallbackList);
      publishReportMasterTemplates(fallbackList);
      setPersistedIds(ids => {
        const next = new Set(ids);
        next.delete(activeId);
        return next;
      });
      setActiveId(fallbackList[0].id);
      setTemplate(fallbackList[0]);
      setSavedAt(fallbackList[0].updatedAt);
    } catch (err) {
      setSaveError(err.message || '템플릿 삭제에 실패했습니다');
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(e) {
    const val = e.target.value;
    if (val === 'new') {
      const next = normalizeReportMasterTemplate({
        ...DEFAULT_REPORT_MASTER_TEMPLATE,
        id: `tpl-${Date.now()}`,
        name: '새 내역서 Master',
        customerId: null,
        updatedAt: new Date().toLocaleString('ko-KR'),
      });
      setTemplate(next);
      setActiveId(next.id);
      setSavedAt(null);
      return;
    }
    setActiveId(val);
    const next = templates.find(t => t.id === val) || templates[0];
    setTemplate(next);
    setSavedAt(next.updatedAt);
  }

  function insertPlaceholder(name) {
    const key = activeEditor === 'css' ? 'css' : activeEditor === 'llmPrompt' ? 'llmPrompt' : 'html';
    const refMap = { llmPrompt: promptRef, html: htmlRef, css: cssRef };
    const ref = refMap[key];
    const token = `{{${name}}}`;
    const value = String(template[key] || '');
    const element = ref.current;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    const nextValue = `${value.slice(0, start)}${token}${value.slice(end)}`;
    setField(key, nextValue);
    window.requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="rt-master-page">
      <div className="rt-master-hero">
        <div className="rt-master-hero-copy">
          <span className="rt-master-eyebrow"><Icon name="sparkles" size={13}/> Report Master Console</span>
          <h2>내역서 Master 템플릿</h2>
          <p>전사 기본 템플릿과 고객사 전용 템플릿을 HTML/CSS/PDF 기준으로 관리합니다.</p>
        </div>
        <div className="rt-master-toolbar">
          <select className="input rt-master-select" value={activeId} onChange={handleSelect}>
            {optionTemplates.map(t => {
              const cName = t.customerId ? (myCustomers.find(c => c.id === t.customerId)?.name || t.customerId) : null;
              const pending = !templates.some(item => item.id === t.id);
              return (
                <option key={t.id} value={t.id}>
                  {t.customerId ? `[${cName}] ${t.name}` : `[전사 기본] ${t.name}`}{pending ? ' (미저장)' : ''}
                </option>
              );
            })}
            <option disabled>──────────</option>
            <option value="new">+ 새 템플릿 만들기</option>
          </select>
          <button className="btn" onClick={reset} disabled={loading}><Icon name="refresh" size={13}/> v2 기본안</button>
          <button className="btn danger" onClick={deleteTemplate} disabled={loading || (!isUnsavedNew && templates.length <= 1)}>
            <Icon name={isUnsavedNew ? 'x' : 'trash'} size={13}/> {isUnsavedNew ? '작성 취소' : '삭제'}
          </button>
          <button className="btn primary" onClick={save} disabled={loading}><Icon name="check" size={13}/> {loading ? '처리 중' : '저장'}</button>
        </div>
      </div>

      {saveError && (
        <div className="rt-render-alert" style={{ marginBottom: 12 }}>
          <Icon name="alert" size={14}/>
          <span>{saveError}</span>
        </div>
      )}

      <div className="rt-master-stat-grid">
        <div className="rt-master-stat">
          <span>적용 범위</span>
          <b>{scopeLabel.title}</b>
          <em>{scopeLabel.caption}</em>
        </div>
        <div className="rt-master-stat">
          <span>변경 상태</span>
          <b>{isDirty ? '저장 필요' : '동기화됨'}</b>
          <em>{savedAt || '아직 저장되지 않음'}</em>
        </div>
        <div className="rt-master-stat">
          <span>구성</span>
          <b>HTML {stats.htmlLines}줄 · CSS {stats.cssLines}줄</b>
          <em>Prompt {stats.promptLines}줄</em>
        </div>
        <div className={'rt-master-stat' + (stats.missing.length ? ' warn' : '')}>
          <span>필수 슬롯</span>
          <b>{stats.missing.length ? `${stats.missing.length}개 누락` : '정상'}</b>
          <em>{stats.missing.length ? stats.missing.map(x => `{{${x}}}`).join(', ') : `${stats.usedCount}개 placeholder 사용`}</em>
        </div>
      </div>

      <div className="rt-master-layout">
        <section className="rt-master-editor">
          <div className="rt-master-card rt-master-card-strong">
            <div className="rt-master-card-h">
              <div>
                <h3>Master 정보</h3>
                <span>템플릿의 적용 범위와 버전을 관리합니다.</span>
              </div>
              {isDirty && <span className="tag tech xs">Unsaved</span>}
            </div>
            <div className="rt-master-fields rt-master-fields-3">
              <label className="form-label">
                <span>적용 대상</span>
                <select className="input" value={template.customerId || ''} onChange={e => setField('customerId', e.target.value || null)}>
                  <option value="">전사 기본 (모든 고객사)</option>
                  {myCustomers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                <span>템플릿명</span>
                <input className="input" value={template.name} onChange={e => setField('name', e.target.value)}/>
              </label>
              <label className="form-label">
                <span>버전</span>
                <input className="input" value={template.version} onChange={e => setField('version', e.target.value)}/>
              </label>
            </div>
          </div>

          <div className="rt-master-card">
            <div className="rt-master-card-h">
              <div>
                <h3>LLM 작성 지시문</h3>
                <span>본문 생성 품질과 금지사항을 정의합니다.</span>
              </div>
              <span className="rt-master-count">{stats.promptChars.toLocaleString()}자</span>
            </div>
            <textarea
              ref={promptRef}
              className="input rt-master-prompt"
              value={template.llmPrompt}
              onFocus={() => setActiveEditor('llmPrompt')}
              onChange={e => setField('llmPrompt', e.target.value)}
            />
          </div>

          <div className="rt-master-card rt-master-placeholder-card">
            <div className="rt-master-card-h">
              <div>
                <h3>Placeholder Bank</h3>
                <span>클릭하면 현재 편집 중인 영역에 삽입됩니다.</span>
              </div>
              <span className="tag muted xs">active: {activeEditor}</span>
            </div>
            <div className="rt-placeholder-groups">
              {PLACEHOLDER_GROUPS.map(group => (
                <div key={group.label} className="rt-placeholder-group">
                  <b>{group.label}</b>
                  <div>
                    {group.items.map(item => (
                      <button key={item} type="button" onClick={() => insertPlaceholder(item)}>
                        {'{{'}{item}{'}}'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rt-master-code-grid">
            <label className={'rt-master-code' + (activeEditor === 'html' ? ' on' : '')}>
              <span>HTML Shell</span>
              <textarea
                ref={htmlRef}
                className="input"
                value={template.html}
                onFocus={() => setActiveEditor('html')}
                onChange={e => setField('html', e.target.value)}
              />
            </label>
            <label className={'rt-master-code' + (activeEditor === 'css' ? ' on' : '')}>
              <span>Print CSS</span>
              <textarea
                ref={cssRef}
                className="input"
                value={template.css}
                onFocus={() => setActiveEditor('css')}
                onChange={e => setField('css', e.target.value)}
              />
            </label>
          </div>
        </section>

        <aside className="rt-master-preview">
          <div className="rt-master-preview-h">
            <div>
              <h3>라이브 미리보기</h3>
              <span>{showPdf ? '백엔드에서 렌더링한 PDF입니다.' : '로컬 HTML fallback 미리보기입니다.'}</span>
            </div>
            <div className="rt-preview-mode">
              <button className={previewMode === 'pdf' ? 'on' : ''} onClick={() => setPreviewMode('pdf')}>PDF</button>
              <button className={previewMode === 'html' ? 'on' : ''} onClick={() => setPreviewMode('html')}>HTML</button>
            </div>
          </div>

          {renderError && (
            <div className="rt-render-alert">
              <Icon name="alert" size={14}/>
              <span>PDF 렌더링 실패: {renderError}. HTML 프리뷰로 계속 확인할 수 있습니다.</span>
            </div>
          )}

          <div className="rt-master-preview-wrap">
            {isRendering && (
              <div className="rt-preview-loading">
                <Icon name="refresh" size={13}/> PDF 렌더링 중
              </div>
            )}
            {showPdf ? (
              <iframe className="rt-master-preview-frame" title="report master template preview pdf" src={pdfUrl}/>
            ) : (
              <iframe className="rt-master-preview-frame" title="report master template preview html" srcDoc={localPreviewHtml}/>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function getScopeLabel(template, customers) {
  if (template.customerId) {
    const customerName = customers.find(c => c.id === template.customerId)?.name || template.customerId;
    return { title: customerName, caption: '고객사 전용 override' };
  }
  return { title: '전사 기본', caption: '고객 전용 템플릿이 없을 때 적용' };
}

function isTemplateDirty(saved, draft) {
  if (!saved) return true;
  return ['customerId', 'name', 'version', 'html', 'css', 'llmPrompt'].some(key => (
    String(saved[key] ?? '') !== String(draft[key] ?? '')
  ));
}

function upsertTemplateList(templates, template) {
  const index = templates.findIndex(t => t.id === template.id);
  if (index >= 0) {
    const copy = [...templates];
    copy[index] = template;
    return copy;
  }
  return [template, ...templates];
}

function getTemplateStats(template) {
  const used = getUsedPlaceholders(template.html);
  return {
    htmlLines: countLines(template.html),
    cssLines: countLines(template.css),
    promptLines: countLines(template.llmPrompt),
    promptChars: String(template.llmPrompt || '').length,
    usedCount: used.length,
    missing: REQUIRED_PLACEHOLDERS.filter(item => !used.includes(item)),
  };
}

function countLines(value) {
  const text = String(value || '');
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

function getUsedPlaceholders(value) {
  const matches = String(value || '').matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g);
  return Array.from(new Set(Array.from(matches, match => match[1]))).sort();
}

function buildLocalPreviewHtml(template) {
  const normalized = normalizeReportMasterTemplate(template);
  const meta = {
    customer: '삼성전자',
    service: 'ERP 백업 시스템',
    instance: 'SEC-ERP-DB01',
    period: '2026.04',
    owner: '이민호',
    createdAt: '2026.05.01',
    status: '완료',
    method: '방문/원격',
    signaturePolicy: '고객 서명 필수',
    documentNo: 'DB-2026-PREVIEW',
  };
  const replacements = {
    title: escapeHtml('삼성전자 ERP 백업 시스템 점검내역서'),
    documentNo: escapeHtml(meta.documentNo),
    templateName: escapeHtml(normalized.name),
    templateVersion: escapeHtml(normalized.version),
    generatedAt: escapeHtml(new Date().toLocaleString('ko-KR')),
    bodyHtml: textToHtml([
      '1. 점검 목적',
      '- ERP 백업 시스템의 안정성과 데이터 정합성을 확인했습니다.',
      '',
      '2. 주요 점검 결과',
      '- 백업 스케줄 정상 동작 확인 완료',
      '- 스토리지 사용률 45%로 운영 기준 이내',
      '- 아카이브 로그 및 백업 데이터 정합성 검증 완료',
      '',
      '3. 특이사항 및 조치',
      '- 4.28 백업 실패 건은 조치 후 정상화 완료',
      '- 야간 배치 시간대 네트워크 대역폭 추가 확보 권고',
    ].join('\n')),
    metaRows: buildPreviewMetaRows(meta),
    chartsHtml: buildPreviewChartsHtml(),
    signatureBlock: buildPreviewSignatureBlock(meta.owner),
  };
  Object.entries(meta).forEach(([key, value]) => {
    replacements[`meta.${key}`] = escapeHtml(value || '-');
  });

  const rendered = renderPlaceholders(normalized.html, replacements);
  return wrapPreviewHtml(rendered, normalized.css);
}

function buildPreviewMetaRows(meta) {
  return [
    ['고객사', meta.customer],
    ['업무/서비스', meta.service],
    ['인스턴스', meta.instance],
    ['기간', meta.period],
    ['작성자', meta.owner],
    ['작성일', meta.createdAt],
    ['방문방법', meta.method],
    ['서명 정책', meta.signaturePolicy],
  ].map(([label, value]) => (
    `<div class="report-meta-cell"><span>${escapeHtml(label)}</span><b>${escapeHtml(value || '-')}</b></div>`
  )).join('');
}

function buildPreviewChartsHtml() {
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:0;">
      <div style="border:1px solid #d8e0ea;border-radius:12px;padding:13px;background:#fff;">
        <h3 style="margin:0 0 10px;font-size:13px;color:#172033;">시스템 자원</h3>
        ${previewBar('CPU Usage', 65, '#10b981')}
        ${previewBar('Memory', 82, '#f59e0b')}
        ${previewBar('Disk', 45, '#10b981')}
      </div>
      <div style="border:1px solid #d8e0ea;border-radius:12px;padding:13px;background:#fff;">
        <h3 style="margin:0 0 10px;font-size:13px;color:#172033;">점검 결과</h3>
        <div style="display:grid;grid-template-columns:92px 1fr;gap:12px;align-items:center;">
          <svg width="92" height="92" viewBox="0 0 92 92">
            <circle cx="46" cy="46" r="32" fill="transparent" stroke="#e5e7eb" stroke-width="14"/>
            <circle cx="46" cy="46" r="32" fill="transparent" stroke="#10b981" stroke-width="14" stroke-dasharray="150 201" transform="rotate(-90 46 46)"/>
            <circle cx="46" cy="46" r="32" fill="transparent" stroke="#f59e0b" stroke-width="14" stroke-dasharray="34 201" stroke-dashoffset="-150" transform="rotate(-90 46 46)"/>
            <circle cx="46" cy="46" r="32" fill="transparent" stroke="#ef4444" stroke-width="14" stroke-dasharray="17 201" stroke-dashoffset="-184" transform="rotate(-90 46 46)"/>
          </svg>
          <div style="font-size:11px;line-height:1.9;color:#334155;">
            <div><b style="color:#10b981;">■</b> 정상 18</div>
            <div><b style="color:#f59e0b;">■</b> 주의 3</div>
            <div><b style="color:#ef4444;">■</b> 장애 1</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function previewBar(label, value, color) {
  return `
    <div style="margin-top:8px;">
      <div style="display:flex;justify-content:space-between;font-size:10.5px;font-weight:800;color:#475569;margin-bottom:3px;">
        <span>${label}</span><span>${value}%</span>
      </div>
      <div style="height:9px;border-radius:999px;background:#e5e7eb;overflow:hidden;">
        <div style="width:${value}%;height:100%;border-radius:999px;background:${color};"></div>
      </div>
    </div>
  `;
}

function buildPreviewSignatureBlock(owner) {
  return [
    '<section class="report-signature">',
    '  <h2>고객 확인 및 서명</h2>',
    '  <div class="report-signature-grid">',
    '    <div class="report-signature-box"><span>고객 담당자</span><b>고객 담당자</b><div class="report-signature-line"></div><span>서명</span></div>',
    `    <div class="report-signature-box"><span>데이터뱅크 담당자</span><b>${escapeHtml(owner || '')}</b><div class="report-signature-line"></div><span>확인</span></div>`,
    '  </div>',
    '</section>',
  ].join('');
}

function renderPlaceholders(source, replacements) {
  return String(source || '').replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key) => replacements[key] ?? '');
}

function wrapPreviewHtml(rendered, css) {
  if (/<html[\s>]/i.test(rendered)) {
    if (rendered.includes('{{css}}')) return rendered.replaceAll('{{css}}', css);
    if (/<style[\s>]/i.test(rendered)) return rendered;
    if (/<\/head>/i.test(rendered)) return rendered.replace(/<\/head>/i, `<style>${css}</style></head>`);
    return rendered;
  }
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <style>${css}</style>
  <style>
    body { padding: 22px; background: #eef2f7; }
    .report-doc { width: 794px; min-height: 1123px; margin: 0 auto; padding: 42px; background: #fff; box-shadow: 0 18px 60px rgba(15, 23, 42, .16); }
  </style>
</head>
<body>${rendered}</body>
</html>`;
}

function textToHtml(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
