/**
 * 파일: frontend/src/features/messaging/parts/ChannelTrend.tsx
 * 역할: 채널(고객사)별 용량 트렌드 및 관제 화면. 메트릭 API 연결.
 * 연관 파일: trend/helpers.ts, trend/CapacityTrendChart.tsx, trend/CapacityKpi.tsx
 *            features/metrics/api/metricsApi.ts
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { getLatestMetrics, getSamples, listTargets } from '../../metrics/api/metricsApi.js';
import { CapacityTrendChart } from './trend/CapacityTrendChart.jsx';
import { CapacityKpi, CapacityStatusBadge } from './trend/CapacityKpi.jsx';
import { TrendInsightCard } from './trend/TrendInsightCard.jsx';
import {
  CAPACITY_KIND_LABELS, CAPACITY_KIND_SHORT,
  capacityTone, formatCapacity, toLatestRow, compareRisk, riskRowToObservation,
} from './trend/helpers.js';

export function ChannelTrend({
  services = [],
  activeServiceId = 'all',
  channel,
  workspaceId = null,
  workspaceName = null,
  servers = [],
  serverIds = [],
}: any) {
  const customerId = channel?.customerId ?? null;

  const [riskRows, setRiskRows]       = React.useState<any[]>([]);
  const [targets,  setTargets]        = React.useState<any[]>([]);
  const [systemFilter, setSystemFilter] = React.useState('all');
  const [kindFilter,   setKindFilter]   = React.useState('all');
  const [selectedId,   setSelectedId]   = React.useState<string | null>(null);
  const [chartSamples, setChartSamples] = React.useState<any[]>([]);
  const [hoveredIdx,   setHoveredIdx]   = React.useState<number | null>(null);
  const [loading,      setLoading]      = React.useState(false);

  // 위험 목록 + 대상 목록 로드
  React.useEffect(() => {
    if (!customerId) return;
    setLoading(true);
    Promise.all([
      getLatestMetrics({ customerId, limit: 200 }),
      listTargets({ customerId }),
    ])
      .then(([risk, tgts]) => {
        setRiskRows(Array.isArray(risk)  ? risk  : []);
        setTargets( Array.isArray(tgts)  ? tgts  : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [customerId]);

  // 선택 행 변경 시 차트 데이터 로드
  React.useEffect(() => {
    if (!selectedRow) { setChartSamples([]); return; }
    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(today.getFullYear() - 1);
    getSamples({
      targetId: selectedRow.targetId,
      metricId: selectedRow.metricId,
      dimensionKey: selectedRow.dimensionKey,
      dimensionValue: selectedRow.dimensionValue,
      from: oneYearAgo.toISOString(),
      to:   today.toISOString(),
      limit: 24,
    })
      .then(rows => setChartSamples(Array.isArray(rows) ? rows : []))
      .catch(() => setChartSamples([]));
  }, [selectedId]);

  // 시스템 종류 목록 (대상에서 파생)
  const systemTypes = React.useMemo(() => {
    const types = [...new Set(targets.map((t: any) => t.systemType))].sort();
    return types;
  }, [targets]);

  // 선택된 서버 칩이 있으면 targetName / hostname 기준으로 좁힘
  const selectedServerNames = React.useMemo(() => {
    if (!Array.isArray(serverIds) || serverIds.length === 0) return null;
    const idSet = new Set(serverIds.map(Number));
    return servers
      .filter((s: any) => idSet.has(Number(s.id)))
      .map((s: any) => String(s.serverName || '').toLowerCase());
  }, [servers, serverIds]);

  // 필터 적용 후 위험 행 목록
  const filteredRisk = React.useMemo(() =>
    riskRows
      .filter((r: any) => systemFilter === 'all' || r.systemType === systemFilter)
      .filter((r: any) => {
        if (!selectedServerNames) return true;
        const name = String(r.targetName || r.hostname || '').toLowerCase();
        return selectedServerNames.some(sn => name.includes(sn) || sn.includes(name));
      })
      .map((r: any) => ({
        ...r,
        id:          `${r.targetId}-${r.metricId}-${r.dimensionKey || ''}-${r.dimensionValue || ''}`,
        label:       r.rawLabel || r.dimensionValue || r.metricName,
        serviceName: r.targetName,
        host:        r.hostname || '-',
        kind:        r.systemType,
        pct:         typeof r.value === 'number' ? Math.round(r.value) : r.value,
        tone:        r.status,
        used:        null,
        total:       null,
        delta:       0,
        needsReview: false,
        monthsToCrit:r.status !== 'crit' ? Math.ceil((90 - (r.value || 0)) / 1.5) : 0,
        confidence:  1,
        sourceTitle:  r.sourceRef || '',
        sourceReportId: r.sourceRef || '',
      }))
      .sort(compareRisk),
  [riskRows, systemFilter, selectedServerNames]);

  const selectedRow = filteredRisk.find(r => r.id === selectedId) || filteredRisk[0] || null;

  // 선택 변경 시 selectedId 자동 갱신
  React.useEffect(() => {
    if (filteredRisk.length && (!selectedId || !filteredRisk.some(r => r.id === selectedId))) {
      setSelectedId(filteredRisk[0]?.id ?? null);
    }
  }, [filteredRisk]);

  const selectedObservation = React.useMemo(() => {
    if (!selectedRow || !chartSamples.length) return null;
    return riskRowToObservation(selectedRow, chartSamples);
  }, [selectedRow, chartSamples]);

  const critCount  = filteredRisk.filter(r => r.tone === 'crit').length;
  const warnCount  = filteredRisk.filter(r => r.tone === 'warn').length;
  const riskTone   = critCount > 0 ? 'crit' : warnCount > 0 ? 'watch' : 'ok';
  const riskLabel  = critCount > 0 ? '임계 초과' : warnCount > 0 ? '주의 필요' : '정상 범위';
  const maxRow     = filteredRisk[0];
  const maxPct     = maxRow?.pct ?? 0;
  const nearestFull= filteredRisk.filter(r => r.monthsToCrit > 0).sort((a, b) => a.monthsToCrit - b.monthsToCrit)[0];

  if (loading) {
    return <div className="page-pad"><div className="text-3">메트릭 데이터 로딩 중...</div></div>;
  }
  if (!customerId) {
    return <div className="page-pad"><div className="text-3">채널을 선택하면 용량 트렌드가 표시됩니다.</div></div>;
  }
  if (!riskRows.length && !loading) {
    return (
      <div className="page-pad">
        <div className="text-3">등록된 모니터링 대상이 없거나 최근 7일 이내 위험 항목이 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="page-pad ws-page scroll" style={{ height: '100%' }}>
      <div className={'trend-hero capacity-hero ' + riskTone}>
        <div className="trend-hero-main">
          <span className="capacity-hero-icon"><Icon name="database" size={18}/></span>
          <div>
            <span className="channel-page-kicker">Capacity Trend</span>
            <h3>용량 현황</h3>
            <p className="text-3">
              {workspaceName
                ? `${workspaceName}${selectedServerNames ? ` · 서버 ${selectedServerNames.length}개 선택됨` : ''}`
                : '모니터링 대상의 메트릭 데이터 기반'}
            </p>
          </div>
        </div>
        <div className="trend-hero-metrics">
          <div><span>최고 위험</span><b>{maxPct}<small>{maxRow?.unit || '%'}</small></b></div>
          <div><span>상태</span><b>{riskLabel}</b></div>
          <div><span>위험 항목</span><b>{critCount + warnCount}<small>건</small></b></div>
        </div>
      </div>

      <div className="trend-h capacity-toolbar">
        <div className="trend-h-left">
          <span className="text-3" style={{ fontSize: 12 }}>
            {filteredRisk.length}개 위험 항목 · 임계 {critCount} / 주의 {warnCount}
          </span>
        </div>
        <div className="capacity-kind-tabs">
          <button className={'capacity-kind-tab' + (systemFilter === 'all' ? ' on' : '')} onClick={() => setSystemFilter('all')}>
            전체 ({riskRows.length})
          </button>
          {systemTypes.map(st => {
            const cnt = riskRows.filter((r: any) => r.systemType === st).length;
            return (
              <button key={st} className={'capacity-kind-tab' + (systemFilter === st ? ' on' : '')} onClick={() => setSystemFilter(st)}>
                {st} ({cnt})
              </button>
            );
          })}
        </div>
      </div>

      {customerId && <TrendInsightCard customerId={customerId}/>}

      <div className="capacity-kpis">
        <CapacityKpi label="임계 초과" value={`${critCount}건`} tone={critCount > 0 ? 'crit' : 'ok'} icon="alert"/>
        <CapacityKpi label="주의 항목" value={`${warnCount}건`} tone={warnCount > 0 ? 'warn' : 'ok'} icon="pulse"/>
        <CapacityKpi
          label="예상 포화"
          value={nearestFull ? `${nearestFull.monthsToCrit}개월` : '-'}
          sub={nearestFull ? nearestFull.label : '6개월 내 없음'}
          tone={nearestFull && nearestFull.monthsToCrit <= 3 ? 'crit' : nearestFull ? 'warn' : 'ok'}
          icon="calendar"
        />
        <CapacityKpi label="모니터링 대상" value={`${targets.length}개`} sub="활성" tone="ok" icon="database"/>
      </div>

      <div className="capacity-main-grid">
        <section className="card card-pad capacity-risk-card">
          <div className="section-h">
            <h3>위험 항목 Top 10</h3>
            <span className="text-3" style={{ fontSize: 12 }}>최근 7일 기준</span>
          </div>
          <div className="capacity-risk-list">
            {filteredRisk.slice(0, 10).map(row => (
              <button
                key={row.id}
                className={'capacity-risk-row ' + row.tone + (selectedRow?.id === row.id ? ' on' : '')}
                onClick={() => setSelectedId(row.id)}
              >
                <div className="capacity-risk-main">
                  <b>{row.label}</b>
                  <span>{row.serviceName} · {row.systemType}</span>
                </div>
                <div className="capacity-risk-pct">
                  <b>{row.pct}{row.unit === '%' ? '%' : ` ${row.unit}`}</b>
                </div>
                <div className="capacity-risk-track">
                  <span style={{ width: `${Math.min(100, row.unit === '%' ? row.pct : 50)}%` }}/>
                </div>
                <CapacityStatusBadge row={row}/>
              </button>
            ))}
            {filteredRisk.length === 0 && (
              <div className="capacity-empty">선택한 필터에 해당하는 위험 항목이 없습니다.</div>
            )}
          </div>
        </section>

        <section className="card card-pad capacity-chart-card">
          <div className="section-h">
            <h3>{selectedRow ? selectedRow.label : '메트릭 추세'} <span className="text-3" style={{ fontWeight: 400, fontSize: 12 }}>12개월</span></h3>
            {selectedRow && <span className="tag muted xs">{selectedRow.serviceName}</span>}
          </div>
          {selectedObservation ? (
            <>
              {hoveredIdx !== null && selectedObservation.samples[hoveredIdx] && (
                <div className="trend-hover-popup capacity-hover">
                  <b>{selectedObservation.samples[hoveredIdx].month}월</b>
                  <span>값 <b>{selectedObservation.samples[hoveredIdx].pct}{selectedRow?.unit === '%' ? '%' : ` ${selectedRow?.unit}`}</b></span>
                </div>
              )}
              <CapacityTrendChart observation={selectedObservation} hoveredIdx={hoveredIdx} onHover={setHoveredIdx}/>
            </>
          ) : (
            <div className="capacity-empty">
              {chartSamples.length === 0 ? '차트 데이터를 불러오는 중...' : '차트 데이터 없음'}
            </div>
          )}
        </section>
      </div>

      <section className="card capacity-detail-card" style={{ marginTop: 16, overflow: 'hidden' }}>
        <div className="card-h">
          <h3>위험 항목 상세</h3>
        </div>
        <div className="ws-table-scroll">
          <table className="trend-table capacity-table">
            <thead><tr>
              <th>대상</th><th>시스템</th><th>메트릭</th><th>값</th><th>상태</th><th>측정시각</th>
            </tr></thead>
            <tbody>
              {filteredRisk.map(row => (
                <tr key={row.id} className={selectedRow?.id === row.id ? 'selected' : ''} onClick={() => setSelectedId(row.id)}>
                  <td><b>{row.serviceName}</b></td>
                  <td className="text-3">{row.systemType}</td>
                  <td>{row.label}</td>
                  <td><span className={'capacity-pct ' + row.tone}>{row.pct}{row.unit === '%' ? '%' : ` ${row.unit}`}</span></td>
                  <td><CapacityStatusBadge row={row}/></td>
                  <td className="text-3">{row.collectedAt ? new Date(row.collectedAt).toLocaleDateString('ko-KR') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
