/**
 * 파일: frontend/src/features/messaging/parts/AIPanel.tsx
 * 역할: AI 어시스턴트(뱅크봇) 사이드 패널. 채널 컨텍스트 요약 및 대화 제공.
 *       채널 진입 시 자동 요약 로드. 제안 버튼 클릭 시 질문 자동 채움.
 * 연관 파일:
 *   - shared/api/sseClient.ts                         : postSseStream (SSE 스트리밍)
 *   - features/messaging/api/messagingApi.ts          : summarizeChannel
 *   - components/common/SlidePanel.tsx               : 인용 원본 슬라이드 패널
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { SlidePanel } from '../../../components/common/SlidePanel.jsx';
import { postSseStream } from '../../../shared/api/sseClient.js';
import { apiPost } from '../../../shared/api/apiClient.js';

interface ChatMsg {
  role: 'user' | 'bot';
  text: string;
  citations: Array<{ idx: number; kind: string; label: string }>;
  error?: boolean;
}

function formatText(text: string, citations: Array<{ idx: number; kind: string; label: string }>, onCite: (c: any) => void) {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/);
    if (!m) return <React.Fragment key={i}>{part}</React.Fragment>;
    const idx = Number(m[1]);
    const cite = citations.find(c => c.idx === idx);
    return (
      <button key={i} className="ai-cite-btn" onClick={() => cite && onCite(cite)} title={cite?.label || `[${idx}]`}>
        {part}
      </button>
    );
  });
}

export function AIPanel({ channel, onClose }: any) {
  const [messages, setMessages]   = React.useState<ChatMsg[]>([]);
  const [input,    setInput]      = React.useState('');
  const [streaming, setStreaming] = React.useState(false);
  const [loadingSummary, setLoadingSummary] = React.useState(false);
  const [citationPanel, setCitationPanel]   = React.useState<any>(null);
  const abortRef  = React.useRef<(() => void) | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // 채널 진입 시 7일 요약 자동 로드
  React.useEffect(() => {
    setMessages([]);
    setInput('');
    if (!channel?.id) return;
    setLoadingSummary(true);
    apiPost(`/api/channels/${channel.id}/assistant/summary`, {})
      .then((res: any) => {
        if (res?.summary) {
          setMessages([{ role: 'bot', text: res.summary, citations: [] }]);
        }
      })
      .catch(() => {
        setMessages([{
          role: 'bot',
          text: `안녕하세요! ${channel.name} 채널 AI 어시스턴트입니다. 궁금한 점을 물어보세요.`,
          citations: [],
        }]);
      })
      .finally(() => setLoadingSummary(false));
  }, [channel?.id]);

  // 새 메시지 시 자동 스크롤
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function handleSend(question?: string) {
    const q = (question ?? input).trim();
    if (!q || streaming) return;

    setMessages(m => [...m, { role: 'user', text: q, citations: [] }]);
    setStreaming(true);
    setInput('');

    const botMsg: ChatMsg = { role: 'bot', text: '', citations: [] };
    setMessages(m => [...m, botMsg]);

    abortRef.current = postSseStream(
      `/api/channels/${channel.id}/assistant/ask`,
      { question: q },
      {
        onEvent(event: string, payload: any) {
          if (event === 'token') {
            botMsg.text += payload.token ?? '';
          }
          if (event === 'citation') {
            botMsg.citations = [...botMsg.citations, payload];
          }
          if (event === 'done') {
            setStreaming(false);
          }
          if (event === 'error') {
            botMsg.text = botMsg.text || 'AI 일시 응답 불가';
            botMsg.error = true;
            setStreaming(false);
          }
          setMessages(m => [...m.slice(0, -1), { ...botMsg }]);
        },
        onError(message: string) {
          setStreaming(false);
          setMessages(m => {
            const last = m[m.length - 1];
            if (last?.role === 'bot') {
              return [...m.slice(0, -1), { ...last, text: last.text || 'AI 응답 실패. 잠시 후 다시 시도해주세요.', error: true }];
            }
            return [...m, { role: 'bot', text: message || 'AI 응답 실패.', citations: [], error: true }];
          });
        },
      },
    );
  }

  function handleAbort() {
    abortRef.current?.();
    setStreaming(false);
  }

  return (
    <aside className="panel ai-panel">
      <div className="panel-h">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="ai-icon" style={{ background: 'var(--brand-500)', color: '#fff', width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sparkles" size={13}/>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>뱅크봇 · AI</div>
            <div className="text-3" style={{ fontSize: 11 }}>{channel.name} 컨텍스트</div>
          </div>
        </div>
        <button className="btn icon ghost" onClick={onClose}><Icon name="x" size={15}/></button>
      </div>
      <div className="panel-scroll scroll" ref={scrollRef}>
        {messages.length === 0 && !loadingSummary && (
          <>
            <div className="ai-suggest-h" style={{ padding: '16px 16px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase' }}>제안</div>
            <button className="ai-suggest" style={{ width: '100%', padding: '12px 16px', display: 'flex', gap: 12, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              onClick={() => handleSend('이번 주 보고서 초안을 작성해줘')}>
              <Icon name="report" size={14} className="text-3"/>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>이번 주 보고서 초안 작성</div>
                <div className="text-3" style={{ fontSize: 11 }}>지난 5일 메시지 + 이력 기반</div>
              </div>
            </button>
            <button className="ai-suggest" style={{ width: '100%', padding: '12px 16px', display: 'flex', gap: 12, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              onClick={() => handleSend('최근 유사 장애 사례를 찾아줘')}>
              <Icon name="search" size={14} className="text-3"/>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>유사 장애 사례 검색</div>
                <div className="text-3" style={{ fontSize: 11 }}>지식베이스 기반 분석</div>
              </div>
            </button>
          </>
        )}

        {loadingSummary && (
          <div style={{ padding: 16, fontSize: 13, color: 'var(--text-3)' }}>
            <Icon name="pulse" size={12}/> 채널 요약 불러오는 중...
          </div>
        )}

        <div className="ai-suggest-h" style={{ padding: '16px 16px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase' }}>대화</div>

        {messages.map((msg, i) => (
          <div key={i} className={`ai-msg ${msg.role}${msg.error ? ' error' : ''}`}
            style={{
              margin: msg.role === 'user' ? '0 16px 8px 48px' : '0 16px 12px',
              padding: 12,
              background: msg.role === 'user' ? 'var(--brand-50)' : 'var(--bg-1)',
              borderRadius: msg.role === 'user' ? '12px 12px 0 12px' : '0 12px 12px 12px',
              fontSize: 13,
              border: `1px solid ${msg.error ? 'var(--err)' : 'var(--border)'}`,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
            {formatText(msg.text, msg.citations, (c) => setCitationPanel(c))}
            {i === messages.length - 1 && streaming && msg.role === 'bot' && (
              <span className="ai-cursor" style={{ display: 'inline-block', width: 8, height: 12, background: 'var(--brand-500)', marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }}/>
            )}
          </div>
        ))}

        <div style={{ padding: '0 14px 14px' }}>
          <div className="ai-input" style={{ position: 'relative' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              disabled={streaming || loadingSummary}
              style={{ width: '100%', borderRadius: 20, padding: '8px 40px 8px 16px', border: '1px solid var(--border)', background: 'var(--bg-main)', boxSizing: 'border-box' }}
              placeholder={streaming ? '응답 중...' : '뱅크봇에게 물어보기…'}
            />
            {streaming ? (
              <button onClick={handleAbort} title="중지" style={{ position: 'absolute', right: 6, top: 4, background: 'var(--err)', color: '#fff', border: 'none', borderRadius: '50%', width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="x" size={12}/>
              </button>
            ) : (
              <button onClick={() => handleSend()} disabled={!input.trim()} style={{ position: 'absolute', right: 6, top: 4, background: 'var(--brand-500)', color: '#fff', border: 'none', borderRadius: '50%', width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: input.trim() ? 1 : 0.4 }}>
                <Icon name="arrow-up" size={14}/>
              </button>
            )}
          </div>
        </div>
      </div>

      <SlidePanel open={!!citationPanel} title={`인용 출처 [${citationPanel?.idx ?? ''}]`} onClose={() => setCitationPanel(null)} width={360}>
        {citationPanel && (
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>
              {citationPanel.kind === 'kb' ? '지식베이스' : citationPanel.kind === 'history' ? '지원이력' : '채널메시지'}
            </div>
            <div style={{ fontSize: 13 }}>{citationPanel.label}</div>
          </div>
        )}
      </SlidePanel>
    </aside>
  );
}
