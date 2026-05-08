/**
 * 파일: frontend/src/features/messaging/parts/MessageContextTag.tsx
 * 역할: 메시지 옆에 표시되는 컨텍스트 chip.
 *       [업무: 전체] 모드에서는 [업무명/서버명 +N] 두 단계 태그,
 *       [업무 X] + [서버: 전체] 모드에서는 [서버명 +N] 한 단계 태그.
 *       대상이 비어있으면 "업무 전체" 라벨로 표시.
 *
 * Usage:
 *   <MessageContextTag
 *     workspaceName="계정계시스템"
 *     targets={msg.targets}
 *     variant="workspace"
 *   />
 *
 * 연관 파일:
 *   - parts/Conversation.tsx              : 메시지 렌더 시 사용
 *   - api/workspaceApi.ts                 : Workspace 타입
 *
 * Types: MessageTarget = { serverId: number; serverName: string }
 */

import React from 'react';

export interface MessageTarget {
  serverId: number;
  serverName: string;
}

interface MessageContextTagProps {
  workspaceName?: string | null;
  targets: MessageTarget[];
  variant: 'workspace' | 'server';
}

export function MessageContextTag({
  workspaceName,
  targets,
  variant,
}: MessageContextTagProps) {
  const hasTargets = Array.isArray(targets) && targets.length > 0;
  const first = hasTargets ? targets[0] : null;
  const extraCount = hasTargets ? targets.length - 1 : 0;

  if (variant === 'workspace') {
    return (
      <span className="msg-ctx-tag">
        {workspaceName && <span className="msg-ctx-ws">{workspaceName}</span>}
        {workspaceName && <span className="msg-ctx-sep">/</span>}
        {first ? (
          <>
            <span className="msg-ctx-srv">{first.serverName}</span>
            {extraCount > 0 && <span className="msg-ctx-extra">+{extraCount}</span>}
          </>
        ) : (
          <span className="msg-ctx-srv muted">업무 전체</span>
        )}
      </span>
    );
  }

  return (
    <span className="msg-ctx-tag">
      {first ? (
        <>
          <span className="msg-ctx-srv">{first.serverName}</span>
          {extraCount > 0 && <span className="msg-ctx-extra">+{extraCount}</span>}
        </>
      ) : (
        <span className="msg-ctx-srv muted">업무 전체</span>
      )}
    </span>
  );
}
