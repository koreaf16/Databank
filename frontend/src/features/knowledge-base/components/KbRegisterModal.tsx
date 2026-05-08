/**
 * 파일: frontend/src/features/knowledge-base/components/KbRegisterModal.jsx
 * 역할: 지식베이스 문서 등록 모달.
 *       파일 탭(기본) — 다중 파일 드래그앤드롭 업로드 + 인덱싱 진행률
 *       URL 탭       — URL 스캔 → 파일 링크 목록 → 선택 등록
 *       직접입력 탭  — 메타정보 + 본문 직접 작성
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { docTypeLabel } from '../utils/kbUtils.js';
import { uploadFiles, probeUrl, registerUrls, subscribeJobProgress } from '../api/kbUploadApi.js';
import { getProducts, getProductVersions } from '../api/kbProductApi.js';

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.pptx,.ppt,.txt,.md';
const MAX_FILES = 50;

// ── 공통 서브 컴포넌트 ────────────────────────────────────────────────────────

function JobRow({ job }) {
  const pct = job.progress ?? 0;
  const done = job.status === 'done', fail = job.status === 'failed';
  return (
    <div className="kb-upload-job">
      <div className="kb-upload-job-header">
        <span className="kb-upload-job-name" title={job.id}>{job.name || job.id}</span>
        <span className={'kb-upload-job-status ' + (job.status || 'queued')}>
          {done ? '완료' : fail ? '실패' : job.stage ?? '처리 중'}
        </span>
      </div>
      <div className="kb-progress">
        <div style={{ width: pct + '%', background: fail ? 'var(--color-danger)' : undefined }}/>
      </div>
    </div>
  );
}

function VersionTagInput({ value, onChange, suggested = [] }) {
  const [input, setInput] = React.useState('');
  function addTag(raw) {
    const t = raw.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInput('');
  }
  return (
    <div className="kb-version-tags">
      {value.map(v => (
        <span key={v} className="kb-version-tag">
          {v}
          <button type="button" onClick={() => onChange(value.filter(x => x !== v))}>×</button>
        </span>
      ))}
      <input
        list="kb-ver-suggest"
        className="kb-version-input"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); if (input.trim()) addTag(input); }
          if (e.key === 'Backspace' && !input && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => { if (input.trim()) addTag(input); }}
        placeholder={value.length === 0 ? '예: 19c  (Enter로 추가)' : '버전 추가...'}
      />
      {suggested.length > 0 && (
        <datalist id="kb-ver-suggest">
          {suggested.filter(v => !value.includes(v)).map(v => <option key={v} value={v}/>)}
        </datalist>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export function KbRegisterModal({ categories, selectedCategoryId, currentUserName, onSave, onDone, onClose, onBackground }) {
  const firstLeaf = categories.find(c => c.parentId) || categories[0];
  const defaultCatId = selectedCategoryId || firstLeaf?.id || '';

  const [tab, setTab] = React.useState('file');

  // ── 파일 탭 state ──
  const [files, setFiles] = React.useState([]);
  const [fileCatId, setFileCatId] = React.useState(defaultCatId);
  const [fileTags, setFileTags] = React.useState('');
  const [fileDocType, setFileDocType] = React.useState('vendor_manual');
  const [fileProductName, setFileProductName] = React.useState('');
  const [fileProductId, setFileProductId] = React.useState('');
  const [fileVersions, setFileVersions] = React.useState([]);
  const [fileSuggestedVersions, setFileSuggestedVersions] = React.useState([]);
  const [fileVendor, setFileVendor] = React.useState('');
  const [fileOsPlatform, setFileOsPlatform] = React.useState('');
  const [fileVersionRange, setFileVersionRange] = React.useState('');
  const [filePhase, setFilePhase] = React.useState('select');
  const [fileJobs, setFileJobs] = React.useState([]);
  const [fileError, setFileError] = React.useState('');
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [dragOver, setDragOver] = React.useState(false);
  const fileInputRef = React.useRef(null);
  const fileUnsubRef = React.useRef(null);

  // ── URL 탭 state ──
  const [urlInput, setUrlInput] = React.useState('');
  const [urlCatId, setUrlCatId] = React.useState(defaultCatId);
  const [urlTags, setUrlTags] = React.useState('');
  const [urlDocType, setUrlDocType] = React.useState('vendor_manual');
  const [urlProductName, setUrlProductName] = React.useState('');
  const [urlProductId, setUrlProductId] = React.useState('');
  const [urlVersions, setUrlVersions] = React.useState([]);
  const [urlSuggestedVersions, setUrlSuggestedVersions] = React.useState([]);
  const [urlVendor, setUrlVendor] = React.useState('');
  const [urlOsPlatform, setUrlOsPlatform] = React.useState('');
  const [urlVersionRange, setUrlVersionRange] = React.useState('');
  const [urlPhase, setUrlPhase] = React.useState('input');
  const [urlLinks, setUrlLinks] = React.useState([]);
  const [selectedUrls, setSelectedUrls] = React.useState(new Set());
  const [urlJobs, setUrlJobs] = React.useState([]);
  const [urlError, setUrlError] = React.useState('');
  const urlUnsubRef = React.useRef(null);

  // ── 직접입력 탭 state ──
  const [form, setForm] = React.useState({
    title: '', bodyText: '',
    categoryId: defaultCatId,
    docType: 'check_item',
    productName: '',
    productId: '',
    versions: [],
    vendor: '',
    osPlatform: '',
    versionRange: '',
    tags: '',
  });
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ── 제품 카탈로그 state ──
  const [products, setProducts] = React.useState([]);
  const [suggestedVersions, setSuggestedVersions] = React.useState([]);

  React.useEffect(() => () => { fileUnsubRef.current?.(); urlUnsubRef.current?.(); }, []);

  // 마운트 시 제품 목록 로드 (모든 탭 공용)
  React.useEffect(() => {
    getProducts().then(list => setProducts(list)).catch(() => {});
  }, []);

  // 파일 탭: 제품명 → productId + vendor + 버전 목록
  React.useEffect(() => {
    const p = products.find(x => x.canonical === fileProductName);
    setFileProductId(p?.id ?? '');
    if (p?.vendor && !fileVendor) setFileVendor(p.vendor);
    if (p?.id) {
      getProductVersions(p.id).then(vs => setFileSuggestedVersions(vs.map(v => v.tag))).catch(() => {});
    } else {
      setFileSuggestedVersions([]);
    }
  }, [fileProductName, products]);

  // URL 탭: 제품명 → productId + vendor + 버전 목록
  React.useEffect(() => {
    const p = products.find(x => x.canonical === urlProductName);
    setUrlProductId(p?.id ?? '');
    if (p?.vendor && !urlVendor) setUrlVendor(p.vendor);
    if (p?.id) {
      getProductVersions(p.id).then(vs => setUrlSuggestedVersions(vs.map(v => v.tag))).catch(() => {});
    } else {
      setUrlSuggestedVersions([]);
    }
  }, [urlProductName, products]);

  // 직접입력 탭: 제품명 → productId + vendor + 버전 목록
  React.useEffect(() => {
    const p = products.find(x => x.canonical === form.productName);
    if (!p) { setSuggestedVersions([]); setF('productId', ''); return; }
    setF('productId', p.id);
    if (p.vendor) setF('vendor', p.vendor);
    getProductVersions(p.id).then(vs => setSuggestedVersions(vs.map(v => v.tag))).catch(() => {});
  }, [form.productName, products]);

  // ── 파일 탭 핸들러 ──

  function addFiles(newFiles) {
    setFiles(prev => {
      const merged = [...prev];
      for (const f of newFiles) {
        if (merged.length >= MAX_FILES) break;
        if (!merged.some(m => m.name === f.name && m.size === f.size)) merged.push(f);
      }
      return merged;
    });
  }

  async function startFileUpload() {
    if (!files.length) return;
    setFilePhase('uploading');
    setFileError('');
    setUploadProgress(0);
    const versions = fileVersions.length ? fileVersions : undefined;
    try {
      const result = await uploadFiles(
        files, fileCatId, fileTags || undefined,
        fileDocType, fileProductId || undefined,
        fileProductName || undefined, versions,
        setUploadProgress,
        fileVendor || undefined,
        fileOsPlatform || undefined,
        fileVersionRange || undefined,
      );
      const jobIds = result.jobIds ?? [];
      const fileNames = (result.files ?? []).map(f => f.fileName);
      setFileJobs(jobIds.map((id, i) => ({ id, name: fileNames[i] ?? id, status: 'queued', progress: 0, stage: 'queued' })));
      setFilePhase('tracking');
      fileUnsubRef.current = subscribeJobProgress(jobIds, setFileJobs, () => setFilePhase('done'));
    } catch (err) {
      setFileError(err.message ?? '업로드 실패');
      setFilePhase('select');
    }
  }

  // ── URL 탭 핸들러 ──

  async function handleScan() {
    if (!urlInput.trim()) return;
    setUrlPhase('scanning');
    setUrlError('');
    setUrlLinks([]);
    setSelectedUrls(new Set());
    try {
      const links = await probeUrl(urlInput.trim());
      setUrlLinks(links);
      setUrlPhase('scanned');
    } catch (err) {
      setUrlError(err.message ?? 'URL 스캔 실패');
      setUrlPhase('input');
    }
  }

  function toggleUrl(href) {
    setSelectedUrls(prev => { const n = new Set(prev); n.has(href) ? n.delete(href) : n.add(href); return n; });
  }

  async function startUrlRegister() {
    const urls = [...selectedUrls];
    if (!urls.length) return;
    setUrlPhase('registering');
    setUrlError('');
    const versions = urlVersions.length ? urlVersions : undefined;
    try {
      const result = await registerUrls(
        urls, urlCatId, urlTags || undefined,
        urlDocType, urlProductId || undefined,
        urlProductName || undefined, versions,
        urlVendor || undefined,
        urlOsPlatform || undefined,
        urlVersionRange || undefined,
      );
      const jobIds = result.jobIds ?? [];
      const names = (result.results ?? []).map(r => r.name);
      setUrlJobs(jobIds.map((id, i) => ({ id, name: names[i] ?? id, status: 'queued', progress: 0, stage: 'queued' })));
      setUrlPhase('tracking');
      urlUnsubRef.current = subscribeJobProgress(jobIds, setUrlJobs, () => setUrlPhase('done'));
    } catch (err) {
      setUrlError(err.message ?? '등록 실패');
      setUrlPhase('scanned');
    }
  }

  // ── 직접입력 저장 ──

  function saveText() {
    const versions = form.versions.length ? form.versions : ['all'];
    onSave({
      title: form.title.trim(),
      categoryId: form.categoryId,
      docType: form.docType,
      productName: form.productName.trim() || '범용',
      productId: form.productId || undefined,
      productVersions: versions,
      versionRange: form.versionRange.trim() || versions.join(', '),
      osPlatform: form.osPlatform.trim() || null,
      vendor: form.vendor.trim() || null,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      author: currentUserName,
      reviewedAt: '미검토',
      status: 'indexing',
      content: form.bodyText,
      source: { type: 'text', url: '' },
      summary: `${versions.join(', ')} 문서. ${docTypeLabel(form.docType)}로 등록됨.`,
      index: { status: 'queued', progress: 8, stage: 'extracting', model: 'bge-m3', updatedAt: '방금', message: '문서 추출 대기열에 등록됨' },
    });
  }

  // ── 탭 정보 ──
  const tabs = [
    { id: 'file', label: '파일', desc: 'PDF/문서 업로드' },
    { id: 'url',  label: 'URL 수집', desc: '페이지에서 파일 링크 수집' },
    { id: 'text', label: '직접 입력', desc: 'Runbook / 메모 작성' },
  ];

  const catOptions = categories.map(c => (
    <option key={c.id} value={c.id}>{c.parentId ? '  └ ' : ''}{c.name}</option>
  ));

  const docTypeOptions = (
    <>
      <option value="vendor_manual">벤더문서</option>
      <option value="check_item">점검항목</option>
      <option value="runbook">Runbook</option>
      <option value="training">교육자료</option>
      <option value="incident_case">장애사례</option>
    </>
  );

  const filesDoneCount = fileJobs.filter(j => j.status === 'done').length;
  const urlsDoneCount  = urlJobs.filter(j => j.status === 'done').length;

  return (
    <div className="modal-backdrop">
      <div className="modal lg" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <div>
            <div className="modal-title">지식베이스 문서 등록</div>
            <div className="text-3" style={{ fontSize: 12, marginTop: 4, color: 'var(--text-3)' }}>메타정보와 버전 정보를 기준으로 RAG 검색 범위를 최적화합니다.</div>
          </div>
          <button className="btn icon ghost" onClick={onClose}><Icon name="x" size={18}/></button>
        </div>

        <div className="modal-body kb-register" style={{ padding: '0' }}>
          {/* ── 탭 ── */}
          <div className="kb-source-tabs" style={{ display: 'flex', background: 'var(--bg-sub)', padding: '0 24px', borderBottom: '1px solid var(--border)' }}>
            {tabs.map(t => (
              <button 
                key={t.id} 
                className={tab === t.id ? 'on' : ''} 
                onClick={() => setTab(t.id)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '16px 20px',
                  border: 'none', background: 'none', cursor: 'pointer', borderBottom: '2px solid transparent',
                  transition: 'all 0.2s', opacity: tab === t.id ? 1 : 0.6,
                  borderBottomColor: tab === t.id ? 'var(--brand-500)' : 'transparent'
                }}
              >
                <b style={{ fontSize: 14, color: tab === t.id ? 'var(--brand-500)' : 'var(--text-1)' }}>{t.label}</b>
                <span style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t.desc}</span>
              </button>
            ))}
          </div>

          <div style={{ padding: '24px', maxHeight: '70vh', overflowY: 'auto' }}>

          {/* ══ 파일 탭 ══ */}
          {tab === 'file' && filePhase === 'select' && (
            <>
              <div className="kb-register-row">
                <label className="form-label">
                  <span>카테고리</span>
                  <select className="input" value={fileCatId} onChange={e => setFileCatId(e.target.value)}>{catOptions}</select>
                </label>
                <label className="form-label">
                  <span>문서유형</span>
                  <select className="input" value={fileDocType} onChange={e => setFileDocType(e.target.value)}>{docTypeOptions}</select>
                </label>
              </div>
              <div className="kb-register-row">
                <label className="form-label">
                  <span>제품 (선택)</span>
                  <input
                    list="kb-file-prod-list"
                    className="input"
                    value={fileProductName}
                    onChange={e => setFileProductName(e.target.value)}
                    placeholder="예: Oracle Database"
                  />
                  <datalist id="kb-file-prod-list">
                    {products.map(p => <option key={p.id} value={p.canonical}/>)}
                  </datalist>
                </label>
                <label className="form-label">
                  <span>벤더 (선택)</span>
                  <input className="input" value={fileVendor} onChange={e => setFileVendor(e.target.value)} placeholder="예: Oracle"/>
                </label>
              </div>
              <div className="kb-register-row">
                <label className="form-label">
                  <span>플랫폼 (선택)</span>
                  <input className="input" value={fileOsPlatform} onChange={e => setFileOsPlatform(e.target.value)} placeholder="예: Linux, Windows"/>
                </label>
                <label className="form-label">
                  <span>버전범위 (선택)</span>
                  <input className="input" value={fileVersionRange} onChange={e => setFileVersionRange(e.target.value)} placeholder="예: 19c~26ai"/>
                </label>
              </div>
              <div className="kb-register-row">
                <label className="form-label wide">
                  <span>태그 (선택)</span>
                  <input className="input" value={fileTags} onChange={e => setFileTags(e.target.value)} placeholder="예: 정기점검, 운영표준"/>
                </label>
              </div>
              <div className="kb-register-row">
                <label className="form-label wide">
                  <span>제품 버전 <span className="text-3" style={{ fontWeight: 400 }}>(Enter 또는 , 로 추가)</span></span>
                  {fileSuggestedVersions.length > 0 && (
                    <div className="kb-ver-chips">
                      {fileSuggestedVersions.map(v => (
                        <button key={v} type="button"
                          className={'kb-ver-chip' + (fileVersions.includes(v) ? ' on' : '')}
                          onClick={() => setFileVersions(prev =>
                            prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
                          )}>
                          {v}
                        </button>
                      ))}
                    </div>
                  )}
                  <VersionTagInput value={fileVersions} onChange={setFileVersions} suggested={fileSuggestedVersions}/>
                </label>
              </div>

              <div
                className={'kb-dropzone' + (dragOver ? ' drag-over' : '')}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); addFiles([...e.dataTransfer.files]); }}
                onClick={() => fileInputRef.current?.click()}
                role="button" tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
              >
                <Icon name="upload" size={28} className="text-3"/>
                <p>파일을 드래그하거나 클릭해서 선택</p>
                <p className="text-3">{ACCEPT} — 최대 {MAX_FILES}개</p>
                <input ref={fileInputRef} type="file" multiple accept={ACCEPT} style={{ display: 'none' }}
                  onChange={e => addFiles([...e.target.files])}/>
              </div>

              {files.length > 0 && (
                <div className="kb-file-list">
                  {files.map((f, i) => (
                    <div key={i} className="kb-file-row">
                      <Icon name="file" size={14}/>
                      <span>{f.name}</span>
                      <span className="text-3">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                      <button className="btn icon ghost xs" onClick={() => setFiles(p => p.filter((_, j) => j !== i))}>
                        <Icon name="x" size={11}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {fileError && <div className="kb-upload-error"><Icon name="alert-circle" size={14}/> {fileError}</div>}
            </>
          )}

          {tab === 'file' && filePhase === 'uploading' && (
            <div className="kb-upload-progress-wrap">
              <div className="kb-upload-progress-label">
                <span>서버로 전송 중...</span>
                <b>{uploadProgress}%</b>
              </div>
              <div className="kb-progress" style={{ height: 8 }}>
                <div style={{ width: uploadProgress + '%' }}/>
              </div>
              <div className="text-3" style={{ fontSize: 12, marginTop: 6 }}>
                {files.length}개 파일 · {(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB
              </div>
            </div>
          )}

          {tab === 'file' && (filePhase === 'tracking' || filePhase === 'done') && (
            <div className="kb-upload-jobs">
              <div className="kb-upload-summary">전체 {fileJobs.length}개 · 완료 {filesDoneCount} · 실패 {fileJobs.filter(j => j.status === 'failed').length}</div>
              {fileJobs.map(j => <JobRow key={j.id} job={j}/>)}
            </div>
          )}

          {/* ══ URL 탭 ══ */}
          {tab === 'url' && (
            <>
              <div className="kb-url-scan-row">
                <label className="form-label" style={{ flex: 1 }}>
                  <span>수집 URL</span>
                  <input className="input" value={urlInput}
                    onChange={e => { setUrlInput(e.target.value); if (urlPhase !== 'input') setUrlPhase('input'); }}
                    placeholder="예: https://vendor.example.com/manuals/"
                    disabled={urlPhase === 'scanning' || urlPhase === 'registering' || urlPhase === 'tracking'}
                    onKeyDown={e => e.key === 'Enter' && handleScan()}/>
                </label>
                <button className="btn" style={{ marginTop: 20, flexShrink: 0 }}
                  disabled={!urlInput.trim() || urlPhase === 'scanning' || urlPhase === 'tracking' || urlPhase === 'registering'}
                  onClick={handleScan}>
                  {urlPhase === 'scanning'
                    ? <><Icon name="sparkles" size={14} className="spin"/> 스캔 중</>
                    : urlPhase === 'scanned' ? '다시 스캔' : '스캔'}
                </button>
              </div>

              {urlError && <div className="kb-upload-error"><Icon name="alert-circle" size={14}/> {urlError}</div>}

              {urlPhase === 'scanned' && (
                <>
                  <div className="kb-register-row">
                    <label className="form-label">
                      <span>카테고리</span>
                      <select className="input" value={urlCatId} onChange={e => setUrlCatId(e.target.value)}>{catOptions}</select>
                    </label>
                    <label className="form-label">
                      <span>문서유형</span>
                      <select className="input" value={urlDocType} onChange={e => setUrlDocType(e.target.value)}>{docTypeOptions}</select>
                    </label>
                  </div>
                  <div className="kb-register-row">
                    <label className="form-label">
                      <span>제품 (선택)</span>
                      <input
                        list="kb-url-prod-list"
                        className="input"
                        value={urlProductName}
                        onChange={e => setUrlProductName(e.target.value)}
                        placeholder="예: Oracle Database"
                      />
                      <datalist id="kb-url-prod-list">
                        {products.map(p => <option key={p.id} value={p.canonical}/>)}
                      </datalist>
                    </label>
                    <label className="form-label">
                      <span>벤더 (선택)</span>
                      <input className="input" value={urlVendor} onChange={e => setUrlVendor(e.target.value)} placeholder="예: Oracle"/>
                    </label>
                  </div>
                  <div className="kb-register-row">
                    <label className="form-label">
                      <span>플랫폼 (선택)</span>
                      <input className="input" value={urlOsPlatform} onChange={e => setUrlOsPlatform(e.target.value)} placeholder="예: Linux, Windows"/>
                    </label>
                    <label className="form-label">
                      <span>버전범위 (선택)</span>
                      <input className="input" value={urlVersionRange} onChange={e => setUrlVersionRange(e.target.value)} placeholder="예: 19c~26ai"/>
                    </label>
                  </div>
                  <div className="kb-register-row">
                    <label className="form-label wide">
                      <span>태그 (선택)</span>
                      <input className="input" value={urlTags} onChange={e => setUrlTags(e.target.value)} placeholder="예: 벤더문서, Oracle"/>
                    </label>
                  </div>
                  <div className="kb-register-row">
                    <label className="form-label wide">
                      <span>제품 버전 <span className="text-3" style={{ fontWeight: 400 }}>(Enter 또는 , 로 추가)</span></span>
                      {urlSuggestedVersions.length > 0 && (
                        <div className="kb-ver-chips">
                          {urlSuggestedVersions.map(v => (
                            <button key={v} type="button"
                              className={'kb-ver-chip' + (urlVersions.includes(v) ? ' on' : '')}
                              onClick={() => setUrlVersions(prev =>
                                prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
                              )}>
                              {v}
                            </button>
                          ))}
                        </div>
                      )}
                      <VersionTagInput value={urlVersions} onChange={setUrlVersions} suggested={urlSuggestedVersions}/>
                    </label>
                  </div>

                  {urlLinks.length === 0 && (
                    <div className="kb-empty" style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                      발견된 파일 링크가 없습니다.
                    </div>
                  )}

                  {urlLinks.length > 0 && (
                    <>
                      <div className="kb-url-list-header">
                        <span>발견된 파일 {urlLinks.length}개</span>
                        <button className="btn ghost xs" onClick={() => setSelectedUrls(new Set(urlLinks.map(l => l.href)))}>전체 선택</button>
                        <button className="btn ghost xs" onClick={() => setSelectedUrls(new Set())}>선택 해제</button>
                      </div>
                      <div className="kb-url-link-list">
                        {urlLinks.map(link => (
                          <label key={link.href} className={'kb-url-link-row' + (selectedUrls.has(link.href) ? ' on' : '')}>
                            <input type="checkbox" checked={selectedUrls.has(link.href)} onChange={() => toggleUrl(link.href)}/>
                            <Icon name="file" size={13}/>
                            <span className="kb-url-link-name" title={link.href}>{link.name}</span>
                            <span className="tag muted xs">{link.ext}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {urlPhase === 'registering' && (
                <div className="kb-upload-jobs">
                  <div className="kb-upload-summary">
                    <Icon name="sparkles" size={13} className="spin" style={{ verticalAlign: 'middle', marginRight: 6 }}/>
                    {selectedUrls.size}개 URL 다운로드 및 등록 중...
                  </div>
                  {[...selectedUrls].map(href => {
                    const link = urlLinks.find(l => l.href === href);
                    return (
                      <div key={href} className="kb-upload-job">
                        <div className="kb-upload-job-header">
                          <span className="kb-upload-job-name" title={href}>{link?.name || href}</span>
                          <span className="kb-upload-job-status queued">처리 중</span>
                        </div>
                        <div className="kb-progress"><div style={{ width: '40%', animation: 'pulse 1.5s ease-in-out infinite' }}/></div>
                      </div>
                    );
                  })}
                </div>
              )}

              {(urlPhase === 'tracking' || urlPhase === 'done') && (
                <div className="kb-upload-jobs">
                  <div className="kb-upload-summary">전체 {urlJobs.length}개 · 완료 {urlsDoneCount}</div>
                  {urlJobs.map(j => <JobRow key={j.id} job={j}/>)}
                </div>
              )}
            </>
          )}

          {/* ══ 직접입력 탭 ══ */}
          {tab === 'text' && (
            <div className="kb-register-grid">
              <label className="form-label wide">
                <span>등록명</span>
                <input className="input" value={form.title} onChange={e => setF('title', e.target.value)}
                  autoFocus placeholder="예: Oracle 19c Tablespace 확장 절차"/>
              </label>
              <label className="form-label">
                <span>카테고리</span>
                <select className="input" value={form.categoryId} onChange={e => setF('categoryId', e.target.value)}>{catOptions}</select>
              </label>
              <label className="form-label">
                <span>문서유형</span>
                <select className="input" value={form.docType} onChange={e => setF('docType', e.target.value)}>
                  <option value="check_item">점검항목</option>
                  <option value="training">교육자료</option>
                  <option value="runbook">Runbook</option>
                  <option value="incident_case">장애사례</option>
                  <option value="vendor_manual">벤더문서</option>
                </select>
              </label>
              <label className="form-label">
                <span>제품명</span>
                <input list="kb-prod-list" className="input" value={form.productName}
                  onChange={e => setF('productName', e.target.value)}
                  placeholder="예: Oracle Database"/>
                <datalist id="kb-prod-list">
                  {products.map(p => <option key={p.id} value={p.canonical}/>)}
                </datalist>
              </label>
              <label className="form-label">
                <span>벤더</span>
                <input className="input" value={form.vendor} onChange={e => setF('vendor', e.target.value)}
                  placeholder="예: Oracle"/>
              </label>
              <label className="form-label">
                <span>플랫폼</span>
                <input className="input" value={form.osPlatform} onChange={e => setF('osPlatform', e.target.value)}
                  placeholder="예: Linux, Windows"/>
              </label>
              <label className="form-label">
                <span>버전범위</span>
                  <input className="input" value={form.versionRange} onChange={e => setF('versionRange', e.target.value)}
                  placeholder="예: 19c~26ai"/>
              </label>
              <label className="form-label wide">
                <span>제품 버전 <span className="text-3" style={{ fontWeight: 400 }}>(Enter 또는 , 로 추가)</span></span>
                {suggestedVersions.length > 0 && (
                  <div className="kb-ver-chips">
                    {suggestedVersions.map(v => (
                      <button key={v} type="button"
                        className={'kb-ver-chip' + (form.versions.includes(v) ? ' on' : '')}
                        onClick={() => setF('versions', form.versions.includes(v)
                          ? form.versions.filter(x => x !== v)
                          : [...form.versions, v])}>
                        {v}
                      </button>
                    ))}
                  </div>
                )}
                <VersionTagInput value={form.versions} onChange={v => setF('versions', v)} suggested={suggestedVersions}/>
              </label>
              <label className="form-label wide">
                <span>태그</span>
                <input className="input" value={form.tags} onChange={e => setF('tags', e.target.value)}
                  placeholder="예: 정기점검, 운영표준"/>
              </label>
              <label className="form-label wide">
                <span>본문</span>
                <textarea className="input" rows={14} value={form.bodyText}
                  onChange={e => setF('bodyText', e.target.value)}
                  style={{ resize: 'vertical', fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}
                  placeholder="절차, 점검 기준, 교육 내용을 직접 입력"/>
              </label>
            </div>
          )}
        </div>
      </div>

        {/* ── 하단 버튼 ── */}
        <div className="modal-foot">
          {tab === 'file' && filePhase === 'select' && (
            <>
              <button className="btn ghost" onClick={onClose}>취소</button>
              <button className="btn primary" disabled={!files.length || !fileCatId} onClick={startFileUpload}>
                <Icon name="upload" size={14}/> {files.length}개 파일 업로드
              </button>
            </>
          )}
          {tab === 'file' && filePhase === 'uploading' && (
            <button className="btn ghost" onClick={onClose}>백그라운드에서 계속</button>
          )}
          {tab === 'file' && filePhase === 'tracking' && (
            <button className="btn ghost" onClick={() => { onBackground?.(fileJobs); onClose(); }}>백그라운드에서 계속</button>
          )}
          {tab === 'file' && filePhase === 'done' && (
            <button className="btn primary" onClick={() => { onDone?.(); onClose(); }}>완료</button>
          )}

          {tab === 'url' && (urlPhase === 'input' || urlPhase === 'scanning') && (
            <>
              <button className="btn ghost" onClick={onClose}>취소</button>
              <button className="btn primary" disabled={!urlInput.trim() || urlPhase === 'scanning'} onClick={handleScan}>
                {urlPhase === 'scanning' ? '스캔 중...' : '스캔'}
              </button>
            </>
          )}
          {tab === 'url' && urlPhase === 'scanned' && (
            <>
              <button className="btn ghost" onClick={onClose}>취소</button>
              <button className="btn primary" disabled={selectedUrls.size === 0} onClick={startUrlRegister}>
                선택한 {selectedUrls.size}개 등록
              </button>
            </>
          )}
          {tab === 'url' && urlPhase === 'registering' && (
            <button className="btn ghost" onClick={onClose}>백그라운드에서 계속</button>
          )}
          {tab === 'url' && urlPhase === 'tracking' && (
            <button className="btn ghost" onClick={() => { onBackground?.(urlJobs); onClose(); }}>백그라운드에서 계속</button>
          )}
          {tab === 'url' && urlPhase === 'done' && (
            <button className="btn primary" onClick={() => { onDone?.(); onClose(); }}>완료</button>
          )}

          {tab === 'text' && (
            <>
              <button className="btn ghost" onClick={onClose}>취소</button>
              <button className="btn primary" disabled={!form.title.trim()} onClick={saveText}>등록 및 인덱싱 시작</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
