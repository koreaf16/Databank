/**
 * 파일: frontend/src/features/support-history/components/SupportHistoryPage.jsx
 * 역할: 지원이력 목록(이력/가동률 탭) 페이지. Oracle DB에서 SUPPORT_HISTORIES를 로드해 표시.
 *       고객사/엔지니어/월/유형/방법 필터, 일괄 선택, 가동률 탭 포함.
 *
 * 연관 파일:
 *   - ../api/historyApi.js                             : getHistories, createHistory
 *   - features/customers/api/customersApi.js           : getCustomers
 *   - features/organization/api/orgApi.js              : getUsers
 *   - app.jsx                                          : nav==='hist' 일 때 렌더
 *   - SupportHistoryRegisterModal.jsx                  : 이력 등록 모달
 *   - HistoryDetailModal.jsx                           : 상세 모달, ParticipantStack
 *   - supportHistory.js                                : 가동률 계산, 목록 정규화
 *   - components/Dashboard.jsx                         : Segment, TypeTag
 *   - components/common/CustomerCombobox.jsx           : 고객사 필터
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { Segment, TypeTag } from '../../../components/Dashboard.jsx';
import { CustomerCombobox } from '../../../components/common/CustomerCombobox.jsx';
import {
  WORKDAY_END_HOUR,
  WORKDAY_START_HOUR,
  buildUtilizationSummary,
  formatDuration,
  formatUtilizationPercent,
  getHistoryBaseTime,
  getHistoryParticipants,
  getMonthKey,
  listMonthKeysFromHistories,
  monthLabel,
  normalizeSupportHistoryList,
} from '../../../supportHistory.js';
import { HistoryDetailModal, ParticipantStack } from './HistoryDetailModal.jsx';
import { SupportHistoryRegisterModal } from './SupportHistoryRegisterModal.jsx';
import { getHistories, createHistory, normalizeHistoryRow, bulkDeleteHistory } from '../api/historyApi.js';
import { getCustomers } from '../../customers/api/customersApi.js';
import { getUsers } from '../../organization/api/orgApi.js';

const AVATAR_COLORS = ['#7c5cff','#2563eb','#dc2626','#16a34a','#ca8a04','#db2777','#0891b2','#9333ea'];
function avatarColor(id) { return AVATAR_COLORS[(Math.abs(Number(id) || 0)) % AVATAR_COLORS.length]; }

// workspaceId / serverIds : 채널의 업무/서버 N:M 컨텍스트.
//   - workspaceId 있으면 그 업무에 묶인 이력만 조회
//   - serverIds[] 있으면 그 서버들 중 하나라도 대상에 포함된 이력만
export function SupportHistory({ fromChannel, workspaceId = null, serverIds = [] }) {
  const [view, setView]               = React.useState('history');
  const [typeFilter, setTypeFilter]   = React.useState('all');
  const [open, setOpen]               = React.useState(null);
  const [records, setRecords]         = React.useState([]);
  const [customers, setCustomers]     = React.useState([]);
  const [engineers, setEngineers]     = React.useState([]);
  const [loading, setLoading]         = React.useState(false);
  const [showRegister, setShowRegister] = React.useState(false);
  const [query, setQuery]             = React.useState('');
  const deferredQuery                 = React.useDeferredValue(query);
  const [historyMonthFilter, setHistoryMonthFilter] = React.useState('all');
  const [customerFilter, setCustomerFilter]         = React.useState('all');
  const [engineerFilter, setEngineerFilter]         = React.useState('all');
  const [methodFilter, setMethodFilter]             = React.useState('all');
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [histCtxDismissed, setHistCtxDismissed] = React.useState(false);

  const monthKeys = listMonthKeysFromHistories(records);
  const [utilMonth, setUtilMonth]     = React.useState(monthKeys[0] || getMonthKey(new Date()));
  const [utilMethod, setUtilMethod]   = React.useState('all');
  const [utilEngineer, setUtilEngineer] = React.useState('all');

  // 고객사 목록 로드
  React.useEffect(() => {
    getCustomers(false)
      .then(rows => setCustomers(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, []);

  // 사용자(엔지니어) 목록 로드
  React.useEffect(() => {
    getUsers()
      .then(rows => {
        const list = (Array.isArray(rows) ? rows : []).map(u => ({
          id:      u.id,
          name:    u.name,
          color:   avatarColor(u.id),
          initial: (u.name || '?')[0],
          role:    u.useType || 'engineer',
        }));
        setEngineers(list);
      })
      .catch(() => {});
  }, []);

  async function loadHistories() {
    setLoading(true);
    try {
      const params = {};
      if (fromChannel?.customerId) params.customerId = fromChannel.customerId;
      if (workspaceId) params.workspaceId = workspaceId;
      if (Array.isArray(serverIds) && serverIds.length > 0) params.serverIds = serverIds;
      const rows = await getHistories(params);
      setRecords(normalizeSupportHistoryList(rows));
    } catch (_) {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { loadHistories(); }, [fromChannel?.customerId, workspaceId, JSON.stringify(serverIds)]);

  React.useEffect(() => {
    if (monthKeys.length > 0 && !monthKeys.includes(utilMonth)) {
      setUtilMonth(monthKeys[0]);
    }
  }, [monthKeys.join('|'), utilMonth]);

  const searchNeedle = deferredQuery.trim().toLowerCase();
  const historyBase = records.filter(history => {
    if (fromChannel && !histCtxDismissed && fromChannel.customerId) {
      if (String(history.customerId) !== String(fromChannel.customerId)) return false;
    }
    const baseMonth = getMonthKey(getHistoryBaseTime(history));
    if (historyMonthFilter !== 'all' && baseMonth !== historyMonthFilter) return false;
    if (customerFilter !== 'all' && history.customerId !== Number(customerFilter)) return false;
    if (engineerFilter !== 'all' && !getHistoryParticipants(history).some(p => String(p.id) === engineerFilter)) return false;
    if (methodFilter !== 'all' && history.supportMode !== methodFilter) return false;
    if (!searchNeedle) return true;
    return [
      history.id, history.customer, history.service, history.summary,
      history.workDetail, history.finding, history.action,
      ...getHistoryParticipants(history).map(p => p.name),
    ].filter(Boolean).join(' ').toLowerCase().includes(searchNeedle);
  });

  const counts = {
    all:      historyBase.length,
    routine:  historyBase.filter(h => h.type === 'routine').length,
    tech:     historyBase.filter(h => h.type === 'tech').length,
    incident: historyBase.filter(h => h.type === 'incident').length,
  };
  const list = typeFilter === 'all' ? historyBase : historyBase.filter(h => h.type === typeFilter);
  const engineerScope = utilEngineer === 'all' ? engineers : engineers.filter(e => String(e.id) === utilEngineer);
  const utilization = buildUtilizationSummary(records, engineerScope, utilMonth, utilMethod);

  async function handleRegister(record) {
    try {
      await createHistory(record);
      await loadHistories();
    } catch (err) {
      console.error('[지원이력 등록]', err);
    }
    setShowRegister(false);
  }

  async function handleBulkDelete() {
    if (!selectedIds.length) return;
    if (!window.confirm(`${selectedIds.length}건의 지원이력을 정말 삭제하시겠습니까?`)) return;
    try {
      setLoading(true);
      await bulkDeleteHistory(selectedIds);
      setSelectedIds([]);
      await loadHistories();
    } catch (err) {
      alert('일괄 삭제 중 오류가 발생했습니다.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const customerOptions = customers.map(c => ({ value: String(c.id), label: c.customerMain }));
  const customerFilterOptions = [
    ...new Map(records.map(r => [r.customerId, r.customer])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], 'ko'))
   .map(([id, name]) => ({ value: String(id), label: name }));

  return (
    <div className="page-pad scroll" style={{ height: '100%' }}>
      {fromChannel && !histCtxDismissed && (
        <div className="ctx-bar" style={{ margin: '-20px -20px 16px', padding: '8px 20px' }}>
          <span className="ctx-bar-icon">🔗</span>
          <span><b>{fromChannel.name}</b> 채널에서 왔어요 — 해당 고객사 이력 우선 표시 중</span>
          <button className="ctx-bar-dismiss" onClick={() => setHistCtxDismissed(true)}>필터 해제</button>
        </div>
      )}
      <div className="page-h">
        <div>
          <div className="page-eyebrow">전체 {records.length}건 · 현재 필터 {view === 'history' ? list.length : utilization.supportCount}건{loading && ' · 불러오는 중…'}</div>
          <h1 className="page-title">지원이력</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {selectedIds.length > 0 && (
            <button className="btn danger" onClick={handleBulkDelete}>
              <Icon name="trash" size={14}/> {selectedIds.length}건 삭제
            </button>
          )}
          <Segment value={view} onChange={setView} options={[{v:'history',l:'이력'},{v:'utilization',l:'가동률'}]}/>
          <button className="btn primary" onClick={() => setShowRegister(true)}><Icon name="plus" size={14}/> 이력 등록</button>
        </div>
      </div>

      {view === 'history' ? (
        <>
          <div className="ai-search" style={{ marginTop: 16 }}>
            <Icon name="sparkles" size={14}/>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="자연어로 이력 검색 — 예: 지난주 archive_lag 관련 조치"
            />
            <span className="hist-search-hint">AI 검색</span>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="hist-toolbar">
              <select className="input" style={{ width: 130, height: 30, fontSize: 12 }} value={typeFilter} onChange={event => setTypeFilter(event.target.value)}>
                <option value="all">전체 유형</option>
                <option value="routine">정기점검</option>
                <option value="tech">기술지원</option>
                <option value="incident">장애처리</option>
              </select>
              <select className="input" style={{ width: 150, height: 30, fontSize: 12 }} value={historyMonthFilter} onChange={event => setHistoryMonthFilter(event.target.value)}>
                <option value="all">전체 월</option>
                {monthKeys.map(month => <option key={month} value={month}>{monthLabel(month)}</option>)}
              </select>
              <CustomerCombobox
                value={customerFilter === 'all' ? null : customerFilter}
                onChange={v => setCustomerFilter(v || 'all')}
                options={customerFilterOptions}
                placeholder="전체 고객사"
                style={{ width: 160, flexShrink: 0 }}
              />
              <select className="input" style={{ width: 150, height: 30, fontSize: 12 }} value={engineerFilter} onChange={event => setEngineerFilter(event.target.value)}>
                <option value="all">전체 엔지니어</option>
                {engineers.map(e => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
              </select>
              <select className="input" style={{ width: 130, height: 30, fontSize: 12 }} value={methodFilter} onChange={event => setMethodFilter(event.target.value)}>
                <option value="all">전체 방법</option>
                <option value="onsite">방문</option>
                <option value="remote">원격</option>
              </select>
              <div style={{ flex: 1 }}/>
              <span className="text-3" style={{ fontSize: 12 }}>{list.length}건</span>
            </div>
            <table className="hist-table">
              <thead><tr>
                <th style={{ width: 28 }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.length === list.length && list.length > 0}
                    onChange={e => setSelectedIds(e.target.checked ? list.map(h => h.id) : [])}
                  />
                </th>
                <th style={{ width: 80 }}>상태</th>
                <th style={{ width: 36 }}>P</th>
                <th style={{ width: 112 }}>기준시각</th>
                <th style={{ width: 126 }}>고객사</th>
                <th style={{ width: 140 }}>서비스</th>
                <th style={{ width: 88 }}>유형</th>
                <th style={{ width: 124 }}>지원구간</th>
                <th style={{ width: 92 }}>총 지원시간</th>
                <th style={{ width: 170 }}>참여 엔지니어</th>
                <th style={{ width: 70 }}>방법</th>
                <th>요약</th>
              </tr></thead>
              <tbody>
                {list.map(history => {
                  const status      = history.status   || 'draft';
                  const statusLabel = { draft: '초안', progress: '진행중', done: '완료', review: '검토중' }[status] || status;
                  const prio        = history.priority || 'p3';
                  const isChecked   = selectedIds.includes(history.id);
                  const custColor   = history.customerColor || '#888';
                  return (
                    <React.Fragment key={history.id}>
                      <tr onClick={() => setOpen({ history, status, prio })} style={{ background: isChecked ? 'var(--selected)' : undefined, cursor: 'pointer' }}>
                        <td onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => setSelectedIds(s => e.target.checked ? [...s, history.id] : s.filter(id => id !== history.id))}
                          />
                        </td>
                        <td><span className={`hist-status-badge ${status}`}>{statusLabel}</span></td>
                        <td><span className={`hist-priority ${prio}`}>{prio.toUpperCase()}</span></td>
                        <td>
                          <div>{history.date}</div>
                          <div className="hist-subtext">{history.id}</div>
                        </td>
                        <td><span className="avatar" style={{ background: custColor, marginRight: 6, verticalAlign: 'middle' }}>{(history.customer || '?')[0]}</span>{history.customer}</td>
                        <td>{history.service}</td>
                        <td><TypeTag type={history.type}/></td>
                        <td>{history.displayRange}</td>
                        <td>{formatDuration(history.actualMinutes)}</td>
                        <td><ParticipantStack participants={getHistoryParticipants(history)}/></td>
                        <td>{history.method}</td>
                        <td>{history.summary}</td>
                      </tr>
                    </React.Fragment>
                  );
                })}
                {list.length === 0 && (
                  <tr>
                    <td colSpan={12} className="hist-empty">조건에 맞는 지원이력이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="util-wrap">
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="hist-toolbar">
              <select className="input" style={{ width: 140, height: 30, fontSize: 12 }} value={utilMonth} onChange={event => setUtilMonth(event.target.value)}>
                {monthKeys.map(month => <option key={month} value={month}>{monthLabel(month)}</option>)}
              </select>
              <select className="input" style={{ width: 150, height: 30, fontSize: 12 }} value={utilEngineer} onChange={event => setUtilEngineer(event.target.value)}>
                <option value="all">전체 엔지니어</option>
                {engineers.map(e => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
              </select>
              <select className="input" style={{ width: 130, height: 30, fontSize: 12 }} value={utilMethod} onChange={event => setUtilMethod(event.target.value)}>
                <option value="all">방문+원격</option>
                <option value="onsite">방문만</option>
                <option value="remote">원격만</option>
              </select>
              <div style={{ flex: 1 }}/>
              <span className="text-3" style={{ fontSize: 12 }}>업무시간 {WORKDAY_START_HOUR}:00~{WORKDAY_END_HOUR}:00 · 실제 지원시간 기준</span>
            </div>
          </div>

          <div className="hist-stats util-stats">
            <div className="hist-stat on">
              <div className="hist-stat-num">{formatDuration(utilization.possibleMinutes)}</div>
              <div className="hist-stat-label">월 가능시간</div>
            </div>
            <div className="hist-stat">
              <div className="hist-stat-num" style={{ color: 'var(--brand-500)' }}>{formatDuration(utilization.totalMinutes)}</div>
              <div className="hist-stat-label">실제 지원시간</div>
            </div>
            <div className="hist-stat">
              <div className="hist-stat-num" style={{ color: 'var(--warn)' }}>{formatUtilizationPercent(utilization.totalMinutes, utilization.possibleMinutes)}</div>
              <div className="hist-stat-label">가동률</div>
            </div>
            <div className="hist-stat">
              <div className="hist-stat-num" style={{ color: 'var(--err)' }}>{utilization.supportCount}</div>
              <div className="hist-stat-label">지원건수</div>
            </div>
          </div>

          <div className="util-summary-grid">
            <div className="card util-summary-card">
              <span className="text-3">방문 지원시간</span>
              <b>{formatDuration(utilization.onsiteMinutes)}</b>
            </div>
            <div className="card util-summary-card">
              <span className="text-3">원격 지원시간</span>
              <b>{formatDuration(utilization.remoteMinutes)}</b>
            </div>
            <div className="card util-summary-card">
              <span className="text-3">표시 규칙</span>
              <b>실제 지원시간 기준이라 100% 초과 가능</b>
            </div>
          </div>

          <div className="card">
            <table className="hist-table util-table">
              <thead><tr>
                <th style={{ width: 120 }}>엔지니어</th>
                <th style={{ width: 108 }}>가능시간</th>
                <th style={{ width: 108 }}>방문</th>
                <th style={{ width: 108 }}>원격</th>
                <th style={{ width: 108 }}>총 지원시간</th>
                <th style={{ width: 88 }}>가동률</th>
                <th style={{ width: 76 }}>지원건수</th>
              </tr></thead>
              <tbody>
                {utilization.rows.map(row => (
                  <tr key={row.id}>
                    <td>
                      <span className="avatar" style={{ background: row.color, marginRight: 6, verticalAlign: 'middle' }}>{row.initial}</span>
                      {row.name}
                    </td>
                    <td>{formatDuration(row.possibleMinutes)}</td>
                    <td>{formatDuration(row.onsiteMinutes)}</td>
                    <td>{formatDuration(row.remoteMinutes)}</td>
                    <td>{formatDuration(row.totalMinutes)}</td>
                    <td>{Math.round(row.utilizationPct)}%</td>
                    <td>{row.supportCount}건</td>
                  </tr>
                ))}
                {utilization.rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="hist-empty">해당 월에 집계할 가동률 데이터가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && (
        <HistoryDetailModal
          item={open}
          onClose={(refetch) => {
            setOpen(null);
            if (refetch === true) loadHistories();
          }}
        />
      )}
      {showRegister && (
        <SupportHistoryRegisterModal
          engineers={engineers}
          customers={customerOptions}
          onClose={() => setShowRegister(false)}
          onSave={handleRegister}
        />
      )}
    </div>
  );
}
