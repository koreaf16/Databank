/**
 * 파일: backend/src/modules/messaging/routes/messagingRoutes.ts
 * 역할: 채널·메시지 HTTP 라우트. /api/channels, /api/messages 경로.
 *
 * 채널 엔드포인트:
 *   GET  /api/channels                        — 채널 목록 (kind/status/userId 필터)
 *   GET  /api/channels/:id                    — 채널 상세
 *   POST /api/channels                        — 채널 생성
 *   PATCH /api/channels/:id                   — 채널 수정
 *   POST /api/channels/:id/members            — 멤버 추가
 *   DELETE /api/channels/:id/members/:userId  — 멤버 제거
 *
 * 채널 안 업무(workspace) 엔드포인트:
 *   GET    /api/channels/:id/workspaces                — 업무 목록
 *   POST   /api/channels/:id/workspaces                — 업무 생성
 *   PATCH  /api/channels/:id/workspaces/:workspaceId   — 업무 수정
 *   DELETE /api/channels/:id/workspaces/:workspaceId   — 업무 비활성화
 *
 * 메시지 엔드포인트:
 *   GET  /api/channels/:id/messages                              — 메시지 목록
 *   POST /api/channels/:id/messages                              — 메시지 전송
 *   DELETE /api/channels/:id/messages/:msgId                     — 메시지 삭제
 *   POST /api/channels/:id/messages/:msgId/reactions             — 리액션 토글
 *   POST /api/channels/:id/messages/:msgId/extract-task          — 작업카드 추출
 *   POST /api/channels/:id/messages/:msgId/extract-task/confirm  — 작업카드 확정 저장
 *
 * AI 엔드포인트:
 *   POST /api/channels/:id/assistant/ask     — SSE 스트리밍 Q&A
 *   POST /api/channels/:id/assistant/summary — 채널 요약 (단발)
 *
 * 연관 파일:
 *   - repository/channelRepository.ts        : 채널 DB
 *   - repository/messageRepository.ts        : 메시지 DB
 *   - services/channelAssistant.ts           : AI 어시스턴트
 *   - services/taskExtractor.ts              : 작업카드 추출
 */

import { Router } from 'express';
import { asyncHandler } from '../../../http/asyncHandler.js';
import { ok, created, errorResponse } from '../../../http/apiResponse.js';
import { requireOracle } from '../../../http/errorHandler.js';
import { toNumber } from '../../../http/validators/primitives.js';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../infra/oracle/withTransaction.js';
import {
  listChannels,
  findChannelById,
  createChannel,
  updateChannel,
  addChannelMember,
  removeChannelMember,
} from '../repository/channelRepository.js';
import {
  listMessages,
  createMessage,
  deleteMessage,
  toggleReaction,
} from '../repository/messageRepository.js';
import {
  listChannelServers,
  createChannelServer,
  updateChannelServer,
  deleteChannelServer,
  listAssignedServers,
} from '../repository/channelServerRepository.js';
import {
  listChannelWorkspaces,
  createChannelWorkspace,
  updateChannelWorkspace,
  deleteChannelWorkspace,
} from '../repository/workspaceRepository.js';
import { answerChannelQuestion, summarizeChannel } from '../services/channelAssistant.js';
import { extractTaskFromMessage, confirmTaskExtraction } from '../services/taskExtractor.js';
import {
  parseOperationalRecordFromMessage,
  confirmOperationalRecordFromMessage,
} from '../services/operationalRecord.js';
import { getCurrentUserId } from '../../../http/currentUser.js';
import { requirePermission, requireAnyPermission } from '../../../http/rbac.js';

// 쿼리스트링의 콤마 구분 ID 목록을 number[]로 파싱한다 (예: ?serverIds=1,2,3).
// 단일 값(?serverIds=1)이나 반복 형태(?serverIds=1&serverIds=2) 모두 지원.
function parseIdList(raw: unknown): number[] {
  if (raw == null || raw === '') return [];
  const flat = Array.isArray(raw) ? raw.join(',') : String(raw);
  return flat
    .split(',')
    .map((token) => toNumber(token.trim()))
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);
}

export const messagingRouter = Router();

// ── 채널 ─────────────────────────────────────────────────────────────────────

// GET /api/channels?kind=customer&status=active&userId=
messagingRouter.get('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const rows = await withOracleConnection(conn => listChannels(conn, {
    kind:   req.query.kind   as string | undefined,
    status: req.query.status as string | undefined,
    userId: toNumber(req.query.userId) || undefined,
  }));
  ok(res, rows);
}));

