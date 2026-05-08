/**
 * @module components/features/sidebar/parts/SidebarSearch
 * @description 채널 패널 검색 바
 * @usage <SidebarSearch value={search} onChange={setSearch}/>
 * @related ChannelPanel.jsx
 * @data 없음
 */
import React from 'react';
import { Icon } from '../../../Icon.jsx';

export function SidebarSearch({ value, onChange }) {
  return (
    <div className="sb-panel-search">
      <Icon name="search" size={13}/>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="채널, 고객사, 멤버 검색"
      />
      <span className="kbd">/</span>
    </div>
  );
}
