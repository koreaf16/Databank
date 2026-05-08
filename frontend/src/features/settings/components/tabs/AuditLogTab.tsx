/**
 * 파일: frontend/src/features/settings/components/tabs/AuditLogTab.tsx
 * 역할: 시스템 감사 로그(활동 이력) 조회 화면.
 */

import React from 'react';
import { Icon } from '../../../../components/Icon.jsx';
import { getAuditLogs } from '../../api/settingsApi.js';

export function AuditLogTab() {
  const [logs, setLogs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState('');

  const loadLogs = React.useCallback(async () => {
    setLoading(true);
    try {
      setLogs(await getAuditLogs());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { loadLogs(); }, [loadLogs]);

  const filteredLogs = logs.filter((log: any) => {
    const s = query.trim().toLowerCase();
    if (!s) return true;
    return (
      log.userName?.toLowerCase().includes(s) ||
      log.action?.toLowerCase().includes(s) ||
      log.target?.toLowerCase().includes(s) ||
      log.summary?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="tab-pane">
      <div className="set-h">
        <div>
          <h2>감사 로그</h2>
          <p className="text-3">시스템에서 발생한 주요 활동 이력입니다. 최근 100건을 표시합니다.</p>
        </div>
        <div className="cust-search-wrap">
          <Icon name="search" size={13}/>
          <input
            className="cust-search-input"
            placeholder="수행자, 액션, 대상 검색"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="hist-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 120 }}>시간</th>
              <th style={{ width: 100 }}>수행자</th>
              <th style={{ width: 120 }}>액션</th>
              <th>내용</th>
              <th style={{ width: 100 }}>구분</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40 }}>불러오는 중...</td></tr>
            ) : filteredLogs.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40 }}>검색 결과가 없습니다.</td></tr>
            ) : (
              filteredLogs.map((log: any) => (
                <tr key={log.id}>
                  <td className="text-3" style={{ fontSize: 12 }}>{log.time || log.createdAt}</td>
                  <td style={{ fontWeight: 600 }}>{log.userName}</td>
                  <td>
                    <span className={`tag xs ${log.kind || 'muted'}`}>{log.action}</span>
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {log.summary || log.target}
                  </td>
                  <td className="text-3" style={{ fontSize: 11 }}>{log.module || log.entityType}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
