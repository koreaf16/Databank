/**
 * 파일: frontend/src/features/messaging/parts/trend/CapacityKpi.tsx
 * 역할: 용량 트렌드 KPI 카드.
 */
import React from 'react';
import { Icon } from '../../../../components/Icon.jsx';

export function CapacityKpi({ label, value, sub, tone = 'ok', icon = 'pulse' }: any) {
  return (
    <div className={'capacity-kpi ' + tone}>
      <span className="capacity-kpi-icon"><Icon name={icon} size={14}/></span>
      <div>
        <span>{label}</span>
        <b>{value}</b>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  );
}

export function CapacityStatusBadge({ row }: any) {
  if (row.needsReview && row.tone === 'crit') return <span className="capacity-badge crit">위험/검토</span>;
  if (row.needsReview && row.tone === 'warn') return <span className="capacity-badge warn">주의/검토</span>;
  if (row.needsReview) return <span className="capacity-badge review">검토</span>;
  if (row.tone === 'crit') return <span className="capacity-badge crit">임계 초과</span>;
  if (row.tone === 'warn') return <span className="capacity-badge warn">주의</span>;
  return <span className="capacity-badge ok">정상</span>;
}
