/**
 * 파일: frontend/src/features/messaging/parts/CustomerInfo.tsx
 * 역할: 고객사 채널의 기본 정보를 조회 전용으로 보여준다.
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';

export function CustomerInfo({ channel, serverCount = 0 }: any) {
  const infoRows = [
    ['고객사명', channel.customerName || channel.name || '-'],
    ['채널명', channel.name || '-'],
    ['채널 상태', channel.status === 'active' ? '활성' : channel.status || '-'],
    ['서버 수', `${serverCount}개`],
    ['주제', channel.topic || '-'],
  ];

  return (
    <div className="page-pad ws-page scroll" style={{ height: '100%' }}>
      <div className="channel-page-head">
        <div>
          <span className="channel-page-kicker">Customer Info</span>
          <h3>고객사정보</h3>
          <p className="text-3">고객사 기본 정보 조회 전용 화면입니다.</p>
        </div>
      </div>

      <section className="card card-pad customer-info-card">
        <div className="customer-info-hero">
          <span className="ws-h-avatar" style={{ background: channel.color || '#667085' }}>
            {channel.initial || channel.name?.[0] || 'C'}
          </span>
          <div>
            <h3>{channel.customerName || channel.name}</h3>
            <p>{channel.topic || '등록된 채널 설명이 없습니다.'}</p>
          </div>
        </div>

        <div className="customer-info-grid">
          {infoRows.map(([label, value]) => (
            <div key={label} className="customer-info-row">
              <span>{label}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>

        <div className="customer-info-note">
          <Icon name="lock" size={14}/>
          <span>고객사 등록/수정과 권한 관리는 상위 설정 영역에서 관리합니다.</span>
        </div>
      </section>
    </div>
  );
}
