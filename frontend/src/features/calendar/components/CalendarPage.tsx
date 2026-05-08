/**
 * 파일: frontend/src/features/calendar/components/CalendarPage.tsx
 * 역할: FullCalendar 기반 일정관리. 월/주/일 보기, 생성/수정/삭제, 드래그 이동, 리사이즈, 반복/알림 지원.
 */

import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import koLocale from '@fullcalendar/core/locales/ko';
import { Icon } from '../../../components/Icon.jsx';
import { Segment } from '../../../components/Dashboard.jsx';
import { CustomerCombobox } from '../../../components/common/CustomerCombobox.jsx';
import { useToast } from '../../../components/common/Toast.jsx';
import {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  editEventOccurrence,
  deleteEventOccurrence,
} from '../api/calendarApi.js';
import { getCustomers } from '../../customers/api/customersApi.js';
import { getUsers } from '../../organization/api/orgApi.js';
import { useUser } from '../../../contexts/UserContext.js';

const TYPE_OPTIONS = [
  { v: 'routine', l: '정기' },
  { v: 'tech', l: '기술지원' },
  { v: 'incident', l: '장애' },
  { v: 'meeting', l: '회의' },
  { v: 'install', l: '설치' },
];

const COLOR_OPTIONS = ['#356bf0', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9', '#64748b'];
const METHOD_OPTIONS = ['', '방문', '원격', '회의', '전화'];
const WEEKDAY_OPTIONS = [
  { v: 'MO', l: '월' }, { v: 'TU', l: '화' }, { v: 'WE', l: '수' }, { v: 'TH', l: '목' },
  { v: 'FR', l: '금' }, { v: 'SA', l: '토' }, { v: 'SU', l: '일' },
];
const VIEW_OPTIONS = [
  { v: 'dayGridMonth', l: '월' },
  { v: 'timeGridWeek', l: '주' },
  { v: 'timeGridDay', l: '일' },
];
const TYPE_COLOR = {
  routine: '#356bf0',
  tech: '#f59e0b',
  incident: '#ef4444',
  meeting: '#8b5cf6',
  install: '#10b981',
};

function pad(n) { return String(n).padStart(2, '0'); }
function dateOnly(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function timeOnly(date) { return `${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function localIsoMinute(date) { return `${dateOnly(date)}T${timeOnly(date)}`; }
function parseLocal(value) {
  const text = String(value || '').slice(0, 16);
  const [d, t = '00:00'] = text.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [h, min] = t.split(':').map(Number);
  return new Date(y, m - 1, day, h || 0, min || 0, 0, 0);
}
function addDays(date, days) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function isoDateTime(date, time) { return `${date}T${time || '00:00'}`; }
function eventBaseId(raw) { return String(raw?.baseId || raw?.recurrenceMasterId || raw?.id || '').split('::')[0]; }
function isRecurringOccurrence(raw) { return Boolean(raw?.recurrenceInstance && raw?.recurrenceOriginalStart); }
function isRecurringEditable(raw) { return isRecurringOccurrence(raw) || Boolean(raw?.recurrenceRule); }
function participantId(participant) { return String(participant?.userId ?? participant?.id ?? participant ?? ''); }
function normalizeParticipantIds(participants) {
  return [...new Set((Array.isArray(participants) ? participants : []).map(participantId).filter(Boolean))];
}
function defaultParticipantIds(source, meId?: string | number) {
  const participants = normalizeParticipantIds(source?.participants);
  if (participants.length > 0) return participants;
  const ownerId = source?.createdBy ?? meId;
  return ownerId == null || ownerId === '' ? [] : [String(ownerId)];
}
function defaultWeekday(dateText) {
  const d = parseLocal(`${dateText}T00:00`);
  return ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d.getDay()];
}
function displayRangeLabel(startAt, endAt, allDay) {
  if (!startAt || !endAt) return '';
  if (allDay) {
    const start = startAt.slice(0, 10);
    const end = dateOnly(addDays(parseLocal(endAt), -1));
    return start === end ? start : `${start} ~ ${end}`;
  }
  return `${startAt.slice(0, 10)} ${startAt.slice(11, 16)} ~ ${endAt.slice(11, 16)}`;
}
function toFullCalendarEvent(row) {
  const color = row.color || TYPE_COLOR[row.eventType] || '#356bf0';
  return {
    id: String(row.id),
    title: row.title,
    start: row.startAt,
    end: row.endAt,
    allDay: Boolean(row.allDay),
    backgroundColor: color,
    borderColor: color,
    extendedProps: { raw: row },
  };
}
function buildDateState(source) {
  const start = source?.startAt ? parseLocal(source.startAt) : new Date();
  const end = source?.endAt ? parseLocal(source.endAt) : new Date(start.getTime() + 60 * 60000);
  const allDay = Boolean(source?.allDay);
  return {
    startDate: dateOnly(start),
    startTime: timeOnly(start),
    endDate: allDay ? dateOnly(addDays(end, -1)) : dateOnly(end),
    endTime: timeOnly(end),
  };
}
function normalizeRecurrenceToForm(rule, startDate) {
  if (!rule) {
    return { recurrenceFreq: 'none', interval: 1, byWeekday: [defaultWeekday(startDate)], ends: 'never', until: '', count: 10 };
  }
  return {
    recurrenceFreq: rule.freq || 'weekly',
    interval: rule.interval || 1,
    byWeekday: Array.isArray(rule.byWeekday) && rule.byWeekday.length ? rule.byWeekday : [defaultWeekday(startDate)],
    ends: rule.ends || (rule.until ? 'until' : rule.count ? 'count' : 'never'),
    until: rule.until || '',
    count: rule.count || 10,
  };
}

function EventModal({ mode, source, customerOptions, userOptions, defaultRange, onClose, onSave, onDelete }) {
  const me = useUser();
  const initial = source || defaultRange || {};
  const dates = buildDateState(initial);
  const recurrence = normalizeRecurrenceToForm(source?.recurrenceRule, dates.startDate);
  const recurring = isRecurringEditable(source);

  const [form, setForm] = React.useState({
    title: source?.title || '',
    eventType: source?.eventType || 'meeting',
    customerId: source?.customerId ? String(source.customerId) : (defaultRange?.customerId ? String(defaultRange.customerId) : null),
    serviceName: source?.serviceName || '',
    method: source?.method || '',
    location: source?.location || '',
    color: source?.color || TYPE_COLOR[source?.eventType] || '#356bf0',
    reminderMinutes: source?.reminderMinutes ?? '',
    memo: source?.memo || '',
    allDay: Boolean(source?.allDay || defaultRange?.allDay),
    startDate: dates.startDate,
    startTime: dates.startTime,
    endDate: dates.endDate,
    endTime: dates.endTime,
    participants: defaultParticipantIds(source, me?.id),
    scope: recurring ? 'single' : 'all',
    ...recurrence,
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function up(key, value) { setForm(prev => ({ ...prev, [key]: value })); }
  function toggleWeekday(day) {
    setForm(prev => {
      const set = new Set(prev.byWeekday || []);
      set.has(day) ? set.delete(day) : set.add(day);
      return { ...prev, byWeekday: [...set] };
    });
  }
  function toggleParticipant(userId) {
    const id = String(userId);
    setForm(prev => {
      const current = Array.isArray(prev.participants) ? prev.participants : [];
      const next = current.includes(id)
        ? current.filter(value => value !== id)
        : [...current, id];
      return { ...prev, participants: next };
    });
  }
  function payload() {
    const startAt = form.allDay ? `${form.startDate}T00:00` : isoDateTime(form.startDate, form.startTime);
    const endAt = form.allDay ? `${dateOnly(addDays(parseLocal(`${form.endDate}T00:00`), 1))}T00:00` : isoDateTime(form.endDate, form.endTime);
    const recurrenceRule = form.recurrenceFreq === 'none' ? null : {
      freq: form.recurrenceFreq,
      interval: Math.max(1, Number(form.interval) || 1),
      ...(form.recurrenceFreq === 'weekly' && { byWeekday: form.byWeekday?.length ? form.byWeekday : [defaultWeekday(form.startDate)] }),
      ...(form.recurrenceFreq === 'monthly' && { byMonthDay: Number(form.startDate.slice(8, 10)) }),
      ends: form.ends,
      ...(form.ends === 'until' && form.until && { until: form.until }),
      ...(form.ends === 'count' && { count: Math.max(1, Number(form.count) || 1) }),
    };
    return {
      title: form.title.trim(),
      eventType: form.eventType,
      customerId: form.customerId || null,
      serviceName: form.serviceName.trim() || null,
      method: form.method || null,
      location: form.location.trim() || null,
      color: form.color || TYPE_COLOR[form.eventType] || '#356bf0',
      reminderMinutes: form.reminderMinutes === '' ? null : Number(form.reminderMinutes),
      memo: form.memo.trim() || null,
      allDay: form.allDay,
      startAt,
      endAt,
      participants: (form.participants || []).map(id => Number(id)).filter(id => Number.isFinite(id)),
      recurrenceRule,
    };
  }
  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try { await onSave(payload(), form.scope); }
    finally { setSaving(false); }
  }

  const title = mode === 'create' ? '새 일정' : '일정 상세';
  const rangeLabel = displayRangeLabel(source?.startAt || defaultRange?.startAt, source?.endAt || defaultRange?.endAt, form.allDay);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal cal-modal" onMouseDown={e => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-h">
          <div>
            <div className="modal-title">{title}</div>
            <div className="text-3" style={{ fontSize: 12, marginTop: 3 }}>{rangeLabel}</div>
          </div>
          <button type="button" className="btn icon ghost" onClick={onClose}><Icon name="x" size={16}/></button>
        </div>

        <div className="modal-body cal-modal-body" style={{ padding: '24px', maxHeight: '72vh', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gap: 24 }}>
            {/* 제목 및 유형 섹션 */}
            <div style={{ display: 'grid', gap: 16 }}>
              <label className="form-label">
                <span>일정 제목 *</span>
                <input className="input" autoFocus value={form.title} onChange={e => up('title', e.target.value)} placeholder="무엇을 할 계획인가요?" required style={{ fontSize: 16, fontWeight: 600, height: 44 }}/>
              </label>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <label className="form-label">
                  <span>유형</span>
                  <select className="input" value={form.eventType} onChange={e => { up('eventType', e.target.value); up('color', TYPE_COLOR[e.target.value] || form.color); }}>
                    {TYPE_OPTIONS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                  </select>
                </label>
                <label className="form-label">
                  <span>색상 테마</span>
                  <div className="cal-color-row" style={{ display: 'flex', gap: 8, height: 36, alignItems: 'center' }}>
                    {COLOR_OPTIONS.map(color => (
                      <button key={color} type="button" 
                        className={'cal-color-dot' + (form.color === color ? ' on' : '')} 
                        style={{ background: color, width: 22, height: 22, borderRadius: '50%', border: form.color === color ? '2px solid var(--text-1)' : 'none', cursor: 'pointer', transition: 'all 0.2s' }} 
                        onClick={() => up('color', color)}
                      />
                    ))}
                  </div>
                </label>
              </div>
            </div>

            {/* 시간 설정 섹션 */}
            <div style={{ padding: '20px', background: 'var(--bg-sub)', borderRadius: '12px', border: '1px solid var(--border)', display: 'grid', gap: 16 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 4 }}>
                <input type="checkbox" checked={form.allDay} onChange={e => up('allDay', e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--brand-500)' }}/>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>종일 일정</span>
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: form.allDay ? '1fr 1fr' : '1fr 100px 1fr 100px', gap: 12, alignItems: 'end' }}>
                <label className="form-label">
                  <span>시작일</span>
                  <input className="input" type="date" value={form.startDate} onChange={e => up('startDate', e.target.value)}/>
                </label>
                {!form.allDay && (
                  <label className="form-label">
                    <span>시간</span>
                    <input className="input" type="time" value={form.startTime} onChange={e => up('startTime', e.target.value)}/>
                  </label>
                )}
                <label className="form-label">
                  <span>종료일</span>
                  <input className="input" type="date" value={form.endDate} onChange={e => up('endDate', e.target.value)}/>
                </label>
                {!form.allDay && (
                  <label className="form-label">
                    <span>시간</span>
                    <input className="input" type="time" value={form.endTime} onChange={e => up('endTime', e.target.value)}/>
                  </label>
                )}
              </div>
            </div>

            {/* 비즈니스 정보 섹션 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <label className="form-label">
                <span>고객사 (선택)</span>
                <CustomerCombobox value={form.customerId} onChange={v => up('customerId', v)} options={customerOptions} placeholder="고객사 선택" style={{ width: '100%' }}/>
              </label>
              <label className="form-label">
                <span>진행 방식</span>
                <select className="input" value={form.method} onChange={e => up('method', e.target.value)}>
                  {METHOD_OPTIONS.map(v => <option key={v || 'none'} value={v}>{v || '미지정'}</option>)}
                </select>
              </label>
              <label className="form-label">
                <span>업무/서비스 명</span>
                <input className="input" value={form.serviceName} onChange={e => up('serviceName', e.target.value)} placeholder="예: DB 정기점검"/>
              </label>
              <label className="form-label">
                <span>장소/위치</span>
                <input className="input" value={form.location} onChange={e => up('location', e.target.value)} placeholder="온라인, 회의실 등"/>
              </label>
            </div>

            {/* 참여 직원 섹션 */}
            <div className="form-label">
              <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-3)', marginBottom: 12, display: 'block' }}>참여 직원 선택</span>
              <div style={{ padding: '12px', background: 'var(--bg-sub)', borderRadius: '10px', border: '1px solid var(--border)', maxHeight: 120, overflowY: 'auto' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {userOptions.map(user => {
                    const checked = form.participants.includes(user.value);
                    return (
                      <button 
                        key={user.value} 
                        type="button"
                        onClick={() => toggleParticipant(user.value)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: '6px',
                          border: '1px solid var(--border)', background: checked ? 'var(--brand-50)' : 'var(--bg-1)',
                          borderColor: checked ? 'var(--brand-300)' : 'var(--border)',
                          fontSize: 12, cursor: 'pointer', transition: 'all 0.2s'
                        }}
                      >
                        <span style={{ color: checked ? 'var(--brand-700)' : 'var(--text-2)', fontWeight: checked ? 700 : 400 }}>{user.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 반복 및 알림 섹션 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '16px', background: 'var(--bg-sub)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <label className="form-label">
                <span>반복 설정</span>
                <select className="input" value={form.recurrenceFreq} onChange={e => up('recurrenceFreq', e.target.value)}>
                  <option value="none">반복 없음</option>
                  <option value="daily">매일</option>
                  <option value="weekly">매주</option>
                  <option value="monthly">매월</option>
                </select>
              </label>
              <label className="form-label">
                <span>알림 설정</span>
                <select className="input" value={form.reminderMinutes} onChange={e => up('reminderMinutes', e.target.value)}>
                  <option value="">알림 없음</option>
                  <option value="0">시작 시</option>
                  <option value="5">5분 전</option>
                  <option value="30">30분 전</option>
                  <option value="60">1시간 전</option>
                  <option value="1440">1일 전</option>
                </select>
              </label>
              
              {form.recurrenceFreq !== 'none' && (
                <>
                  <label className="form-label">
                    <span>반복 간격 (일/주/월)</span>
                    <input className="input" type="number" min="1" value={form.interval} onChange={e => up('interval', e.target.value)}/>
                  </label>
                  <label className="form-label">
                    <span>반복 종료 조건</span>
                    <select className="input" value={form.ends} onChange={e => up('ends', e.target.value)}>
                      <option value="never">계속 반복</option>
                      <option value="until">특정 날짜까지</option>
                      <option value="count">특정 횟수만큼</option>
                    </select>
                  </label>
                  {form.recurrenceFreq === 'weekly' && (
                    <div className="form-label" style={{ gridColumn: 'span 2' }}>
                      <span>반복 요일</span>
                      <div className="cal-weekday-row" style={{ display: 'flex', gap: 6 }}>
                        {WEEKDAY_OPTIONS.map(day => (
                          <button key={day.v} type="button" 
                            className={'cal-weekday' + (form.byWeekday?.includes(day.v) ? ' on' : '')} 
                            style={{ 
                              flex: 1, height: 32, borderRadius: '6px', border: '1px solid var(--border)',
                              background: form.byWeekday?.includes(day.v) ? 'var(--brand-500)' : 'var(--bg-1)',
                              color: form.byWeekday?.includes(day.v) ? '#fff' : 'var(--text-2)',
                              fontWeight: 600, cursor: 'pointer'
                            }} 
                            onClick={() => toggleWeekday(day.v)}>{day.l}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {mode !== 'create' && recurring && (
              <label className="form-label" style={{ padding: '12px 16px', background: 'rgba(255, 150, 0, 0.05)', borderRadius: '8px', border: '1px solid rgba(255, 150, 0, 0.2)' }}>
                <span style={{ color: '#b45309', fontWeight: 700 }}>⚠️ 반복 일정 수정 범위</span>
                <select className="input" value={form.scope} onChange={e => up('scope', e.target.value)} style={{ marginTop: 8 }}>
                  <option value="single">현재 선택된 일정만 수정</option>
                  <option value="following">이 일정 및 향후 전체 일정 수정</option>
                  <option value="all">과거 포함 전체 반복 일정 수정</option>
                </select>
              </label>
            )}

            <label className="form-label">
              <span>상세 메모</span>
              <textarea className="input" rows={3} value={form.memo} onChange={e => up('memo', e.target.value)} placeholder="일정과 관련된 특이사항이나 메모를 입력하세요." style={{ resize: 'vertical' }}/>
            </label>
          </div>
        </div>

        <div className="modal-foot" style={{ justifyContent: mode === 'create' ? 'flex-end' : 'space-between' }}>
          {mode !== 'create' && <button type="button" className="btn danger" onClick={() => onDelete(form.scope)}><Icon name="trash" size={13}/> 삭제</button>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" onClick={onClose}>취소</button>
            <button type="submit" className="btn primary" disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function Calendar({ fromChannel }) {
  const toast = useToast();
  const me = useUser();
  const calendarRef = React.useRef(null);
  const [events, setEvents] = React.useState([]);
  const [customers, setCustomers] = React.useState([]);
  const [users, setUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [view, setView] = React.useState('timeGridWeek');
  const [title, setTitle] = React.useState('');
  const [range, setRange] = React.useState(null);
  const [custFilter, setCustFilter] = React.useState(null);
  const [typeFilter, setTypeFilter] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [myOnly, setMyOnly] = React.useState(false);
  const [calCtxDismissed, setCalCtxDismissed] = React.useState(true);
  const [modal, setModal] = React.useState(null);

  React.useEffect(() => {
    getCustomers(false).then(rows => setCustomers(Array.isArray(rows) ? rows : [])).catch(() => {});
    getUsers().then(rows => setUsers(Array.isArray(rows) ? rows : [])).catch(() => {});
  }, []);

  const customerOptions = React.useMemo(() => customers.map(c => ({ value: String(c.id), label: c.customerMain })), [customers]);
  const userOptions = React.useMemo(() => users.map(user => ({
    value: String(user.id),
    label: [user.name, user.department].filter(Boolean).join(' · '),
  })), [users]);

  const loadEvents = React.useCallback(() => {
    if (!range) return Promise.resolve();
    setLoading(true);
    const params = { from: range.from, to: range.to };
    if (custFilter) params.customerId = custFilter;
    if (myOnly && me?.id) params.engineerId = me.id;
    return getEvents(params)
      .then(rows => setEvents(Array.isArray(rows) ? rows : []))
      .catch(() => {
        setEvents([]);
        toast?.('일정을 불러오지 못했습니다', 'error');
      })
      .finally(() => setLoading(false));
  }, [range, custFilter, myOnly, me?.id, toast]);

  React.useEffect(() => { loadEvents(); }, [loadEvents]);

  const visibleEvents = React.useMemo(() => {
    let list = events;
    if (typeFilter) list = list.filter(e => e.eventType === typeFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(e => [e.title, e.customerName, e.serviceName, e.memo, e.location].some(v => String(v || '').toLowerCase().includes(q)));
    }
    if (fromChannel && !calCtxDismissed && fromChannel.customerId) {
      list = list.filter(e => String(e.customerId) === String(fromChannel.customerId));
    }
    return list.map(toFullCalendarEvent);
  }, [events, typeFilter, query, fromChannel, calCtxDismissed]);

  function changeView(nextView) {
    setView(nextView);
    calendarRef.current?.getApi().changeView(nextView);
  }
  function move(command) {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api[command]();
  }
  function openCreateAtNow() {
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 30) * 30, 0, 0);
    const end = new Date(now.getTime() + 60 * 60000);
    const ctxCustomerId = fromChannel?.customerId && !calCtxDismissed ? String(fromChannel.customerId) : null;
    setModal({ mode: 'create', defaultRange: { startAt: localIsoMinute(now), endAt: localIsoMinute(end), allDay: false, customerId: ctxCustomerId } });
  }
  function handleDatesSet(arg) {
    const endInclusive = addDays(arg.end, -1);
    setRange({ from: dateOnly(arg.start), to: dateOnly(endInclusive) });
    setTitle(arg.view.title);
    setView(arg.view.type);
  }
  function handleSelect(info) {
    const end = info.allDay ? info.end : info.end || new Date(info.start.getTime() + 60 * 60000);
    const ctxCustomerId = fromChannel?.customerId && !calCtxDismissed ? String(fromChannel.customerId) : null;
    setModal({ mode: 'create', defaultRange: { startAt: localIsoMinute(info.start), endAt: localIsoMinute(end), allDay: info.allDay, customerId: ctxCustomerId } });
    calendarRef.current?.getApi().unselect();
  }
  function handleEventClick(info) {
    const raw = info.event.extendedProps.raw;
    setModal({ mode: 'edit', source: raw });
  }
  async function persistMoveOrResize(info) {
    const raw = info.event.extendedProps.raw;
    const changes = {
      startAt: localIsoMinute(info.event.start),
      endAt: localIsoMinute(info.event.end || new Date(info.event.start.getTime() + 60 * 60000)),
      allDay: info.event.allDay,
    };
    try {
      if (isRecurringOccurrence(raw)) {
        await editEventOccurrence(eventBaseId(raw), { originalStart: raw.recurrenceOriginalStart, scope: 'single', changes });
      } else {
        await updateEvent(raw.id, changes);
      }
      await loadEvents();
    } catch {
      info.revert();
      toast?.('일정 변경을 저장하지 못했습니다', 'error');
    }
  }
  async function saveModal(payload, scope) {
    try {
      if (modal.mode === 'create') {
        await createEvent(payload);
        toast?.('일정을 만들었습니다', 'success');
      } else if (isRecurringEditable(modal.source)) {
        await editEventOccurrence(eventBaseId(modal.source), {
          originalStart: modal.source.recurrenceOriginalStart || modal.source.startAt,
          scope,
          changes: payload,
        });
        toast?.('반복 일정을 수정했습니다', 'success');
      } else {
        await updateEvent(modal.source.id, payload);
        toast?.('일정을 수정했습니다', 'success');
      }
      setModal(null);
      await loadEvents();
    } catch (err: any) {
      toast?.(err?.message || '저장에 실패했습니다', 'error');
    }
  }
  async function removeModal(scope) {
    if (!modal?.source) return;
    const message = isRecurringEditable(modal.source) && scope !== 'single'
      ? '선택한 반복 범위의 일정을 삭제할까요?'
      : '이 일정을 삭제할까요?';
    if (!window.confirm(message)) return;
    try {
      if (isRecurringEditable(modal.source)) {
        await deleteEventOccurrence(eventBaseId(modal.source), { originalStart: modal.source.recurrenceOriginalStart || modal.source.startAt, scope });
      } else {
        await deleteEvent(modal.source.id);
      }
      toast?.('일정을 삭제했습니다', 'success');
      setModal(null);
      await loadEvents();
    } catch {
      toast?.('일정을 삭제하지 못했습니다', 'error');
    }
  }

  return (
    <div className="cal-page">
      {fromChannel && fromChannel.customerId && (
        <div className="ctx-bar">
          <span className="ctx-bar-icon">🔗</span>
          <span><b>{fromChannel.name}</b> 고객사 일정만 보기</span>
          <button className="ctx-bar-dismiss" onClick={() => setCalCtxDismissed(v => !v)}>
            {calCtxDismissed ? '고객사 필터 적용' : '전체 보기'}
          </button>
        </div>
      )}

      <div className="page-pad cal-head-pad">
        <div className="page-h cal-page-h">
          <div>
            <div className="page-eyebrow">{title || '일정'}</div>
            <h1 className="page-title">일정관리</h1>
          </div>
          <div className="cal-toolbar">
            <label className="cal-inline-check"><input type="checkbox" checked={myOnly} onChange={e => setMyOnly(e.target.checked)}/> 내 일정만</label>
            <button className="btn icon" onClick={() => move('prev')}><Icon name="chevron-left" size={14}/></button>
            <button className="btn" onClick={() => move('today')}>오늘</button>
            <button className="btn icon" onClick={() => move('next')}><Icon name="chevron-right" size={14}/></button>
            <Segment value={view} onChange={changeView} options={VIEW_OPTIONS}/>
            <button className="btn primary" onClick={openCreateAtNow}><Icon name="plus" size={14}/> 새 일정</button>
          </div>
        </div>
        <div className="cal-filters">
          <div style={{ position: 'relative' }}>
            <Icon name="search" size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }}/>
            <input className="input sm" placeholder="일정 검색…" value={query} onChange={e => setQuery(e.target.value)} style={{ paddingLeft: 28, width: 180 }}/>
          </div>
          <CustomerCombobox value={custFilter} onChange={setCustFilter} options={customerOptions} placeholder="전체 고객사" style={{ width: 170 }}/>
          <select className="input sm" style={{ height: 32, fontSize: 12, width: 120 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">전체 유형</option>
            {TYPE_OPTIONS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
          {loading && <span className="text-3" style={{ fontSize: 12 }}>불러오는 중…</span>}
        </div>
      </div>

      <div className="cal-full-wrap">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          locale={koLocale}
          initialView="timeGridWeek"
          headerToolbar={false}
          height="100%"
          firstDay={1}
          nowIndicator
          selectable
          selectMirror
          editable
          eventResizableFromStart={false}
          allDaySlot
          slotMinTime="00:00:00"
          slotMaxTime="24:00:00"
          slotDuration="00:30:00"
          snapDuration="00:15:00"
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          dayMaxEvents
          events={visibleEvents}
          datesSet={handleDatesSet}
          select={handleSelect}
          eventClick={handleEventClick}
          eventDrop={persistMoveOrResize}
          eventResize={persistMoveOrResize}
          eventContent={(arg) => (
            <div className="cal-fc-event-inner">
              <b>{arg.timeText}</b>
              <span>{arg.event.title}</span>
              {arg.event.extendedProps.raw?.customerName && <small>{arg.event.extendedProps.raw.customerName}</small>}
            </div>
          )}
        />
      </div>

      {modal && (
        <EventModal
          mode={modal.mode}
          source={modal.source}
          defaultRange={modal.defaultRange}
          customerOptions={customerOptions}
          userOptions={userOptions}
          onClose={() => setModal(null)}
          onSave={saveModal}
          onDelete={removeModal}
        />
      )}
    </div>
  );
}
