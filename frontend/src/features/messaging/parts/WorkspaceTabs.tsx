/**
 * 파일: frontend/src/features/messaging/parts/WorkspaceTabs.tsx
 * 역할: 채널 진입 시 상단에 표시되는 업무(workspace) 탭.
 *       [전체] [업무1] [업무2] ... [+업무 관리] 형태.
 *       업무는 시스템 단위 작업 공간(예: 계정계시스템, 홈페이지, MIS).
 *       서버는 별도 영역(ServiceBar)에서 필터/대상 선택 chip으로 다룬다.
 *
 * Usage:
 *   <WorkspaceTabs
 *     workspaces={workspaces}
 *     activeWorkspaceId={workspaceId}
 *     onSelect={setWorkspaceId}
 *     onManage={() => setShowManageModal(true)}
 *   />
 *
 * 연관 파일:
 *   - api/workspaceApi.ts                 : Workspace 타입, 데이터 소스
 *   - parts/WorkspaceManageModal.tsx      : "+업무 관리" 클릭 시 열리는 모달
 *   - components/Workspace.tsx            : 호출처
 *
 * Types/MockData source: api/workspaceApi.ts (Workspace)
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import type { Workspace } from '../api/workspaceApi.js';

interface WorkspaceTabsProps {
  workspaces: Workspace[];
  activeWorkspaceId: number | 'all';
  onSelect: (workspaceId: number | 'all') => void;
  onManage: () => void;
}

export function WorkspaceTabs({
  workspaces,
  activeWorkspaceId,
  onSelect,
  onManage,
}: WorkspaceTabsProps) {
  return (
    <div className="svc-bar">
      <div className="svc-bar-scroll">
        <button
          className={'svc-chip' + (activeWorkspaceId === 'all' ? ' on' : '')}
          onClick={() => onSelect('all')}
        >
          <Icon name="hash" size={11} className="" style={undefined} />
          전체
          <span className="svc-chip-count">{workspaces.length}</span>
        </button>

        {workspaces.map((ws) => (
          <button
            key={ws.id}
            className={'svc-chip' + (activeWorkspaceId === ws.id ? ' on' : '')}
            onClick={() => onSelect(ws.id)}
            title={ws.memo || ws.name}
          >
            {ws.name}
          </button>
        ))}

        <button
          className="svc-chip add"
          onClick={onManage}
          title="업무 추가/관리"
        >
          <Icon name="plus" size={11} className="" style={undefined} />
          업무 관리
        </button>
      </div>
    </div>
  );
}
