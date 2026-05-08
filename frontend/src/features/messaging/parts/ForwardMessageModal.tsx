/**
 * 파일: frontend/src/features/messaging/parts/ForwardMessageModal.tsx
 * 역할: 메시지를 다른 채널로 공유(전달)하기 위한 모달.
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { useMasterData } from '../../../contexts/MasterDataContext.js';

export function ForwardMessageModal({ message, onClose }: any) {
  const [query, setQuery] = React.useState('');
  const { customers } = useMasterData();
  const results = customers.filter((c: any) => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5);

  return (
    <div className="modal-backdrop" onClick={() => onClose()}>
      <div className="modal" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <div className="modal-title">메시지 전달</div>
          <button className="btn icon ghost" onClick={() => onClose()}><Icon name="x" size={16}/></button>
        </div>
        <div className="modal-body" style={{ padding: '20px 24px' }}>
          <div className="msg-preview" style={{ padding: '14px 18px', background: 'var(--bg-sub)', borderRadius: '12px', marginBottom: 20, border: '1px solid var(--border)', borderLeft: '4px solid var(--brand-500)' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 6, alignItems: 'center' }}>
              <b style={{ fontSize: 13, color: 'var(--text-1)' }}>{message?.author?.name}</b>
              <span className="text-3" style={{ fontSize: 11, opacity: 0.7 }}>{message?.time}</span>
            </div>
            <div className="text-2" style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-2)' }}>{message?.text}</div>
          </div>

          <label className="form-label" style={{ marginBottom: 16 }}>
            <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-3)', marginBottom: 8, display: 'block' }}>전달할 대상 채널 검색</span>
            <div style={{ position: 'relative' }}>
              <Icon name="search" size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }}/>
              <input
                className="input"
                style={{ paddingLeft: 36, width: '100%', borderRadius: '10px' }}
                placeholder="고객사 또는 프로젝트명 입력..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
            </div>
          </label>

          <div style={{ display: 'grid', gap: 8 }}>
            {results.map((c: any) => (
              <button
                key={c.id}
                className="btn ghost"
                style={{ 
                  justifyContent: 'flex-start', 
                  padding: '10px 14px', 
                  borderRadius: '10px',
                  background: 'var(--bg-1)',
                  border: '1px solid var(--border)',
                  transition: 'all 0.2s'
                }}
                onClick={() => onClose(c)}
              >
                <span className="avatar sm" style={{ background: c.color, marginRight: 10, width: 26, height: 26, fontSize: 11, fontWeight: 700 }}>{c.initial}</span>
                <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-1)' }}>{c.name}</span>
                <Icon name="chevron-right" size={12} style={{ marginLeft: 'auto', opacity: 0.4 }}/>
              </button>
            ))}
            {results.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', background: 'var(--bg-sub)', borderRadius: '12px', border: '1px dashed var(--border)' }}>
                <Icon name="search" size={24} style={{ color: 'var(--text-4)', marginBottom: 8, display: 'block', margin: '0 auto' }}/>
                <div className="text-3" style={{ fontSize: 13 }}>검색 결과가 없습니다.</div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={() => onClose()}>취소</button>
        </div>
      </div>
    </div>
  );
}
