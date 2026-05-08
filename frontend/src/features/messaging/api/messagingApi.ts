/**
 * 파일: frontend/src/features/messaging/api/messagingApi.js
 * 역할: 채널·메시지 백엔드 API 호출. /api/channels 경로.
 *       채널 목록(5종류), 메시지 목록/전송/삭제, 리액션 토글.
 *
 * 연관 파일:
 *   - shared/api/apiClient.js                              : fetch + envelope 파싱
 *   - features/messaging/components/Workspace-like usage  : 주 사용처
 *   - backend/src/modules/messaging/routes/messagingRoutes.ts : /api/channels
 */

import { apiGet, apiPost, apiPatch, apiDelete } from '../../../shared/api/apiClient.js';

// ── 채널 ─────────────────────────────────────────────────────────────────────

/**
 * 채널 목록 조회.
 * @param {object} params - kind, status, userId 필터
 */
export function getChannels(params = {}) {
  const q = {};
  if (params.kind)   q.kind   = params.kind;
  if (params.status) q.status = params.status;
  if (params.userId) q.userId = String(params.userId);
  return apiGet('/api/channels', Object.keys(q).length ? q : undefined);
}

export function getChannel(id) {
  return apiGet(`/api/channels/${id}`);
}

export function createChannel(payload) {
  return apiPost('/api/channels', payload);
}

export function updateChannel(id, payload) {
  return apiPatch(`/api/channels/${id}`, payload);
}

/** 채널 멤버 추가. body: { userId } */
export function addChannelMember(channelId, userId) {
  return apiPost(`/api/channels/${channelId}/members`, { userId });
}

/** 채널 멤버 제거 */
export function removeChannelMember(channelId, userId) {
  return apiDelete(`/api/channels/${channelId}/members/${userId}`);
}

// ── 채널 서버리스트 ──────────────────────────────────────────────────────────

export function getAssignedServers() {
  return apiGet('/api/channels/assigned-servers');
}

export function getChannelServers(channelId) {
  return apiGet(`/api/channels/${channelId}/servers`);
}

export function createChannelServer(channelId, payload) {
  return apiPost(`/api/channels/${channelId}/servers`, payload);
}

export function updateChannelServer(channelId, serverId, payload) {
  return apiPatch(`/api/channels/${channelId}/servers/${serverId}`, payload);
}

export function deleteChannelServer(channelId, serverId) {
  return apiDelete(`/api/channels/${channelId}/servers/${serverId}`);
}

// ── 메시지 ───────────────────────────────────────────────────────────────────

/**
 * 채널 메시지 목록 (날짜별 그룹).
 * @param {object} params - before, limit, parentId, workspaceId, serverIds(number[])
 * @returns {Array} [{ date, messages }] — 각 메시지에 targets[{serverId, serverName}] 포함
 */
export function getMessages(channelId, params = {}) {
  const q = {};
  if (params.before)        q.before      = params.before;
  if (params.limit)         q.limit       = String(params.limit);
  if (params.parentId)      q.parentId    = String(params.parentId);
  if (params.workspaceId)   q.workspaceId = String(params.workspaceId);
  if (Array.isArray(params.serverIds) && params.serverIds.length > 0) {
    q.serverIds = params.serverIds.join(',');
  }
  return apiGet(`/api/channels/${channelId}/messages`, Object.keys(q).length ? q : undefined);
}

/**
 * 메시지 전송.
 * body 필드:
 *   - authorUserId, content, msgType, attachmentJson?, parentId?  (기존)
 *   - workspaceId   : 메시지가 속할 업무. 업무 컨텍스트에서 작성 시 필수
 *   - serverIds[]   : 대상 서버 N개. 비면 "업무 전체" 메시지
 */
export function sendMessage(channelId, payload) {
  return apiPost(`/api/channels/${channelId}/messages`, payload);
}

/** 메시지 삭제. body: { userId } */
export function deleteMessage(channelId, messageId, userId) {
  return apiDelete(`/api/channels/${channelId}/messages/${messageId}`, { userId });
}

/** 리액션 토글. body: { userId, emoji } */
export function toggleReaction(channelId, messageId, userId, emoji) {
  return apiPost(`/api/channels/${channelId}/messages/${messageId}/reactions`, { userId, emoji });
}
