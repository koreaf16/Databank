/**
 * 파일: frontend/src/features/messaging/parts/ChannelHistory.tsx
 * 역할: 채널(고객사)별 지원 이력 목록 및 검색 화면.
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { TypeTag } from '../../../components/Dashboard.jsx';
import { getHistoryParticipants } from '../../../supportHistory.js';

export function ChannelHistory({ channel, histories = [], onGoNewInput }: any) {
  const [query, setQuery] = React.useState('');

  const filtered = histories.filter((h: any) => {
    const s = query.trim().toLowerCase();
    if (!s) return true;
    return (
      h.summary?.toLowerCase().includes(s) ||
      h.service?.toLowerCase().includes(s) ||
      h.method?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="page-pad ws-page scroll" style={{ height: '100%' }}>
      <div className="channel-page-head" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <span className="channel-page-kicker">History</span>
          <h3>지원 이력</h3>
          <p className="text-3">{channel.name} 고객사의 누적 지원 데이터입니다.</p>
        </div>
        <div style={{ position: 'relative', width: 240 }}>
          <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }}/>
          <input
            className="input sm"
            style={{ paddingLeft: 32, width: '100%' }}
            placeholder="이력 검색..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="hist-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 100 }}>날짜</th>
              <th style={{ width: 140 }}>서비스</th>
              <th style={{ width: 100 }}>엔지니어</th>
              <th style={{ width: 100 }}>유형</th>
              <th style={{ width: 80 }}>방법</th>
              <th>내용 요약</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>이력이 없습니다.</td></tr>
            ) : (
              filtered.map((h: any) => (
                <tr key={h.id}>
                  <td className="text-3" style={{ fontSize: 12 }}>{h.date || h.startedAt?.split('T')[0]}</td>
                  <td><b>{h.service}</b></td>
                  <td>{getHistoryParticipants(h.participants || []).map((p: any) => p.name).join(', ')}</td>
                  <td><TypeTag type={h.type}/></td>
                  <td className="text-3">{h.method}</td>
                  <td style={{ fontSize: 13 }}>{h.summary}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
