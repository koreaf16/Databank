/**
 * 파일: frontend/src/components/Workspace.tsx
 * 역할: 워크스페이스(채널) 메인 화면. 대화, 이력, 트렌드, 리포트 탭 관리.
 *       기능별 하위 컴포넌트로 완전히 분리됨.
 */

import React from 'react';
import { Icon } from './Icon.jsx';
import { TypeTag, Segment } from './Dashboard.jsx';
import { SlidePanel } from './common/SlidePanel.jsx';

import { Conversation } from '../features/messaging/parts/Conversation.js';
import { SupportHistory } from '../features/support-history/components/SupportHistoryPage.jsx';
import { ChannelTrend } from '../features/messaging/parts/ChannelTrend.js';
import { ChannelReports } from '../features/messaging/parts/ChannelReports.js';
import { NewInput } from '../features/messaging/parts/NewInput.js';
import { ThreadPanel } from '../features/messaging/parts/ThreadPanel.js';
import { AIPanel } from '../features/messaging/parts/AIPanel.js';
import { ServiceBar } from '../features/messaging/parts/ServiceBar.js';
import { WorkspaceTabs } from '../features/messaging/parts/WorkspaceTabs.js';
import { WorkspaceManageModal } from '../features/messaging/parts/WorkspaceManageModal.js';
import { getChannelServers } from '../features/messaging/api/messagingApi.js';
import { getChannelWorkspaces, type Workspace as WorkspaceItem } from '../features/messaging/api/workspaceApi.js';

import { useUser } from '../contexts/UserContext.js';

const TAB_DETAILS: Record<string, any> = {
  Chat: { icon: 'message', label: '채팅', fallback: '실시간 협업' },
  Conversation: { icon: 'message', label: 'Conversation', fallback: '실시간 협업' },
  History: { icon: 'history', label: 'History', fallback: '지원 이력' },
  Trend: { icon: 'pulse', label: 'Trend', fallback: '운영 지표' },
  'New Input': { icon: 'plus', label: 'New Input', fallback: '빠른 등록' },
  Reports: { icon: 'report', label: 'Reports', fallback: '내역서' },
};

