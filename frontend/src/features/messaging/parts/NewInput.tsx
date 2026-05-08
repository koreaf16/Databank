import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { parseHistoryText, createHistory } from '../../support-history/api/historyApi.js';
import { listTargets } from '../../metrics/api/metricsApi.js';
import { createReportFromHistory } from '../../weekly-report/api/weeklyReportApi.js';
import { useUser } from '../../../contexts/UserContext.js';
import { useMasterData } from '../../../contexts/MasterDataContext.js';
import { ParsedResultTree } from './ParsedResultTree.js';

function toTimelineValue(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return match ? `${match[1]}T${match[2]}` : undefined;
}

function buildTimeline(draft: any) {
  const supportStartedAt = toTimelineValue(draft.startTime);
  const supportEndedAt = toTimelineValue(draft.endTime);
  return {
    ...(supportStartedAt ? { supportStartedAt } : {}),
    ...(supportEndedAt ? { supportEndedAt } : {}),
  };
}

function normalizePriority(priority: string | null | undefined): string {
  return ['p1', 'p2', 'p3', 'p4'].includes(String(priority)) ? String(priority) : 'p3';
}

function currentWeekPayload(me: any) {
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

function prepareMetrics(metrics: any[] = [], targets: any[] = [], serverGroups: any[] = []) {
  const groupTargetMap = new Map(
    serverGroups
      .filter(group => group?.serverKey && group?.matchedTargetId)
      .map(group => [String(group.serverKey), group.matchedTargetId]),
  );
  const grouped = serverGroups.length > 0;
  return metrics.map(metric => ({
    ...metric,
    selected: metric.selected !== false,
    targetId: metric.targetId
      ?? groupTargetMap.get(String(metric.serverKey || ''))
      ?? (grouped ? null : autoTargetId(metric, targets)),
  }));
}

function fallbackServerGroup(metrics: any[]) {
  return {
    serverKey: 'default-server',
    serverLabel: metrics[0]?.serverLabel || 'Server',
    metricIndexes: metrics.map((_, index) => index),
    matchedTargetId: null,
    matchedTargetName: null,
    matchConfidence: 0,
    matchReason: null,
  };
}

function buildServerGroups(parsed: any, metrics: any[]) {
  const rawGroups = Array.isArray(parsed?.serverGroups) ? parsed.serverGroups : [];
  const groups = rawGroups
    .map((group: any, index: number) => {
      const indexes = Array.isArray(group.metricIndexes)
        ? group.metricIndexes.filter((i: number) => Number.isInteger(i) && i >= 0 && i < metrics.length)
        : metrics
            .map((metric, metricIndex) => String(metric.serverKey || '') === String(group.serverKey || '') ? metricIndex : -1)
            .filter(indexValue => indexValue >= 0);
      return {
        ...group,
        serverKey: group.serverKey || `server-${index + 1}`,
        serverLabel: group.serverLabel || `Server ${index + 1}`,
        metricIndexes: indexes,
      };
    })
    .filter((group: any) => group.metricIndexes.length > 0);

  if (groups.length > 0) return groups;
  return metrics.length ? [fallbackServerGroup(metrics)] : [];
}

function groupTargetId(group: any, metrics: any[]) {
  const selectedTargets = group.metricIndexes
    .map((index: number) => metrics[index])
    .filter((metric: any) => metric?.selected !== false)
    .map((metric: any) => metric?.targetId)
    .filter(Boolean);
  const unique = [...new Set(selectedTargets.map(String))];
  return unique.length === 1 ? Number(unique[0]) : group?.matchedTargetId ?? '';
}

export function NewInput({ channel, services = [], activeServiceId = 'all' }: any) {
  const me = useUser();
  const { customers } = useMasterData();
  const [inputText, setInputText] = React.useState('');
  const [parsed, setParsed] = React.useState<any>(null);
  const [metrics, setMetrics] = React.useState<any[]>([]);
  const [targets, setTargets] = React.useState<any[]>([]);
  const [customerId, setCustomerId] = React.useState<any>(channel?.customerId ?? '');
  const [parsing, setParsing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [reporting, setReporting] = React.useState(false);
  const [savedHistory, setSavedHistory] = React.useState<any>(null);
  const [savedReport, setSavedReport] = React.useState<any>(null);
  const [error, setError] = React.useState('');
  const [activeServerKey, setActiveServerKey] = React.useState('');

  const selectedService = activeServiceId === 'all'
    ? services[0]
    : services.find((service: any) => service.id === activeServiceId) || services[0];

  React.useEffect(() => {
    setCustomerId(channel?.customerId ?? '');
  }, [channel?.customerId]);

  React.useEffect(() => {
    if (!customerId) {
      setTargets([]);
      return;
    }
    listTargets({ customerId })
      .then(rows => setTargets(Array.isArray(rows) ? rows : []))
      .catch(() => setTargets([]));
  }, [customerId]);

  React.useEffect(() => {
    if (parsed?.metricCandidates) {
      setMetrics(prepareMetrics(parsed.metricCandidates, targets, parsed.serverGroups || []));
    }
  }, [parsed, targets]);

  const serverGroups = React.useMemo(() => buildServerGroups(parsed, metrics), [parsed, metrics]);
  const activeServerGroup = React.useMemo(
    () => serverGroups.find((group: any) => group.serverKey === activeServerKey) || serverGroups[0] || null,
    [serverGroups, activeServerKey],
  );
  const activeMetricIndexes = activeServerGroup?.metricIndexes || metrics.map((_, index) => index);
  const visibleMetrics = React.useMemo(
    () => activeMetricIndexes.map((metricIndex: number) => ({ ...metrics[metricIndex], __sourceIndex: metricIndex })),
    [activeMetricIndexes, metrics],
  );
  const activeTargetId = activeServerGroup ? groupTargetId(activeServerGroup, metrics) : '';

  React.useEffect(() => {
    if (!serverGroups.length) {
      setActiveServerKey('');
      return;
    }
    if (!serverGroups.some((group: any) => group.serverKey === activeServerKey)) {
      setActiveServerKey(serverGroups[0].serverKey);
    }
  }, [serverGroups, activeServerKey]);

  async function handleParse() {
    if (!inputText.trim() || parsing) return;
    setParsing(true);
    setError('');
    setSavedHistory(null);
    setSavedReport(null);
    try {
      const result: any = await parseHistoryText({ text: inputText, channelName: channel?.name, customerId });
      setParsed(result);
      setMetrics(prepareMetrics(result.metricCandidates || [], targets, result.serverGroups || []));
    } catch (err: any) {
      setError(err?.message || 'AI 파싱에 실패했습니다.');
    } finally {
      setParsing(false);
    }
  }

  function updateMetric(index: number, patch: any) {
    setMetrics(current => current.map((metric, i) => i === index ? { ...metric, ...patch } : metric));
  }

  function updateServerTarget(group: any, targetId: number | null) {
    const indexes = new Set(group.metricIndexes || []);
    setMetrics(current => current.map((metric, index) => indexes.has(index) ? { ...metric, targetId } : metric));
  }

  function validateMetricTargets() {
    const missingGroups = serverGroups.filter((group: any) =>
      group.metricIndexes.some((index: number) => metrics[index]?.selected !== false)
      && !groupTargetId(group, metrics),
    );
    if (missingGroups.length > 0) {
      setError(`모니터링 대상을 선택해야 하는 서버 탭: ${missingGroups.map((group: any) => group.serverLabel).join(', ')}`);
      return false;
    }
    return true;
  }

  async function handleSave() {
    if (!parsed || saving) return;
    if (!customerId) {
      setError('고객사를 선택해야 이력등록이 가능합니다.');
      return;
    }
    if (!validateMetricTargets()) return;
    setSaving(true);
    setError('');
    try {
      const draft = parsed.historyDraft || parsed;
      const created = await createHistory({
        customerId,
        service: draft.service || parsed.service || selectedService?.name || 'Operational record',
        historyType: draft.historyType || parsed.historyType || 'routine',
        supportMode: draft.supportMode || parsed.supportMode || 'remote',
        priority: normalizePriority(draft.priority || parsed.priority),
        summary: draft.summary || parsed.summary || inputText.slice(0, 200),
        workDetail: draft.workDetail || inputText,
        finding: draft.finding || parsed.finding || null,
        action: draft.action || parsed.action || null,
        documentKind: parsed.documentKind,
        aiConfidence: parsed.confidence,
        parsedJson: { ...parsed, metricCandidates: metrics, serverGroups: serverGroupsForSave },
        metricCandidates: metrics,
        timeline: buildTimeline(draft),
        status: 'draft',
        createdBy: me?.id,
      });
      setSavedHistory(created);
      setInputText('');
    } catch (err: any) {
      setError(err?.message || '이력등록 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateReport() {
    const historyId = savedHistory?.id || savedHistory?.historyId;
    if (!historyId || reporting) return;
    setReporting(true);
    setError('');
    try {
      const report = await createReportFromHistory({
        historyId,
        ...currentWeekPayload(me),
      });
      setSavedReport(report);
    } catch (err: any) {
      setError(err?.message || '레포트 초안 생성에 실패했습니다.');
    } finally {
      setReporting(false);
    }
  }

  const selectedMetricCount = metrics.filter(metric => metric.selected !== false).length;
  const activeTarget = targets.find((target: any) => String(target.targetId) === String(activeTargetId));
  const serverGroupsForSave = serverGroups.map((group: any) => {
    const targetId = groupTargetId(group, metrics);
    const target = targets.find((item: any) => String(item.targetId) === String(targetId));
    return {
      ...group,
      matchedTargetId: targetId || null,
      matchedTargetName: target?.name || group.matchedTargetName || null,
      matchConfidence: targetId ? Math.max(group.matchConfidence || 0, 1) : group.matchConfidence || 0,
      matchReason: targetId && target?.name ? 'Selected in New Input' : group.matchReason || null,
    };
  });

  return (
    <div className="page-pad ws-page scroll" style={{ height: '100%' }}>
      <div className="channel-page-head">
        <div>
          <span className="channel-page-kicker">New Input</span>
          <h3>운영기록 빠른 입력</h3>
          <p className="text-3">점검, 장애, 기술지원, 설치 내용을 붙여넣으면 AI가 이력등록 초안과 트렌드 수치를 트리로 정리합니다.</p>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 16px', marginTop: 12, background: 'var(--err-bg, #fef2f2)', border: '1px solid var(--err)', borderRadius: 8, fontSize: 13, color: 'var(--err)' }}>
          {error}
        </div>
      )}

      {savedHistory && (
        <div style={{ padding: '10px 16px', marginTop: 12, background: 'var(--ok-bg, #ecfdf5)', border: '1px solid var(--ok, #16a34a)', borderRadius: 8, fontSize: 13, color: 'var(--ok, #16a34a)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Icon name="check" size={14}/> 이력등록 초안이 저장되었습니다.
          <button className="btn sm ghost" onClick={handleCreateReport} disabled={reporting}>
            <Icon name="report" size={12}/> {reporting ? '레포트 생성 중...' : '레포트 초안 생성'}
          </button>
          {savedReport && <span className="tag ok xs">Report #{savedReport.id}</span>}
        </div>
      )}

      <section className="card card-pad ni-compose" style={{ marginTop: 20 }}>
        <div className="ni-card-head" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <span className="text-3" style={{ fontSize: 12 }}>입력 원문</span>
            <div style={{ fontWeight: 600 }}>현장 메모 또는 점검 결과 붙여넣기</div>
          </div>
          <div style={{ minWidth: 220 }}>
            <select className="input sm" value={customerId ?? ''} onChange={event => setCustomerId(event.target.value)}>
              <option value="">고객사 선택</option>
              {customers.map((customer: any) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </div>
        </div>

        <textarea
          className="input ni-textarea"
          rows={12}
          style={{ width: '100%', marginBottom: 12 }}
          value={inputText}
          onChange={event => setInputText(event.target.value)}
          placeholder="[ SERVER : JSN ] 점검 결과 또는 장애 조치 내용을 붙여넣으세요."
        />

        <div className="ni-action-row" style={{ display: 'flex', gap: 8 }}>
          <button className="btn primary" onClick={handleParse} disabled={!inputText.trim() || parsing}>
            {parsing ? <><Icon name="pulse" size={14}/> 분석 중...</> : <><Icon name="sparkles" size={14}/> AI 파싱</>}
          </button>
          <div style={{ flex: 1 }}/>
          <button className="btn primary" onClick={handleSave} disabled={!parsed || saving}>
            {saving ? '저장 중...' : <><Icon name="check" size={13}/> 이력등록 저장</>}
          </button>
        </div>
      </section>

      {parsed && (
        <section className="card card-pad" style={{ marginTop: 16 }}>
          <div className="section-h">
            <h3>AI 파싱 결과</h3>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className="tag info xs">{parsed.documentKind || 'record'}</span>
              <span className="tag muted xs">신뢰도 {Math.round((parsed.confidence ?? 0) * 100)}%</span>
              <span className="tag muted xs">수치 {selectedMetricCount}/{metrics.length}건</span>
            </div>
          </div>
          {serverGroups.length > 0 && (
            <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {serverGroups.map((group: any) => {
                  const selectedCount = group.metricIndexes.filter((index: number) => metrics[index]?.selected !== false).length;
                  return (
                    <button
                      key={group.serverKey}
                      type="button"
                      className={'btn sm ' + (activeServerGroup?.serverKey === group.serverKey ? 'primary' : 'ghost')}
                      onClick={() => setActiveServerKey(group.serverKey)}
                    >
                      <Icon name="server" size={12}/>
                      {group.serverLabel}
                      <span className="tag muted xs">{selectedCount}</span>
                    </button>
                  );
                })}
              </div>

              {activeServerGroup && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: 10, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-sub)' }}>
                  <label className="form-label" style={{ minWidth: 280, margin: 0 }}>
                    <span>모니터링 대상</span>
                    <select
                      className="input sm"
                      value={activeTargetId ?? ''}
                      onChange={event => updateServerTarget(activeServerGroup, event.target.value ? Number(event.target.value) : null)}
                    >
                      <option value="">대상 선택</option>
                      {targets.map((target: any) => (
                        <option key={target.targetId} value={target.targetId}>
                          {[target.name, target.hostname].filter(Boolean).join(' · ')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{activeServerGroup.serverLabel}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {activeTarget
                        ? `선택 대상: ${activeTarget.name}`
                        : activeServerGroup.matchConfidence >= 0.8 && activeServerGroup.matchedTargetName
                        ? `자동 매칭: ${activeServerGroup.matchedTargetName} (${Math.round(activeServerGroup.matchConfidence * 100)}%)`
                        : '대상을 선택하면 이 서버 탭의 모든 선택 수치에 적용됩니다.'}
                    </span>
                    {activeServerGroup.matchReason && (
                      <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{activeServerGroup.matchReason}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <ParsedResultTree
            parsed={parsed}
            metrics={visibleMetrics}
            targets={targets}
            onMetricChange={updateMetric}
            height="min(760px, calc(100vh - 250px))"
            hideMetricTargetSelect={Boolean(activeServerGroup)}
          />
        </section>
      )}
    </div>
  );
}
