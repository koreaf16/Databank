/**
 * @module components/features/sidebar/parts/DirectMessages
 * @description DM 섹션. presence dot·미읽음·멘션 표시. 정렬: 멘션 > 미읽음 > presence > 최근활동.
 * @usage <DirectMessages currentChannel={id} onChannel={fn}/>
 * @related ChannelPanel.jsx
 */
import React from 'react';
import { Icon } from '../../../Icon.jsx';
import { SidebarSection } from './SidebarSection.jsx';
import { getChannels } from '../../../../features/messaging/api/messagingApi.js';

function presenceOrder(presence) {
  if (presence === 'online') return 0;
  if (presence === 'away') return 1;
  if (presence === 'mixed') return 2;
  return 3;
}

export function DirectMessages({ currentChannel, onChannel }) {
  const [open, setOpen] = React.useState(true);
  const [rawDms, setRawDms] = React.useState<any[]>([]);

  React.useEffect(() => {
    getChannels({ kind: 'dm' })
      .then(rows => setRawDms(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, []);

  const dms = [...rawDms].sort((a, b) => {
    if (!!b.mentioned !== !!a.mentioned) return b.mentioned ? 1 : -1;
    const unreadDiff = (b.unread || 0) - (a.unread || 0);
    if (unreadDiff !== 0) return unreadDiff;
    return presenceOrder(a.presence) - presenceOrder(b.presence);
  });

  const totalUnread = dms.reduce((n, dm) => n + (dm.unread || 0), 0);
  const hasMention = dms.some(dm => dm.mentioned);
  const meta = hasMention ? '@' : (totalUnread > 0 ? totalUnread : null);

  return (
    <SidebarSection
      label="다이렉트 메시지"
      open={open}
      onToggle={() => setOpen(v => !v)}
      meta={meta}
      action={
        <button className="sb-add" title="새 DM 시작">
          <Icon name="plus" size={12}/>
        </button>
      }
    >
      {dms.map(dm => (
        <button
          key={dm.id}
          className={`sb-ch${currentChannel === dm.id ? ' on' : ''}${dm.unread > 0 ? ' unread' : ''}`}
          onClick={() => onChannel({ ...dm, kind: 'dm' })}
          title={dm.name}
        >
          <span className="sb-ch-dm">
            {dm.isGroup ? (
              <span
                className="sb-ch-avatar"
                style={{ background: dm.color, width: 18, height: 18, borderRadius: 4, fontSize: 9 }}
              >
                {dm.initial}
              </span>
            ) : (
              <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                <span
                  className="avatar"
                  style={{ background: dm.color, width: 18, height: 18, fontSize: 9 }}
                >
                  {dm.initial}
                </span>
                <span
                  className={`presence ${dm.presence || 'offline'}`}
                  style={{ position: 'absolute', right: -2, bottom: -2 }}
                />
              </span>
            )}
          </span>
          <span className="sb-ch-name">{dm.name}</span>
          {dm.mentioned && <span className="sb-ch-mention">@</span>}
          {dm.unread > 0 && !dm.mentioned && (
            <span className="sb-badge sm">{dm.unread}</span>
          )}
        </button>
      ))}
    </SidebarSection>
  );
}
