/**
 * @module components/features/sidebar/parts/WorkspaceHeader
 * @description 채널 패널 상단 워크스페이스 헤더 (로고 + 이름 + 액션 버튼)
 * @usage <WorkspaceHeader onCmdK={fn}/>
 * @related ChannelPanel.jsx
 * @data 없음 (회사명은 하드코딩 금지 → 향후 env에서)
 */
import React from 'react';
import { Icon } from '../../../Icon.jsx';

export function WorkspaceHeader({ onCmdK }) {
  return (
    <div className="sb-panel-h">
      <button className="sb-panel-ws">
        <span className="sb-panel-ws-name">DATABANK Systems</span>
        <Icon name="chevron-down" size={12} style={{ color: 'rgba(255,255,255,.45)', flexShrink: 0 }}/>
      </button>
      <div className="sb-panel-actions">
        {onCmdK && (
          <button className="sb-icon-btn" onClick={onCmdK} title="통합 검색 (⌘K)">
            <Icon name="search" size={14}/>
          </button>
        )}
        <button className="sb-icon-btn" title="새 메시지 작성">
          <Icon name="edit" size={14}/>
        </button>
      </div>
    </div>
  );
}
