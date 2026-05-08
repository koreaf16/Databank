/**
 * 파일: backend/src/modules/messaging/services/taskExtractor.ts
 * 역할: 메시지 본문을 LLM(JSON mode)으로 분석해 작업카드를 자동 추출한다.
 *       추출 결과는 엔지니어 검토 후 confirmTaskExtraction으로 이력 등록.
 * 연관 파일:
 *   - knowledge-base/services/ai/aiModelResolver.ts          : resolveLlmModelForUseCase
 *   - knowledge-base/services/generator/llmRouter.ts         : chatOnceWithModel
 *   - messaging/repository/messageRepository.ts              : findMessageById
 *   - messaging/repository/channelRepository.ts              : findChannelById
 *   - support-history/repository/supportHistoryRepository.ts : createHistory
 *   - audit/repository/auditRepository.ts                    : logAudit
 *   - messaging/routes/messagingRoutes.ts                    : 라우트 등록
 */

import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { withOracleTransaction } from '../../../infra/oracle/withTransaction.js';
import {
  resolveLlmModelForUseCase,
} from '../../knowledge-base/services/ai/aiModelResolver.js';
import {
  chatOnceWithModel,
} from '../../knowledge-base/services/generator/llmRouter.js';
import { findMessageById } from '../repository/messageRepository.js';
import { findChannelById } from '../repository/channelRepository.js';
import { createHistory } from '../../support-history/repository/supportHistoryRepository.js';
import { logAudit } from '../../audit/repository/auditRepository.js';
import type { LlmMessage } from '../../knowledge-base/services/generator/promptBuilder.js';

export interface ExtractedTask {
  taskName:          string;
  customerId:        number | null;
  category:          'routine' | 'incident' | 'install' | 'investigation';
  priority:          'low' | 'medium' | 'high' | 'urgent';
  estimatedMinutes:  number;
  serviceName:       string | null;
  summary:           string;
  actions:           Array<{ label: string; completed: boolean }>;
  followUp:          string | null;
  confidence:        number;
}

const TASK_SYSTEM_PROMPT = `너는 SI 운영 보조 AI다. 다음 메시지에서 지원이력 등록용 작업 카드를 추출한다.
출력은 반드시 JSON, 다음 스키마 강제:
{
  "taskName":         string,
  "customerId":       number | null,
  "category":         "routine"|"incident"|"install"|"investigation",
  "priority":         "low"|"medium"|"high"|"urgent",
  "estimatedMinutes": number,
  "serviceName":      string | null,
  "summary":          string,
  "actions":          [{ "label": string, "completed": boolean }],
  "followUp":         string | null,
  "confidence":       number
}
분류 기준:
- 설치/구축/패치/업그레이드/마이그레이션 수행 내역은 category="install".
- 장애 발생, 서비스 중단, 오류 복구, 원인 분석, 조치 내역 중심이면 category="incident".
- DB/OS 상태표, 점검표, 용량표, alert log 목록처럼 상태를 점검한 리포트는 위험 항목이 있어도 category="routine".
- 원인 확인만 있고 실제 조치가 불명확하면 category="investigation".

운영 리포트 처리 기준:
- Oracle 신호(ORA, tablespace, SGA, Data Guard, log sequence)는 serviceName="Oracle DB"로 우선 추론한다.
- Data Guard/Replication UNSYNC, 큰 sequence gap, ORA-600/ORA-7445/ORA-603, 디스크 80% 이상, 테이블스페이스 85% 이상은 summary와 actions에 근거 숫자를 포함한다.
- 작업카드는 전체 표를 복사하지 말고 핵심 위험, 조치 후보, 후속 확인만 압축한다.
- priority는 서비스 중단/DB 비정상 OPEN 실패면 urgent, 현재 장애는 아니지만 큰 복제 gap/내부 오류/디스크 80% 이상이면 high, 관찰 수준이면 medium, 특이사항 없으면 low.

근거 부족 필드는 null. 추측 금지. JSON 외 텍스트 없음.`;

interface TaskHints {
  category: ExtractedTask['category'] | null;
  serviceName: string | null;
  priority: ExtractedTask['priority'] | null;
  taskName: string | null;
  summary: string | null;
  actions: Array<{ label: string; completed: boolean }>;
  forceCategory: boolean;
  promptHint: string;
}

function validateExtracted(obj: any): asserts obj is ExtractedTask {
  if (!obj || typeof obj !== 'object') throw new Error('추출 결과가 올바르지 않습니다');
  if (!obj.taskName || typeof obj.taskName !== 'string') throw new Error('taskName 누락');
  if (!['routine', 'incident', 'install', 'investigation'].includes(obj.category)) {
    obj.category = 'routine';
  }
  if (!['low', 'medium', 'high', 'urgent'].includes(obj.priority)) {
    obj.priority = 'medium';
  }
  if (!Array.isArray(obj.actions)) obj.actions = [];
  if (typeof obj.confidence !== 'number') obj.confidence = 0.5;
}

