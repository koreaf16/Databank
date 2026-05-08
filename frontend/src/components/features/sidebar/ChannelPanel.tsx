/**
 * @module components/features/sidebar/ChannelPanel
 * @description 240px 채널 패널 셸. home/msg nav에서만 표시.
 *   내부 4섹션: 부서채널 / 담당고객사 / DM / 프로젝트
 * @usage <ChannelPanel tweaks={tweaks} currentNav={nav} currentChannel={id} onChannel={fn}
 *          customers={[]} onAddCustomer={fn} onRemoveCustomer={fn}
 *          onCmdK={fn} onShortcuts={fn} onLogout={fn}/>
 * @related MenuRail.jsx, parts/*, app.jsx
 */
import React from 'react';
import { WorkspaceHeader } from './parts/WorkspaceHeader.jsx';
import { DepartmentChannels } from './parts/DepartmentChannels.jsx';
import { CustomerChannels } from './parts/CustomerChannels.jsx';
import { DirectMessages } from './parts/DirectMessages.jsx';
import { ProjectsSection } from './parts/ProjectsSection.jsx';
import { UserFooter } from './parts/UserFooter.jsx';
import { MyCustomersSection } from './parts/MyCustomersSection.jsx';

export function ChannelPanel({
  tweaks,
  currentChannel,
  onChannel,
  customers,
  onAddCustomer,
  onRemoveCustomer,
  onCmdK,
  onShortcuts,
  onLogout,
}) {
  const pattern = tweaks?.sidebarPattern || 'slack';
  const patternClass = pattern === 'discord' ? 'sb-discord'
    : pattern === 'teams' ? 'sb-teams'
    : '';

  return (
    <div className={`sb-panel${patternClass ? ` ${patternClass}` : ''}`}>
      <WorkspaceHeader onCmdK={onCmdK}/>

      <div className="sb-channels scroll">
        <MyCustomersSection
          customers={customers}
          currentChannel={currentChannel}
          onChannel={onChannel}
        />

        <CustomerChannels
          customers={customers}
          currentChannel={currentChannel}
          onChannel={onChannel}
          onAddCustomer={onAddCustomer}
          onRemoveCustomer={onRemoveCustomer}
        />

        <DepartmentChannels
          currentChannel={currentChannel}
          onChannel={onChannel}
        />

        <DirectMessages
          currentChannel={currentChannel}
          onChannel={onChannel}
        />

        <ProjectsSection
          currentChannel={currentChannel}
          onChannel={onChannel}
        />
      </div>

      <UserFooter onLogout={onLogout} onShortcuts={onShortcuts}/>
    </div>
  );
}
