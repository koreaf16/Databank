/**
 * 파일: backend/src/modules/support-history/services/textParser.ts
 * 역할: 자유 형식 업무 메모를 LLM(JSON mode)으로 분석해 지원이력 필드를 추출한다.
 *       New Input 탭 AI 파싱 기능에서 호출.
 * 연관 파일:
 *   - knowledge-base/services/ai/aiModelResolver.ts : resolveLlmModelForUseCase
 *   - knowledge-base/services/generator/llmRouter.ts : chatOnceWithModel
 *   - support-history/routes/supportHistoryRoutes.ts : /parse-text 라우트
 */

import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { resolveLlmModelForUseCase } from '../../knowledge-base/services/ai/aiModelResolver.js';
import { chatOnceWithModel } from '../../knowledge-base/services/generator/llmRouter.js';
import type { LlmMessage } from '../../knowledge-base/services/generator/promptBuilder.js';
import { listTargets, type MonitorTargetRow } from '../../metrics/repository/metricRepository.js';

const HISTORY_TYPES = ['routine', 'incident', 'install', 'investigation'] as const;
const SUPPORT_MODES = ['remote', 'onsite'] as const;
const DOCUMENT_TYPES = [
  'work_memo',
  'inspection_report',
  'incident_report',
  'installation_record',
  'troubleshooting_log',
  'other',
] as const;
const SEVERITIES = ['normal', 'watch', 'warning', 'critical'] as const;
const PRIORITIES = ['p1', 'p2', 'p3', 'p4'] as const;

type HistoryType = typeof HISTORY_TYPES[number];
type SupportMode = typeof SUPPORT_MODES[number];
type DocumentType = typeof DOCUMENT_TYPES[number];
type Severity = typeof SEVERITIES[number];
type Priority = typeof PRIORITIES[number];

const PARSE_SYSTEM = `너는 SI 운영 엔지니어의 업무 메모, 설치내역, 장애내역, 정기점검 리포트를 지원이력으로 구조화하는 AI다.
출력은 반드시 JSON, 다음 스키마 강제:
{
  "customer":     string | null,
  "service":      string | null,
  "historyType":  "routine"|"incident"|"install"|"investigation"|null,
  "supportMode":  "remote"|"onsite"|null,
  "startTime":    string | null,
  "endTime":      string | null,
  "engineers":    string | null,
  "summary":      string | null,
  "documentType": "work_memo"|"inspection_report"|"incident_report"|"installation_record"|"troubleshooting_log"|"other"|null,
  "severity":     "normal"|"watch"|"warning"|"critical"|null,
  "priority":     "p1"|"p2"|"p3"|"p4"|null,
  "finding":      string | null,
  "action":       string | null,
  "confidence":   number
}

분류 기준:
- 설치/구축/패치/업그레이드/마이그레이션 수행 내역은 historyType="install".
- 장애 발생, 서비스 중단, 오류 복구, 원인 분석, 조치 내역 중심이면 historyType="incident".
- DB/OS 상태표, 점검표, 용량표, alert log 목록처럼 상태를 점검한 리포트는 위험 항목이 있어도 historyType="routine".
- 원인 확인만 있고 실제 조치가 불명확하면 historyType="investigation".

운영 리포트 처리 기준:
- Oracle 신호(ORA, tablespace, SGA, Data Guard, log sequence)는 service="Oracle DB"로 우선 추론한다.
- Filesystem/Use%/Mounted on은 OS 디스크 점검 신호로 본다.
- Data Guard/Replication UNSYNC, 큰 sequence gap, ORA-600/ORA-7445/ORA-603, 디스크 80% 이상, 테이블스페이스 85% 이상은 finding에 근거 숫자를 포함한다.
- action에는 엔지니어가 바로 실행할 후속 확인/조치 항목을 쓴다.
- summary는 500자 이내로, 핵심 상태와 위험만 압축한다.
- startTime/endTime은 실제 작업 시간일 때만 "YYYY-MM-DD HH:MM" 형식으로 정규화한다. alert log 발생시각을 작업시간으로 오인하지 않는다.

근거 없는 필드는 null. 추측 금지. JSON 외 텍스트 없음.`;

const SERVER_SPLIT_SYSTEM = `You split operational database/server check text into server-specific sections.
Return JSON only:
{
  "servers": [
    { "serverLabel": "string", "sourceText": "exact source text for only that server", "confidence": 0.0 }
  ]
}
Rules:
- Split only when the text clearly contains more than one server or target.
- Keep sourceText as close to the original text as possible.
- Do not summarize.
- If unsure, return one server containing the full text.`;

const TARGET_MATCH_SYSTEM = `You match one parsed server section to one monitoring target.
Return JSON only:
{ "targetId": number | null, "confidence": number, "reason": "short reason" }
Rules:
- Choose only from the provided targetId values.
- Ignore numeric prefixes such as "43." when matching labels.
- Use server label, instance name, hostname, target name, and description.
- Return null if the match is ambiguous.`;

export interface ParsedHistoryFields {
  customer:     string | null;
  service:      string | null;
  historyType:  HistoryType | null;
  supportMode:  SupportMode | null;
  startTime:    string | null;
  endTime:      string | null;
  engineers:    string | null;
  summary:      string | null;
  documentType: DocumentType | null;
  severity:     Severity | null;
  priority:     Priority | null;
  finding:      string | null;
  action:       string | null;
  confidence:   number;
}

export interface OperationalMetricCandidate {
  id: string;
  metricId: string;
  label: string;
  value: number;
  unit: string;
  dimensionKey: string | null;
  dimensionValue: string | null;
  rawLabel: string | null;
  status: 'ok' | 'warn' | 'crit';
  selected: boolean;
  targetId: number | null;
  collectedAt: string;
  evidence: string;
  serverKey?: string | null;
  serverLabel?: string | null;
  matchConfidence?: number | null;
  matchReason?: string | null;
}

export interface OperationalServerGroup {
  serverKey: string;
  serverLabel: string;
  sourceText: string;
  metricIndexes: number[];
  confidence: number;
  matchedTargetId: number | null;
  matchedTargetName: string | null;
  matchConfidence: number;
  matchReason: string | null;
}

