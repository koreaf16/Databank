/**
 * 파일: frontend/src/features/knowledge-base/components/KbAskPanel.tsx
 * 역할: AI 답변 SSE 스트리밍 패널.
 *       청크 수신 → 토큰 스트리밍 → 인용 배지 표시 흐름.
 *
 * 연관 파일:
 *   - api/kbSearchApi.ts                : askStream
 *   - components/KbCitationLink.tsx     : CitationText, CitationBadges
 *   - components/common/CommandK.tsx    : 우측 패널로 임베드
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { askStream } from '../api/kbSearchApi.js';
import { CitationText, CitationBadges } from './KbCitationLink.jsx';

export function KbAskPanel({ query, topK = 10, mode = 'hybrid', onChunks, onPrompt, onCite, activeCitation }) {
  const [state, setState] = React.useState('idle'); // idle | loading | streaming | done | error
  const [answer, setAnswer] = React.useState('');
  const [citations, setCitations] = React.useState([]);
  const [errorMsg, setErrorMsg] = React.useState('');
  const abortRef = React.useRef(null);

  React.useEffect(() => {
    if (!query?.trim()) {
      setState('idle');
      setAnswer('');
      setCitations([]);
      return;
    }

    abortRef.current?.();

    setState('loading');
    setAnswer('');
    setCitations([]);
    setErrorMsg('');

    abortRef.current = askStream(query, topK, {
      onChunks: (chunks) => {
        onChunks?.(chunks);
        setState('streaming');
      },
      onPrompt: (messages) => {
        onPrompt?.(messages);
      },
      onToken: (token) => {
        setAnswer((prev) => prev + token);
      },
      onAnswer: (text) => {
        setAnswer(text);
      },
      onDone: (cits) => {
        setCitations(cits);
        setState('done');
      },
      onError: (msg) => {
        setErrorMsg(msg ?? 'AI 답변 생성 중 오류가 발생했습니다');
        setState('error');
      },
    }, mode);

    return () => abortRef.current?.();
  }, [query, topK, mode]);

  if (state === 'idle') {
    return (
      <div className="kb-ask-idle">
        <Icon name="sparkles" size={22} className="text-3"/>
        <p>⌘+Enter로 AI 답변을 생성합니다</p>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div className="kb-ask-loading">
        <Icon name="sparkles" size={16} className="spin"/>
        <span>검색 중...</span>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="kb-ask-error">
        <Icon name="alert-circle" size={16}/>
        <span>{errorMsg}</span>
      </div>
    );
  }

  return (
    <div className="kb-ask-panel">
      <div className="kb-ask-answer">
        <CitationText text={answer} onCite={onCite}/>
        {(state === 'streaming') && (
          <span className="kb-ask-cursor"/>
        )}
      </div>
      {state === 'done' && (
        <CitationBadges
          citations={citations}
          activeCitation={activeCitation}
          onCite={onCite}
        />
      )}
    </div>
  );
}
