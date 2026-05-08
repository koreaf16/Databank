/**
 * 파일: frontend/src/features/messaging/parts/CustomerMentionCard.tsx
 * 역할: 메시지 작성 중 #고객사 멘션 시 하단에 표시되는 고객사 정보 카드.
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';

export function CustomerMentionCard({ customer, onGoChannel }: any) {
  if (!customer) return null;

  return (
    <div className="mention-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 20 }}>
      <span className="avatar xs" style={{ background: customer.color }}>{customer.initial}</span>
      <span style={{ fontWeight: 600, fontSize: 13 }}>{customer.name}</span>
      <button
        className="btn icon ghost sm"
        style={{ width: 22, height: 22 }}
        onClick={() => onGoChannel?.(customer)}
        title="채널로 이동"
      >
        <Icon name="arrow-right" size={12}/>
      </button>
    </div>
  );
}
