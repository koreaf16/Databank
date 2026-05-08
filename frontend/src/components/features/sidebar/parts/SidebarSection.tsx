/**
 * @module components/features/sidebar/parts/SidebarSection
 * @description 채널 패널 접기/펼치기 섹션 공용 컴포넌트
 * @usage <SidebarSection label="부서 채널" open={open} onToggle={fn} action={<button>}> children </SidebarSection>
 * @related ChannelPanel.jsx, DepartmentChannels.jsx, CustomerChannels.jsx
 * @data 없음
 */
import React from 'react';
import { Icon } from '../../../Icon.jsx';

export function SidebarSection({ label, open, onToggle, action, meta, children }) {
  return (
    <div className="sb-grp">
      <div className="sb-grp-h">
        <button className="sb-grp-toggle" onClick={onToggle}>
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={10}/>
          <span>{label}</span>
        </button>
        {meta != null && <span className="sb-grp-meta">{meta}</span>}
        {action}
      </div>
      {open && <div className="sb-grp-body">{children}</div>}
    </div>
  );
}
