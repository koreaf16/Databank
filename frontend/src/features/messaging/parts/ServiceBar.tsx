/**
 * 파일: frontend/src/features/messaging/parts/ServiceBar.tsx
 * 역할: 업무(workspace) 안의 서버 칩 — 필터 + 대상 선택 도구 (다중 선택).
 *       선택된 서버는 Conversation/NewInput 등에서 메시지·이력 대상으로 사용된다.
 *       방 전환이 아니라 같은 채팅 흐름 안에서 서버를 필터/태깅하는 역할.
 *
 * Usage:
 *   <ServiceBar
 *     servers={visibleServers}
 *     selectedServerIds={selectedServerIds}
 *     onToggle={(sid) => toggleServer(sid)}
 *     onClearAll={() => setSelectedServerIds([])}
 *   />
 *
 * 연관 파일:
 *   - components/Workspace.tsx              : 호출처 (selectedServerIds 보유)
 *   - parts/Conversation.tsx                : 선택 상태로 메시지 필터/대상 결정
 *   - parts/MessageTargetsBar.tsx           : 입력창 위에서 동일 chip 표시
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';

interface ServiceBarProps {
  servers:           any[];
  selectedServerIds: ReadonlyArray<number>;
  onToggle:          (serverId: number) => void;
  onClearAll:        () => void;
  onManage?:         () => void;
}

export function ServiceBar({
  servers,
  selectedServerIds,
  onToggle,
  onClearAll,
  onManage,
}: ServiceBarProps) {
  const allSelected = selectedServerIds.length === 0;
  const isOn = (sid: number) => selectedServerIds.includes(Number(sid));

  return (
    <div className="svc-bar">
      <div className="svc-bar-scroll">
        {/* "전체" 칩 — 모든 서버 선택 해제 */}
        <button
          className={'svc-chip' + (allSelected ? ' on' : '')}
          onClick={onClearAll}
          title="필터 해제 (업무 전체 보기)"
        >
          <Icon name="hash" size={11} className="" style={undefined}/>
          전체
          <span className="svc-chip-count">{servers.length}</span>
        </button>

        {/* 서버 칩 — 클릭 시 다중 선택/해제 */}
        {servers.map((server: any) => {
          const sid = Number(server.id);
          const on = isOn(sid);
          return (
            <button
              key={server.id}
              className={'svc-chip' + (on ? ' on' : '')}
              onClick={() => onToggle(sid)}
              title={[server.serverName, server.platform, server.productName].filter(Boolean).join(' · ')}
            >
              {server.status === 'warning' && (
                <span className="svc-chip-dot" style={{ background: '#f59e0b' }}/>
              )}
              {server.status === 'error' && (
                <span className="svc-chip-dot" style={{ background: '#ef4444' }}/>
              )}
              {server.serverName}
              {server.productName && (
                <span className="svc-chip-freq">{server.productName}</span>
              )}
            </button>
          );
        })}

        {/* 서버 관리 모달 호출 (선택) */}
        {onManage && (
          <button
            className="svc-chip add"
            onClick={onManage}
            title="서버리스트에서 서버 관리"
          >
            <Icon name="plus" size={11} className="" style={undefined}/> 서버 관리
          </button>
        )}
      </div>
    </div>
  );
}
