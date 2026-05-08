/**
 * @module components/features/sidebar/parts/MyCustomersSection
 * @description 사이드바 최상단 "내 고객사" 섹션.
 *   /api/channels/assigned-servers 로 정/부 엔지니어 지정 서버를 조회해 고객사별 채널을 자동 표시.
 *   customers prop으로 실제 채널 데이터(unread, color 등)를 보강하고,
 *   없으면 서버 데이터 기준으로 최소 정보만 표시.
 */
import React from 'react';
import { SidebarSection } from './SidebarSection.jsx';
import { getAssignedServers } from '../../../../features/messaging/api/messagingApi.js';

export function MyCustomersSection({ customers = [], currentChannel, onChannel }) {
  const [myChannels, setMyChannels] = React.useState<any[]>([]);
  const [open, setOpen] = React.useState(true);

  // customers 변경 시 보강 데이터 업데이트
  React.useEffect(() => {
    if (myChannels.length === 0) return;
    const byId = new Map(customers.map((c: any) => [Number(c.id), c]));
    setMyChannels(prev => prev.map(ch => {
      const full = byId.get(Number(ch.id));
      return full ? { ...ch, ...full } : ch;
    }));
  // customers가 바뀔 때만 실행
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers]);

  React.useEffect(() => {
    getAssignedServers()
      .then((rows: any) => {
        const list: any[] = Array.isArray(rows) ? rows : (rows?.items ?? []);
        if (list.length === 0) return;

        // channelId 기준 중복 제거
        const seen = new Set<number>();
        const channels: any[] = [];
        for (const row of list) {
          const cid = Number(row.channelId);
          if (!Number.isFinite(cid) || seen.has(cid)) continue;
          seen.add(cid);

          // customers prop 에서 실제 채널 데이터 보강
          const full = customers.find((c: any) => Number(c.id) === cid);
          channels.push(full ?? {
            id: cid,
            kind: 'customer',
            customerName: row.customerName,
            name: row.channelName || row.customerName,
            customerId: row.customerId,
            initial: (row.customerName || row.channelName || '고')[0],
            color: '#667085',
          });
        }
        setMyChannels(channels);
      })
      .catch(() => {});
  // 최초 마운트 시 1회만 — customers 로드 완료 후 업데이트는 위 effect가 담당
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (myChannels.length === 0) return null;

  return (
    <SidebarSection
      label={`내 고객사 (${myChannels.length})`}
      open={open}
      onToggle={() => setOpen(v => !v)}
    >
      {myChannels.map((c: any) => (
        <button
          key={c.id}
          className={`sb-ch${currentChannel === c.id ? ' on' : ''}${(c.unread || 0) > 0 ? ' unread' : ''}`}
          onClick={() => onChannel({ ...c, kind: 'customer' })}
        >
          <span className="sb-ch-avatar" style={{ background: c.color || '#667085' }}>
            {c.initial || c.customerName?.[0] || c.name?.[0] || '고'}
          </span>
          <span className="sb-ch-name">{c.customerName || c.name}</span>
          {c.status === 'incident' && <span className="sb-pulse"/>}
          {c.status === 'warning' && <span className="dot warn" style={{ flexShrink: 0 }}/>}
          {c.mentioned && <span className="sb-ch-mention">@</span>}
          {(c.unread || 0) > 0 && !c.mentioned && (
            <span className="sb-badge sm">{c.unread}</span>
          )}
        </button>
      ))}
    </SidebarSection>
  );
}