/**
 * 메시지에서 작업카드 추출. 결과를 반환하며 저장은 confirmTaskExtraction에서 수행.
 */
export async function extractTaskFromMessage(
  channelId: string | number,
  messageId: string | number,
): Promise<{ extracted: ExtractedTask; confidence: number }> {
  return withOracleConnection(async (conn) => {
    const msg     = await findMessageById(conn, messageId);
    if (!msg) throw Object.assign(new Error('메시지를 찾을 수 없습니다'), { status: 404 });

    const channel  = await findChannelById(conn, channelId);
    const customerId = channel?.customerId ?? null;
    const messageText = String(msg.content || '');
    const hints = analyzeTaskMessage(messageText);

    const userPrompt = [
      channel ? `채널: ${channel.name}` : '',
      customerId ? `고객사 ID: ${customerId}` : '',
      hints.promptHint ? `규칙 기반 사전 분석 힌트:\n${hints.promptHint}` : '',
      `메시지 본문:\n<message>\n${messageText.slice(0, 8000)}\n</message>`,
    ].filter(Boolean).join('\n');

    const messages: LlmMessage[] = [
      { role: 'system', content: TASK_SYSTEM_PROMPT },
      { role: 'user',   content: userPrompt },
    ];

    const model  = await resolveLlmModelForUseCase(conn, 'task_extractor');
    const raw    = await chatOnceWithModel(model, messages, { responseFormat: 'json' });
    const parsed = JSON.parse(raw) as ExtractedTask;
    applyTaskHints(parsed, hints);
    validateExtracted(parsed);

    if (parsed.customerId == null && customerId) {
      parsed.customerId = customerId;
    }

    return { extracted: parsed, confidence: parsed.confidence };
  });
}

