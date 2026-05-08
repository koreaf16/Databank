// ⌘K 글로벌 검색 모달 — 이력/KB/일정/보고서 통합 검색
// KB 탭: 하이브리드 청크 검색 + ⌘Enter AI 답변 패널

import React from 'react';
import { Icon } from '../Icon.jsx';
import { hybridSearch } from '../../features/knowledge-base/api/kbSearchApi.js';
import { KbChunkList } from '../../features/knowledge-base/components/KbChunkList.jsx';
import { KbAskPanel } from '../../features/knowledge-base/components/KbAskPanel.jsx';
import { listHistories } from '../../api/historyApi.js';

const CATEGORIES = [
  { id: 'hist',   label: '지원이력',   icon: 'history'   },
  { id: 'kb',     label: '지식베이스', icon: 'book'      },
  { id: 'cal',    label: '일정',       icon: 'calendar'  },
  { id: 'report', label: '보고서',     icon: 'report'    },
];

const RECENT = [
  { id: 'r1', cat: 'hist', title: '삼성전자 — Oracle 19c 분기점검', meta: '2026-04-29', nav: 'hist' },
  { id: 'r2', cat: 'kb',   title: 'archive_lag 장애 대응 가이드',   meta: 'DBA 가이드',  nav: 'kb'   },
  { id: 'r3', cat: 'cal',  title: 'VMware 패치 — SK하이닉스',       meta: '2026-05-12', nav: 'cal'  },
];

function buildCalData() {
  return [
    { id: 'cal-1', cat: 'cal', title: 'Oracle 정기점검', desc: '신한은행', meta: '2026-05-07', nav: 'cal' },
    { id: 'cal-2', cat: 'cal', title: 'MS-SQL 분석',     desc: '삼성생명', meta: '2026-05-09', nav: 'cal' },
    { id: 'cal-3', cat: 'cal', title: 'VMware 패치',     desc: 'SK하이닉스', meta: '2026-05-12', nav: 'cal' },
  ];
}