// GET /api/channels/assigned-servers — 현재 사용자가 정/부 엔지니어인 서버 목록
messagingRouter.get('/assigned-servers', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const userId = getCurrentUserId(req);
  if (!userId) return errorResponse(res, { code: 'UNAUTHORIZED', message: '로그인이 필요합니다' }, 401);
  const rows = await withOracleConnection(conn => listAssignedServers(conn, userId));
  ok(res, rows);
}));

// GET /api/channels/:id
messagingRouter.get('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleConnection(conn => findChannelById(conn, req.params.id));
  if (!row) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '채널을 찾을 수 없습니다' } });
  ok(res, row);
}));

// POST /api/channels
messagingRouter.post('/', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(conn => createChannel(conn, req.body || {}));
  created(res, row);
}));

// PATCH /api/channels/:id
messagingRouter.patch('/:id', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const row = await withOracleTransaction(conn => updateChannel(conn, req.params.id, req.body || {}));
  ok(res, row);
}));

// POST /api/channels/:id/members  — body: { userId }
messagingRouter.post('/:id/members', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const result = await withOracleTransaction(
    conn => addChannelMember(conn, req.params.id, req.body?.userId),
  );
  created(res, result);
}));

// DELETE /api/channels/:id/members/:userId
messagingRouter.delete('/:id/members/:userId', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const result = await withOracleTransaction(
    conn => removeChannelMember(conn, req.params.id, req.params.userId),
  );
  ok(res, result);
}));

// ── 채널 서버리스트 ──────────────────────────────────────────────────────────

// GET /api/channels/:id/servers
messagingRouter.get('/:id/servers', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const channelId = toNumber(req.params.id);
  if (channelId == null) return errorResponse(res, { message: '유효하지 않은 채널 ID입니다' }, 400);
  const rows = await withOracleConnection(conn => listChannelServers(conn, channelId));
  ok(res, rows);
}));

// POST /api/channels/:id/servers
messagingRouter.post('/:id/servers', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  if (!await requirePermission(req, res, 'customer.server.create')) return;
  const channelId = toNumber(req.params.id);
  if (channelId == null) return errorResponse(res, { message: '유효하지 않은 채널 ID입니다' }, 400);
  const row = await withOracleTransaction(conn =>
    createChannelServer(conn, channelId, req.body || {}, getCurrentUserId(req)),
  );
  created(res, row);
}));

// PATCH /api/channels/:id/servers/:serverId
messagingRouter.patch('/:id/servers/:serverId', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  if (!await requireAnyPermission(req, res, ['customer.server.create', 'customer.server.assign'])) return;
  const channelId = toNumber(req.params.id);
  const serverId = toNumber(req.params.serverId);
  if (channelId == null || serverId == null) return errorResponse(res, { message: '유효하지 않은 파라미터입니다' }, 400);
  const row = await withOracleTransaction(conn =>
    updateChannelServer(conn, channelId, serverId, req.body || {}),
  );
  ok(res, row);
}));

// DELETE /api/channels/:id/servers/:serverId
messagingRouter.delete('/:id/servers/:serverId', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  if (!await requirePermission(req, res, 'customer.server.create')) return;
  const channelId = toNumber(req.params.id);
  const serverId = toNumber(req.params.serverId);
  if (channelId == null || serverId == null) return errorResponse(res, { message: '유효하지 않은 파라미터입니다' }, 400);
  const result = await withOracleTransaction(conn => deleteChannelServer(conn, channelId, serverId));
  ok(res, result);
}));

// ── 채널 안 업무(workspace) ──────────────────────────────────────────────────

// GET /api/channels/:id/workspaces
messagingRouter.get('/:id/workspaces', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const channelId = toNumber(req.params.id);
  if (channelId == null) return errorResponse(res, { message: '유효하지 않은 채널 ID입니다' }, 400);
  const rows = await withOracleConnection(conn => listChannelWorkspaces(conn, channelId));
  ok(res, rows);
}));

// POST /api/channels/:id/workspaces  — body: { name, status?, primaryOwnerId?, memo? }
messagingRouter.post('/:id/workspaces', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  if (!await requirePermission(req, res, 'customer.workspace.create')) return;
  const channelId = toNumber(req.params.id);
  if (channelId == null) return errorResponse(res, { message: '유효하지 않은 채널 ID입니다' }, 400);
  const row = await withOracleTransaction(conn =>
    createChannelWorkspace(conn, channelId, req.body || {}, getCurrentUserId(req)),
  );
  created(res, row);
}));

