/**
 * 파일: frontend/src/features/knowledge-base/components/KbRagSearchPanel.jsx
 * 역할: RAG 자연어검색 탭 본체.
 *       질문입력 + 모드토글 → 답변(스트리밍) / 프롬프트(접힘) / 검색된청크 3섹션.
 *
 * 연관 파일:
 *   - components/KbAskPanel.tsx      : 답변 스트리밍 렌더
 *   - components/KbChunkList.tsx     : 청크 카드 목록
 *   - api/kbSearchApi.ts             : askStream (mode + onPrompt)
 *   - components/Icon.jsx            : 아이콘
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { KbAskPanel } from './KbAskPanel.jsx';
import { KbChunkList } from './KbChunkList.jsx';

function estimateTokens(messages) {
  if (!messages?.length) return 0;
  const chars = messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
  return Math.round(chars / 1.5);
}

function PromptSection({ messages }) {
  const [open, setOpen] = React.useState(false);
  const tokens = estimateTokens(messages);

  const copyAll = () => {
    const text = (messages ?? []).map(m => `[${m.role}]\n${m.content}`).join('\n\n---\n\n');
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  if (!messages?.length) return null;

  return (
    <div className="kb-rag-prompt-section">
      <button
        className="kb-rag-prompt-toggle"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={13}/>
        <span>LLM 프롬프트</span>
        <span className="kb-rag-prompt-token-count">~{tokens.toLocaleString()} 글자</span>
        <span className="kb-rag-prompt-toggle-hint">{open ? '접기' : '펼치기'}</span>
      </button>
      {open && (
        <div className="kb-rag-prompt-body">
          <button className="kb-rag-prompt-copy btn ghost xs" onClick={copyAll}>
            <Icon name="copy" size={12}/> 복사
          </button>
          {messages.map((msg, i) => (
            <div key={i} className={'kb-rag-prompt-msg kb-rag-prompt-msg--' + msg.role}>
              <div className="kb-rag-prompt-role">{msg.role === 'system' ? 'system' : 'user'}</div>
              <pre className="kb-rag-prompt-content">{msg.content}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function KbRagSearchPanel() {
  const [inputValue, setInputValue] = React.useState('');
  const [submittedQuery, setSubmittedQuery] = React.useState('');
  const [mode, setMode] = React.useState('hybrid');
  const [chunks, setChunks] = React.useState([]);
  const [messages, setMessages] = React.useState(null);
  const [activeCitation, setActiveCitation] = React.useState(null);

  function handleSubmit() {
    const q = inputValue.trim();
    if (!q) return;
    setChunks([]);
    setMessages(null);
    setActiveCitation(null);
    setSubmittedQuery(q);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="kb-rag-panel">
      {/* ── 상단 컨트롤 바 ── */}
      <div className="kb-rag-controls">
        <div className="kb-rag-input-wrap">
          <Icon name="sparkles" size={16} className="kb-rag-input-icon"/>
          <input
            className="kb-rag-input"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="자연어로 질문하세요 — Enter로 검색"
          />
        </div>
        <div className="kb-rag-mode-toggle" role="group" aria-label="검색 모드">
          <button
            className={'kb-rag-mode-btn' + (mode === 'hybrid' ? ' on' : '')}
            onClick={() => setMode('hybrid')}
          >
            하이브리드
          </button>
          <button
            className={'kb-rag-mode-btn' + (mode === 'vector' ? ' on' : '')}
            onClick={() => setMode('vector')}
          >
            벡터
          </button>
        </div>
        <button className="btn primary" onClick={handleSubmit} disabled={!inputValue.trim()}>
          검색
        </button>
      </div>

      {/* ── 결과 영역 ── */}
      {submittedQuery ? (
        <div className="kb-rag-results">
          {/* 1. 답변 */}
          <div className="kb-rag-answer-section">
            <div className="kb-rag-section-label">
              <Icon name="sparkles" size={13}/> AI 답변
            </div>
            <KbAskPanel
              query={submittedQuery}
              topK={10}
              mode={mode}
              onChunks={setChunks}
              onPrompt={setMessages}
              onCite={setActiveCitation}
              activeCitation={activeCitation}
            />
          </div>

          {/* 2. 프롬프트 (접힘) */}
          <PromptSection messages={messages}/>

          {/* 3. 검색된 청크 */}
          <div className="kb-rag-chunks-section">
            <div className="kb-rag-section-label">
              <Icon name="layers" size={13}/> 검색된 청크
              {chunks.length > 0 && <span className="kb-rag-chunk-count">{chunks.length}개</span>}
            </div>
            <KbChunkList
              chunks={chunks}
              query={submittedQuery}
              activeCitation={activeCitation}
              onSelect={chunk => setActiveCitation(chunk.num)}
              loading={false}
            />
          </div>
        </div>
      ) : (
        <div className="kb-rag-empty">
          <Icon name="search" size={28} className="text-3"/>
          <p>질문을 입력하면 지식베이스에서 관련 내용을 찾아 답변합니다.</p>
          <div className="kb-rag-empty-hints">
            <span className="tag muted xs">하이브리드: 키워드 + 벡터 검색</span>
            <span className="tag muted xs">벡터: 의미 유사도 검색</span>
          </div>
        </div>
      )}
    </div>
  );
}