export interface OperationalParseResult extends ParsedHistoryFields {
  documentKind: 'inspection' | 'summary' | 'incident' | 'tech' | 'install' | 'other';
  historyDraft: {
    customer: string | null;
    service: string | null;
    historyType: HistoryType | null;
    supportMode: SupportMode | null;
    priority: Priority | null;
    summary: string | null;
    workDetail: string | null;
    finding: string | null;
    action: string | null;
    startTime: string | null;
    endTime: string | null;
  };
  sections: Array<{ title: string; content: string }>;
  metricCandidates: OperationalMetricCandidate[];
  serverGroups: OperationalServerGroup[];
}

interface OperationalHints {
  documentType: DocumentType | null;
  historyType: HistoryType | null;
  supportMode: SupportMode | null;
  service: string | null;
  severity: Severity | null;
  priority: Priority | null;
  summary: string | null;
  finding: string | null;
  action: string | null;
  confidence: number;
  promptHint: string;
  lockHistoryType: boolean;
}

export async function parseHistoryText(
  text: string,
  channelName?: string,
): Promise<ParsedHistoryFields> {
  return withOracleConnection(async (conn) => {
    const hints = analyzeOperationalText(text, channelName);
    const userPrompt = [
      `기준일(Asia/Seoul): ${todayKst()}`,
      channelName ? `채널(고객사 힌트): ${channelName}` : '',
      hints.promptHint ? `규칙 기반 사전 분석 힌트:\n${hints.promptHint}` : '',
      `업무 메모:\n${text.slice(0, 3000)}`,
    ].filter(Boolean).join('\n');

    const messages: LlmMessage[] = [
      { role: 'system', content: PARSE_SYSTEM },
      { role: 'user',   content: userPrompt },
    ];

    const model  = await resolveLlmModelForUseCase(conn, 'text_parser');
    const raw    = await chatOnceWithModel(model, messages, { responseFormat: 'json' });
    const parsed = JSON.parse(raw) as Partial<ParsedHistoryFields>;
    return normalizeParsedHistory(parsed, hints);
  });
}

export async function parseOperationalRecordText(
  text: string,
  channelName?: string,
  options: { customerId?: number | string | null } = {},
): Promise<OperationalParseResult> {
  const parsed = await parseHistoryText(text, channelName);
  const targets = await loadMonitorTargets(options.customerId);
  const { metricCandidates, serverGroups } = await extractServerScopedMetricCandidates(text, targets);
  const documentKind = toDocumentKind(parsed);
  const workDetail = buildWorkDetailFromSections(text, documentKind, parsed, metricCandidates);
  const sections = buildOperationalSections(documentKind, parsed, metricCandidates);

  return {
    ...parsed,
    documentKind,
    historyDraft: {
      customer: parsed.customer,
      service: parsed.service,
      historyType: parsed.historyType,
      supportMode: parsed.supportMode,
      priority: parsed.priority,
      summary: parsed.summary,
      workDetail,
      finding: parsed.finding,
      action: parsed.action,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
    },
    sections,
    metricCandidates,
    serverGroups,
  };
}

interface TextServerBlock {
  serverKey: string;
  serverLabel: string;
  sourceText: string;
  confidence: number;
}

interface TargetMatch {
  targetId: number | null;
  targetName: string | null;
  confidence: number;
  reason: string | null;
}

async function loadMonitorTargets(customerId: number | string | null | undefined): Promise<MonitorTargetRow[]> {
  const id = customerId == null || customerId === '' ? null : Number(customerId);
  if (!id || !Number.isFinite(id)) return [];
  try {
    return await withOracleConnection(conn => listTargets(conn, { customerId: id }));
  } catch {
    return [];
  }
}

async function extractServerScopedMetricCandidates(
  text: string,
  targets: MonitorTargetRow[],
): Promise<{ metricCandidates: OperationalMetricCandidate[]; serverGroups: OperationalServerGroup[] }> {
  const blocks = await splitOperationalServerBlocks(text);
  const metricCandidates: OperationalMetricCandidate[] = [];
  const serverGroups: OperationalServerGroup[] = [];

  for (const block of blocks) {
    const match = await matchServerTarget(block, targets);
    const extracted = extractOperationalMetricCandidates(block.sourceText);
    const startIndex = metricCandidates.length;
    const autoTargetId = match.confidence >= 0.8 ? match.targetId : null;

    for (const metric of extracted) {
      metricCandidates.push({
        ...metric,
        id: `${block.serverKey}:${metric.id}`,
        serverKey: block.serverKey,
        serverLabel: block.serverLabel,
        targetId: metric.targetId ?? autoTargetId,
        matchConfidence: match.confidence,
        matchReason: match.reason,
      });
    }

    serverGroups.push({
      serverKey: block.serverKey,
      serverLabel: block.serverLabel,
      sourceText: block.sourceText,
      metricIndexes: extracted.map((_, offset) => startIndex + offset),
      confidence: block.confidence,
      matchedTargetId: autoTargetId,
      matchedTargetName: autoTargetId ? match.targetName : null,
      matchConfidence: match.confidence,
      matchReason: match.reason,
    });
  }

  return { metricCandidates, serverGroups };
}

async function splitOperationalServerBlocks(text: string): Promise<TextServerBlock[]> {
  const source = normalizeNewlines(text);
  const markerBlocks = splitServerBlocksByMarkers(source);
  if (markerBlocks.length > 1 || !shouldAskLlmForServerSplit(source)) {
    return markerBlocks.length ? markerBlocks : [singleServerBlock(source, null, 0.55)];
  }

  const llmBlocks = await splitServerBlocksWithLlm(source);
  if (llmBlocks.length > 1) return llmBlocks;
  return markerBlocks.length ? markerBlocks : [singleServerBlock(source, null, 0.55)];
}

function splitServerBlocksByMarkers(source: string): TextServerBlock[] {
  const lines = source.split('\n');
  const starts: Array<{ line: number; label: string }> = [];
  const marker = /^\s*\[\s*SERVER\s*:\s*([^\]]+)\]\s*$/i;
  const simple = /^\s*(?:server|host|hostname|db\s*server)\s*[:=]\s*(.{2,100})\s*$/i;

  lines.forEach((line, index) => {
    const match = line.match(marker) ?? line.match(simple);
    if (match?.[1]) starts.push({ line: index, label: match[1].trim() });
  });

  if (!starts.length) return [];
  return starts.map((start, index) => {
    const next = starts[index + 1]?.line ?? lines.length;
    const prefix = index === 0 && start.line > 0
      ? lines.slice(0, start.line).filter(line => line.trim()).join('\n')
      : '';
    const body = lines.slice(start.line, next).join('\n');
    const sourceText = [prefix, body].filter(Boolean).join('\n');
    return singleServerBlock(sourceText, start.label, 0.98, index);
  });
}

