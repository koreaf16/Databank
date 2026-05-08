/**
 * 파일: frontend/src/features/messaging/api/workspaceApi.ts
 * 역할: 채널 안 업무(workspace) CRUD 백엔드 API 호출.
 *       업무 = 시스템 단위 작업 공간 (예: 계정계시스템, 홈페이지, MIS).
 *
 * Usage:
 *   import { getChannelWorkspaces, createChannelWorkspace } from './workspaceApi';
 *   const workspaces = await getChannelWorkspaces(channelId);
 *
 * 연관 파일:
 *   - shared/api/apiClient.js                                       : fetch + envelope 파싱
 *   - features/messaging/parts/WorkspaceTabs.tsx                   : 상위 업무 탭 (사용처)
 *   - features/messaging/parts/WorkspaceManageModal.tsx            : 업무 추가/수정 모달
 *   - backend/src/modules/messaging/routes/messagingRoutes.ts      : /api/channels/:id/workspaces
 *
 * Types:
 *   Workspace = { id, channelId, name, status, primaryOwnerId?, primaryOwnerName?, memo?, ... }
 */

import { apiGet, apiPost, apiPatch, apiDelete } from '../../../shared/api/apiClient.js';

export interface Workspace {
  id: number;
  channelId: number;
  name: string;
  status: 'active' | 'paused' | 'archived';
  primaryOwnerId: number | null;
  primaryOwnerName: string | null;
  memo: string | null;
  enabled: boolean;
  createdBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface WorkspacePayload {
  name: string;
  status?: 'active' | 'paused' | 'archived';
  primaryOwnerId?: number | null;
  memo?: string | null;
}

export function getChannelWorkspaces(channelId: number | string): Promise<Workspace[]> {
  return apiGet(`/api/channels/${channelId}/workspaces`);
}

export function createChannelWorkspace(channelId: number | string, payload: WorkspacePayload): Promise<Workspace> {
  return apiPost(`/api/channels/${channelId}/workspaces`, payload);
}

export function updateChannelWorkspace(
  channelId: number | string,
  workspaceId: number | string,
  payload: Partial<WorkspacePayload>,
): Promise<Workspace> {
  return apiPatch(`/api/channels/${channelId}/workspaces/${workspaceId}`, payload);
}

export function deleteChannelWorkspace(
  channelId: number | string,
  workspaceId: number | string,
): Promise<{ workspaceId: number; removed: boolean }> {
  return apiDelete(`/api/channels/${channelId}/workspaces/${workspaceId}`);
}
