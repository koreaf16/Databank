/**
 * @module components/features/sidebar/parts/UserFooter
 * @description 채널 패널 하단 사용자 정보 바 및 로그아웃/단축키 버튼
 * @usage <UserFooter onLogout={fn} onShortcuts={fn}/>
 * @related ChannelPanel.jsx
 * @data UserContext
 */
import React from 'react';
import { Icon } from '../../../Icon.jsx';
import { useUser } from '../../../../contexts/UserContext.js';

export function UserFooter({ onLogout, onShortcuts }) {
  const me = useUser();
  return (
    <div className="sb-userbar">
      <div className="avatar lg" style={{ background: me?.color || '#5b8eff' }}>
        {me?.initial || '?'}
      </div>
      <div className="sb-userbar-info">
        <div className="sb-userbar-name">{me?.name || '-'}</div>
        <div className="sb-userbar-meta">
          <span className="dot ok"/>
          {me?.dept || ''}
          {me?.rbacRoleLabel ? ` · ${me.rbacRoleLabel}` : ''}
        </div>
      </div>
      {onShortcuts && (
        <button className="sb-icon-btn" onClick={onShortcuts} title="단축키 안내 (?)">
          <Icon name="keyboard" size={14}/>
        </button>
      )}
      {onLogout && (
        <button className="sb-icon-btn" onClick={onLogout} title="로그아웃">
          <Icon name="logout" size={14}/>
        </button>
      )}
    </div>
  );
}
