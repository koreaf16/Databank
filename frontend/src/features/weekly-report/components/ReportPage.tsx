/**
 * 파일: frontend/src/features/weekly-report/components/ReportPage.jsx
 * 역할: 주간업무보고 페이지. 팀 선택 → 엔지니어별 이번 주 업무실적 + 다음 주 일정.
 *       Phase 1.5에서 window.* mock → Oracle DB API 연결 완료.
 *
 * 연관 파일:
 *   - app.jsx : nav==='rep' 일 때 렌더
 *   - features/organization/api/orgApi.js         : 부서/사용자 조회
 *   - features/support-history/api/historyApi.js  : 이번 주 업무실적·정기점검
 *   - features/calendar/api/calendarApi.js        : 다음 주 일정 + getWeekRange
 *   - components/Dashboard.jsx : TypeTag
 *   - components/Icon.jsx : 아이콘
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { TypeTag } from '../../../components/Dashboard.jsx';
import { getDepartments, getUsers } from '../../organization/api/orgApi.js';
import { getHistories } from '../../support-history/api/historyApi.js';
import { getEvents, getWeekRange } from '../../calendar/api/calendarApi.js';
import { useUser } from '../../../contexts/UserContext.js';

const AVATAR_COLORS = ['#7c5cff','#2563eb','#dc2626','#16a34a','#ca8a04','#db2777','#0891b2','#9333ea'];
function avatarColor(id) { return AVATAR_COLORS[Math.abs(Number(id) || 0) % AVATAR_COLORS.length]; }

function weekLabel(week) {
  const f = week.from.slice(5).replace('-', '.');
  const t = week.to.slice(5).replace('-', '.');
  return `${f} — ${t} · ${week.label.replace(/^\d{4}년 /, '')}`;
}

const DAY_KOR = ['일', '월', '화', '수', '목', '금', '토'];

function normalizeEvent(e) {
  const startDate = e.startAt ? e.startAt.slice(0, 10) : '';
  const d = startDate ? new Date(startDate) : null;
  const dayLabel = d ? `${DAY_KOR[d.getDay()]} ${startDate.slice(5).replace('-', '/')}` : '';
  const time = e.startAt && e.endAt ? `${e.startAt.slice(11)}~${e.endAt.slice(11)}` : '';
  return {
    id: e.id,
    dayLabel,
    sortKey: d ? d.getDay() : 0,
    type: e.eventType,
    customer: e.customerName || '내부',
    service: e.serviceName || e.title || '',
    time,
    method: e.method || '',
    participantIds: Array.isArray(e.participants)
      ? e.participants.map(p => String(p?.userId ?? p?.id ?? p)).filter(Boolean)
      : [],
    createdBy: e.createdBy == null ? null : String(e.createdBy),
  };
}

function eventForEngineer(event, engineer) {
  const engineerId = String(engineer.id);
  if (event.participantIds?.length > 0) return event.participantIds.includes(engineerId);
  return event.createdBy === engineerId;
}

function groupScheduleByDay(items) {
  const map = {};
  const order = [];
  items.forEach(item => {
    if (!map[item.dayLabel]) { map[item.dayLabel] = []; order.push(item.dayLabel); }
    map[item.dayLabel].push(item);
  });
  return order.map(day => ({ day, items: map[day] }));
}

export function ReportPage() {
  const me = useUser();
  const thisWeek = React.useMemo(() => getWeekRange(), []);
  const nextWeek = React.useMemo(() => getWeekRange(new Date(Date.now() + 7 * 86400000)), []);

  const [teams, setTeams]       = React.useState([]);
  const [users, setUsers]       = React.useState([]);
  const [selTeam, setSelTeam]   = React.useState(null);
  const [histories, setHistories] = React.useState([]);
  const [events, setEvents]     = React.useState([]);
  const [addedIds, setAddedIds] = React.useState([]);
  const [showPicker, setShowPicker]   = React.useState(false);
  const [pickerSel, setPickerSel]     = React.useState(new Set());

  React.useEffect(() => {
    getDepartments()
      .then(depts => {
        const myDeptId = me?.deptId;
        const mapped = depts.map(d => ({ id: d.id, name: d.name, color: avatarColor(d.id), mine: d.id === myDeptId }));
        setTeams(mapped);
        setSelTeam(mapped.find(t => t.mine)?.id ?? mapped[0]?.id ?? null);
      })
      .catch(() => {});
    getUsers().then(setUsers).catch(() => {});
  }, []);

  React.useEffect(() => {
    getHistories({ from: thisWeek.from, to: thisWeek.to })
      .then(setHistories).catch(() => {});
  }, []);

  React.useEffect(() => {
    getEvents({ from: nextWeek.from, to: nextWeek.to })
      .then(evts => {
        const normalized = evts.map(normalizeEvent);
        setEvents(normalized);
        setAddedIds(normalized.map(e => e.id));
      })
      .catch(() => {});
  }, []);

  const teamEngineers = React.useMemo(() =>
    selTeam == null ? [] : users
      .filter(u => u.deptId === selTeam)
      .map(u => ({ ...u, color: avatarColor(u.id), initial: (u.name || '?')[0], dept: u.department || '' })),
  [users, selTeam]);

  const historyByEngineer = React.useMemo(() => {
    const map = {};
    for (const h of histories) {
      if (h.managerId == null) continue;
      if (!map[h.managerId]) map[h.managerId] = [];
      map[h.managerId].push(h);
    }
    return map;
  }, [histories]);

  const addedItems = React.useMemo(
    () => events.filter(e => addedIds.includes(e.id)),
    [events, addedIds],
  );

  function worksForEngineer(eng) {
    return (historyByEngineer[eng.id] || [])
      .filter(h => h.type !== 'routine')
      .map(h => ({
        id: h.id, type: h.type,
        customer: h.customer, service: h.service,
        summary: h.summary || '',
        workDetail: h.workDetail || '',
        finding: h.finding || '',
        action: h.action || '',
        method: h.supportMode || '',
        date: h.timeline?.supportStartedAt?.slice(5, 10).replace('-', '/') || '',
      }));
  }

  function routineForEngineer(eng) {
    return (historyByEngineer[eng.id] || [])
      .filter(h => h.type === 'routine')
      .map(h => ({
        id: h.id,
        customer: h.customer, service: h.service,
        date: h.timeline?.supportStartedAt?.slice(5, 10).replace('-', '/') || '',
        status: 'done',
      }));
  }

  function openPicker() { setPickerSel(new Set(addedIds)); setShowPicker(true); }
  function confirmPicker() { setAddedIds([...pickerSel]); setShowPicker(false); }
  function togglePicker(id) {
    setPickerSel(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  const WEEK_LABEL      = weekLabel(thisWeek);
  const NEXT_WEEK_LABEL = weekLabel(nextWeek);

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      <div className="rep-team-nav">
        <div className="rep-team-nav-title">팀 선택</div>
        {teams.map(t => (
          <button key={t.id} className={'rep-team-btn' + (selTeam === t.id ? ' on' : '')} onClick={() => setSelTeam(t.id)}>
            <span className="rep-team-dot" style={{ background: t.color }}/>
            {t.name}
            {t.mine && <span className="tag info" style={{ fontSize: 9, marginLeft: 'auto', padding: '1px 5px' }}>우리팀</span>}
          </button>
        ))}
      </div>

      <div className="page-pad scroll" style={{ flex: 1, height: '100%', minWidth: 0 }}>
        <div className="page-h">
          <div>
            <div className="page-eyebrow">{WEEK_LABEL} · 이번 주</div>
            <h1 className="page-title">업무보고</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn"><Icon name="download" size={13}/> PDF</button>
            <button className="btn"><Icon name="grid" size={13}/> Excel</button>
            <button className="btn" onClick={openPicker}><Icon name="plus" size={13}/> 일정 추가</button>
          </div>
        </div>

        <div className="rep-person-list">
          {teamEngineers.map(eng => {
            const works    = worksForEngineer(eng);
            const routines = routineForEngineer(eng);
            const engSchedules = addedItems.filter(item => eventForEngineer(item, eng));
            const byDay = groupScheduleByDay(engSchedules);
            return (
              <div key={eng.id}>
                <div className="card rep-combined-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div className="rep-eng-head" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="avatar" style={{ background: eng.color, width: 32, height: 32, fontSize: 13, flexShrink: 0 }}>{eng.initial}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{eng.name}</div>
                      <div className="text-3" style={{ fontSize: 12 }}>{eng.dept}</div>
                    </div>
                    <span className="text-3" style={{ marginLeft: 'auto', fontSize: 12 }}>
                      {works.length > 0 ? `작업 ${works.length}건` : '이번 주 정기점검 외 작업 없음'} | 다음 주 일정 {engSchedules.length}건
                    </span>
                  </div>
                  <div className="rep-person-row" style={{ gap: 0, margin: 0 }}>
                    <div className="rep-work-side" style={{ borderRight: '1px solid var(--border)' }}>
                      <div style={{ padding: '14px 18px 0' }}>
                        <div className="page-eyebrow" style={{ marginBottom: 2 }}>{WEEK_LABEL} · 이번 주</div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>업무 실적</div>
                      </div>
                      {works.length > 0 ? (
                        <div className="rep-work-list" style={{ marginTop: 8 }}>
                          {works.map((w, wi) => (
                            <div key={w.id} className={'rep-work-item' + (wi > 0 ? ' border-top' : '')}>
                              <div className="rep-work-head">
                                <TypeTag type={w.type}/>
                                <b style={{ fontSize: 13 }}>{w.customer}</b>
                                <span className="text-3">· {w.service}</span>
                                <span className="text-3" style={{ marginLeft: 'auto', fontSize: 11 }}>{w.date} · {w.method}</span>
                              </div>
                              <div className="rep-work-summary">{w.summary}</div>
                              <div className="rep-work-detail-grid">
                                <div className="rep-work-detail-row"><span className="rep-work-label">작업 내용</span><span>{w.workDetail}</span></div>
                                <div className="rep-work-detail-row"><span className="rep-work-label">발견 사항</span><span>{w.finding}</span></div>
                                <div className="rep-work-detail-row"><span className="rep-work-label">조치 결과</span><span>{w.action}</span></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ padding: '12px 18px 16px', color: 'var(--text-4)', fontSize: 12 }}>이번 주 정기점검 외 별도 작업 없음</div>
                      )}
                      <div className="rep-routine-box">
                        <div className="rep-routine-head">
                          <h3 style={{ margin: 0, fontSize: 13 }}>정기점검</h3>
                          <span className="text-3" style={{ fontSize: 12 }}>{routines.length}건</span>
                        </div>
                        {routines.length === 0 ? (
                          <div className="text-3" style={{ fontSize: 12, padding: '0 18px 14px' }}>이번 주 정기점검 항목이 없습니다.</div>
                        ) : (
                          <table className="rep-routine-table">
                            <thead>
                              <tr>{['고객사','서비스','날짜','상태'].map(h => <th key={h}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                              {routines.map((r, i) => (
                                <tr key={r.id} style={{ borderBottom: i < routines.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                  <td>{r.customer}</td>
                                  <td className="text-3">{r.service}</td>
                                  <td className="text-3">{r.date}</td>
                                  <td><span className={`tag ${r.status === 'done' ? 'ok' : 'muted'}`} style={{ fontSize: 10 }}>{r.status === 'done' ? '완료' : '예정'}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                    <div className="rep-schedule-side" style={{ background: 'var(--bg-sub)' }}>
                      <div className="rep-schedule-head" style={{ borderBottom: 'none', background: 'transparent' }}>
                        <div>
                          <div className="page-eyebrow" style={{ marginBottom: 2 }}>{NEXT_WEEK_LABEL} · 다음 주</div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>일정 계획</div>
                        </div>
                        <span className="text-3" style={{ fontSize: 12 }}>{engSchedules.length}건</span>
                      </div>
                      <div className="rep-schedule-body">
                        {byDay.length === 0 ? (
                          <div className="rep-empty" style={{ fontSize: 12, color: 'var(--text-4)' }}>추가된 일정이 없습니다</div>
                        ) : (
                          byDay.map(({ day, items }) => (
                            <div key={day} className="rep-schedule-day">
                              <div className="rep-schedule-day-title">{day}</div>
                              <div className="rep-schedule-list">
                                {items.map(item => (
                                  <div key={item.id} className="rep-schedule-item">
                                    <TypeTag type={item.type}/>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.customer}</div>
                                      <div className="text-3" style={{ fontSize: 11, marginTop: 1 }}>{item.service} · {item.time} · {item.method}</div>
                                    </div>
                                    <button className="rep-schedule-remove" onClick={() => setAddedIds(ids => ids.filter(id => id !== item.id))}><Icon name="x" size={12}/></button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showPicker && (
        <div className="modal-backdrop">
          <div className="modal lg" onClick={e => e.stopPropagation()} style={{ width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-h">
              <div>
                <div className="modal-title">보고서 일정 추가</div>
                <div className="text-3" style={{ fontSize: 12, marginTop: 4, color: 'var(--text-3)' }}>{NEXT_WEEK_LABEL} · 캘린더 연동</div>
              </div>
              <button className="btn icon ghost" onClick={() => setShowPicker(false)}><Icon name="x" size={18}/></button>
            </div>
            <div className="scroll" style={{ flex: 1, padding: '20px 24px' }}>
              {events.length === 0 && (
                <div style={{ color: 'var(--text-4)', fontSize: 13, textAlign: 'center', padding: '40px 0', background: 'var(--bg-sub)', borderRadius: '12px', border: '1px dashed var(--border)' }}>
                  <Icon name="calendar" size={24} style={{ marginBottom: 8, display: 'block', margin: '0 auto', opacity: 0.5 }}/>
                  다음 주 등록된 일정이 없습니다.
                </div>
              )}
              {groupScheduleByDay(events).map(({ day, items }) => (
                <div key={day} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.05em', marginBottom: 10, textTransform: 'uppercase' }}>{day}</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {items.map(item => {
                      const checked = pickerSel.has(item.id);
                      return (
                        <label 
                          key={item.id} 
                          style={{ 
                            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: '12px', cursor: 'pointer', 
                            border: `1px solid ${checked ? 'var(--brand-300)' : 'var(--border)'}`, 
                            background: checked ? 'var(--brand-50)' : 'var(--bg-1)',
                            transition: 'all 0.2s'
                          }}
                        >
                          <input 
                            type="checkbox" 
                            checked={checked} 
                            onChange={() => togglePicker(item.id)} 
                            style={{ width: 16, height: 16, accentColor: 'var(--brand-500)' }}
                          />
                          <TypeTag type={item.type}/>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{item.customer}</div>
                            <div className="text-3" style={{ fontSize: 11, marginTop: 1, opacity: 0.8 }}>{item.service} · {item.time} · {item.method}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-foot" style={{ justifyContent: 'space-between' }}>
              <span className="text-3" style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand-600)' }}>{pickerSel.size}개 일정 선택됨</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn ghost" onClick={() => setShowPicker(false)}>취소</button>
                <button className="btn primary" onClick={confirmPicker}>보고서에 추가</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
