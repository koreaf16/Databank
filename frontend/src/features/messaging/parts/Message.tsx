import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { SlidePanel } from '../../../components/common/SlidePanel.jsx';
import { apiPost } from '../../../shared/api/apiClient.js';
import { useMasterData } from '../../../contexts/MasterDataContext.js';
import { useUser } from '../../../contexts/UserContext.js';
import { listTargets } from '../../metrics/api/metricsApi.js';
import { createReportFromHistory } from '../../weekly-report/api/weeklyReportApi.js';
import { ParsedResultTree } from './ParsedResultTree.js';

function highlightMentions(text: string, serviceMasters: any[], servers: any[] = []): React.ReactNode {
  const names = [
    ...serviceMasters.map((service: any) => service.name),
    ...servers.map((server: any) => server.serverName),
  ].filter(Boolean);
  if (!names.length) return text;

  const pattern = names.map(name => String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const parts = text.split(new RegExp(`@(${pattern})`, 'g'));
  return parts.map((part, index) => {
    if (index % 2 === 1) return <span key={index} className="svc-mention">@{part}</span>;
    return part;
  });
}

function looksOperationalRecord(text: string): boolean {
  const source = String(text || '');
  if (source.length < 160) return false;
  return /\[\s*\d+\.\s*(INSTANCE STATUS|SGA MEMORY|DATABASE SIZE|TABLESPACE USAGE|REPLICATION|OS DISK|RECENT ALERT)/i.test(source)
    || /\bORA[-\s]?\d{3,5}\b|Tablespace Name|Filesystem\s+Size\s+Used\s+Avail\s+Use%|SOURCE DB CURRENT LOG SEQUENCE/i.test(source);
}

function weekPayload(me: any) {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    teamId: me?.deptId ?? null,
    createdBy: me?.id ?? null,
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
  };
}

function autoTargetId(candidate: any, targets: any[]) {
  const dim = String(candidate.dimensionValue || '').toLowerCase();
  const raw = String(candidate.rawLabel || candidate.label || '').toLowerCase();
  const match = targets.find((target: any) => {
    const hay = `${target.name || ''} ${target.hostname || ''} ${target.description || ''}`.toLowerCase();
    return (dim && hay.includes(dim)) || (raw && hay.includes(raw));
  });
  return match?.targetId ?? null;
}

const TASK_CATEGORIES = ['routine', 'incident', 'install', 'investigation'];
const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

function TaskExtractPanel({ channelId, messageId, onClose, onRegistered }: any) {
  const { customers } = useMasterData();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [task, setTask] = React.useState<any>(null);
  const [confidence, setConfidence] = React.useState(0);

  React.useEffect(() => {
    setLoading(true);
    setError('');
    apiPost(`/api/channels/${channelId}/messages/${messageId}/extract-task`, {})
      .then((res: any) => {
        setTask(res.extracted);
        setConfidence(res.confidence ?? res.extracted?.confidence ?? 0);
      })
      .catch((err: any) => setError(err?.message || 'AI 작업카드 추출에 실패했습니다.'))
      .finally(() => setLoading(false));
  }, [channelId, messageId]);

  function setField(key: string, value: any) {
    setTask((current: any) => ({ ...current, [key]: value }));
  }

  function updateAction(index: number, patch: any) {
    setTask((current: any) => ({
      ...current,
      actions: (current.actions || []).map((action: any, i: number) => i === index ? { ...action, ...patch } : action),
    }));
  }

  function addAction() {
    setTask((current: any) => ({
      ...current,
      actions: [...(current.actions || []), { label: '', completed: false }],
    }));
  }

  async function handleRegister() {
    if (!task || saving) return;
    setSaving(true);
    setError('');
    try {
      await apiPost(`/api/channels/${channelId}/messages/${messageId}/extract-task/confirm`, { task });
      onRegistered?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || '작업카드 등록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>AI 분석 중...</div>;
  if (error && !task) return <PanelError error={error} onClose={onClose}/>;
  if (!task) return null;

  return (
    <div className="scroll" style={{ padding: '16px 20px 24px', display: 'grid', gap: 12, maxHeight: 'calc(100vh - 120px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={`tag ${confidence < 0.7 ? 'warn' : 'ok'} xs`}>신뢰도 {Math.round(confidence * 100)}%</span>
        {error && <span style={{ color: 'var(--err)', fontSize: 12 }}>{error}</span>}
      </div>

      <label className="form-label">
        <span>작업명</span>
        <input className="input sm" value={task.taskName || ''} onChange={event => setField('taskName', event.target.value)}/>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label className="form-label">
          <span>분류</span>
          <select className="input sm" value={task.category || 'routine'} onChange={event => setField('category', event.target.value)}>
            {TASK_CATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="form-label">
          <span>우선순위</span>
          <select className="input sm" value={task.priority || 'medium'} onChange={event => setField('priority', event.target.value)}>
            {TASK_PRIORITIES.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>

      <label className="form-label">
        <span>고객사</span>
        <select className="input sm" value={task.customerId ?? ''} onChange={event => setField('customerId', event.target.value ? Number(event.target.value) : null)}>
          <option value="">미지정</option>
          {customers.map((customer: any) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
        </select>
      </label>

      <label className="form-label">
        <span>서비스</span>
        <input className="input sm" value={task.serviceName || ''} onChange={event => setField('serviceName', event.target.value)}/>
      </label>

      <label className="form-label">
        <span>요약</span>
        <textarea className="input sm" rows={3} value={task.summary || ''} onChange={event => setField('summary', event.target.value)}/>
      </label>

      <div style={{ display: 'grid', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>후속 조치</span>
        {(task.actions || []).map((action: any, index: number) => (
          <label key={index} style={{ display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr)', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={Boolean(action.completed)} onChange={event => updateAction(index, { completed: event.target.checked })}/>
            <input className="input sm" value={action.label || ''} onChange={event => updateAction(index, { label: event.target.value })}/>
          </label>
        ))}
        <button className="btn ghost sm" onClick={addAction} style={{ justifySelf: 'start' }}><Icon name="plus" size={12}/> 항목 추가</button>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn ghost sm" onClick={onClose}>닫기</button>
        <button className="btn primary sm" onClick={handleRegister} disabled={saving || !task.taskName}>{saving ? '등록 중...' : '지원이력으로 등록'}</button>
      </div>
    </div>
  );
}

function OperationalRecordPanel({ channelId, messageId, onClose }: any) {
  const me = useUser();
  const { customers } = useMasterData();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [reporting, setReporting] = React.useState(false);
  const [error, setError] = React.useState('');
  const [parsed, setParsed] = React.useState<any>(null);
  const [metrics, setMetrics] = React.useState<any[]>([]);
  const [targets, setTargets] = React.useState<any[]>([]);
  const [customerId, setCustomerId] = React.useState<any>('');
  const [historyId, setHistoryId] = React.useState('');
  const [reportId, setReportId] = React.useState('');

  React.useEffect(() => {
    setLoading(true);
    setError('');
    apiPost(`/api/channels/${channelId}/messages/${messageId}/parse-operational`, {})
      .then((res: any) => {
        setParsed(res);
        setCustomerId(res?.historyDraft?.customerId ?? '');
        setMetrics((res.metricCandidates || []).map((metric: any) => ({ ...metric, selected: metric.selected !== false })));
      })
      .catch((err: any) => setError(err?.message || 'AI 운영기록 파싱에 실패했습니다.'))
      .finally(() => setLoading(false));
  }, [channelId, messageId]);

  React.useEffect(() => {
    if (!customerId) {
      setTargets([]);
      setMetrics(current => current.map(metric => ({ ...metric, targetId: null })));
      return;
    }

    let alive = true;
    listTargets({ customerId })
      .then(rows => {
        if (!alive) return;
        const targetRows = Array.isArray(rows) ? rows : [];
        const validTargetIds = new Set(targetRows.map((target: any) => String(target.targetId)));
        setTargets(targetRows);
        setMetrics(current => current.map(metric => ({
          ...metric,
          targetId: metric.targetId && validTargetIds.has(String(metric.targetId))
            ? metric.targetId
            : autoTargetId(metric, targetRows),
        })));
      })
      .catch(() => {
        if (!alive) return;
        setTargets([]);
      });

    return () => {
      alive = false;
    };
  }, [customerId]);

  function changeCustomer(nextCustomerId: any) {
    setCustomerId(nextCustomerId);
    setParsed((current: any) => current
      ? {
          ...current,
          historyDraft: {
            ...(current.historyDraft || {}),
            customerId: nextCustomerId ? Number(nextCustomerId) : null,
          },
        }
      : current);
    setHistoryId('');
    setReportId('');
  }

  function updateMetric(index: number, patch: any) {
    setMetrics(current => current.map((metric, i) => i === index ? { ...metric, ...patch } : metric));
  }

  async function handleRegister() {
    if (!parsed || saving) return;
    if (!customerId) {
      setError('고객사를 선택해야 이력등록이 가능합니다.');
      return;
    }
    const missing = metrics.filter(metric => metric.selected !== false && !metric.targetId);
    if (missing.length) {
      setError(`저장할 수치 ${missing.length}건의 모니터링 대상을 선택해야 합니다.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await apiPost(`/api/channels/${channelId}/messages/${messageId}/confirm-operational`, {
        parsed: {
          ...parsed,
          historyDraft: {
            ...(parsed.historyDraft || {}),
            customerId: Number(customerId),
          },
          metricCandidates: metrics,
        },
      });
      setHistoryId(result.historyId || '');
    } catch (err: any) {
      setError(err?.message || '이력등록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function handleReport() {
    if (!historyId || reporting) return;
    setReporting(true);
    setError('');
    try {
      const report = await createReportFromHistory({ historyId, ...weekPayload(me) });
      setReportId(String(report.id || ''));
    } catch (err: any) {
      setError(err?.message || '레포트 초안 생성에 실패했습니다.');
    } finally {
      setReporting(false);
    }
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>AI 분석 중...</div>;
  if (error && !parsed) return <PanelError error={error} onClose={onClose}/>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: 520 }}>
      <div style={{ padding: '14px 20px 10px', display: 'flex', gap: 6, alignItems: 'center', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 220 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>고객사</span>
          <select className="input sm" value={customerId ?? ''} onChange={event => changeCustomer(event.target.value)}>
            <option value="">선택 필요</option>
            {customers.map((customer: any) => (
              <option key={customer.id} value={customer.id}>{customer.name}</option>
            ))}
          </select>
        </label>
        <span className="tag info xs">{parsed?.documentKind || 'record'}</span>
        <span className="tag muted xs">신뢰도 {Math.round((parsed?.confidence ?? 0) * 100)}%</span>
        <span className="tag muted xs">대상 {targets.length}개</span>
        {historyId && <span className="tag ok xs">이력 {historyId}</span>}
        {reportId && <span className="tag ok xs">Report #{reportId}</span>}
        {error && <span style={{ color: 'var(--err)', fontSize: 12 }}>{error}</span>}
      </div>
      <div style={{ padding: 12, flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ParsedResultTree
          parsed={parsed}
          metrics={metrics}
          targets={targets}
          onMetricChange={updateMetric}
          compact
          height="100%"
        />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-elev)', flexShrink: 0 }}>
        <button className="btn ghost sm" onClick={onClose}>닫기</button>
        <button className="btn primary sm" onClick={handleRegister} disabled={saving || !!historyId}>{saving ? '등록 중...' : '이력등록 저장'}</button>
        <button className="btn brand sm" onClick={handleReport} disabled={!historyId || reporting || !!reportId}>{reporting ? '생성 중...' : '레포트 초안 생성'}</button>
      </div>
    </div>
  );
}

function PanelError({ error, onClose }: { error: string; onClose: () => void }) {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ color: 'var(--err)', marginBottom: 16 }}>{error}</div>
      <button className="btn sm ghost" onClick={onClose}>닫기</button>
    </div>
  );
}

export function Message({ m, svc, team, isOtherTeam, channelId, onOpenThread, onForward, servers = [] }: any) {
  const author = m.author || { name: 'Unknown', color: '#888', initial: '?' };
  const [showTask, setShowTask] = React.useState(false);
  const [showOperational, setShowOperational] = React.useState(false);
  const { serviceMasters } = useMasterData();
  const isOperational = looksOperationalRecord(m.text || m.content || '');

  return (
    <div className={'msg' + (m.mention ? ' has-mention' : '') + (m.isBot ? ' bot' : '') + (isOtherTeam ? ' other-team' : '')}>
      <div className="msg-avatar avatar lg" style={{ background: author.color }}>{author.initial}</div>
      <div className="msg-body">
        <div className="msg-h">
          <span className="msg-name">{author.name}</span>
          {m.isBot && <span className="tag muted" style={{ fontSize: 10, padding: '1px 6px' }}>BOT</span>}
          {team && <span className="msg-team-tag" style={{ '--team': team.color } as any}>{team.name}</span>}
          {svc && <span className="msg-svc-tag">@{svc.name}</span>}
          <span className="msg-time">{m.time}</span>
        </div>

        <div className="msg-text">
          {(m.text || '').split('\n').map((line: string, index: number) => (
            <React.Fragment key={index}>
              {index > 0 && <br/>}
              {highlightMentions(line, serviceMasters, servers)}
            </React.Fragment>
          ))}
        </div>

        {m.attachment && <Attachment a={m.attachment}/>}

        {isOperational && (
          <button
            className="atch history"
            style={{ marginTop: 8, width: '100%', textAlign: 'left', cursor: 'pointer' }}
            onClick={() => setShowOperational(true)}
          >
            <div className="atch-icon"><Icon name="sparkles" size={16}/></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="atch-title">AI 운영기록 파싱 가능</div>
              <div className="atch-meta">점검 수치, 이력등록 초안, 레포트 초안을 트리로 검토할 수 있습니다.</div>
            </div>
            <span className="tag info xs">AI</span>
          </button>
        )}

        {m.reactions && m.reactions.length > 0 && (
          <div className="msg-reacts">
            {m.reactions.map((reaction: any, index: number) => (
              <button key={index} className="react"><span>{reaction.e}</span> <span>{reaction.count}</span></button>
            ))}
            <button className="react add"><Icon name="plus" size={11}/></button>
          </div>
        )}

        {m.thread > 0 && (
          <button className="msg-thread" onClick={() => onOpenThread(m)}>
            <Icon name="thread" size={13}/> Thread {m.thread}
          </button>
        )}
      </div>

      <div className="msg-actions">
        <button title="Emoji"><Icon name="smile" size={14}/></button>
        <button title="Thread" onClick={() => onOpenThread(m)}><Icon name="thread" size={14}/></button>
        <button className="msg-act-btn" title="AI 작업카드 추출" onClick={() => setShowTask(true)}>
          <Icon name="sparkles" size={13}/> 작업카드
        </button>
        {isOperational && (
          <button className="msg-act-btn" title="AI 운영기록 파싱" onClick={() => setShowOperational(true)}>
            <Icon name="report" size={13}/> 운영기록
          </button>
        )}
        <button className="msg-act-btn" title="채널로 공유" onClick={() => onForward?.(m)}>
          <Icon name="share" size={13}/> 공유
        </button>
        <button title="More"><Icon name="more-h" size={14}/></button>
      </div>

      <SlidePanel open={showTask} onClose={() => setShowTask(false)} title="작업카드 추출" width={440}>
        {showTask && (
          <TaskExtractPanel
            channelId={channelId}
            messageId={m.id}
            onClose={() => setShowTask(false)}
            onRegistered={() => setShowTask(false)}
          />
        )}
      </SlidePanel>

      <SlidePanel open={showOperational} onClose={() => setShowOperational(false)} title="운영기록 AI 파싱" width={760}>
        {showOperational && (
          <OperationalRecordPanel
            channelId={channelId}
            messageId={m.id}
            onClose={() => setShowOperational(false)}
          />
        )}
      </SlidePanel>
    </div>
  );
}

function Attachment({ a }: any) {
  if (a.kind === 'report') {
    return (
      <div className="atch report">
        <div className="atch-icon"><Icon name="report" size={16}/></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="atch-title">{a.title}</div>
          <div className="atch-meta">{a.meta}</div>
        </div>
        <span className="tag install">{a.metric}</span>
        <button className="btn sm ghost"><Icon name="download" size={12}/></button>
      </div>
    );
  }
  if (a.kind === 'history') {
    return (
      <div className="atch history">
        <div className="atch-icon"><Icon name="history" size={16}/></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="atch-title">{a.title}</div>
          <div className="atch-meta">{a.meta}</div>
        </div>
        <button className="btn sm ghost">상세 <Icon name="arrow-right" size={11}/></button>
      </div>
    );
  }
  return null;
}
