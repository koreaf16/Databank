/**
 * 파일: frontend/src/features/messaging/parts/trend/TrendInsightCard.tsx
 * 역할: 트렌드 화면 AI 인사이트 카드. /api/metrics/insights?customerId= 로드 + 1시간 캐시 표시.
 * 연관 파일:
 *   - features/metrics/api/metricsApi.ts       : getInsight
 *   - components/Icon.tsx                      : sparkles, pulse 아이콘
 */

import React from 'react';
import { Icon } from '../../../../components/Icon.jsx';
import { apiGet } from '../../../../shared/api/apiClient.js';

function formatGeneratedAt(iso: string): string {
  const diffMs  = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  return `${Math.floor(diffMin / 60)}시간 전`;
}

function renderSummary(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    if (line.startsWith('- [ ] ') || line.startsWith('- [x] ') || line.startsWith('- [X] ')) {
      const done = line.charAt(3) !== ' ';
      return (
        <div key={i} className="insight-action" style={{ display: 'flex', alignItems: 'flex-start', gap: 6, margin: '3px 0' }}>
          <Icon name={done ? 'check' : 'circle'} size={12} style={{ marginTop: 2, color: done ? 'var(--ok)' : 'var(--text-3)', flexShrink: 0 }}/>
          <span style={{ fontSize: 12 }}>{line.slice(6)}</span>
        </div>
      );
    }
    if (line.startsWith('권장 액션:') || line.startsWith('권장 액션')) {
      return <div key={i} style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-2)', marginTop: 8, marginBottom: 4 }}>{line}</div>;
    }
    if (!line.trim()) return null;
    return <p key={i} style={{ margin: '4px 0', fontSize: 13, lineHeight: 1.6 }}>{line}</p>;
  }).filter(Boolean);
}

interface InsightProps {
  customerId: number | string;
}

export function TrendInsightCard({ customerId }: InsightProps) {
  const [data,     setData]     = React.useState<any>(null);
  const [loading,  setLoading]  = React.useState(false);
  const [error,    setError]    = React.useState('');
  const [open,     setOpen]     = React.useState(true);

  function load() {
    if (!customerId) return;
    setLoading(true);
    setError('');
    apiGet('/api/metrics/insights', { customerId: String(customerId) })
      .then((res: any) => setData(res))
      .catch((err: any) => setError(err?.message || 'AI 분석 일시 불가'))
      .finally(() => setLoading(false));
  }

  React.useEffect(() => {
    load();
  }, [customerId]);

  if (error) {
    return (
      <div className="card card-pad" style={{ marginBottom: 12, borderLeft: '3px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-4)', fontSize: 12 }}>
          <Icon name="sparkles" size={12}/> AI 분석 일시 불가
          <button className="btn ghost sm" style={{ fontSize: 11 }} onClick={load}>다시 시도</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', fontSize: 12 }}>
          <Icon name="pulse" size={12}/> AI 인사이트 분석 중...
        </div>
      </div>
    );
  }

  if (!data?.summary) return null;

  return (
    <div className="card card-pad" style={{ marginBottom: 12, borderLeft: '3px solid var(--brand-500)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: open ? 10 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="sparkles" size={14} style={{ color: 'var(--brand-500)' }}/>
          <span style={{ fontWeight: 600, fontSize: 13 }}>AI 인사이트</span>
          {data.fromCache && (
            <span className="tag muted xs" style={{ fontSize: 10 }}>캐시</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {data.generatedAt && (
            <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{formatGeneratedAt(data.generatedAt)} 생성</span>
          )}
          <button className="btn ghost sm" style={{ fontSize: 11 }} onClick={load} title="다시 분석">
            지금 다시 분석
          </button>
          <button className="btn icon ghost" onClick={() => setOpen(o => !o)}>
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={13}/>
          </button>
        </div>
      </div>

      {open && (
        <div style={{ color: 'var(--text)', lineHeight: 1.6 }}>
          {renderSummary(data.summary)}
        </div>
      )}
    </div>
  );
}
