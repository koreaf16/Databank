/**
 * 파일: frontend/src/features/knowledge-base/components/KbChunkList.tsx
 * 역할: 하이브리드 검색 결과 청크 카드 목록.
 *       번호 클릭 시 onSelect(chunk) 콜백, citation 강조 지원.
 *
 * 연관 파일:
 *   - components/common/CommandK.tsx   : 좌측 패널로 임베드
 *   - api/kbSearchApi.ts               : hybridSearch 결과
 *   - components/KbCitationLink.tsx    : [N] 클릭 핸들러
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';

function SnipText({ text, query }) {
  if (!query || !text) return text ?? '';
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="cmdk-mark">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function KbChunkList({ chunks, query, activeCitation, onSelect, loading }) {
  const listRef = React.useRef(null);
  const itemRefs = React.useRef({});

  // 인용 번호 클릭 시 해당 카드로 스크롤
  React.useEffect(() => {
    if (activeCitation == null) return;
    const el = itemRefs.current[activeCitation];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeCitation]);

  if (loading) {
    return (
      <div className="kb-chunk-loading">
        <Icon name="sparkles" size={16} className="spin"/>
        <span>검색 중...</span>
      </div>
    );
  }

  if (!chunks || chunks.length === 0) {
    return (
      <div className="kb-chunk-empty">
        <Icon name="search" size={18}/>
        <span>검색 결과가 없습니다</span>
      </div>
    );
  }

  return (
    <div className="kb-chunk-list" ref={listRef}>
      {chunks.map((chunk) => {
        const isActive = activeCitation === chunk.num;
        return (
          <button
            key={chunk.id}
            ref={(el) => { itemRefs.current[chunk.num] = el; }}
            className={'kb-chunk-card' + (isActive ? ' active' : '')}
            onClick={() => onSelect?.(chunk)}
          >
            <div className="kb-chunk-num">{chunk.num}</div>
            <div className="kb-chunk-body">
              {chunk.headingPath && (
                <div className="kb-chunk-heading">{chunk.headingPath}</div>
              )}
              <div className="kb-chunk-text">
                <SnipText
                  text={chunk.contentText?.slice(0, 200)}
                  query={query}
                />
                {chunk.contentText?.length > 200 && '…'}
              </div>
              <div className="kb-chunk-meta">
                {chunk.rrfScore > 0 && (
                  <span className="kb-chunk-score">RRF {chunk.rrfScore?.toFixed(4)}</span>
                )}
                {chunk.rerankScore != null && chunk.rerankScore !== chunk.rrfScore && (
                  <span className="kb-chunk-score">리랭크 {chunk.rerankScore?.toFixed(4)}</span>
                )}
                {chunk.source && (
                  <span className={'kb-chunk-source kb-chunk-source--' + chunk.source}>
                    {chunk.source === 'bm25' ? 'BM25' : chunk.source === 'vector' ? '벡터' : '둘다'}
                  </span>
                )}
                {chunk.pageFrom != null && (
                  <span>{chunk.pageFrom}쪽</span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
