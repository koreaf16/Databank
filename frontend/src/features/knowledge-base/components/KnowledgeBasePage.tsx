/**
 * 파일: frontend/src/features/knowledge-base/components/KnowledgeBasePage.jsx
 * 역할: RAG 지식베이스 메인 페이지. 카테고리 트리/문서 목록/상세 3-패널 레이아웃.
 *       Phase 1.4에서 window.* mock → Oracle DB API 연결 완료.
 *
 * 연관 파일:
 *   - app.jsx : nav==='kb' 일 때 렌더
 *   - KbCategoryNode.jsx : 카테고리 트리 노드
 *   - KbRegisterModal.jsx : 문서 등록 모달
 *   - KbDocDetail.jsx : IndexStatus, DocTypeBadge, VersionMatchBadge, Meta
 *   - kbUtils.js : descendantCategoryIds, byOrder, getVersionMatch, docTypeLabel, indexStatusLabel
 *   - api/kbApi.js : API 호출
 *   - components/Icon.jsx : 아이콘
 *   - KbJobQueuePanel.tsx : 인덱싱 큐 패널
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { KbCategoryNode } from './KbCategoryNode.jsx';
import { KbRegisterModal } from './KbRegisterModal.jsx';
import { KbJobQueuePanel } from './KbJobQueuePanel.jsx';
import { IndexStatus, DocTypeBadge, VersionMatchBadge, Meta } from './KbDocDetail.jsx';
import {
  descendantCategoryIds,
  byOrder,
  getVersionMatch,
  docTypeLabel,
  indexStatusLabel,
} from '../utils/kbUtils.js';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getDocuments,
  createDocument,
  deleteDocument,
  bulkDeleteDocuments,
  reindexDocument as reindexDoc,
} from '../api/kbApi.js';
import { subscribeJobProgress } from '../api/kbUploadApi.js';
import { KbRagSearchPanel } from './KbRagSearchPanel.jsx';
import { useUser } from '../../../contexts/UserContext.js';

export function KnowledgeBase({ fromChannel }) {
  const me = useUser();
  const [categories, setCategories] = React.useState([]);
  const [docs, setDocs] = React.useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState(null);
  const [selectedDocId, setSelectedDocId] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [serviceFilter, setServiceFilter] = React.useState('all');
  const [versionFilter, setVersionFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [showRegister, setShowRegister] = React.useState(false);
  const [bgJobs, setBgJobs] = React.useState([]);
  const bgUnsubRef = React.useRef(null);
  const queueReloadRef = React.useRef<(() => void) | null>(null);
  const [selectedDocIds, setSelectedDocIds] = React.useState(new Set<string>());
  const [bulkProgress, setBulkProgress] = React.useState<{ action: string; total: number; done: number; failed: number } | null>(null);

  React.useEffect(() => () => { bgUnsubRef.current?.(); }, []);

  function handleBackground(jobs) {
    const activeJobs = jobs.filter(j => j.status !== 'done' && j.status !== 'failed');
    if (!activeJobs.length) return;
    setBgJobs(prev => {
      const map = new Map(prev.map(j => [j.id, j]));
      for (const j of jobs) map.set(j.id, j);
      return [...map.values()];
    });
    bgUnsubRef.current?.();
    bgUnsubRef.current = subscribeJobProgress(
      activeJobs.map(j => j.id),
      (updatedJobs) => {
        const updMap = new Map(updatedJobs.map(j => [j.id, j]));
        setBgJobs(prev => prev.map(j => updMap.get(j.id) ?? j));
      },
      () => getDocuments().then(list => setDocs(list)).catch(() => {}),
    );
  }

  React.useEffect(() => {
    getCategories().then(list => {
      setCategories(list);
      if (list.length > 0) setSelectedCategoryId(list[0].id);
    }).catch(() => {});
  }, []);

  React.useEffect(() => {
    getDocuments().then(list => {
      setDocs(list);
      if (list.length > 0) setSelectedDocId(list[0].id);
    }).catch(() => {});
  }, []);

  const serviceMasters = React.useMemo(() => {
    const map = new Map();
    for (const d of docs) {
      if (d.serviceMasterId && !map.has(d.serviceMasterId)) {
        map.set(d.serviceMasterId, d.productName || d.serviceMasterId);
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [docs]);

  const selectedCategory = categories.find(c => c.id === selectedCategoryId) || categories[0];
  const selectedDoc = docs.find(d => d.id === selectedDocId) || docs[0];
  const categoryIds = new Set([selectedCategoryId, ...descendantCategoryIds(categories, selectedCategoryId)]);
  const filteredDocs = docs
    .map(d => ({ ...d, versionMatch: getVersionMatch(d, versionFilter) }))
    .filter(d => !selectedCategoryId || categoryIds.has(d.categoryId))
    .filter(d => serviceFilter === 'all' || d.serviceMasterId === serviceFilter)
    .filter(d => statusFilter === 'all' || d.index.status === statusFilter || d.status === statusFilter)
    .filter(d => typeFilter === 'all' || d.docType === typeFilter)
    .filter(d => !versionFilter.trim() || d.versionMatch)
    .filter(d => {
      const needle = query.trim().toLowerCase();
      if (!needle) return true;
      return [d.title, d.summary, d.content, d.productName, d.vendor, ...(d.tags || [])]
        .filter(Boolean).join(' ').toLowerCase().includes(needle);
    });

  React.useEffect(() => {
    if (filteredDocs.length > 0 && !filteredDocs.some(d => d.id === selectedDocId)) {
      setSelectedDocId(filteredDocs[0].id);
    }
  }, [selectedCategoryId, query, serviceFilter, versionFilter, statusFilter, typeFilter]);

  async function addCategory(parentId = selectedCategoryId) {
    const name = prompt('카테고리명을 입력하세요');
    if (!name?.trim()) return;
    const cat = await createCategory({ name: name.trim(), parentId, icon: 'book', order: categories.length + 1 });
    setCategories(list => [...list, cat]);
    setSelectedCategoryId(cat.id);
  }

  async function renameCategory(cat) {
    const name = prompt('카테고리명을 수정하세요', cat.name);
    if (!name?.trim()) return;
    const updated = await updateCategory(cat.id, { name: name.trim() });
    setCategories(list => list.map(c => c.id === cat.id ? updated : c));
  }

  async function removeCategory(cat) {
    const ids = new Set([cat.id, ...descendantCategoryIds(categories, cat.id)]);
    if (docs.some(d => ids.has(d.categoryId))) {
      alert('문서가 있는 카테고리는 삭제할 수 없습니다. 먼저 문서를 다른 카테고리로 이동하세요.');
      return;
    }
    await deleteCategory(cat.id);
    setCategories(list => list.filter(c => !ids.has(c.id)));
    setSelectedCategoryId(categories.find(c => c.parentId === null)?.id || null);
  }

  async function registerDocument(payload) {
    const doc = await createDocument(payload);
    setDocs(list => [doc, ...list]);
    setSelectedCategoryId(doc.categoryId);
    setSelectedDocId(doc.id);
    setShowRegister(false);
  }

  async function reindexDocument(docId) {
    const doc = await reindexDoc(docId);
    setDocs(list => list.map(d => d.id === docId ? doc : d));
    queueReloadRef.current?.();
  }

  async function handleDeleteDocument(docId) {
    if (!window.confirm('이 문서를 삭제하시겠습니까?\n청크·파일·인덱스가 모두 삭제됩니다.')) return;
    await deleteDocument(docId);
    setDocs(list => {
      const next = list.filter(d => d.id !== docId);
      if (selectedDocId === docId) setSelectedDocId(next[0]?.id ?? null);
      return next;
    });
  }

  function toggleDocSelect(docId: string) {
    setSelectedDocIds(s => { const n = new Set(s); n.has(docId) ? n.delete(docId) : n.add(docId); return n; });
  }

  function toggleSelectAll() {
    setSelectedDocIds(
      selectedDocIds.size === filteredDocs.length && filteredDocs.length > 0
        ? new Set()
        : new Set(filteredDocs.map(d => d.id))
    );
  }

  async function handleBulkDelete() {
    if (!selectedDocIds.size) return;
    if (!window.confirm(`선택한 ${selectedDocIds.size}개 문서를 삭제하시겠습니까?\n청크·파일·인덱스가 모두 삭제됩니다.`)) return;
    const ids = [...selectedDocIds];
    let done = 0, failed = 0;
    const deletedIds: string[] = [];
    setBulkProgress({ action: '삭제', total: ids.length, done: 0, failed: 0 });
    for (const docId of ids) {
      try {
        await deleteDocument(docId);
        deletedIds.push(docId);
        done++;
      } catch {
        failed++;
      }
      setBulkProgress({ action: '삭제', total: ids.length, done, failed });
    }
    const deletedSet = new Set(deletedIds);
    setDocs(list => {
      const next = list.filter(d => !deletedSet.has(d.id));
      if (deletedSet.has(selectedDocId ?? '')) setSelectedDocId(next[0]?.id ?? null);
      return next;
    });
    setSelectedDocIds(new Set());
    setTimeout(() => setBulkProgress(null), 2000);
  }

  async function handleBulkReindex() {
    if (!selectedDocIds.size) return;
    const ids = [...selectedDocIds];
    let done = 0, failed = 0;
    setBulkProgress({ action: '인덱싱', total: ids.length, done: 0, failed: 0 });
    for (const docId of ids) {
      try {
        const doc = await reindexDoc(docId);
        if (doc) setDocs(list => list.map(d => d.id === docId ? doc : d));
        done++;
      } catch {
        failed++;
      }
      setBulkProgress({ action: '인덱싱', total: ids.length, done, failed });
    }
    setSelectedDocIds(new Set());
    setTimeout(() => setBulkProgress(null), 2000);
  }

  const [kbCtxDismissed, setKbCtxDismissed] = React.useState(false);
  const [favDocIds, setFavDocIds] = React.useState(new Set());
  const [kbTab, setKbTab] = React.useState<'docs' | 'rag'>('docs');
  return (
    <div className="page-pad scroll" style={{ height: '100%' }}>
      {fromChannel && !kbCtxDismissed && (
        <div className="ctx-bar" style={{ margin: '-20px -20px 16px', padding: '8px 20px' }}>
          <span className="ctx-bar-icon">🔗</span>
          <span><b>{fromChannel.name}</b> 채널에서 왔어요 — 관련 문서 우선 표시 중</span>
          <button className="ctx-bar-dismiss" onClick={() => setKbCtxDismissed(true)}>필터 해제</button>
        </div>
      )}
      <div className="page-h">
        <div>
          <div className="page-eyebrow">RAG 지식베이스 · {docs.length}개 문서 · {docs.reduce((s, d) => s + d.chunks, 0).toLocaleString()}개 청크</div>
          <h1 className="page-title">지식베이스</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn" onClick={() => addCategory(selectedCategoryId)}><Icon name="plus" size={14}/> 카테고리</button>
          <button className="btn primary" onClick={() => setShowRegister(true)}><Icon name="plus" size={14}/> 문서등록</button>
        </div>
      </div>

      <div className="kb-tab-strip">
        <button
          className={'kb-tab-btn' + (kbTab === 'docs' ? ' on' : '')}
          onClick={() => setKbTab('docs')}
        >
          <Icon name="book" size={13}/> 문서검색
        </button>
        <button
          className={'kb-tab-btn' + (kbTab === 'rag' ? ' on' : '')}
          onClick={() => setKbTab('rag')}
        >
          <Icon name="sparkles" size={13}/> RAG 자연어검색
        </button>
      </div>

      {kbTab === 'rag' && <KbRagSearchPanel/>}

      {kbTab === 'docs' && <div className="kb-console">
        <aside className="kb-tree card">
          <div className="kb-pane-h">
            <div>
              <h3>카테고리</h3>
              <div className="text-3">점검항목, 교육자료, 운영 표준</div>
            </div>
            <button className="btn icon ghost sm" onClick={() => addCategory(null)}><Icon name="plus" size={12}/></button>
          </div>
          <div className="kb-tree-list">
            {categories.filter(c => c.parentId === null).sort(byOrder).map(cat => (
              <KbCategoryNode
                key={cat.id}
                cat={cat}
                categories={categories}
                docs={docs}
                selectedId={selectedCategoryId}
                onSelect={setSelectedCategoryId}
                onAdd={addCategory}
                onRename={renameCategory}
                onRemove={removeCategory}
              />
            ))}
          </div>
        </aside>

        <section className="kb-list card">
          <div className="kb-toolbar">
            <div className="kb-search">
              <Icon name="search" size={16}/>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="제목, 키워드, 문서 내용 검색"/>
            </div>
            <div className="kb-filters">
              <select className="input" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="all">전체 문서유형</option>
                <option value="check_item">점검항목</option>
                <option value="training">교육자료</option>
                <option value="runbook">Runbook</option>
                <option value="incident_case">장애사례</option>
                <option value="vendor_manual">벤더문서</option>
              </select>
              <select className="input" value={serviceFilter} onChange={e => setServiceFilter(e.target.value)}>
                <option value="all">전체 시스템</option>
                {serviceMasters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input className="input" value={versionFilter} onChange={e => setVersionFilter(e.target.value)} placeholder="버전: 19c, 2019, RHEL 8"/>
              <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">전체 상태</option>
                <option value="ready">검색 가능</option>
                <option value="embedding">벡터화 중</option>
                <option value="failed">실패</option>
              </select>
            </div>
          </div>

          <div className="kb-list-h">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                className="kb-select-all"
                checked={filteredDocs.length > 0 && selectedDocIds.size === filteredDocs.length}
                ref={(el: HTMLInputElement | null) => { if (el) el.indeterminate = selectedDocIds.size > 0 && selectedDocIds.size < filteredDocs.length; }}
                onChange={toggleSelectAll}
              />
              <div>
                <h2>{selectedCategory?.name || '전체 문서'}</h2>
                <p className="text-3">{filteredDocs.length}개 문서 · 버전 필터는 정확 일치, 호환, 범용 문서를 구분합니다.</p>
              </div>
            </div>
            {selectedDocIds.size > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="text-3">{selectedDocIds.size}개 선택</span>
                <button className="btn ghost sm" onClick={handleBulkReindex}><Icon name="refresh" size={12}/> 인덱싱</button>
                <button className="btn danger sm" onClick={handleBulkDelete}><Icon name="trash" size={12}/> 삭제</button>
              </div>
            )}
          </div>

          <div className="kb-doc-list">
            {filteredDocs.length === 0 && <div className="kb-empty">조건에 맞는 문서가 없습니다.</div>}
            {filteredDocs.map(doc => (
              <div key={doc.id} className={'kb-doc-row-wrap' + (selectedDoc?.id === doc.id ? ' on' : '') + (selectedDocIds.has(doc.id) ? ' checked' : '')}>
                <label className="kb-doc-check" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selectedDocIds.has(doc.id)} onChange={() => toggleDocSelect(doc.id)}/>
                </label>
                <button className={'kb-doc-row' + (selectedDoc?.id === doc.id ? ' on' : '')} onClick={() => setSelectedDocId(doc.id)}>
                  <div className="kb-doc-main">
                    <div className="kb-doc-title">
                      <span>{doc.title}</span>
                      <DocTypeBadge type={doc.docType}/>
                      {versionFilter.trim() && <VersionMatchBadge match={doc.versionMatch}/>}
                    </div>
                    <div className="kb-doc-summary">{doc.summary}</div>
                    <div className="kb-doc-meta">
                      <span>{doc.productName}</span>
                      <span>{doc.productVersions.join(', ')}</span>
                      <span>{doc.author}</span>
                      <span>{doc.updatedAt}</span>
                    </div>
                    {doc.tags?.length > 0 && (
                      <div className="kb-doc-tags">
                        {doc.tags.map(t => <span key={t} className="tag muted xs">{t}</span>)}
                      </div>
                    )}
                  </div>
                  <IndexStatus status={doc.index}/>
                </button>
                <button
                  className={'kb-fav-btn' + (favDocIds.has(doc.id) ? ' on' : '')}
                  title={favDocIds.has(doc.id) ? '즐겨찾기 해제' : '즐겨찾기'}
                  onClick={e => { e.stopPropagation(); setFavDocIds(s => { const n = new Set(s); n.has(doc.id) ? n.delete(doc.id) : n.add(doc.id); return n; }); }}
                >
                  {favDocIds.has(doc.id) ? '★' : '☆'}
                </button>
              </div>
            ))}
          </div>
        </section>

        <aside className="kb-detail card">
          {selectedDoc && (
            <>
              <div className="kb-pane-h">
                <div>
                  <h3>{selectedDoc.title}</h3>
                  <div className="text-3">{selectedDoc.productName} · {selectedDoc.productVersions.join(', ')}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn ghost sm" onClick={() => reindexDocument(selectedDoc.id)}><Icon name="refresh" size={12}/> 재인덱싱</button>
                  <button className="btn danger sm" onClick={() => handleDeleteDocument(selectedDoc.id)}><Icon name="trash" size={12}/> 삭제</button>
                </div>
              </div>
              <div className="kb-detail-body">
                <div className="kb-meta-grid">
                  <Meta label="문서유형" value={docTypeLabel(selectedDoc.docType)}/>
                  <Meta label="제품/버전" value={`${selectedDoc.productName} · ${selectedDoc.productVersions.join(', ')}`}/>
                  <Meta label="버전범위" value={selectedDoc.versionRange}/>
                  <Meta label="플랫폼" value={selectedDoc.osPlatform}/>
                  <Meta label="벤더" value={selectedDoc.vendor}/>
                  <Meta label="검토일" value={selectedDoc.reviewedAt}/>
                </div>
                <div className="kb-index-card">
                  <div className="kb-index-top">
                    <div>
                      <div className="text-3">RAG 인덱싱</div>
                      <b>{indexStatusLabel(selectedDoc.index.status)}</b>
                    </div>
                    <span className={'kb-status ' + selectedDoc.index.status}>{selectedDoc.index.progress}%</span>
                  </div>
                  <div className="kb-progress"><div style={{ width: selectedDoc.index.progress + '%' }}/></div>
                  <div className="kb-index-grid">
                    <span>청크 {selectedDoc.chunks}</span>
                    <span>벡터 {selectedDoc.vectors}</span>
                    <span>{selectedDoc.index.model}</span>
                  </div>
                  <p>{selectedDoc.index.message}</p>
                </div>
                <div className="kb-tags">
                  {selectedDoc.tags.map(t => <span key={t} className="tag muted">{t}</span>)}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>}

      {bulkProgress && (
        <div className="kb-bulk-progress-toast">
          <div className="kb-bulk-progress-header">
            <span>
              <b>{bulkProgress.action} 중...</b>
              {' '}{bulkProgress.done + bulkProgress.failed}/{bulkProgress.total}
              {bulkProgress.done + bulkProgress.failed >= bulkProgress.total && ' — 완료'}
            </span>
            {bulkProgress.failed > 0 && <span style={{ color: 'var(--color-danger)' }}>{bulkProgress.failed}개 실패</span>}
          </div>
          <div className="kb-progress" style={{ height: 6 }}>
            <div style={{ width: `${Math.round(((bulkProgress.done + bulkProgress.failed) / bulkProgress.total) * 100)}%` }}/>
          </div>
        </div>
      )}

      <KbJobQueuePanel
        bgJobs={bgJobs}
        onJobsChange={() => getDocuments().then(list => setDocs(list)).catch(() => {})}
        reloadRef={queueReloadRef}
      />

      {showRegister && (
        <KbRegisterModal
          categories={categories}
          currentUserName={me?.name || '관리자'}
          onClose={() => setShowRegister(false)}
          onSave={registerDocument}
          onDone={() => getDocuments().then(list => setDocs(list)).catch(() => {})}
          onBackground={handleBackground}
          selectedCategoryId={selectedCategoryId}
        />
      )}
    </div>
  );
}
