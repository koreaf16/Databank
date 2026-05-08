/**
 * 파일: frontend/src/features/messaging/parts/WorkspaceManageModal.tsx
 * 역할: 채널 안 업무(workspace) 추가/수정/비활성화 모달.
 *       업무 = 시스템 단위 작업 공간 (예: 계정계시스템, 홈페이지, MIS).
 *       기존 .modal-backdrop / .modal 패턴 (AddCustomerModal 참조).
 *
 * Usage:
 *   <WorkspaceManageModal
 *     channelId={channel.id}
 *     workspaces={workspaces}
 *     onClose={() => setOpen(false)}
 *     onChanged={reloadWorkspaces}
 *   />
 *
 * 연관 파일:
 *   - api/workspaceApi.ts                 : CRUD 호출
 *   - parts/WorkspaceTabs.tsx             : "+업무 관리" 클릭 시 이 모달 열림
 *   - components/Workspace.tsx            : 호출처
 *
 * Types/MockData source: api/workspaceApi.ts (Workspace, WorkspacePayload)
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import {
  createChannelWorkspace,
  updateChannelWorkspace,
  deleteChannelWorkspace,
  type Workspace,
} from '../api/workspaceApi.js';

interface WorkspaceManageModalProps {
  channelId: number | string;
  workspaces: Workspace[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}

export function WorkspaceManageModal({
  channelId,
  workspaces,
  onClose,
  onChanged,
}: WorkspaceManageModalProps) {
  const [newName, setNewName] = React.useState('');
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [editingName, setEditingName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleCreate() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createChannelWorkspace(channelId, { name });
      setNewName('');
      await onChanged();
    } catch (err: any) {
      setError(err?.message || '업무 생성에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(ws: Workspace) {
    setEditingId(ws.id);
    setEditingName(ws.name);
  }

  async function commitEdit() {
    if (editingId == null) return;
    const name = editingName.trim();
    if (!name || busy) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateChannelWorkspace(channelId, editingId, { name });
      setEditingId(null);
      await onChanged();
    } catch (err: any) {
      setError(err?.message || '업무 수정에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(ws: Workspace) {
    if (busy) return;
    const ok = window.confirm(`"${ws.name}" 업무를 비활성화하시겠습니까?\n속한 서버/메시지/이력은 그대로 남고 업무 연결만 해제됩니다.`);
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await deleteChannelWorkspace(channelId, ws.id);
      await onChanged();
    } catch (err: any) {
      setError(err?.message || '업무 비활성화에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <div>
            <div className="modal-title">업무 관리</div>
            <div className="text-3" style={{ fontSize: 12 }}>
              시스템 단위 작업 공간을 만들고 관리합니다 (예: 계정계시스템, 홈페이지, MIS).
            </div>
          </div>
          <button className="btn icon ghost" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="새 업무명 (예: 계정계시스템)"
              autoFocus
              disabled={busy}
              style={{ flex: 1 }}
            />
            <button
              className="btn primary"
              onClick={handleCreate}
              disabled={!newName.trim() || busy}
            >
              <Icon name="plus" size={13} /> 추가
            </button>
          </div>

          {error && (
            <div className="text-3" style={{ color: 'var(--danger-600, #dc2626)', fontSize: 12, marginBottom: 8 }}>
              {error}
            </div>
          )}

          <div className="ws-manage-list scroll">
            {workspaces.length === 0 && (
              <div className="svc-empty">아직 등록된 업무가 없습니다.</div>
            )}
            {workspaces.map((ws) => (
              <div key={ws.id} className="ws-manage-row">
                {editingId === ws.id ? (
                  <input
                    className="input"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                    disabled={busy}
                    style={{ flex: 1 }}
                  />
                ) : (
                  <button
                    className="ws-manage-name"
                    onClick={() => startEdit(ws)}
                    title="클릭해서 이름 수정"
                  >
                    {ws.name}
                  </button>
                )}
                <button
                  className="btn icon ghost"
                  onClick={() => handleDelete(ws)}
                  title="업무 비활성화"
                  disabled={busy}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
