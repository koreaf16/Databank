/**
 * 파일: frontend/src/features/assigned-customers/components/AssignedCustomersPage.tsx
 * 역할: 내가 정/부 엔지니어로 지정된 서버와 고객사 검색 탭을 제공한다.
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { Segment } from '../../../components/Dashboard.jsx';
import { getAssignedServers, getChannels } from '../../messaging/api/messagingApi.js';

const ROLE_LABEL: Record<string, string> = {
  primary: '정 엔지니어',
  secondary: '부 엔지니어',
};

const STATUS_LABEL: Record<string, string> = {
  active: '운영중',
  warning: '주의',
  incident: '장애',
  paused: '중지',
};

const STATUS_CLASS: Record<string, string> = {
  active: 'install',
  warning: 'tech',
  incident: 'incident',
  paused: 'muted',
};

function channelFromAssigned(row: any) {
  return {
    id: row.channelId,
    kind: 'customer',
    name: row.channelName || row.customerName,
    customerId: row.customerId,
    customerName: row.customerName,
    initial: (row.customerName || row.channelName || '고')[0],
    color: '#667085',
  };
}

export function AssignedCustomersPage({ onChannel }: any) {
  const [tab, setTab] = React.useState('mine');
  const [assigned, setAssigned] = React.useState<any[]>([]);
  const [channels, setChannels] = React.useState<any[]>([]);
  const [assignedLoading, setAssignedLoading] = React.useState(false);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [assignedSearch, setAssignedSearch] = React.useState('');
  const [customerSearch, setCustomerSearch] = React.useState('');

  const loadAssigned = React.useCallback(async () => {
    setAssignedLoading(true);
    try {
      const rows = await getAssignedServers();
      setAssigned(Array.isArray(rows) ? rows : []);
    } catch {
      setAssigned([]);
    } finally {
      setAssignedLoading(false);
    }
  }, []);

  const loadChannels = React.useCallback(async () => {
    setSearchLoading(true);
    try {
      const rows = await getChannels({ kind: 'customer' });
      setChannels(Array.isArray(rows) ? rows : (rows?.items ?? []));
    } catch {
      setChannels([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  React.useEffect(() => { loadAssigned(); }, [loadAssigned]);
  React.useEffect(() => { if (tab === 'search' && channels.length === 0) loadChannels(); }, [tab, channels.length, loadChannels]);

  const assignedRows = React.useMemo(() => {
    const q = assignedSearch.trim().toLowerCase();
    if (!q) return assigned;
    return assigned.filter(row =>
      [row.customerName, row.channelName, row.serverName, row.platform, row.productName, ROLE_LABEL[row.myRole]]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [assigned, assignedSearch]);

  const customerRows = React.useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter(channel =>
      [channel.customerName, channel.name, channel.topic]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [channels, customerSearch]);

  return (
    <div className="page-pad scroll" style={{ height: '100%' }}>
      <div className="page-h">
        <div>
          <div className="page-eyebrow">Assigned Customers</div>
          <h1 className="page-title">담당고객사</h1>
          <div className="text-3" style={{ marginTop: 4 }}>서버별 정/부 엔지니어 지정 기준으로 표시됩니다.</div>
        </div>
        <Segment
          value={tab}
          onChange={setTab}
          options={[
            { v: 'mine', l: '내 담당 서버' },
            { v: 'search', l: '고객사 검색' },
          ]}
        />
      </div>

      {tab === 'mine' && (
        <section className="assigned-shell">
          <div className="assigned-toolbar">
            <div className="server-search">
              <Icon name="search" size={13}/>
              <input
                className="input sm"
                value={assignedSearch}
                onChange={e => setAssignedSearch(e.target.value)}
                placeholder="고객사 / 채널 / 서버 / 제품명 검색"
              />
            </div>
            <button className="btn" onClick={loadAssigned} disabled={assignedLoading}>
              <Icon name="refresh" size={13}/> 새로고침
            </button>
          </div>

          <div className="card server-list-card">
            {assignedLoading ? (
              <div className="server-empty">담당 서버를 불러오는 중입니다.</div>
            ) : assignedRows.length === 0 ? (
              <div className="server-empty">담당 서버가 없습니다.</div>
            ) : (
              <table className="hist-table server-table">
                <thead>
                  <tr>
                    <th>고객사</th>
                    <th>채널</th>
                    <th>서버명</th>
                    <th style={{ width: 120 }}>플랫폼</th>
                    <th style={{ width: 140 }}>제품명</th>
                    <th style={{ width: 110 }}>내 역할</th>
                    <th style={{ width: 84 }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedRows.map(row => (
                    <tr key={row.id} onClick={() => onChannel?.(channelFromAssigned(row))}>
                      <td><b>{row.customerName || '-'}</b></td>
                      <td>{row.channelName || '-'}</td>
                      <td>{row.serverName}</td>
                      <td>{row.platform || <span className="text-4">-</span>}</td>
                      <td>{row.productName}</td>
                      <td><span className="tag xs info">{ROLE_LABEL[row.myRole] || '-'}</span></td>
                      <td><span className={`tag xs ${STATUS_CLASS[row.status] || 'muted'}`}>{STATUS_LABEL[row.status] || row.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {tab === 'search' && (
        <section className="assigned-shell">
          <div className="assigned-toolbar">
            <div className="server-search">
              <Icon name="search" size={13}/>
              <input
                className="input sm"
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                placeholder="고객사명 / 채널명 검색"
              />
            </div>
            <button className="btn" onClick={loadChannels} disabled={searchLoading}>
              <Icon name="refresh" size={13}/> 새로고침
            </button>
          </div>

          <div className="assigned-search-grid">
            {searchLoading ? (
              <div className="card card-pad text-3">고객사를 불러오는 중입니다.</div>
            ) : customerRows.length === 0 ? (
              <div className="card card-pad text-3">검색 결과가 없습니다.</div>
            ) : customerRows.map(channel => (
              <button key={channel.id} className="assigned-customer-card" onClick={() => onChannel?.(channel)}>
                <span className="ws-h-avatar" style={{ background: channel.color || '#667085' }}>
                  {channel.initial || channel.customerName?.[0] || channel.name?.[0] || '고'}
                </span>
                <span>
                  <b>{channel.customerName || channel.name}</b>
                  <em>{channel.name}</em>
                </span>
                <Icon name="arrow-right" size={14}/>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
