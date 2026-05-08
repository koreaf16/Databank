/**
 * 파일: frontend/src/features/knowledge-base/components/KbCitationLink.tsx
 * 역할: AI 답변 본문의 [N] 인용 번호를 클릭 가능한 링크로 렌더.
 *       클릭 시 onCite(num) 콜백 → KbChunkList에서 해당 카드 강조.
 *
 * 연관 파일:
 *   - components/KbAskPanel.tsx  : 답변 본문 렌더 시 사용
 *   - components/KbChunkList.tsx : activeCitation prop으로 연결
 */

import React from 'react';

/** 텍스트에서 [N] 패턴을 찾아 클릭 가능한 span으로 변환 */
export function CitationText({ text, onCite }) {
  if (!text) return null;

  const parts = text.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (match) {
          const num = parseInt(match[1], 10);
          return (
            <span
              key={i}
              className="kb-citation-link"
              role="button"
              tabIndex={0}
              onClick={() => onCite?.(num)}
              onKeyDown={(e) => e.key === 'Enter' && onCite?.(num)}
            >
              [{num}]
            </span>
          );
        }
        return part;
      })}
    </>
  );
}

/** 인용 배열을 뱃지 목록으로 렌더 */
export function CitationBadges({ citations, activeCitation, onCite }) {
  if (!citations || citations.length === 0) return null;
  return (
    <div className="kb-citations">
      <span className="kb-citations-label">인용:</span>
      {citations.map((c) => (
        <button
          key={c.num}
          className={'kb-citation-badge' + (activeCitation === c.num ? ' active' : '')}
          onClick={() => onCite?.(c.num)}
          title={[c.headingPath, c.pageFrom != null ? `${c.pageFrom}쪽` : ''].filter(Boolean).join(' ')}
        >
          [{c.num}]
        </button>
      ))}
    </div>
  );
}