function shouldAskLlmForServerSplit(source: string): boolean {
  const repeatedSectionCount = [
    /\[\s*1\.\s*INSTANCE STATUS\]/gi,
    /\[\s*2\.\s*SGA MEMORY HIT RATIO\]/gi,
    /\[\s*4\.\s*TABLESPACE USAGE DETAILS\]/gi,
    /\[\s*6\.\s*OS DISK USAGE\]/gi,
  ].reduce((max, regex) => Math.max(max, Array.from(source.matchAll(regex)).length), 0);
  if (repeatedSectionCount > 1) return true;
  const instanceRows = Array.from(source.matchAll(/^\s*([A-Za-z0-9_$#.-]+)\s+OPEN\s+(PRIMARY|STANDBY|PHYSICAL STANDBY|LOGICAL STANDBY)/gim));
  return instanceRows.length > 1;
}

async function splitServerBlocksWithLlm(source: string): Promise<TextServerBlock[]> {
  try {
    return await withOracleConnection(async (conn) => {
      const model = await resolveLlmModelForUseCase(conn, 'text_parser');
      const messages: LlmMessage[] = [
        { role: 'system', content: SERVER_SPLIT_SYSTEM },
        { role: 'user', content: `Operational text:\n${source.slice(0, 12000)}` },
      ];
      const raw = await chatOnceWithModel(model, messages, { responseFormat: 'json' });
      const parsed = JSON.parse(raw) as { servers?: Array<{ serverLabel?: string; sourceText?: string; confidence?: number }> };
      const servers = Array.isArray(parsed.servers) ? parsed.servers : [];
      return servers
        .map((server, index) => singleServerBlock(
          cleanText(server.sourceText) ?? '',
          cleanText(server.serverLabel),
          clampNumber(numberOr(server.confidence, 0.65), 0, 1),
          index,
        ))
        .filter(block => block.sourceText.length >= 40);
    });
  } catch {
    return [];
  }
}

function singleServerBlock(sourceText: string, label: string | null, confidence: number, index = 0): TextServerBlock {
  const inferredLabel = label ?? inferServerLabel(sourceText) ?? (index === 0 ? 'Server' : `Server ${index + 1}`);
  return {
    serverKey: makeServerKey(inferredLabel, index),
    serverLabel: inferredLabel,
    sourceText,
    confidence,
  };
}

function inferServerLabel(source: string): string | null {
  return firstMatch(source, /\[\s*SERVER\s*:\s*([^\]]+)\]/i)
    ?? firstMatch(source, /^\s*(?:server|host|hostname|db\s*server)\s*[:=]\s*(.+)$/im)
    ?? parseInstanceStatus(unfoldWrappedDfLines(source.split('\n')))?.instance
    ?? null;
}

function makeServerKey(label: string, index: number): string {
  const key = normalizeIdentity(label) || `server${index + 1}`;
  return `${key}-${index + 1}`;
}

async function matchServerTarget(block: TextServerBlock, targets: MonitorTargetRow[]): Promise<TargetMatch> {
  if (!targets.length) {
    return { targetId: null, targetName: null, confidence: 0, reason: 'No monitoring targets available' };
  }

  const deterministic = deterministicTargetMatch(block, targets);
  if (deterministic.confidence >= 0.88) return deterministic;

  const llm = await matchServerTargetWithLlm(block, targets);
  return llm.confidence > deterministic.confidence ? llm : deterministic;
}

function deterministicTargetMatch(block: TextServerBlock, targets: MonitorTargetRow[]): TargetMatch {
  if (targets.length === 1) {
    const target = targets[0];
    return {
      targetId: target.targetId,
      targetName: target.name,
      confidence: block.serverLabel === 'Server' ? 0.72 : 0.86,
      reason: 'Only monitoring target for customer',
    };
  }

  const aliases = buildServerAliases(block);
  const scored = targets
    .map(target => scoreTargetMatch(target, aliases))
    .sort((a, b) => b.confidence - a.confidence);
  const best = scored[0];
  if (!best || best.confidence <= 0) {
    return { targetId: null, targetName: null, confidence: 0, reason: 'No deterministic match' };
  }

  const second = scored[1];
  const ambiguous = second && best.confidence - second.confidence < 0.06;
  return {
    targetId: ambiguous ? null : best.target.targetId,
    targetName: ambiguous ? null : best.target.name,
    confidence: ambiguous ? Math.min(best.confidence, 0.69) : best.confidence,
    reason: ambiguous
      ? `Ambiguous target match: ${best.target.name} / ${second.target.name}`
      : best.reason,
  };
}

function buildServerAliases(block: TextServerBlock): string[] {
  const lines = unfoldWrappedDfLines(block.sourceText.split('\n'));
  const instance = parseInstanceStatus(lines)?.instance;
  const raw = [block.serverLabel, instance].filter(Boolean) as string[];
  const aliases = new Set<string>();

  for (const value of raw) {
    const stripped = stripNumericPrefix(value);
    [value, stripped, ...value.split(/[._\-\s]+/), ...stripped.split(/[._\-\s]+/)]
      .map(normalizeIdentity)
      .filter(alias => alias.length >= 3)
      .forEach(alias => aliases.add(alias));
  }

  return Array.from(aliases);
}

function scoreTargetMatch(target: MonitorTargetRow, aliases: string[]): { target: MonitorTargetRow; confidence: number; reason: string } {
  const fields = [
    ['name', target.name],
    ['hostname', target.hostname],
    ['description', target.description],
    ['systemType', target.systemType],
  ] as const;
  let confidence = 0;
  let reason = 'No match';

  for (const alias of aliases) {
    for (const [field, value] of fields) {
      const normalized = normalizeIdentity(String(value ?? ''));
      if (!normalized) continue;
      let score = 0;
      if (normalized === alias) score = 0.96;
      else if (normalized.includes(alias) && alias.length >= 3) score = 0.9;
      else if (alias.includes(normalized) && normalized.length >= 3) score = 0.82;
      else if (tokenOverlap(alias, normalized) >= 0.8) score = 0.78;
      if (score > confidence) {
        confidence = score;
        reason = `${field} matched ${alias}`;
      }
    }
  }

  return { target, confidence, reason };
}

async function matchServerTargetWithLlm(block: TextServerBlock, targets: MonitorTargetRow[]): Promise<TargetMatch> {
  try {
    return await withOracleConnection(async (conn) => {
      const model = await resolveLlmModelForUseCase(conn, 'text_parser');
      const targetOptions = targets.slice(0, 80).map(target => ({
        targetId: target.targetId,
        name: target.name,
        hostname: target.hostname,
        systemType: target.systemType,
        description: target.description,
      }));
      const messages: LlmMessage[] = [
        { role: 'system', content: TARGET_MATCH_SYSTEM },
        {
          role: 'user',
          content: JSON.stringify({
            serverLabel: block.serverLabel,
            sourceText: block.sourceText.slice(0, 2500),
            targets: targetOptions,
          }),
        },
      ];
      const raw = await chatOnceWithModel(model, messages, { responseFormat: 'json' });
      const parsed = JSON.parse(raw) as { targetId?: number | string | null; confidence?: number; reason?: string };
      const targetId = parsed.targetId == null ? null : Number(parsed.targetId);
      const target = targets.find(item => item.targetId === targetId) ?? null;
      if (!target) {
        return { targetId: null, targetName: null, confidence: 0, reason: 'LLM returned no valid target' };
      }
      return {
        targetId: target.targetId,
        targetName: target.name,
        confidence: clampNumber(numberOr(parsed.confidence, 0), 0, 1),
        reason: cleanText(parsed.reason) ?? 'LLM target match',
      };
    });
  } catch {
    return { targetId: null, targetName: null, confidence: 0, reason: 'LLM target match failed' };
  }
}

function stripNumericPrefix(value: string): string {
  return String(value || '').trim().replace(/^\d+\s*[._\-\s]+/, '');
}

function normalizeIdentity(value: string): string {
  return stripNumericPrefix(value)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z0-9가-힣]+/g, '');
}

function tokenOverlap(left: string, right: string): number {
  const l = new Set(left.match(/[a-z]+|\d+|[가-힣]+/g) ?? []);
  const r = new Set(right.match(/[a-z]+|\d+|[가-힣]+/g) ?? []);
  if (!l.size || !r.size) return 0;
  let matches = 0;
  for (const token of l) {
    if (r.has(token)) matches += 1;
  }
  return matches / Math.max(l.size, r.size);
}

function extractOperationalMetricCandidates(text: string): OperationalMetricCandidate[] {
  const source = normalizeNewlines(text);
  const lines = unfoldWrappedDfLines(source.split('\n'));
  const collectedAt = new Date().toISOString();
  const candidates: OperationalMetricCandidate[] = [];

  const push = (input: Omit<OperationalMetricCandidate, 'id' | 'selected' | 'targetId' | 'collectedAt'> & { selected?: boolean }) => {
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    candidates.push({
      ...input,
      id: `${input.metricId}:${input.dimensionKey ?? ''}:${input.dimensionValue ?? ''}:${candidates.length + 1}`,
      value,
      selected: input.selected ?? true,
      targetId: null,
      collectedAt,
    });
  };

  const ratioMap: Array<[RegExp, string, string, 'high' | 'low', number | null, number | null]> = [
    [/Buffer Cache Hit Ratio\s*:\s*([.\d]+)%?/i, 'oracle.sga.buffer_cache_hit_ratio', 'Buffer Cache Hit Ratio', 'low', 95, 90],
    [/Library Cache Hit Ratio\s*:\s*([.\d]+)%?/i, 'oracle.sga.library_cache_hit_ratio', 'Library Cache Hit Ratio', 'low', 95, 90],
    [/Dictionary Cache Hit Ratio\s*:\s*([.\d]+)%?/i, 'oracle.sga.dictionary_cache_hit_ratio', 'Dictionary Cache Hit Ratio', 'low', 95, 90],
    [/Shared Pool Free \(%\)\s*:\s*([.\d]+)%?/i, 'oracle.sga.shared_pool_free', 'Shared Pool Free', 'low', 10, 5],
  ];
  for (const [regex, metricId, label, direction, warn, crit] of ratioMap) {
    const match = source.match(regex);
    if (!match) continue;
    const value = Number(normalizeDecimal(match[1]));
    push({
      metricId, label, value, unit: '%',
      dimensionKey: 'ratio', dimensionValue: label, rawLabel: label,
      status: statusFor(value, direction, warn, crit),
      evidence: match[0],
    });
  }

  const totalDb = firstMatch(source, /Total DB Size\s+([.\d]+)/i);
  if (totalDb) {
    push({
      metricId: 'oracle.db.total_size_gb',
      label: 'Total DB Size',
      value: Number(normalizeDecimal(totalDb)),
      unit: 'GB',
      dimensionKey: 'database',
      dimensionValue: 'total',
      rawLabel: 'Total DB Size',
      status: 'ok',
      evidence: `Total DB Size ${totalDb} GB`,
    });
  }
  const segmentSize = firstMatch(source, /Total Segment Size\s+([.\d]+)/i);
  if (segmentSize) {
    push({
      metricId: 'oracle.db.segment_size_gb',
      label: 'Total Segment Size',
      value: Number(normalizeDecimal(segmentSize)),
      unit: 'GB',
      dimensionKey: 'database',
      dimensionValue: 'segment',
      rawLabel: 'Total Segment Size',
      status: 'ok',
      evidence: `Total Segment Size ${segmentSize} GB`,
    });
  }
  const actualUsage = firstMatch(source, /Actual Usage %\s+-\s+([.\d]+)%?/i);
  if (actualUsage) {
    const value = Number(normalizeDecimal(actualUsage));
    push({
      metricId: 'oracle.db.actual_usage',
      label: 'Actual DB Usage',
      value,
      unit: '%',
      dimensionKey: 'database',
      dimensionValue: 'actual',
      rawLabel: 'Actual Usage %',
      status: statusFor(value, 'high', 80, 90),
      evidence: `Actual Usage ${actualUsage}%`,
    });
  }

  for (const row of parseUsageRows(lines, /^[A-Z][A-Z0-9_$#]*$/i)) {
    push({
      metricId: 'oracle.tablespace.usage',
      label: `Tablespace ${row.name}`,
      value: row.usedPct,
      unit: '%',
      dimensionKey: 'tablespace',
      dimensionValue: row.name,
      rawLabel: row.name,
      status: statusFor(row.usedPct, 'high', 80, 90),
      evidence: `${row.name} ${formatPercent(row.usedPct)}`,
    });
    if (Number.isFinite(row.totalMb)) {
      push({
        metricId: 'oracle.tablespace.total_mb',
        label: `Tablespace ${row.name} Total`,
        value: row.totalMb,
        unit: 'MB',
        dimensionKey: 'tablespace',
        dimensionValue: row.name,
        rawLabel: `${row.name} Total`,
        status: 'ok',
        evidence: `${row.name} Total: ${row.totalMb} MB`,
      });
    }
    if (Number.isFinite(row.usedMb)) {
      push({
        metricId: 'oracle.tablespace.used_mb',
        label: `Tablespace ${row.name} Used`,
        value: row.usedMb,
        unit: 'MB',
        dimensionKey: 'tablespace',
        dimensionValue: row.name,
        rawLabel: `${row.name} Used`,
        status: 'ok',
        evidence: `${row.name} Used: ${row.usedMb} MB`,
      });
    }
    if (Number.isFinite(row.freeMb)) {
      push({
        metricId: 'oracle.tablespace.free_mb',
        label: `Tablespace ${row.name} Free`,
        value: row.freeMb,
        unit: 'MB',
        dimensionKey: 'tablespace',
        dimensionValue: row.name,
        rawLabel: `${row.name} Free`,
        status: 'ok',
        evidence: `${row.name} Free: ${row.freeMb} MB`,
      });
    }
  }

  const replication = parseReplication(lines, source);
  if (replication) {
    push({
      metricId: 'oracle.replication.apply_gap_seq',
      label: `${replication.node} apply gap`,
      value: replication.gap,
      unit: 'seq',
      dimensionKey: 'standby',
      dimensionValue: replication.node,
      rawLabel: 'Replication Gap',
      status: statusFor(replication.gap, 'high', 1, 1000),
      evidence: `${replication.node} ${replication.syncState} gap ${replication.gap}`,
    });
    if (replication.sourceSeq) {
      push({
        metricId: 'oracle.replication.source_sequence',
        label: 'Source DB current log sequence',
        value: replication.sourceSeq,
        unit: 'seq',
        dimensionKey: 'database',
        dimensionValue: 'source',
        rawLabel: 'Source DB current log sequence',
        status: 'ok',
        evidence: `SOURCE DB CURRENT LOG SEQUENCE: ${replication.sourceSeq}`,
      });
    }
    push({
      metricId: 'oracle.replication.applied_sequence',
      label: `${replication.node} applied sequence`,
      value: replication.appliedSeq,
      unit: 'seq',
      dimensionKey: 'standby',
      dimensionValue: replication.node,
      rawLabel: 'Applied SEQ#',
      status: 'ok',
      evidence: `${replication.node} applied ${replication.appliedSeq}`,
    });
  }

  for (const disk of parseDiskRows(lines)) {
    push({
      metricId: 'linux.disk.usage',
      label: `Disk ${disk.mount}`,
      value: disk.usedPct,
      unit: '%',
      dimensionKey: 'mount',
      dimensionValue: disk.mount,
      rawLabel: disk.filesystem,
      status: statusFor(disk.usedPct, 'high', 80, 90),
      evidence: `${disk.filesystem} ${disk.usedPct}% ${disk.mount}`,
    });
    if (disk.totalGb !== null) {
      push({
        metricId: 'linux.disk.total_gb',
        label: `Disk ${disk.mount} Total`,
        value: disk.totalGb,
        unit: 'GB',
        dimensionKey: 'mount',
        dimensionValue: disk.mount,
        rawLabel: `${disk.filesystem} Total`,
        status: 'ok',
        evidence: `${disk.mount} Total: ${Number.isInteger(disk.totalGb) ? disk.totalGb : disk.totalGb.toFixed(2)} GB`,
      });
    }
    if (disk.usedGb !== null) {
      push({
        metricId: 'linux.disk.used_gb',
        label: `Disk ${disk.mount} Used`,
        value: disk.usedGb,
        unit: 'GB',
        dimensionKey: 'mount',
        dimensionValue: disk.mount,
        rawLabel: `${disk.filesystem} Used`,
        status: 'ok',
        evidence: `${disk.mount} Used: ${Number.isInteger(disk.usedGb) ? disk.usedGb : disk.usedGb.toFixed(2)} GB`,
      });
    }
    if (disk.availGb !== null) {
      push({
        metricId: 'linux.disk.avail_gb',
        label: `Disk ${disk.mount} Avail`,
        value: disk.availGb,
        unit: 'GB',
        dimensionKey: 'mount',
        dimensionValue: disk.mount,
        rawLabel: `${disk.filesystem} Avail`,
        status: 'ok',
        evidence: `${disk.mount} Avail: ${Number.isInteger(disk.availGb) ? disk.availGb : disk.availGb.toFixed(2)} GB`,
      });
    }
  }

  const alert = parseOracleAlerts(source);
  if (alert.total > 0) {
    push({
      metricId: 'oracle.alert.errors',
      label: 'Recent alert log ORA errors',
      value: alert.total,
      unit: 'count',
      dimensionKey: 'alert',
      dimensionValue: 'all',
      rawLabel: 'Recent alert log ORA errors',
      status: statusFor(alert.total, 'high', 1, 5),
      evidence: alert.labels.slice(0, 5).join(', '),
    });
    push({
      metricId: 'oracle.alert.internal_errors',
      label: 'Recent alert log internal ORA errors',
      value: alert.severe,
      unit: 'count',
      dimensionKey: 'alert',
      dimensionValue: 'internal',
      rawLabel: 'ORA-600/7445/603',
      status: statusFor(alert.severe, 'high', 1, 3),
      evidence: alert.labels.filter(v => /ORA-00600|ORA-07445|ORA-00603/.test(v)).slice(0, 5).join(', '),
    });
  }

  return candidates;
}

function toDocumentKind(parsed: ParsedHistoryFields): OperationalParseResult['documentKind'] {
  if (parsed.historyType === 'install' || parsed.documentType === 'installation_record') return 'install';
  if (parsed.historyType === 'incident' || parsed.documentType === 'incident_report' || parsed.documentType === 'troubleshooting_log') return 'incident';
  if (parsed.documentType === 'inspection_report' || parsed.historyType === 'routine') return 'inspection';
  if (parsed.documentType === 'work_memo') return 'tech';
  return parsed.summary ? 'summary' : 'other';
}

function buildOperationalSections(
  documentKind: OperationalParseResult['documentKind'],
  parsed: ParsedHistoryFields,
  metrics: OperationalMetricCandidate[],
): Array<{ title: string; content: string }> {
  const hotMetrics = metrics
    .filter(m => m.status !== 'ok')
    .slice(0, 8)
    .map(m => `- ${m.label}: ${m.value}${m.unit} (${m.status})`)
    .join('\n');
  const metricSummary = metrics.length
    ? `Parsed metrics: ${metrics.length}${hotMetrics ? `\n${hotMetrics}` : ''}`
    : '';
  const base = [
    { title: 'Summary', content: parsed.summary || '' },
    { title: 'Findings', content: parsed.finding || metricSummary },
    { title: 'Actions', content: parsed.action || '' },
  ].filter(s => s.content);

  if (documentKind === 'incident') {
    return [
      { title: 'Symptoms', content: parsed.summary || '' },
      { title: 'Cause / Findings', content: parsed.finding || '' },
      { title: 'Action / Recovery', content: parsed.action || '' },
      { title: 'Metrics', content: metricSummary },
    ].filter(s => s.content);
  }
  if (documentKind === 'install') {
    return [
      { title: 'Install Target', content: parsed.service || '' },
      { title: 'Work Details', content: parsed.summary || '' },
      { title: 'Verification', content: parsed.finding || metricSummary },
      { title: 'Follow-up', content: parsed.action || '' },
    ].filter(s => s.content);
  }
  if (documentKind === 'inspection') {
    return [
      { title: 'Inspection Summary', content: parsed.summary || '' },
      { title: 'Risk Items', content: parsed.finding || hotMetrics },
      { title: 'Recommended Actions', content: parsed.action || '' },
      { title: 'Parsed Metrics', content: metricSummary },
    ].filter(s => s.content);
  }
  return base;
}

function buildWorkDetailFromSections(
  text: string,
  documentKind: OperationalParseResult['documentKind'],
  parsed: ParsedHistoryFields,
  metrics: OperationalMetricCandidate[],
): string {
  const lines = [
    `Document kind: ${documentKind}`,
    parsed.summary ? `Summary: ${parsed.summary}` : '',
    parsed.finding ? `Findings:\n${parsed.finding}` : '',
    parsed.action ? `Actions:\n${parsed.action}` : '',
    metrics.length ? `Parsed metrics:\n${metrics.map(m => `- ${m.label}: ${m.value}${m.unit} [${m.status}]`).join('\n')}` : '',
    `\nOriginal text:\n${text}`,
  ].filter(Boolean);
  return truncate(lines.join('\n\n'), 3900) || text.slice(0, 3900);
}

function statusFor(value: number, direction: 'high' | 'low', warn: number | null, crit: number | null): 'ok' | 'warn' | 'crit' {
  if (warn == null || crit == null) return 'ok';
  if (direction === 'low') {
    if (value <= crit) return 'crit';
    if (value <= warn) return 'warn';
    return 'ok';
  }
  if (value >= crit) return 'crit';
  if (value >= warn) return 'warn';
  return 'ok';
}

function analyzeOperationalText(text: string, channelName?: string): OperationalHints {
  const source = normalizeNewlines(text);
  const lower = source.toLowerCase();
  const lines = unfoldWrappedDfLines(source.split('\n'));
  const facts: string[] = [];
  const risks: string[] = [];
  const actions: string[] = [];
  let riskRank = 0;

  const setRisk = (rank: number): void => {
    riskRank = Math.max(riskRank, rank);
  };

  const server = firstMatch(source, /\[\s*SERVER\s*:\s*([^\]]+)\]/i)
    ?? firstMatch(source, /^\s*server\s*[:=]\s*(.+)$/im);
  if (server) facts.push(`서버 ${server.trim()}`);

  const hasOperationalSections = /\[\s*\d+\.\s*(INSTANCE STATUS|SGA MEMORY|DATABASE SIZE|TABLESPACE USAGE|REPLICATION|OS DISK|RECENT ALERT)/i.test(source);
  const hasOracleSignal = /\bORA[-\s]?\d{3,5}\b|TABLESPACE|SGA|DATA\s*GUARD|LOG\s+SEQUENCE|INSTANCE\s+STATUS/i.test(source);
  const hasDiskSignal = /Filesystem\s+Size\s+Used\s+Avail\s+Use%|Mounted on/i.test(source);
  const hasInstallSignal = hasAny(lower, ['설치', '구축', '패치', '업그레이드', '마이그레이션', 'install', 'upgrade', 'patch']);
  const hasIncidentSignal = hasAny(lower, ['장애', '복구', '서비스 중단', '다운', '오류 조치', 'incident', 'outage', 'failure']);
  const hasOnsiteSignal = hasAny(lower, ['방문', '현장', '출장', 'onsite']);

  const instance = parseInstanceStatus(lines);
  if (instance) {
    facts.push(`DB ${instance.instance} ${instance.status}/${instance.role}/${instance.openMode}`);
    if (instance.status !== 'OPEN') {
      risks.push(`DB 인스턴스 상태가 ${instance.status}`);
      actions.push('DB 인스턴스 상태와 alert log를 즉시 확인');
      setRisk(3);
    }
  }

  const dbUsage = firstMatch(source, /Actual Usage %\s+-\s+([.\d]+)%?/i);
  if (dbUsage) facts.push(`DB 실제 사용률 ${normalizeDecimal(dbUsage)}%`);

  const replication = parseReplication(lines, source);
  if (replication) {
    facts.push(`Source SEQ ${formatNumber(replication.sourceSeq)} / ${replication.node} ${replication.syncState} gap ${formatNumber(replication.gap)}`);
    if (replication.syncState !== 'SYNC' || replication.gap > 0) {
      risks.push(`${replication.node} ${replication.syncState}, archive/apply gap ${formatNumber(replication.gap)}`);
      actions.push('Data Guard transport/apply 상태, MRP/RFS 프로세스, archive gap 해소 여부 확인');
      setRisk(replication.gap >= 1000 || replication.syncState === 'UNSYNC' ? 3 : 2);
    }
  }

  const tablespaces = parseUsageRows(lines, /^[A-Z][A-Z0-9_$#]*$/i);
  const hotTablespaces = tablespaces.filter(row => row.usedPct >= 75).sort((a, b) => b.usedPct - a.usedPct);
  if (hotTablespaces.length > 0) {
    const top = hotTablespaces[0];
    facts.push(`최고 테이블스페이스 사용률 ${top.name} ${formatPercent(top.usedPct)}`);
    const risky = hotTablespaces.filter(row => row.usedPct >= 85);
    if (risky.length > 0) {
      risks.push(`테이블스페이스 임계치 접근: ${risky.slice(0, 3).map(row => `${row.name} ${formatPercent(row.usedPct)}`).join(', ')}`);
      actions.push('테이블스페이스 autoextend, datafile 여유, 증설 필요 여부 확인');
      setRisk(risky.some(row => row.usedPct >= 90) ? 3 : 2);
    }
  }

  const disks = parseDiskRows(lines);
  const hotDisks = disks.filter(row => row.usedPct >= 75).sort((a, b) => b.usedPct - a.usedPct);
  if (hotDisks.length > 0) {
    facts.push(`디스크 사용률 상위 ${hotDisks.slice(0, 3).map(row => `${row.mount} ${row.usedPct}%`).join(', ')}`);
    const risky = hotDisks.filter(row => row.usedPct >= 80);
    if (risky.length > 0) {
      risks.push(`OS 디스크 임계치 접근: ${risky.slice(0, 3).map(row => `${row.mount} ${row.usedPct}%`).join(', ')}`);
      actions.push('디스크 정리 또는 증설 계획 수립, 백업/덤프/로그 적재 경로 확인');
      setRisk(risky.some(row => row.usedPct >= 90) ? 3 : 2);
    }
  }

  const alert = parseOracleAlerts(source);
  if (alert.total > 0) {
    facts.push(`alert log ORA ${alert.labels.slice(0, 5).join(', ')}${alert.total > 5 ? ` 외 ${alert.total - 5}건` : ''}`);
    if (alert.severe > 0) {
      risks.push(`ORA-600/ORA-7445 등 내부 오류 ${alert.severe}건 확인${alert.latestAt ? `, 최신 ${alert.latestAt}` : ''}`);
      actions.push('ORA 내부 오류 trace 확인, 재발 여부 점검, 필요 시 패치/Oracle SR 검토');
      setRisk(3);
    } else {
      actions.push('alert log 오류의 재발 여부와 영향 범위 확인');
      setRisk(1);
    }
  }

  const service = hasOracleSignal ? 'Oracle DB' : hasDiskSignal ? 'OS/Server' : null;
  const documentType: DocumentType | null = hasInstallSignal
    ? 'installation_record'
    : hasIncidentSignal
      ? 'incident_report'
      : hasOperationalSections
        ? 'inspection_report'
        : null;
  const historyType: HistoryType | null = hasInstallSignal
    ? 'install'
    : hasIncidentSignal
      ? 'incident'
      : hasOperationalSections
        ? 'routine'
        : null;
  const lockHistoryType = Boolean(hasInstallSignal || hasIncidentSignal || hasOperationalSections);
  const severity = rankToSeverity(riskRank);
  const priority = rankToPriority(riskRank, hasIncidentSignal);
  const subject = buildSubject(server, service, documentType, channelName);
  const summary = buildSummary(subject, facts, risks);

  if (actions.length === 0 && facts.length > 0) {
    actions.push('점검 결과를 지원이력에 기록하고 주요 지표 추이를 다음 점검 때 재확인');
  }

  const findingLines = [
    ...facts.slice(0, 6).map(v => `- ${v}`),
    ...risks.slice(0, 6).map(v => `- 위험: ${v}`),
  ];

  const confidence = facts.length + risks.length >= 4 ? 0.88 : facts.length > 0 ? 0.74 : 0.5;
  const hintParts = [
    documentType ? `documentType=${documentType}` : '',
    historyType ? `historyType=${historyType}` : '',
    service ? `service=${service}` : '',
    severity ? `severity=${severity}` : '',
    priority ? `priority=${priority}` : '',
    facts.length ? `facts=${facts.slice(0, 8).join(' | ')}` : '',
    risks.length ? `risks=${risks.slice(0, 8).join(' | ')}` : '',
    actions.length ? `recommendedActions=${actions.slice(0, 5).join(' | ')}` : '',
  ].filter(Boolean);

  return {
    documentType,
    historyType,
    supportMode: hasOnsiteSignal ? 'onsite' : hasOperationalSections || hasOracleSignal || hasDiskSignal ? 'remote' : null,
    service,
    severity,
    priority,
    summary,
    finding: findingLines.length ? findingLines.join('\n') : null,
    action: actions.length ? actions.map(v => `- ${v}`).join('\n') : null,
    confidence,
    promptHint: hintParts.join('\n'),
    lockHistoryType,
  };
}

function normalizeParsedHistory(parsed: Partial<ParsedHistoryFields>, hints: OperationalHints): ParsedHistoryFields {
  const parsedHistoryType = asEnum(parsed.historyType, HISTORY_TYPES);
  const historyType = hints.lockHistoryType
    ? (hints.historyType ?? parsedHistoryType)
    : (parsedHistoryType ?? hints.historyType);

  const confidence = clampNumber(
    Math.max(numberOr(parsed.confidence, 0.5), hints.confidence),
    0,
    1,
  );

  return {
    customer:     cleanText(parsed.customer),
    service:      cleanText(parsed.service) ?? hints.service,
    historyType,
    supportMode:  asEnum(parsed.supportMode, SUPPORT_MODES) ?? hints.supportMode,
    startTime:    normalizeDateTime(cleanText(parsed.startTime)),
    endTime:      normalizeDateTime(cleanText(parsed.endTime)),
    engineers:    cleanText(parsed.engineers),
    summary:      truncate(cleanText(parsed.summary) ?? hints.summary, 900),
    documentType: asEnum(parsed.documentType, DOCUMENT_TYPES) ?? hints.documentType,
    severity:     asEnum(parsed.severity, SEVERITIES) ?? hints.severity,
    priority:     asEnum(parsed.priority, PRIORITIES) ?? hints.priority,
    finding:      truncate(cleanText(parsed.finding) ?? hints.finding, 1800),
    action:       truncate(cleanText(parsed.action) ?? hints.action, 1800),
    confidence,
  };
}

function parseInstanceStatus(lines: string[]): { instance: string; status: string; role: string; openMode: string } | null {
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z0-9_$#.-]+)\s+(OPEN|MOUNTED|STARTED|SHUTDOWN|CLOSED)\s+(.+?)\s+(READ\s+WRITE|READ\s+ONLY|MOUNTED|NOMOUNT)\s*$/i);
    if (match && match[1].toUpperCase() !== 'INSTANCE') {
      return {
        instance: match[1],
        status: match[2].toUpperCase(),
        role: match[3].trim().replace(/\s+/g, ' ').toUpperCase(),
        openMode: match[4].trim().replace(/\s+/g, ' ').toUpperCase(),
      };
    }
  }
  return null;
}

function parseReplication(lines: string[], source: string): { sourceSeq: number; node: string; syncState: string; appliedSeq: number; gap: number } | null {
  const sourceSeq = Number(firstMatch(source, /SOURCE DB CURRENT LOG SEQUENCE:\s*([0-9]+)/i) ?? 0);
  for (const line of lines) {
    const match = line.match(/^\s*(.+?)\s+(SYNC|UNSYNC|LAGGING|ERROR|UNKNOWN)\s+([0-9]+)\s+([0-9]+)\s*$/i);
    if (!match || /Node Name/i.test(match[1])) continue;
    return {
      sourceSeq,
      node: match[1].trim().replace(/\s+/g, ' '),
      syncState: match[2].toUpperCase(),
      appliedSeq: Number(match[3]),
      gap: Number(match[4]),
    };
  }
  return null;
}

function parseUsageRows(lines: string[], namePattern: RegExp): Array<{ name: string; usedPct: number; totalMb: number; usedMb: number; freeMb: number }> {
  const rows: Array<{ name: string; usedPct: number; totalMb: number; usedMb: number; freeMb: number }> = [];
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z0-9_$#.-]+)\s+([.\d]+)\s+([.\d]+)\s+([.\d]+)\s+([.\d]+)%?\s*$/);
    if (!match || !namePattern.test(match[1])) continue;
    const pct = Number(match[5]);
    if (Number.isFinite(pct)) {
      rows.push({
        name: match[1],
        totalMb: Number(match[2]),
        usedMb: Number(match[3]),
        freeMb: Number(match[4]),
        usedPct: pct,
      });
    }
  }
  return rows;
}

function parseSizeToGb(sizeStr: string): number | null {
  const match = sizeStr.trim().toUpperCase().match(/^([.\d]+)\s*([KMGTP]?)B?$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = match[2];
  if (unit === 'K') return value / 1024 / 1024;
  if (unit === 'M') return value / 1024;
  if (unit === 'G' || unit === '') return value;
  if (unit === 'T') return value * 1024;
  if (unit === 'P') return value * 1024 * 1024;
  return value;
}

function parseDiskRows(lines: string[]): Array<{ filesystem: string; mount: string; usedPct: number; totalGb: number | null; usedGb: number | null; availGb: number | null }> {
  const rows: Array<{ filesystem: string; mount: string; usedPct: number; totalGb: number | null; usedGb: number | null; availGb: number | null }> = [];
  for (const line of lines) {
    const match = line.match(/^\s*(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+([0-9]+)%\s+(\S+)\s*$/);
    if (!match || match[1].toLowerCase() === 'filesystem') continue;
    rows.push({
      filesystem: match[1],
      totalGb: parseSizeToGb(match[2]),
      usedGb: parseSizeToGb(match[3]),
      availGb: parseSizeToGb(match[4]),
      usedPct: Number(match[5]),
      mount: match[6],
    });
  }
  return rows;
}

function parseOracleAlerts(source: string): { total: number; severe: number; labels: string[]; latestAt: string | null } {
  const labels: string[] = [];
  const seen = new Set<string>();
  let total = 0;
  let severe = 0;
  let latestAt: string | null = null;
  const regex = /\bORA[-\s]?([0-9]{3,5})(?:\s*\[([^\]]+)\])?[\s\S]{0,120}?([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2}:[0-9]{2})?/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    const code = match[1].padStart(5, '0');
    const detail = match[2]?.trim();
    const label = detail ? `ORA-${code} [${detail}]` : `ORA-${code}`;
    total += 1;
    if (!seen.has(label)) {
      labels.push(label);
      seen.add(label);
    }
    if (code === '00600' || code === '07445' || code === '00603') severe += 1;
    const at = match[3] ?? null;
    if (at && (!latestAt || at > latestAt)) latestAt = at;
  }
  return { total, severe, labels, latestAt };
}

function unfoldWrappedDfLines(lines: string[]): string[] {
  const unfolded: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i] ?? '';
    const next = lines[i + 1] ?? '';
    if (/^\s*\/\S+\s*$/.test(current) && /^\s*\S+\s+\S+\s+\S+\s+[0-9]+%\s+\S+/.test(next)) {
      unfolded.push(`${current.trim()} ${next.trim()}`);
      i += 1;
    } else {
      unfolded.push(current);
    }
  }
  return unfolded;
}

function buildSubject(server: string | null, service: string | null, documentType: DocumentType | null, channelName?: string): string {
  const label = documentType === 'installation_record'
    ? '설치 내역'
    : documentType === 'incident_report'
      ? '장애 내역'
      : documentType === 'inspection_report'
        ? '점검 결과'
        : '업무 내역';
  return [channelName, server, service, label].filter(Boolean).join(' ');
}

function buildSummary(subject: string, facts: string[], risks: string[]): string | null {
  if (!facts.length && !risks.length) return null;
  const details = risks.length > 0 ? risks.slice(0, 3) : facts.slice(0, 3);
  return truncate(`${subject}: ${details.join(', ')}`, 500);
}

function rankToSeverity(rank: number): Severity {
  if (rank >= 3) return 'critical';
  if (rank === 2) return 'warning';
  if (rank === 1) return 'watch';
  return 'normal';
}

function rankToPriority(rank: number, incidentSignal: boolean): Priority {
  if (incidentSignal && rank >= 3) return 'p1';
  if (rank >= 3) return 'p2';
  if (rank === 2) return 'p3';
  return 'p4';
}

function hasAny(source: string, needles: string[]): boolean {
  return needles.some(needle => source.includes(needle));
}

function firstMatch(source: string, pattern: RegExp): string | null {
  const match = source.match(pattern);
  return match?.[1]?.trim() || null;
}

function asEnum<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(normalized) ? normalized as T[number] : null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (!cleaned || cleaned.toLowerCase() === 'null' || cleaned === '-') return null;
  return cleaned;
}

function normalizeDateTime(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/([0-9]{4}-[0-9]{2}-[0-9]{2})[ T]([0-9]{2}:[0-9]{2})/);
  return match ? `${match[1]} ${match[2]}` : value;
}

function normalizeNewlines(value: string): string {
  return String(value || '').replace(/\r\n?/g, '\n');
}

function normalizeDecimal(value: string): string {
  return value.startsWith('.') ? `0${value}` : value;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function truncate(value: string | null, max: number): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('en-US') : '-';
}

function todayKst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
