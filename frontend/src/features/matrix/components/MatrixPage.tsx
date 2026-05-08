/**
 * 파일: frontend/src/features/matrix/components/MatrixPage.jsx
 * 역할: 정기점검 현황표 — 고객사×월별 점검 셀, 슬라이드 패널로 이력 상세 표시.
 *       Phase 1.6에서 Math.random() + window.* mock → Oracle DB API 연결 완료.
 *
 * 연관 파일:
 *   - app.jsx : nav==='mat' 일 때 렌더
 *   - api/matrixApi.js : 플랜 조회/셀 업데이트
 *   - features/support-history/api/historyApi.js : 셀 상세 이력 조회
 *   - components/Dashboard.jsx : Ring, Segment, TypeTag
 *   - components/common/SlidePanel.jsx : 셀 클릭 슬라이드 패널
 *   - components/Icon.jsx : 아이콘
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { Ring, Segment, TypeTag } from '../../../components/Dashboard.jsx';
import { SlidePanel } from '../../../components/common/SlidePanel.jsx';
import { getMatrix } from '../api/matrixApi.js';
import { getHistories } from '../../support-history/api/historyApi.js';
import { useUser } from '../../../contexts/UserContext.js';

const AVATAR_COLORS = ['#7c5cff','#2563eb','#dc2626','#16a34a','#ca8a04','#db2777','#0891b2','#9333ea'];
function avatarColor(id) { return AVATAR_COLORS[Math.abs(Number(id) || 0) % AVATAR_COLORS.length]; }

// ── 셀 클릭 시 보여줄 이력 카드 ──────────────────────────────────────────────

function MatrixCellDetail({ customer, month, service }) {
  const [histories, setHistories] = React.useState([]);

  React.useEffect(() => {
    if (!customer?.id) return;
    getHistories({ customerId: customer.id })
      .then(list => {
        setHistories(list.slice(0, 5).map(h => ({
          id: h.id,
          type: h.type,
          summary: h.summary || '점검 내용 없음',
          participants: (h.participants || []).filter(Boolean),
          displayRange: h.timeline?.supportStartedAt
            ? `${h.timeline.supportStartedAt}${h.timeline.supportEndedAt ? ' ~ ' + h.timeline.supportEndedAt : ''}`
            : `${month} 점검`,
          actualMinutes: h.actualMinutes || 0,
        })));
      })
      .catch(() => setHistories([]));
  }, [customer?.id, month]);

  return (
    <div>
      <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-3)' }}>
        <b style={{ color: 'var(--text)' }}>{customer.name}</b> · {service} · {month}
      </div>
      {histories.length === 0 && (
        <div style={{ color: 'var(--text-3)', fontSize: 13 }}>등록된 지원이력이 없습니다.</div>
      )}
      {histories.map(h => (
        <div key={h.id} className="mx-hist-card">
          <div className="mx-hist-card-h">
            <span className="mx-hist-card-title">
              <TypeTag type={h.type}/>
            </span>
            <span className="text-3" style={{ fontSize: 11 }}>{h.displayRange}</span>
          </div>
          <div className="mx-hist-card-body">{h.summary || '점검 내용 없음'}</div>
          {h.participants?.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {h.participants.filter(Boolean).map((p, i) => (
                <span key={i} className="tag muted" style={{ fontSize: 11 }}>{p.name || p}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────

export function MatrixPage({ fromChannel }) {
  const me = useUser();
  const [year, setYear] = React.useState(2026);
  const [half, setHalf] = React.useState(1);
  const months = half === 1 ? ['1월','2월','3월','4월','5월','6월'] : ['7월','8월','9월','10월','11월','12월'];
  const monthOffset = half === 1 ? 0 : 6;

  const [scope, setScope] = React.useState('me');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [selected, setSelected] = React.useState(null);
  const [tooltip, setTooltip] = React.useState(null);
  const [plans, setPlans] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  const ctxCustomer = fromChannel?.name;

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = { year, half, scope };
      if (scope === 'me' && me?.id) params.userId = me.id;
      const data = await getMatrix(params);
      setPlans(data || []);
    } catch (err) {
      console.error('점검현황 데이터를 불러오지 못했습니다.', err);
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [year, half, scope]);

  React.useEffect(() => { loadData(); }, [loadData]);

  const rows = React.useMemo(() => plans.map(plan => {
    const cellMap = {};
    for (const c of (plan.cells || [])) cellMap[c.month] = c;
    return {
      c: {
        id:      plan.customerId,
        name:    plan.customerName,
        color:   avatarColor(plan.customerId),
        initial: (plan.customerName || '?')[0],
      },
      service: plan.serviceName,
      planId:  plan.planId,
      cells: months.map((_, mi) => {
        const monthNum = mi + 1 + monthOffset;
        const cell = cellMap[monthNum] || {};
        return {
          month:     monthNum,
          status:    cell.status || 'pending',
          done:      cell.status === 'done',
          urgent:    cell.status === 'urgent',
        };
      }),
    };
  }), [plans, half, months, monthOffset]);

  const filteredData = statusFilter === 'urgent'
    ? rows.filter(row => row.cells.some(x => x.urgent))
    : rows;

  function handleCellClick(row, monthIdx) {
    setSelected({ customer: row.c, service: row.service, month: months[monthIdx], cell: row.cells[monthIdx] });
  }

  return (
    <div className="page-pad scroll" style={{ height: '100%' }}>
      {ctxCustomer && (
        <div className="ctx-bar">
          <span className="ctx-bar-icon">🔗</span>
          <span>{ctxCustomer} 채널에서 왔어요</span>
        </div>
      )}
      <div className="page-h">
        <div>
          <div className="page-eyebrow">{year}년 {half}반기 · 정기점검</div>
          <h1 className="page-title">점검현황표</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="input sm"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ height: 32, fontSize: 12 }}
          >
            <option value="all">전체 상태</option>
            <option value="urgent">적색만</option>
          </select>
          <Segment value={scope} onChange={setScope} options={[{v:'me',l:'내 담당'},{v:'all',l:'전체'}]}/>
          <button className="btn icon" onClick={() => { if (half === 1) { setYear(y => y - 1); setHalf(2); } else { setHalf(1); } }}><Icon name="chevron-left" size={14}/></button>
          <button className="btn">{year}년 {half}반기</button>
          <button className="btn icon" onClick={() => { if (half === 2) { setYear(y => y + 1); setHalf(1); } else { setHalf(2); } }}><Icon name="chevron-right" size={14}/></button>
          <button className="btn" onClick={loadData} disabled={loading}><Icon name="refresh" size={13}/> 현행화</button>
        </div>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="mx-table">
          <thead>
            <tr>
              <th>고객사</th>
              <th>서비스</th>
              {months.map(m => <th key={m}>{m}</th>)}
              <th>달성률</th>
            </tr>
          </thead>
          <tbody>
            {loading && plans.length === 0 ? (
              <tr><td colSpan={months.length + 3} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>불러오는 중...</td></tr>
            ) : filteredData.length === 0 ? (
              <tr><td colSpan={months.length + 3} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>등록된 정기점검 계획이 없습니다.</td></tr>
            ) : (
              filteredData.map(row => {
                const done = row.cells.filter(x => x.done).length;
                const pct = Math.round(done / row.cells.length * 100);
                return (
                  <tr key={`${row.c.id}-${row.service}`}>
                    <td>
                      <span className="avatar" style={{ background: row.c.color, marginRight: 6, verticalAlign: 'middle' }}>{row.c.initial}</span>
                      <b>{row.c.name}</b>
                    </td>
                    <td className="text-3">{row.service}</td>
                    {row.cells.map((x, ci) => {
                      const tip = `${x.urgent ? '이상 ' : x.done ? '완료 ' : '미완료 '}· 클릭하면 상세 이력을 볼 수 있어요`;
                      return (
                        <td
                          key={ci}
                          className="mx-cell"
                          style={{ textAlign: 'center', position: 'relative' }}
                          onClick={() => handleCellClick(row, ci)}
                          onMouseEnter={() => setTooltip(`${row.c.name} ${months[ci]} — ${x.urgent ? '⚠ 이상' : x.done ? '✓ 완료' : '○ 미완료'}`)}
                          onMouseLeave={() => setTooltip(null)}
                          title={tip}
                        >
                          {x.urgent ? <span className="dot err"/> : x.done ? <span className="dot ok"/> : <span className="dot gray"/>}
                        </td>
                      );
                    })}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Ring percent={pct} size={28}/>
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <SlidePanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.customer.name} · ${selected.month} 점검 이력` : ''}
        width={420}
      >
        {selected && (
          <MatrixCellDetail
            customer={selected.customer}
            month={selected.month}
            service={selected.service}
          />
        )}
      </SlidePanel>

      {tooltip && (
        <div className="mx-tooltip">{tooltip}</div>
      )}
    </div>
  );
}
