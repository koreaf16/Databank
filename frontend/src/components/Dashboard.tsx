/**
 * 파일: frontend/src/components/Dashboard.tsx
 * 역할: 홈 대시보드. 오늘 일정, 주간 KPI, 최근 지원이력 표시.
 *       기존 하드코딩 데이터를 Oracle API 연동 데이터로 전환.
 */

import React from 'react';
import { Icon } from './Icon.jsx';
import { getHomeSummary, getTodayEvents, getRecentHistory } from '../features/home/api/homeApi.js';
import { useUser } from '../contexts/UserContext.js';

export function Dashboard({ onNav, onChannel }) {
  const [filter, setFilter] = React.useState('team');
  const [summary, setSummary] = React.useState<any>(null);
  const [todayEvents, setTodayEvents] = React.useState([]);
  const [recentHistory, setRecentHistory] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  const me = useUser() || {};

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const userId = filter === 'me' ? me.id : undefined;
      const [s, events, hist] = await Promise.all([
        getHomeSummary(),
        getTodayEvents(userId),
        getRecentHistory(userId),
      ]);
      setSummary(s);
      setTodayEvents(events || []);
      setRecentHistory(hist || []);
    } catch (err) {
      console.error('대시보드 데이터를 불러오지 못했습니다.', err);
    } finally {
      setLoading(false);
    }
  }, [filter, me.id]);

  React.useEffect(() => { loadData(); }, [loadData]);

  const now = new Date();
  const dateStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

  return (
    <div className="page-pad scroll" style={{ height: '100%' }}>
      <div className="page-h">
        <div>
          <div className="page-eyebrow">{dateStr}</div>
          <h1 className="page-title">안녕하세요, {me.name}님 👋</h1>
          <div className="text-3" style={{ marginTop: 4 }}>
            {summary ? `오늘은 ${summary.todayEventCount}개의 일정이 있어요.` : '대시보드 데이터를 로딩 중입니다...'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={loadData} disabled={loading}>
            <Icon name="refresh" size={14}/> {loading ? '로딩 중...' : '새로고침'}
          </button>
          <button className="btn primary" onClick={() => onNav('cal')}>
            <Icon name="plus" size={14}/> 일정 등록
          </button>
        </div>
      </div>

      <div className="dash-grid">
        {/* KPI cards */}
        <div className="dash-kpis">
          <KpiCard
            label="오늘의 일정"
            value={summary?.todayEventCount ?? 0}
            unit="건"
            delta="오늘 전체"
            icon="calendar"
            onClick={() => onNav('cal')}
          />
          <KpiCard
            label="이번 주 지원"
            value={summary?.weekHistoryCount ?? 0}
            unit="건"
            delta="월요일부터 현재까지"
            icon="history"
            onClick={() => onNav('hist')}
          />
          <KpiCard
            label="미완료 점검"
            value={summary?.pendingWorkCount ?? 0}
            unit="건"
            delta="조치 필요"
            icon="flame"
            danger={Number(summary?.pendingWorkCount) > 0}
            onClick={() => onNav('mat')}
          />
          <KpiCard
            label="최근 리포트"
            value={recentHistory.length}
            unit="건"
            delta="최신 10건 기준"
            icon="report"
            onClick={() => onNav('rep')}
          />
        </div>

        {/* Today schedule */}
        <div className="card dash-today">
          <div className="card-h">
            <div>
              <h3>오늘의 일정</h3>
              <div className="text-3" style={{ fontSize: 12, marginTop: 2 }}>{dateStr}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Segment value={filter} onChange={setFilter} options={[{v:'team',l:'팀 전체'},{v:'me',l:'내 일정'}]}/>
              <button className="btn ghost sm" onClick={() => onNav('cal')}>일정표 보기 <Icon name="arrow-right" size={12}/></button>
            </div>
          </div>
          <div className="schedule-list">
            {todayEvents.length === 0 ? (
              <div className="dash-empty">오늘 예정된 일정이 없습니다.</div>
            ) : (
              todayEvents.map((s: any) => {
                const start = s.startAt ? new Date(s.startAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--';
                const end = s.endAt ? new Date(s.endAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--';
                return (
                  <div key={s.id} className="schedule-row">
                    <div className="sched-time">
                      <div className="sched-time-start">{start}</div>
                      <div className="sched-time-end">{end}</div>
                    </div>
                    <div className={'sched-bar type-' + s.eventType}/>
                    <div className="sched-body">
                      <div className="sched-title">
                        <span>{s.title}</span>
                      </div>
                      <div className="sched-meta">
                        <span>{s.customerName || '고객사 미지정'}</span>
                        <span className="sched-dot">·</span>
                        <span><Icon name={s.method === '방문' ? 'building' : 'video'} size={11}/> {s.method || '원격'}</span>
                      </div>
                    </div>
                    <TypeTag type={s.eventType}/>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent History */}
        <div className="card dash-recent">
          <div className="card-h">
            <h3>최근 지원 이력</h3>
            <button className="btn ghost sm" onClick={() => onNav('hist')}>전체 보기 <Icon name="arrow-right" size={12}/></button>
          </div>
          <div className="history-mini-list" style={{ display: 'grid', gap: 10, padding: 12 }}>
            {recentHistory.length === 0 ? (
              <div className="dash-empty">최근 지원 이력이 없습니다.</div>
            ) : (
              recentHistory.map((h: any) => (
                <div key={h.id} className="hist-mini-item" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{h.customerName}</div>
                    <div className="text-3" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.summary}</div>
                    <div className="text-4" style={{ fontSize: 11, marginTop: 4 }}>{new Date(h.startedAt).toLocaleDateString()} · {h.historyType}</div>
                  </div>
                  <span className={`tag xs ${h.status}`}>{h.status}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick links */}
        <div className="card quick-card">
          <h3 style={{ margin: 0, marginBottom: 10, fontSize: 13 }}>빠른 이동</h3>
          <button className="quick-btn" onClick={() => onNav('rep')}>
            <Icon name="report" size={18}/>
            <div>
              <div style={{ fontWeight: 600 }}>주간 보고서 작성</div>
              <div className="text-3" style={{ fontSize: 11 }}>이번 주 미작성 보고서 확인</div>
            </div>
            <Icon name="arrow-right" size={14}/>
          </button>
          <button className="quick-btn" onClick={() => onNav('kb')}>
            <Icon name="book" size={18}/>
            <div>
              <div style={{ fontWeight: 600 }}>지식베이스</div>
              <div className="text-3" style={{ fontSize: 11 }}>기술 문서 및 장애 사례 검색</div>
            </div>
            <Icon name="arrow-right" size={14}/>
          </button>
          <button className="quick-btn" onClick={() => onNav('mat')}>
            <Icon name="grid" size={18}/>
            <div>
              <div style={{ fontWeight: 600 }}>점검현황표</div>
              <div className="text-3" style={{ fontSize: 11 }}>상반기 정기점검 진척도</div>
            </div>
            <Icon name="arrow-right" size={14}/>
          </button>
        </div>

        {/* 내 작업 큐 (임시) */}
        <MyQueue me={me} />

      </div>
    </div>
  );
}

function MyQueue({ me }) {
  const items = [
    { icon: 'history',  label: '진행중 이력',         count: 0,  urgent: false, nav: 'hist' },
    { icon: 'at',       label: '응답 대기 멘션',       count: 0,  urgent: false, nav: 'msg'  },
    { icon: 'report',   label: '결재 대기 보고서',     count: 0,  urgent: false, nav: 'rep'  },
    { icon: 'alert-circle', label: 'SLA 임박 (1시간 이내)', count: 0, urgent: true,  nav: 'hist' },
  ];
  return (
    <div className="dash-queue">
      <div className="dash-queue-h">
        <span className="dash-queue-title">📌 내 작업 큐</span>
        <span className="text-3" style={{ fontSize: 11 }}>{me.name}</span>
      </div>
      {items.map(item => (
        <div
          key={item.label}
          className="dash-queue-item"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}
        >
          <Icon name={item.icon} size={14} style={{ color: item.urgent && item.count > 0 ? 'var(--err)' : 'var(--text-3)' }}/>
          <span className="dash-queue-label" style={{ flex: 1, fontSize: 13 }}>{item.label}</span>
          <span className={'dash-queue-count' + (item.count === 0 ? ' zero' : '')}>
            {item.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function KpiCard({ label, value, unit, delta, icon, danger, onClick }) {
  return (
    <button className={'card kpi-card' + (danger ? ' danger' : '')} onClick={onClick}>
      <div className="kpi-h">
        <div className={'kpi-icon' + (danger ? ' danger' : '')}><Icon name={icon} size={14}/></div>
        <div className="kpi-label">{label}</div>
      </div>
      <div className="kpi-num-row">
        <div className="kpi-num"><span className="kpi-val">{value}</span><span className="kpi-unit">{unit}</span></div>
      </div>
      {delta && <div className="kpi-delta">{delta}</div>}
    </button>
  );
}

export function Ring({ percent, size = 38 }) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="ring">
      <circle cx={size/2} cy={size/2} r={r} stroke="var(--border)" strokeWidth="3" fill="none"/>
      <circle cx={size/2} cy={size/2} r={r} stroke="var(--brand-500)" strokeWidth="3" fill="none"
              strokeDasharray={c} strokeDashoffset={c * (1 - percent/100)} strokeLinecap="round"
              transform={`rotate(-90 ${size/2} ${size/2})`}/>
    </svg>
  );
}

export function Segment({ value, onChange, options }) {
  return (
    <div className="seg">
      {options.map(o => (
        <button key={o.v} className={'seg-btn' + (value === o.v ? ' on' : '')} onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  );
}

export function TypeTag({ type }) {
  const map = { routine: '정기점검', tech: '기술지원', incident: '장애처리', meeting: '회의', install: '설치' };
  return <span className={'tag ' + type}>{map[type]}</span>;
}