// PATCH /api/channels/:id/workspaces/:workspaceId
messagingRouter.patch('/:id/workspaces/:workspaceId', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  if (!await requireAnyPermission(req, res, ['customer.workspace.create', 'customer.workspace.assign'])) return;
  const channelId = toNumber(req.params.id);
  const workspaceId = toNumber(req.params.workspaceId);
  if (channelId == null || workspaceId == null) return errorResponse(res, { message: '유효하지 않은 파라미터입니다' }, 400);
  const row = await withOracleTransaction(conn =>
    updateChannelWorkspace(conn, channelId, workspaceId, req.body || {}),
  );
  ok(res, row);
}));

// DELETE /api/channels/:id/workspaces/:workspaceId
messagingRouter.delete('/:id/workspaces/:workspaceId', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  if (!await requirePermission(req, res, 'customer.workspace.create')) return;
  const channelId = toNumber(req.params.id);
  const workspaceId = toNumber(req.params.workspaceId);
  if (channelId == null || workspaceId == null) return errorResponse(res, { message: '유효하지 않은 파라미터입니다' }, 400);
  const result = await withOracleTransaction(conn => deleteChannelWorkspace(conn, channelId, workspaceId));
  ok(res, result);
}));

// ── 메시지 ───────────────────────────────────────────────────────────────────

// GET /api/channels/:id/messages?before=ISO&limit=50&workspaceId=N&serverIds=1,2
messagingRouter.get('/:id/messages', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const days = await withOracleConnection(conn => listMessages(conn, req.params.id, {
    before:      req.query.before as string | undefined,
    limit:       toNumber(req.query.limit) || 50,
    parentId:    req.query.parentId != null ? (toNumber(req.query.parentId) || undefined) : undefined,
    workspaceId: req.query.workspaceId != null ? (toNumber(req.query.workspaceId) || undefined) : undefined,
    serverIds:   parseIdList(req.query.serverIds),
  }));
  ok(res, days);
}));

// POST /api/channels/:id/messages
messagingRouter.post('/:id/messages', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const msg = await withOracleTransaction(
    conn => createMessage(conn, req.params.id, req.body || {}),
  );
  created(res, msg);
}));

// DELETE /api/channels/:id/messages/:msgId — body: { userId }
messagingRouter.delete('/:id/messages/:msgId', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const result = await withOracleTransaction(
    conn => deleteMessage(conn, req.params.msgId, req.body?.userId),
  );
  ok(res, result);
}));

// POST /api/channels/:id/messages/:msgId/reactions — body: { userId, emoji }
messagingRouter.post('/:id/messages/:msgId/reactions', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const result = await withOracleTransaction(
    conn => toggleReaction(conn, req.params.msgId, req.body?.userId, req.body?.emoji),
  );
  ok(res, result);
}));

// POST /api/channels/:id/messages/:msgId/extract-task
messagingRouter.post('/:id/messages/:msgId/extract-task', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const result = await extractTaskFromMessage(req.params.id, req.params.msgId);
  ok(res, result);
}));

// POST /api/channels/:id/messages/:msgId/extract-task/confirm — body: { task }
messagingRouter.post('/:id/messages/:msgId/extract-task/confirm', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const userId = getCurrentUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다' } });
  const result = await confirmTaskExtraction(req.params.id, req.params.msgId, req.body?.task, userId);
  created(res, { ...result, ok: true });
}));

// POST /api/channels/:id/messages/:msgId/parse-operational
messagingRouter.post('/:id/messages/:msgId/parse-operational', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const result = await parseOperationalRecordFromMessage(req.params.id, req.params.msgId);
  ok(res, result);
}));

// POST /api/channels/:id/messages/:msgId/confirm-operational -- body: { parsed }
messagingRouter.post('/:id/messages/:msgId/confirm-operational', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const userId = getCurrentUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Login required' } });
  const result = await confirmOperationalRecordFromMessage(req.params.id, req.params.msgId, req.body?.parsed, userId);
  created(res, result);
}));

// ── AI 어시스턴트 ─────────────────────────────────────────────────────────────

// POST /api/channels/:id/assistant/ask — body: { question } — SSE 스트리밍
messagingRouter.post('/:id/assistant/ask', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const question = String(req.body?.question || '').trim();
  if (!question) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: '질문이 비어 있습니다' } });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: string, payload: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    await answerChannelQuestion(req.params.id, question, send);
  } catch (err: any) {
    send('error', { message: err?.message ?? 'AI 응답 오류' });
  } finally {
    res.end();
  }
}));

// POST /api/channels/:id/assistant/summary
messagingRouter.post('/:id/assistant/summary', asyncHandler(async (req, res) => {
  if (!requireOracle(res)) return;
  const summary = await summarizeChannel(req.params.id);
  ok(res, { summary });
}));
