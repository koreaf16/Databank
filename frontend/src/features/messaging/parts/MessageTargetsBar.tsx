/**
 * 파일: frontend/src/features/messaging/parts/MessageTargetsBar.tsx
 * 역할: 메시지 입력창 위에 표시되는 "대상" chip 영역.
 *       선택된 서버가 있으면 chip 목록 + ✕로 제거 가능.
 *       선택된 서버가 없으면 "대상: 업무 전체" 안내.
 *       서버 칩 다중 선택은 ServiceBar에서 이루어지고, 본 컴포넌트는 그 상태를 표시·해제만 한다.
 *
 * Usage:
 *   <MessageTargetsBar
 *     servers={servers}
 *     selectedServerIds={selectedServerIds}
 *     onRemove={(id) => setSelectedServerIds(prev => prev.filter(x => x !== id))}
 *   />
 *
 * 연관 파일:
 *   - parts/ServiceBar.tsx                 : 서버 칩 다중 선택 (이 상태를 prop으로 전달받음)
 *   - parts/Conversation.tsx               : 입력창 영역에서 본 컴포넌트를 렌더
 *   - components/Workspace.tsx             : selectedServerIds 상태 보유
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';

interface ServerLike {
  id: number | string;
  serverName: string;
}

interface MessageTargetsBarProps {
  servers: ServerLike[];
  selectedServerIds: ReadonlyArray<number>;
  onRemove: (serverId: number) => void;
  disabled?: boolean;
}

export function MessageTargetsBar({
  servers,
  selectedServerIds,
  onRemove,
  disabled = false,
}: MessageTargetsBarProps) {
  if (selectedServerIds.length === 0) {
    return (
      <div className="msg-targets msg-targets-empty">
        <span className="msg-targets-label">대상</span>
        <span className="msg-targets-hint">업무 전체</span>
      </div>
    );
  }

  return (
    <div className="msg-targets">
      <span className="msg-targets-label">대상</span>
      {selectedServerIds.map((sid) => {
        const server = servers.find((s) => Number(s.id) === Number(sid));
        if (!server) return null;
        return (
          <span key={sid} className="msg-target-chip">
            {server.serverName}
            <button
              className="msg-target-chip-x"
              onClick={() => onRemove(Number(sid))}
              disabled={disabled}
              title="대상에서 제거"
              aria-label={`${server.serverName} 제거`}
            >
              <Icon name="x" size={10} />
            </button>
          </span>
        );
      })}
    </div>
  );
}
