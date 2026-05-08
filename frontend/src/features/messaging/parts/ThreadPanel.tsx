/**
 * 파일: frontend/src/features/messaging/parts/ThreadPanel.tsx
 * 역할: 메시지 스레드 상세 보기 패널.
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';

export function ThreadPanel({ message, onClose }: any) {
  if (!message) return null;

  return (
    <aside className="panel thread-panel">
      <div className="panel-h">
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>스레드</div>
          <div className="text-3" style={{ fontSize: 11 }}>
            {message.author?.name}님의 메시지 · 답글 {message.thread || 0}개
          </div>
        </div>
        <button className="btn icon ghost" onClick={onClose}><Icon name="x" size={15}/></button>
      </div>
      <div className="panel-scroll scroll">
        <div className="thread-parent" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div className="msg-h" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div className="avatar" style={{ background: message.author?.color }}>{message.author?.initial}</div>
            <span className="msg-name" style={{ fontWeight: 600 }}>{message.author?.name}</span>
            <span className="msg-time" style={{ fontSize: 11, color: 'var(--text-4)' }}>{message.time}</span>
          </div>
          <div className="msg-text" style={{ marginLeft: 34 }}>
            {message.text}
          </div>
        </div>

        <div className="thread-divider" style={{ textAlign: 'center', margin: '16px 0', position: 'relative' }}>
          <span style={{ background: 'var(--bg-panel)', padding: '0 12px', fontSize: 11, color: 'var(--text-3)', position: 'relative', zIndex: 2 }}>
            {message.thread || 0}개의 답글
          </span>
          <div style={{ position: 'absolute', top: '50%', left: 20, right: 20, height: 1, background: 'var(--border)', zIndex: 1 }}/>
        </div>

        {/* Dummy thread replies for visualization */}
        {[
          { n: '김민수', i: '김', c: '#5b8eff', t: '09:45', text: '확인 감사합니다. 우선 조치부터 진행할게요.' },
          { n: '박서연', i: '박', c: '#15a06a', t: '10:02', text: '저도 검토하겠습니다.' },
        ].map((r, i) => (
          <div className="msg" key={i} style={{ padding: '8px 20px' }}>
            <div className="msg-avatar avatar" style={{ background: r.c }}>{r.i}</div>
            <div className="msg-body">
              <div className="msg-h"><span className="msg-name">{r.n}</span><span className="msg-time">{r.t}</span></div>
              <div className="msg-text">{r.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="thread-composer" style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ position: 'relative' }}>
          <input className="input" style={{ width: '100%', paddingRight: 40 }} placeholder="스레드에 답글…"/>
          <button className="btn primary sm" style={{ position: 'absolute', right: 4, top: 4, height: 28, width: 28, padding: 0 }}>
            <Icon name="send" size={12}/>
          </button>
        </div>
      </div>
    </aside>
  );
}