export function Workspace({ channel, role, onClose, onGoChannel, onCmdK }: any) {
  const isDM = channel.kind === 'dm' || String(channel.id || '').startsWith('dm-');
  const isService = (!channel.kind || channel.kind === 'customer') && !channel.emoji && !isDM;
  const TABS_SERVICE = ['Chat','History','Trend','New Input','Reports'];
  const TABS_GROUP = ['Chat','History','Reports'];
  const tabs = isDM ? ['Chat'] : (isService ? TABS_SERVICE : TABS_GROUP);

  const [tab, setTab] = React.useState('Chat');
  const [thread, setThread] = React.useState(null);
  const [showAI, setShowAI] = React.useState(false);
  const [services, setServices] = React.useState(channel.services || []);
  const [servers, setServers] = React.useState<any[]>([]);
  const [activeServiceId, setActiveServiceId] = React.useState('all');
  const [showOtherTeams, setShowOtherTeams] = React.useState(false);
  const [serverCount, setServerCount] = React.useState(0);

  // 업무(workspace) 상태 — 채널 안의 시스템 단위 작업 공간 (예: 계정계시스템, 홈페이지, MIS)
  const [workspaces, setWorkspaces] = React.useState<WorkspaceItem[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = React.useState<number | 'all'>('all');
  const [selectedServerIds, setSelectedServerIds] = React.useState<number[]>([]);
  const [showWorkspaceModal, setShowWorkspaceModal] = React.useState(false);

  React.useEffect(() => {
    setServices(channel.services || []);
    setServers([]);
    setActiveServiceId('all');
    setTab('Chat');
    setThread(null);
    setShowAI(false);
    setServerCount(0);
    setWorkspaces([]);
    setSelectedWorkspaceId('all');
    setSelectedServerIds([]);
    setShowWorkspaceModal(false);
  }, [channel.id]);

  React.useEffect(() => {
    if (!isService || !channel.id) return;
    getChannelServers(channel.id)
      .then(rows => {
        const list = Array.isArray(rows) ? rows : [];
        setServers(list);
        setServerCount(list.length);
      })
      .catch(() => { setServers([]); setServerCount(0); });
  }, [channel.id, isService]);

  const reloadWorkspaces = React.useCallback(async () => {
    if (!isService || !channel.id) return;
    try {
      const rows = await getChannelWorkspaces(channel.id);
      setWorkspaces(Array.isArray(rows) ? rows : []);
    } catch {
      setWorkspaces([]);
    }
  }, [channel.id, isService]);

  React.useEffect(() => { reloadWorkspaces(); }, [reloadWorkspaces]);

  // 업무 선택이 바뀌면 서버 다중 선택을 초기화
  React.useEffect(() => {
    setSelectedServerIds([]);
  }, [selectedWorkspaceId]);

  // 현재 선택된 업무에 속한 서버만 노출 (전체 모드면 모든 서버)
  const visibleServers = React.useMemo(() => {
    if (selectedWorkspaceId === 'all') return servers;
    return servers.filter((s: any) => Number(s.workspaceId) === Number(selectedWorkspaceId));
  }, [servers, selectedWorkspaceId]);

  const activeWorkspaceName = React.useMemo(() => {
    if (selectedWorkspaceId === 'all') return null;
    return workspaces.find((w) => w.id === selectedWorkspaceId)?.name ?? null;
  }, [workspaces, selectedWorkspaceId]);

  const me = useUser();
  const myTeamId = me?.deptId ? String(me.deptId) : '';
  const roleId = me?.rbacRoleId || role;
  return (
    <div className="ws">
      <div className="ws-h">
        <div className="ws-h-left">
          {channel.emoji ? (
            <span className="ws-h-emoji">{channel.emoji}</span>
          ) : (
            <span className="ws-h-avatar" style={{ background: channel.color || '#667085' }}>{channel.initial || channel.name?.[0]}</span>
          )}
          <div>
            <div className="ws-h-name">
              {!channel.emoji && <Icon name={isDM ? 'at' : 'hash'} size={14} className="text-3" style={{ marginRight: 2 }}/>}
              {channel.name}
              {channel.starred && <Icon name="star-fill" size={13} style={{ color: '#f5a623', marginLeft: 6 }}/>}
            </div>
            <div className="ws-h-meta">
               <span className="text-3">멤버 12명</span>
               {!isDM && <span className="text-4">·</span>}
               {!isDM && <span className="text-3">{isService ? `서버 ${serverCount}개` : `업무 ${services.length}개`}</span>}
            </div>
          </div>
        </div>
        <div className="ws-h-right">
          {!isDM && (
            <button className="btn ghost sm" onClick={onCmdK} title="검색">
              <Icon name="search" size={14}/> 검색
            </button>
          )}
          <button className={'btn ghost sm' + (showAI ? ' on' : '')} onClick={() => setShowAI(s => !s)}>
            <Icon name="sparkles" size={14}/> AI
          </button>
          <button className="btn icon ghost" onClick={onClose} title="닫기"><Icon name="x" size={16}/></button>
        </div>
      </div>

      {isService && (
        <WorkspaceTabs
          workspaces={workspaces}
          activeWorkspaceId={selectedWorkspaceId}
          onSelect={setSelectedWorkspaceId}
          onManage={() => setShowWorkspaceModal(true)}
        />
      )}

      {isService && tab === 'Chat' && selectedWorkspaceId !== 'all' && (
        <ServiceBar
          servers={visibleServers}
          selectedServerIds={selectedServerIds}
          onToggle={(sid: number) =>
            setSelectedServerIds((prev) =>
              prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid],
            )
          }
          onClearAll={() => setSelectedServerIds([])}
        />
      )}

      <div className="ws-tabs">
        {tabs.map(t => {
          const detail = TAB_DETAILS[t] || { icon: 'circle', label: t };
          const active = tab === t;
          return (
            <button key={t} className={'ws-tab' + (active ? ' on' : '')} onClick={() => setTab(t)}>
              <span className="ws-tab-icon"><Icon name={detail.icon} size={14}/></span>
              <span className="ws-tab-copy">
                <span className="ws-tab-title">{detail.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="ws-body">
        <div className="ws-main">
          {tab === 'Chat' && (
            <Conversation
              channel={channel}
              isDM={isDM}
              services={services}
              servers={servers}
              activeServiceId={activeServiceId}
              myTeamId={myTeamId}
              showOtherTeams={showOtherTeams}
              onOpenThread={setThread}
              onGoChannel={onGoChannel}
              onClearServiceFilter={() => setActiveServiceId('all')}
              workspaces={workspaces}
              selectedWorkspaceId={selectedWorkspaceId}
              selectedServerIds={selectedServerIds}
              onToggleServerTarget={(sid: number) =>
                setSelectedServerIds((prev) =>
                  prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid],
                )
              }
              onClearServerTargets={() => setSelectedServerIds([])}
              activeWorkspaceName={activeWorkspaceName}
            />
          )}
          {tab === 'History' && (
            <SupportHistory
              fromChannel={channel}
              workspaceId={selectedWorkspaceId === 'all' ? null : selectedWorkspaceId}
              serverIds={selectedServerIds}
            />
          )}
          {tab === 'Trend' && (
            <ChannelTrend
              services={services}
              activeServiceId={activeServiceId}
              channel={channel}
              workspaceId={selectedWorkspaceId === 'all' ? null : selectedWorkspaceId}
              workspaceName={activeWorkspaceName}
              servers={visibleServers}
              serverIds={selectedServerIds}
            />
          )}
          {tab === 'New Input' && (
            <NewInput
              channel={channel}
              services={services}
              activeServiceId={activeServiceId}
              workspaceId={selectedWorkspaceId === 'all' ? null : selectedWorkspaceId}
              workspaceName={activeWorkspaceName}
              servers={visibleServers}
              selectedServerIds={selectedServerIds}
              onToggleServer={(sid: number) =>
                setSelectedServerIds((prev) =>
                  prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid],
                )
              }
            />
          )}
          {tab === 'Reports' && (
            <ChannelReports
              channel={channel}
              services={services}
              activeServiceId={activeServiceId}
              myTeamId={myTeamId}
              workspaceId={selectedWorkspaceId === 'all' ? null : selectedWorkspaceId}
              workspaceName={activeWorkspaceName}
              serverIds={selectedServerIds}
            />
          )}
        </div>
        {thread && <ThreadPanel message={thread} onClose={() => setThread(null)}/>}
        {showAI && <AIPanel channel={channel} onClose={() => setShowAI(false)} />}
      </div>

      {showWorkspaceModal && (
        <WorkspaceManageModal
          channelId={channel.id}
          workspaces={workspaces}
          onClose={() => setShowWorkspaceModal(false)}
          onChanged={reloadWorkspaces}
        />
      )}
    </div>
  );
}