function analyzeTaskMessage(text: string): TaskHints {
  const source = String(text || '');
  const lower = source.toLowerCase();
  const facts: string[] = [];
  const risks: string[] = [];
  const actions: string[] = [];

  const server = source.match(/\[\s*SERVER\s*:\s*([^\]]+)\]/i)?.[1]?.trim() ?? null;
  const hasOperationalSections = /\[\s*\d+\.\s*(INSTANCE STATUS|SGA MEMORY|DATABASE SIZE|TABLESPACE USAGE|REPLICATION|OS DISK|RECENT ALERT)/i.test(source);
  const hasOracleSignal = /\bORA[-\s]?\d{3,5}\b|TABLESPACE|SGA|DATA\s*GUARD|LOG\s+SEQUENCE|INSTANCE\s+STATUS/i.test(source);
  const hasDiskSignal = /Filesystem\s+Size\s+Used\s+Avail\s+Use%|Mounted on/i.test(source);
  const hasInstallSignal = ['설치', '구축', '패치', '업그레이드', '마이그레이션', 'install', 'upgrade', 'patch'].some(v => lower.includes(v));
  const hasIncidentSignal = ['장애', '복구', '서비스 중단', '다운', 'incident', 'outage', 'failure'].some(v => lower.includes(v));

  const replicationGap = Number(source.match(/\bGap\s*-+\s*[\s\S]{0,160}?([0-9]{3,})\s*$/im)?.[1] ?? source.match(/\b(UNSYNC|LAGGING)\s+[0-9]+\s+([0-9]+)/i)?.[2] ?? 0);
  const hasInternalOra = /\bORA[-\s]?(600|00600|7445|07445|603|00603)\b/i.test(source);
  const hotDisk = maxPercent(source.matchAll(/\s([0-9]{2,3})%\s+\S+/g));
  const hotTablespace = maxPercent(source.matchAll(/^\s*[A-Z][A-Z0-9_$#]*\s+[.\d]+\s+[.\d]+\s+[.\d]+\s+([.\d]+)%?\s*$/gim));

  if (server) facts.push(`서버 ${server}`);
  if (replicationGap > 0) {
    risks.push(`Replication/Data Guard gap ${replicationGap.toLocaleString('en-US')}`);
    actions.push('Data Guard transport/apply 상태와 archive gap 해소 여부 확인');
  }
  if (hasInternalOra) {
    risks.push('ORA-600/ORA-7445/ORA-603 계열 내부 오류 확인');
    actions.push('alert log 및 trace 확인, 재발 여부 점검, 필요 시 패치/Oracle SR 검토');
  }
  if (hotDisk >= 80) {
    risks.push(`OS 디스크 사용률 최대 ${hotDisk}%`);
    actions.push('디스크 정리 또는 증설 계획 수립');
  }
  if (hotTablespace >= 85) {
    risks.push(`테이블스페이스 사용률 최대 ${hotTablespace}%`);
    actions.push('테이블스페이스 datafile/autoextend 여유 확인');
  }

  const category: ExtractedTask['category'] | null = hasInstallSignal
    ? 'install'
    : hasIncidentSignal
      ? 'incident'
      : hasOperationalSections
        ? 'routine'
        : null;
  const serviceName = hasOracleSignal ? 'Oracle DB' : hasDiskSignal ? 'OS/Server' : null;
  const priority: ExtractedTask['priority'] | null = hasIncidentSignal && (hasInternalOra || replicationGap >= 1000)
    ? 'urgent'
    : replicationGap >= 1000 || hasInternalOra || hotDisk >= 80 || hotTablespace >= 85
      ? 'high'
      : hasOperationalSections
        ? 'medium'
        : null;
  const label = category === 'install'
    ? '설치 내역'
    : category === 'incident'
      ? '장애 내역'
      : category === 'routine'
        ? '점검 결과'
        : '작업';
  const taskName = [server, serviceName, label].filter(Boolean).join(' ') || null;
  const summary = risks.length > 0
    ? `${taskName ?? '운영 리포트'}: ${risks.slice(0, 3).join(', ')}`
    : facts.length > 0
      ? `${taskName ?? '운영 리포트'}: ${facts.slice(0, 3).join(', ')}`
      : null;

  const promptHint = [
    category ? `category=${category}` : '',
    serviceName ? `serviceName=${serviceName}` : '',
    priority ? `priority=${priority}` : '',
    facts.length ? `facts=${facts.join(' | ')}` : '',
    risks.length ? `risks=${risks.join(' | ')}` : '',
    actions.length ? `actions=${actions.join(' | ')}` : '',
  ].filter(Boolean).join('\n');

  return {
    category,
    serviceName,
    priority,
    taskName,
    summary,
    actions: actions.map(label => ({ label, completed: false })),
    forceCategory: Boolean(hasInstallSignal || hasIncidentSignal || hasOperationalSections),
    promptHint,
  };
}

function applyTaskHints(task: Partial<ExtractedTask>, hints: TaskHints): void {
  if (!task.taskName && hints.taskName) task.taskName = hints.taskName;
  if (hints.forceCategory && hints.category) task.category = hints.category;
  if (!task.serviceName && hints.serviceName) task.serviceName = hints.serviceName;
  if (!task.summary && hints.summary) task.summary = hints.summary;
  if ((!Array.isArray(task.actions) || task.actions.length === 0) && hints.actions.length > 0) {
    task.actions = hints.actions;
  }
  if (hints.priority) {
    task.priority = maxPriority(task.priority, hints.priority);
  }
  if (typeof task.estimatedMinutes !== 'number' || !Number.isFinite(task.estimatedMinutes)) {
    task.estimatedMinutes = hints.category === 'routine' ? 60 : 90;
  }
  if (typeof task.confidence !== 'number') {
    task.confidence = hints.promptHint ? 0.78 : 0.5;
  }
}

function maxPriority(a: ExtractedTask['priority'] | undefined, b: ExtractedTask['priority']): ExtractedTask['priority'] {
  const rank: Record<ExtractedTask['priority'], number> = { low: 1, medium: 2, high: 3, urgent: 4 };
  if (!a || !rank[a]) return b;
  return rank[a] >= rank[b] ? a : b;
}

function maxPercent(matches: IterableIterator<RegExpMatchArray>): number {
  let max = 0;
  for (const match of matches) {
    const pct = Number(match[1]);
    if (Number.isFinite(pct)) max = Math.max(max, pct);
  }
  return max;
}

/**
 * 엔지니어가 검토 후 확정한 작업카드를 지원이력으로 저장.
 */
export async function confirmTaskExtraction(
  channelId: string | number,
  messageId: string | number,
  editedTask: ExtractedTask,
  userId: number,
): Promise<{ historyId: string }> {
  return withOracleTransaction(async (conn) => {
    const supportMode = 'remote';
    const created = await createHistory(conn, {
      customerId:   editedTask.customerId,
      serviceName:  editedTask.serviceName || '미지정',
      historyType:  editedTask.category,
      supportMode,
      priority:     editedTask.priority === 'urgent' ? 'p1'
                  : editedTask.priority === 'high'   ? 'p2'
                  : editedTask.priority === 'medium' ? 'p3' : 'p4',
      summary:      `${editedTask.taskName}\n\n${editedTask.summary}`,
      workDetail:   editedTask.actions.map(a => `- [${a.completed ? 'x' : ' '}] ${a.label}`).join('\n'),
      status:       'draft',
      createdBy:    userId,
    });

    const historyId = created?.historyId ?? created?.id ?? '';

    await logAudit(conn, {
      userId,
      action:     'task.extracted-from-message',
      entityType: 'support-history',
      entityId:   String(historyId),
      summary:    `메시지 ${messageId}에서 작업카드 추출·등록`,
    });

    return { historyId };
  });
}
