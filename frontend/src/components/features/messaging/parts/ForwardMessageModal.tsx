/**
 * @module components/features/messaging/parts/ForwardMessageModal
 * @description 메시지를 다른 채널/DM으로 공유(forward)하는 모달
 * @usage <ForwardMessageModal message={msg} onClose={targetChannel => fn(targetChannel)}/>
 * @related Workspace.jsx
 */
import React from 'react';
import { Icon } from '../../../Icon.jsx';
import { useMasterData } from '../../../../contexts/MasterDataContext.js';
import { useUser } from '../../../../contexts/UserContext.js';
import { getChannels } from '../../../../features/messaging/api/messagingApi.js';

export function ForwardMessageModal({ message, onClose }) {
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState(null);
  const [teamChannels, setTeamChannels] = React.useState<any[]>([]);
  const [dms, setDms] = React.useState<any[]>([]);

  const { customers } = useMasterData();
  const me = useUser();

  React.useEffect(() => {
    getChannels({ kind: 'team' })
      .then(rows => setTeamChannels(Array.isArray(rows) ? rows.map(ch => ({ ...ch, type: 'team', prefix: '#' })) : []))
      .catch(() => {});
    getChannels({ kind: 'dm' })
      .then(rows => setDms(Array.isArray(rows) ? rows.map(dm => ({ ...dm, type: 'dm', prefix: '@' })) : []))
      .catch(() => {});
  }, []);

  const customerChannels = customers.map(c => ({
    id: c.id, name: c.name, type: 'customer', prefix: '◎',
    color: c.color, initial: c.initial,
  }));

  const needle = query.trim().toLowerCase();
  const allTargets = [...teamChannels, ...customerChannels, ...dms].filter(t =>
    !needle || t.name.toLowerCase().includes(needle),
  );

  function forward() {
    if (!selected) return;
    onClose(selected);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="modal-h">
          <div>
            <div className="modal-title">메시지 공유</div>
            <div className="text-3" style={{ fontSize: 12 }}>공유할 채널 또는 DM을 선택하세요.</div>
          </div>
          <button className="btn icon ghost" onClick={() => onClose(null)}>
            <Icon name="x" size={16}/>
          </button>
        </div>

        <div className="modal-body" style={{ padding: '20px 24px' }}>
          {message && (
            <div
              style={{
                background: 'var(--bg-sub)',
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: 20,
                fontSize: 13,
                color: 'var(--text-2)',
                border: '1px solid var(--border)',
                borderLeft: '4px solid var(--brand-500)',
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase' }}>
                {message.author?.name || (typeof message.author === 'string' ? message.author : '메시지')}
              </div>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {message.text || '(첨부파일)'}
              </div>
            </div>
          )}

          <div className="sb-search" style={{ marginBottom: 16, background: 'var(--bg-sub)', border: '1px solid var(--border)', borderRadius: '10px' }}>
            <Icon name="search" size={14}/>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="채널 또는 DM 검색"
              style={{ fontSize: 13 }}
              autoFocus
            />
          </div>

          <div className="cust-pick-list scroll" style={{ maxHeight: 280, display: 'grid', gap: 6 }}>
            {allTargets.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-4)' }}>
                <Icon name="search" size={24} style={{ marginBottom: 8, display: 'block', margin: '0 auto', opacity: 0.5 }}/>
                <div style={{ fontSize: 13 }}>검색 결과가 없습니다.</div>
              </div>
            )}
            {allTargets.map(t => (
              <button
                key={t.id}
                className="cust-pick"
                onClick={() => setSelected(t)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: selected?.id === t.id ? 'var(--brand-50)' : 'var(--bg-1)',
                  border: selected?.id === t.id ? '1px solid var(--brand-300)' : '1px solid var(--border)',
                  transition: 'all 0.2s',
                }}
              >
                {t.color ? (
                  <span className="sb-ch-avatar" style={{ background: t.color, width: 28, height: 28, fontSize: 11, fontWeight: 700 }}>{t.initial}</span>
                ) : (
                  <span
                    style={{
                      width: 28, height: 28, background: 'var(--bg-sub)', borderRadius: '6px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--text-3)', flexShrink: 0, fontSize: 13,
                    }}
                  >
                    {t.prefix}
                  </span>
                )}
                <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{t.name}</div>
                  <div className="text-3" style={{ fontSize: 11, opacity: 0.7 }}>
                    {t.type === 'team' ? '팀 채널' : t.type === 'customer' ? '고객사 채널' : 'DM'}
                  </div>
                </div>
                {selected?.id === t.id && (
                  <Icon name="check-circle-fill" size={16} style={{ color: 'var(--brand-500)' }}/>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={() => onClose(null)}>취소</button>
          <button className="btn primary" onClick={forward} disabled={!selected}>
            공유하기
          </button>
        </div>
      </div>
    </div>
  );
}
