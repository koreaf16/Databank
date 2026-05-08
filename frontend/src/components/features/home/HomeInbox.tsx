/**
 * @module components/features/home/HomeInbox
 * @description 홈 통합 인박스 페이지. 멘션·미읽음·즐겨찾기·최근활동 4탭.
 * @usage <HomeInbox onChannel={fn} onNav={fn}/>
 * @related app.jsx, Dashboard.jsx
 * @data /api/channels (kind: team|customer|dm), UserContext
 */
import React from 'react';
import { Icon } from '../../Icon.jsx';
import { getChannels } from '../../../features/messaging/api/messagingApi.js';
import { useUser } from '../../../contexts/UserContext.js';

const TABS = [
  { id: 'mentions',  label: '@멘션',   icon: 'at' },
  { id: 'unread',    label: '미읽음',   icon: 'message' },
  { id: 'starred',   label: '즐겨찾기', icon: 'star-fill' },
  { id: 'recent',    label: '최근활동', icon: 'history' },
];

function toItem(ch: any, kind: string) {
  if (kind === 'team') return { id: ch.id, name: ch.name, kind, unread: ch.unread || 0, mentioned: !!ch.mentioned, icon: '#', color: null };
  if (kind === 'customer') return { id: ch.id, name: ch.name, kind, unread: ch.unread || 0, mentioned: !!ch.mentioned, starred: !!ch.starred, color: ch.color, initial: ch.initial };
  return { id: ch.id, name: ch.name, kind, unread: ch.unread || 0, mentioned: !!ch.mentioned, presence: ch.presence, color: ch.color, initial: ch.initial };
}

function ItemRow({ item, onChannel }) {
  const statusDot = item.presence === 'online' ? 'ok'
    : item.presence === 'away' ? 'warn'
    : item.presence === 'offline' ? 'gray'
    : null;

  return (
    <button
      className="btn ghost"
      style={{
        width: '100%', height: 'auto', padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        borderRadius: 0, borderBottom: '1px solid var(--border)',
        textAlign: 'left',
      }}
      onClick={() => onChannel({ ...item })}
    >
      {item.color ? (
        <div
          className="avatar lg"
          style={{ background: item.color, borderRadius: item.kind === 'customer' ? 8 : '50%', flexShrink: 0 }}
        >
          {item.initial}
        </div>
      ) : (
        <div
          style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: 'var(--bg-sub)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--text-3)', fontSize: 15, fontWeight: 700,
          }}
        >
          {item.icon}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: item.unread > 0 ? 700 : 500, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          {item.name}
          {statusDot && <span className={`dot ${statusDot}`} style={{ width: 6, height: 6 }}/>}
        </div>
        <div className="text-3" style={{ fontSize: 11, marginTop: 1 }}>
          {item.kind === 'team' ? '팀 채널'
            : item.kind === 'customer' ? '고객사 채널'
            : 'DM'}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {item.mentioned && <span style={{ background: 'var(--err)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 3 }}>@</span>}
        {item.unread > 0 && (
          <span style={{ background: 'var(--brand-500)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 9 }}>
            {item.unread}
          </span>
        )}
        {item.starred && <Icon name="star-fill" size={12} style={{ color: 'var(--warn)' }}/>}
      </div>
    </button>
  );
}

export function HomeInbox({ onChannel, onNav }) {
  const [tab, setTab] = React.useState('mentions');
  const [allItems, setAllItems] = React.useState<any[]>([]);

  React.useEffect(() => {
    Promise.all([
      getChannels({ kind: 'team' }),
      getChannels({ kind: 'customer' }),
      getChannels({ kind: 'dm' }),
    ]).then(([teams, customers, dms]) => {
      setAllItems([
        ...(teams    || []).map((ch: any) => toItem(ch, 'team')),
        ...(customers|| []).map((ch: any) => toItem(ch, 'customer')),
        ...(dms      || []).map((ch: any) => toItem(ch, 'dm')),
      ]);
    }).catch(() => {});
  }, []);

  const filtered = allItems.filter(item => {
    if (tab === 'mentions')  return item.mentioned;
    if (tab === 'unread')    return item.unread > 0;
    if (tab === 'starred')   return item.starred;
    return item.unread > 0 || item.mentioned;
  }).sort((a, b) => {
    if (!!b.mentioned !== !!a.mentioned) return b.mentioned ? 1 : -1;
    return (b.unread || 0) - (a.unread || 0);
  });

  const me = useUser();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* 헤더 */}
      <div
        style={{
          padding: '18px 24px 14px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--panel)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              안녕하세요, {me?.name?.split('')[0]}님 👋
            </h2>
            <div className="text-3" style={{ fontSize: 12, marginTop: 3 }}>
              {me?.dept} · {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm" onClick={() => onNav?.('cal')}>
              <Icon name="calendar" size={13}/> 일정
            </button>
            <button className="btn sm" onClick={() => onNav?.('rep')}>
              <Icon name="report" size={13}/> 보고
            </button>
          </div>
        </div>

        {/* 탭 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map(t => {
            const cnt = allItems.filter(item =>
              t.id === 'mentions' ? item.mentioned
              : t.id === 'unread' ? item.unread > 0
              : t.id === 'starred' ? item.starred
              : item.unread > 0 || item.mentioned,
            ).length;
            return (
              <button
                key={t.id}
                className={`btn sm${tab === t.id ? ' primary' : ' ghost'}`}
                onClick={() => setTab(t.id)}
                style={{ gap: 5 }}
              >
                <Icon name={t.icon} size={12}/>
                {t.label}
                {cnt > 0 && (
                  <span
                    style={{
                      background: tab === t.id ? 'rgba(255,255,255,.3)' : 'var(--brand-500)',
                      color: '#fff', fontSize: 10, fontWeight: 700,
                      padding: '1px 5px', borderRadius: 8,
                    }}
                  >
                    {cnt}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 목록 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>
            <Icon name={TABS.find(t => t.id === tab)?.icon || 'check'} size={32} style={{ opacity: .3, marginBottom: 12 }}/>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {tab === 'mentions' ? '새 멘션이 없습니다'
                : tab === 'unread' ? '미읽음 항목이 없습니다'
                : tab === 'starred' ? '즐겨찾기 항목이 없습니다'
                : '최근 활동이 없습니다'}
            </div>
          </div>
        ) : (
          filtered.map(item => (
            <ItemRow key={item.id} item={item} onChannel={onChannel}/>
          ))
        )}
      </div>
    </div>
  );
}
