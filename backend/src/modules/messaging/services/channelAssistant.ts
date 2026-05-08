/**
 * 파일: backend/src/modules/messaging/services/channelAssistant.ts
 * 역할: 채널 AI 어시스턴트. KB 하이브리드 검색 + 최근 메시지 + 지원이력 컨텍스트 기반 Q&A.
 *       채널 7일 요약(summary) 기능도 제공.
 * 연관 파일:
 *   - knowledge-base/services/retriever/hybridFusion.ts     : hybridSearch
 *   - knowledge-base/services/ai/aiModelResolver.ts          : resolveLlmModelForUseCase
 *   - knowledge-base/services/generator/llmRouter.ts         : streamChatWithModel, chatOnceWithModel
 *   - messaging/repository/channelRepository.ts              : findChannelById
 *   - messaging/repository/messageRepository.ts              : listMessages
 *   - support-history/repository/supportHistoryRepository.ts : listHistories
 *   - messaging/routes/messagingRoutes.ts                    : 라우트 등록
 */

import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { hybridSearch } from '../../knowledge-base/services/retriever/hybridFusion.js';
import {
  resolveLlmModelForUseCase,
} from '../../knowledge-base/services/ai/aiModelResolver.js';
import {
  streamChatWithModel,
  chatOnceWithModel,
} from '../../knowledge-base/services/generator/llmRouter.js';
import { findChannelById } from '../repository/channelRepository.js';
import { listMessages } from '../repository/messageRepository.js';
import { listHistories } from '../../support-history/repository/supportHistoryRepository.js';
import type { LlmMessage } from '../../knowledge-base/services/generator/promptBuilder.js';

const CHANNEL_ASSISTANT_SYSTEM = `너는 DataBank Slack의 AI 어시스턴트 뱅크봇이다. 사용자는 SI 운영 엔지니어다.

답변 규칙:
1. 반드시 한국어로 답변한다.
2. 인용은 [1], [2] 형식 — 메시지·이력·KB 청크 번호로 매핑한다.
3. 컨텍스트에 없는 내용은 "확인 어려움"으로 답한다. 추측 금지.
4. 코드·명령어는 코드블록(\`\`\`)으로 감싼다.
5. KB 자료가 없으면 답변 첫 문장을 "관련 KB 자료가 없어 채널 기록만으로 답변드립니다."로 시작한다.
6. 8문단 이내로 간결하게 답한다.`;

export interface AssistantToken {
  type: 'token' | 'citation' | 'done' | 'error';
  token?: string;
  citationIdx?: number;
  label?: string;
  kind?: string;
  message?: string;
}

/**
 * 채널 Q&A 스트리밍. onEvent(type, payload) 콜백으로 SSE 이벤트를 전달한다.
 */
export async function answerChannelQuestion(
  channelId: string | number,
  question: string,
  onEvent: (event: string, payload: any) => void,
): Promise<void> {
  await withOracleConnection(async (conn) => {
    // 1. 채널 컨텍스트 수집
    const channel   = await findChannelById(conn, channelId);
    const rawDays   = await listMessages(conn, channelId, { limit: 50 });
    const recentMsgs = rawDays.flatMap((d: any) => d.messages || []).slice(-50);

    const allHistories = channel?.customerId
      ? await listHistories(conn, { customerId: channel.customerId })
      : [];
    const histories = (allHistories as any[]).slice(0, 5);

    // 2. KB 하이브리드 검색
    const kbChunks = await hybridSearch(conn, question, 3, 50, 'hybrid').catch(() => []);

    // 3. 인용 레지스트리 구성 (메시지 → 이력 → KB 순)
    const registry: Array<{ kind: string; label: string; ref: any }> = [];

    const msgContext = recentMsgs.slice(-20).map((m: any, i: number) => {
      registry.push({ kind: 'message', label: `${m.authorName || '사용자'}: ${String(m.content || '').slice(0, 60)}`, ref: m });
      return `[${registry.length}] ${m.authorName || '사용자'}: ${String(m.content || '').slice(0, 200)}`;
    }).join('\n');

    const histContext = (histories as any[]).slice(0, 5).map((h: any) => {
      registry.push({ kind: 'history', label: h.summary?.slice(0, 60) || h.historyId, ref: h });
      return `[${registry.length}] ${h.summary || ''} (${h.historyType || ''}, ${h.serviceName || ''})`;
    }).join('\n');

    const kbContext = kbChunks.slice(0, 3).map((c: any) => {
      registry.push({ kind: 'kb', label: c.heading || c.docTitle || 'KB', ref: c });
      return `[${registry.length}] ${c.content?.slice(0, 300) || ''}`;
    }).join('\n');

    // 4. 컨텍스트 조립
    const contextParts: string[] = [];
    if (msgContext)  contextParts.push(`=== 최근 메시지 ===\n${msgContext}`);
    if (histContext) contextParts.push(`=== 지원 이력 ===\n${histContext}`);
    if (kbContext)   contextParts.push(`=== 지식베이스 ===\n${kbContext}`);

    const hasKb = kbChunks.length > 0;
    const systemContent = hasKb
      ? CHANNEL_ASSISTANT_SYSTEM
      : CHANNEL_ASSISTANT_SYSTEM;

    const llmMessages: LlmMessage[] = [
      { role: 'system', content: systemContent },
      { role: 'user',   content: `${contextParts.join('\n\n')}\n\n질문: ${question}` },
    ];

    // 5. LLM 스트리밍
    const model = await resolveLlmModelForUseCase(conn, 'channel_assistant');
    await streamChatWithModel(model, llmMessages, (chunk) => {
      if (chunk.token) onEvent('token', { token: chunk.token });
      if (chunk.done)  {
        // 인용 레지스트리 전송
        registry.forEach((r, i) => {
          onEvent('citation', { idx: i + 1, kind: r.kind, label: r.label });
        });
        onEvent('done', {});
      }
    });
  });
}

/**
 * 채널 최근 5일 요약 (단발 호출, 스트리밍 없음).
 */
export async function summarizeChannel(channelId: string | number): Promise<string> {
  return withOracleConnection(async (conn) => {
    const channel  = await findChannelById(conn, channelId);
    const rawDays  = await listMessages(conn, channelId, { limit: 100 });
    const msgs     = rawDays.flatMap((d: any) => d.messages || []).slice(-100);

    const rawHistories = channel?.customerId
      ? await listHistories(conn, { customerId: channel.customerId })
      : [];
    const histories = (rawHistories as any[]).slice(0, 5);

    const msgContext = msgs.slice(-30).map((m: any) =>
      `${m.authorName || '사용자'}: ${String(m.content || '').slice(0, 150)}`,
    ).join('\n');

    const histContext = (histories as any[]).slice(0, 3).map((h: any) =>
      `이력: ${h.summary || ''} (${h.historyType || ''})`,
    ).join('\n');

    const llmMessages: LlmMessage[] = [
      {
        role: 'system',
        content: `너는 DataBank Slack AI 어시스턴트다. 채널의 최근 활동을 3-5문장으로 한국어 요약한다. 핵심 사항·주요 이슈·후속 필요 사항 위주로 작성한다.`,
      },
      {
        role: 'user',
        content: `채널: ${channel?.name || channelId}\n\n=== 최근 메시지 ===\n${msgContext}\n\n=== 최근 지원이력 ===\n${histContext}\n\n위 내용을 요약해줘.`,
      },
    ];

    const model = await resolveLlmModelForUseCase(conn, 'channel_assistant');
    return chatOnceWithModel(model, llmMessages);
  });
}
