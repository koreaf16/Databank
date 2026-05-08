/**
 * 파일: frontend/src/features/messaging/components/ChannelLanding.jsx
 * 역할: 채널이 선택되지 않은 상태의 홈 패널 안내 화면.
 *
 * 연관 파일:
 *   - app.jsx : nav==='msg' && !channel 일 때 렌더
 *   - components/Icon.jsx : 아이콘
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';

export function ChannelLanding() {
  return (
    <div className="cl-wrap">
      <div className="cl-hero">
        <div className="cl-icon"><Icon name="sidebar" size={28}/></div>
        <h2>홈 패널에서 항목을 선택해주세요</h2>
        <p className="text-3">왼쪽 홈 패널에서 고객사, 팀 채널, 공지, DM을 선택하면<br/>대화·이력·트렌드·보고서를 한곳에서 볼 수 있어요.</p>
        <div className="cl-types">
          <div className="cl-type"><div className="cl-type-i"><Icon name="building" size={16}/></div><div><b>고객사 채널</b><span>일반 서비스 채널 — Conversation / History / Trend / Reports</span></div></div>
          <div className="cl-type"><div className="cl-type-i"><Icon name="users" size={16}/></div><div><b>팀 채널</b><span>그룹 채널 — Conversation / History / Reports</span></div></div>
        </div>
      </div>
    </div>
  );
}
