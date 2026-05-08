/**
 * @module components/features/messaging/parts/CustomerMentionCard
 * @description 메시지에 첨부되는 고객사 #멘션 카드. 상태·업종·서비스 수·담당자 표시.
 * @usage <CustomerMentionCard customer={customerObj} onGoChannel={fn}/>
 * @related Workspace.jsx
 */
import React from 'react';
import { Icon } from '../../../Icon.jsx';

export function CustomerMentionCard({ customer, onGoChannel }) {
  if (!customer) return null;

  const statusColor =
    customer.status === 'incident' ? 'var(--err)'
    : customer.status === 'warning' ? 'var(--warn)'
    : 'var(--ok)';

  const statusLabel =
    customer.status === 'incident' ? '장애 진행 중'
    : customer.status === 'warning' ? '경고'
    : '정상';

  return (
    <div
      className="card"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', marginTop: 6, cursor: 'pointer',
        maxWidth: 300, transition: 'box-shadow .12s',
      }}
      onClick={() => onGoChannel?.(customer)}
      title={`${customer.name} 채널로 이동`}
    >
      <div
        className="avatar lg"
        style={{ background: customer.color, borderRadius: 8, flexShrink: 0 }}
      >
        {customer.initial}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{customer.name}</div>
        <div className="text-3" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
          <span style={{ color: statusColor }}>●</span>
          <span>{statusLabel}</span>
          <span>·</span>
          <span>{customer.group}</span>
          <span>·</span>
          <span>업무 {customer.serviceCount}건</span>
        </div>
      </div>
      <Icon name="arrow-right" size={13} style={{ color: 'var(--text-4)', flexShrink: 0 }}/>
    </div>
  );
}