export function CommandK({ open, onClose, onNav }) {
  const [q, setQ] = React.useState('');
  const [cat, setCat] = React.useState('all');
  const [results, setResults] = React.useState([]);

  // KB 전용 상태
  const [kbChunks, setKbChunks] = React.useState([]);
  const [kbLoading, setKbLoading] = React.useState(false);
  const [askQuery, setAskQuery] = React.useState('');
  const [activeCitation, setActiveCitation] = React.useState(null);

  const inputRef = React.useRef(null);
  const data = React.useRef<any[]>(null);
  const kbDebounce = React.useRef(null);
  const isKbMode = cat === 'kb' || cat === 'all';

  React.useEffect(() => {
    if (open) {
      setQ('');
      setCat('all');
      setKbChunks([]);
      setAskQuery('');
      setActiveCitation(null);
      setTimeout(() => inputRef.current?.focus(), 50);
      if (!data.current) {
        const cal = buildCalData();
        data.current = cal;
        listHistories({ limit: 200 }).then(rows => {
          const hist = rows.map((h: any) => ({
            id: `hist-${h.id}`, cat: 'hist',
            title: `${h.customer} — ${h.service}`,
            desc: h.summary || h.action || '',
            meta: h.displayRange || '', nav: 'hist',
          }));
          data.current = [...hist, ...cal];
        }).catch(() => {});
      }
    }
  }, [open]);

  // 비KB 결과 필터
  React.useEffect(() => {
    if (!q.trim() || !data.current) { setResults([]); return; }
    const lower = q.toLowerCase();
    const filtered = data.current.filter(item => {
      const matchCat = cat === 'all' || item.cat === cat;
      const matchQ = item.title.toLowerCase().includes(lower)
        || (item.desc || '').toLowerCase().includes(lower)
        || (item.meta || '').toLowerCase().includes(lower);
      return matchCat && matchQ;
    });
    setResults(filtered.slice(0, 20));
  }, [q, cat]);

  // KB 하이브리드 검색 (250ms 디바운스)
  React.useEffect(() => {
    if (!q.trim() || !isKbMode) {
      setKbChunks([]);
      setKbLoading(false);
      return;
    }
    clearTimeout(kbDebounce.current);
    setKbLoading(true);
    kbDebounce.current = setTimeout(async () => {
      try {
        const res = await hybridSearch(q.trim(), 10);
        setKbChunks(res?.chunks ?? []);
      } catch {
        setKbChunks([]);
      } finally {
        setKbLoading(false);
      }
    }, 250);
    return () => clearTimeout(kbDebounce.current);
  }, [q, cat]);

  function handleSelect(item) {
    if (onNav) onNav(item.nav);
    onClose();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return; }
    // ⌘+Enter: AI 답변 요청
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (q.trim() && isKbMode) setAskQuery(q.trim());
    }
  }

  if (!open) return null;

  const showRecent = !q.trim();
  const nonKbItems = showRecent
    ? RECENT.filter(r => cat === 'all' || r.cat === cat)
    : results.filter(r => r.cat !== 'kb');

  const showKbPanel = isKbMode && q.trim();

  return (
    <div className="cmdk-backdrop">
      <div
        className={'cmdk-modal' + (showKbPanel ? ' cmdk-wide' : '')}
        onClick={e => e.stopPropagation()}
      >
        {/* 검색 입력 */}
        <div className="cmdk-search-row">
          <Icon name="search" size={16} className="cmdk-search-icon"/>
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="이력·KB·일정·보고서 통합 검색..."
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="cmdk-esc">Esc</kbd>
        </div>

        {/* 카테고리 탭 */}
        <div className="cmdk-cats">
          {[{ id: 'all', label: '전체', icon: 'hash' }, ...CATEGORIES].map(c => (
            <button
              key={c.id}
              className={'cmdk-cat-btn' + (cat === c.id ? ' on' : '')}
              onClick={() => setCat(c.id)}
            >
              <Icon name={c.icon} size={13}/>
              {c.label}
            </button>
          ))}
          {showKbPanel && (
            <button
              className="cmdk-cat-btn cmdk-ask-btn"
              title="⌘+Enter AI 답변"
              onClick={() => setAskQuery(q.trim())}
            >
              <Icon name="sparkles" size={13}/>
              AI 답변
            </button>
          )}
        </div>

        {/* 본문 — KB 모드: 좌우 분할 패널 */}
        {showKbPanel ? (
          <div className="cmdk-kb-layout">
            {/* 좌: 청크 목록 */}
            <div className="cmdk-kb-left">
              <div className="cmdk-section-label">
                지식베이스 청크 {kbChunks.length > 0 ? `(${kbChunks.length})` : ''}
              </div>
              <KbChunkList
                chunks={kbChunks}
                query={q}
                activeCitation={activeCitation}
                onSelect={(chunk) => setActiveCitation(chunk.num)}
                loading={kbLoading}
              />
            </div>
            {/* 우: AI 답변 */}
            <div className="cmdk-kb-right">
              <div className="cmdk-section-label">
                AI 답변
                {!askQuery && <span className="text-3"> · ⌘+Enter</span>}
              </div>
              {askQuery ? (
                <KbAskPanel
                  query={askQuery}
                  topK={10}
                  onChunks={(chunks) => setKbChunks(chunks)}
                  onCite={(num) => setActiveCitation(num)}
                  activeCitation={activeCitation}
                />
              ) : (
                <div className="kb-ask-idle">
                  <Icon name="sparkles" size={20} className="text-3"/>
                  <p className="text-3">⌘+Enter로 AI 답변 생성</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* 일반 검색 결과 */
          <div className="cmdk-results">
            {showRecent && <div className="cmdk-section-label">최근 검색</div>}
            {q.trim() && nonKbItems.length > 0 && <div className="cmdk-section-label">이력 · 일정 · 보고서</div>}
            {nonKbItems.length === 0 && q.trim() && (
              <div className="cmdk-empty">
                <Icon name="search" size={20}/>
                <span>"{q}"에 대한 결과가 없습니다</span>
              </div>
            )}
            {nonKbItems.map(item => {
              const catInfo = CATEGORIES.find(c => c.id === item.cat);
              return (
                <button key={item.id} className="cmdk-item" onClick={() => handleSelect(item)}>
                  <span className="cmdk-item-icon">
                    <Icon name={catInfo?.icon || 'file'} size={15}/>
                  </span>
                  <span className="cmdk-item-body">
                    <span className="cmdk-item-title">{highlight(item.title, q)}</span>
                    {item.desc && (
                      <span className="cmdk-item-desc">{item.desc.slice(0, 60)}</span>
                    )}
                  </span>
                  <span className="cmdk-item-meta">
                    <span className="tag muted">{catInfo?.label}</span>
                    {item.meta && <span className="text-4">{item.meta}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="cmdk-footer">
          <span><kbd>↵</kbd> 이동</span>
          <span><kbd>↑↓</kbd> 탐색</span>
          <span><kbd>⌘↵</kbd> AI 답변</span>
          <span><kbd>Esc</kbd> 닫기</span>
        </div>
      </div>
    </div>
  );
}

function highlight(text, q) {
  if (!q.trim()) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="cmdk-mark">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}
