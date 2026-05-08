/**
 * 파일: backend/src/modules/metrics/services/trendInsight.ts
 * 역할: 메트릭 트렌드 자연어 인사이트 생성. LLM 요약 + KB 검색 + 1시간 캐시.
 *       선형회귀로 포화 예측, KB에서 유사 사례 검색 후 LLM으로 요약.
 * 연관 파일:
 *   - metrics/repository/metricRepository.ts              : getRisk, getSamples, listTargets
 *   - knowledge-base/services/retriever/hybridFusion.ts   : hybridSearch
 *   - knowledge-base/services/ai/aiModelResolver.ts        : resolveLlmModelForUseCase
 *   - knowledge-base/services/generator/llmRouter.ts       : chatOnceWithModel
 *   - metrics/routes/metricsRoutes.ts                     : 라우트 등록
 */

import oracledb from 'oracledb';
import { withOracleConnection } from '../../../infra/oracle/withConnection.js';
import { hybridSearch } from '../../knowledge-base/services/retriever/hybridFusion.js';
import {
  resolveLlmModelForUseCase,
} from '../../knowledge-base/services/ai/aiModelResolver.js';
import {
  chatOnceWithModel,
} from '../../knowledge-base/services/generator/llmRouter.js';
import type { LlmMessage } from '../../knowledge-base/services/generator/promptBuilder.js';

// ── 1시간 TTL 인사이트 캐시 ───────────────────────────────────────────────────

const CACHE_TTL_MS = 3_600_000;
const insightCache = new Map<string, { result: TrendInsightResult; expiresAt: number }>();

export interface TrendInsightResult {
  summary:          string;
  stats:            MetricStats[];
  generatedAt:      string;
  cachedForSeconds: number;
  fromCache:        boolean;
}

interface MetricStats {
  targetId:     number;
  targetName:   string;
  systemType:   string;
  metricId:     string;
  metricName:   string;
  unit:         string;
  currentValue: number;
  status:       string;
  changeFrom6m: number | null;
  slopePctPerMonth: number | null;
  monthsToFull: number | null;
}

// ── 통계 헬퍼 ──────────────────────────────────────────────────────────────────

/**
 * 단순 선형회귀(OLS). x는 인덱스, y는 값. slope 반환.
 */
function linearSlope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const xs = ys.map((_, i) => i);
  const sumX  = xs.reduce((a, b) => a + b, 0);
  const sumY  = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sumX2 - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

// ── 메트릭 샘플 조회 (12개월, 고객사 기준) ─────────────────────────────────────

async function fetchMonthlyStats(conn: any, customerId: number): Promise<MetricStats[]> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 12);

  const result = await conn.execute(
    `SELECT
       t.TARGET_ID     AS "targetId",
       t.NAME          AS "targetName",
       t.SYSTEM_TYPE   AS "systemType",
       s.METRIC_ID     AS "metricId",
       s.DIMENSION_KEY AS "dimensionKey",
       s.DIMENSION_VALUE AS "dimensionValue",
       s.RAW_LABEL     AS "rawLabel",
       d.NAME          AS "metricName",
       d.UNIT          AS "unit",
       d.CRIT_THRESHOLD AS "critThreshold",
       s.VALUE         AS "value",
       s.STATUS        AS "status",
       s.COLLECTED_AT  AS "collectedAt"
     FROM METRIC_SAMPLES s
     JOIN MONITOR_TARGETS    t ON t.TARGET_ID = s.TARGET_ID
     JOIN METRIC_DEFINITIONS d ON d.METRIC_ID = s.METRIC_ID
     WHERE t.CUSTOMER_ID = :customerId
       AND s.COLLECTED_AT >= :cutoff
     ORDER BY t.TARGET_ID, s.METRIC_ID, s.COLLECTED_AT`,
    { customerId, cutoff },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );

  const rows: any[] = result.rows || [];

  // targetId + metricId 로 그룹화
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const key = `${row['targetId']}-${row['metricId']}-${row['dimensionKey'] ?? ''}-${row['dimensionValue'] ?? ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const stats: MetricStats[] = [];
  for (const [, samples] of groups) {
    const latest = samples[samples.length - 1];
    const sixMoAgo = new Date();
    sixMoAgo.setMonth(sixMoAgo.getMonth() - 6);
    const older6m = samples.filter((s: any) => new Date(s['collectedAt']) <= sixMoAgo);
    const oldestIn6m = older6m[older6m.length - 1] ?? null;

    const vals = samples.map((s: any) => Number(s['value']));
    const slope = linearSlope(vals);
    const crit = latest['critThreshold'] != null ? Number(latest['critThreshold']) : 90;
    const current = Number(latest['value']);
    const monthsToFull = slope > 0 ? Math.ceil((crit - current) / slope) : null;

    stats.push({
      targetId:         Number(latest['targetId']),
      targetName:       latest['targetName'],
      systemType:       latest['systemType'],
      metricId:         latest['metricId'],
      metricName:       latest['rawLabel'] || latest['dimensionValue'] || latest['metricName'],
      unit:             latest['unit'] || '%',
      currentValue:     current,
      status:           latest['status'],
      changeFrom6m:     oldestIn6m != null ? Math.round((current - Number(oldestIn6m['value'])) * 10) / 10 : null,
      slopePctPerMonth: Math.round(slope * 100) / 100,
      monthsToFull:     monthsToFull != null && monthsToFull > 0 ? monthsToFull : null,
    });
  }

  // 위험도 순 정렬: crit > warn > ok, 같으면 현재값 내림차순
  return stats.sort((a, b) => {
    const rank: Record<string, number> = { crit: 3, warn: 2, ok: 1 };
    return (rank[b.status] ?? 0) - (rank[a.status] ?? 0) || b.currentValue - a.currentValue;
  });
}

// ── 인사이트 생성 ──────────────────────────────────────────────────────────────

const INSIGHT_SYSTEM = `너는 SI 운영 분석 AI다. 다음 메트릭 통계를 자연어로 요약하고 권장 액션 3-5개를 제안한다.
원칙: (a) 한국어, (b) 숫자 인용 시 정확한 값, (c) 비교는 % 변화율 명시,
(d) 권장 액션은 즉시 실행 가능한 동작 (체크리스트 형식), (e) 추측 금지.
형식: 요약 단락 + "권장 액션:" 이후 항목별 "- [ ] 액션" 형식.`;

export async function generateTrendInsight(opts: {
  customerId?: number;
  targetId?: number;
}): Promise<TrendInsightResult> {
  const cacheKey = `insight:${opts.customerId ?? 'all'}:${opts.targetId ?? 'all'}`;
  const cached = insightCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.result, fromCache: true };
  }

  const result = await withOracleConnection(async (conn) => {
    if (!opts.customerId && !opts.targetId) {
      return {
        summary:          '조회 조건을 지정해주세요 (customerId 또는 targetId)',
        stats:            [],
        generatedAt:      new Date().toISOString(),
        cachedForSeconds: 0,
        fromCache:        false,
      } as TrendInsightResult;
    }

    // 1. 통계 계산
    const allStats = opts.customerId
      ? await fetchMonthlyStats(conn, opts.customerId)
      : [];
    const stats = allStats.slice(0, 5);

    if (!stats.length) {
      return {
        summary:          '최근 12개월 내 메트릭 데이터가 없습니다.',
        stats:            [],
        generatedAt:      new Date().toISOString(),
        cachedForSeconds: CACHE_TTL_MS / 1000,
        fromCache:        false,
      } as TrendInsightResult;
    }

    // 2. KB 검색 — 위험 항목별 관련 사례
    const atRisk = stats.filter(s => s.status !== 'ok');
    const queries = atRisk.slice(0, 3).map(s =>
      `${s.systemType} ${s.metricName} ${Math.round(s.currentValue)}% 위험`,
    );
    const kbResults = await Promise.all(
      queries.map(q => hybridSearch(conn, q, 2, 20, 'hybrid').catch(() => [])),
    );
    const kbExcerpts = kbResults.flat().slice(0, 4).map((c: any) =>
      (c.content || '').slice(0, 200),
    );

    // 3. LLM 요약
    const statsJson = JSON.stringify(stats.map(s => ({
      대상:   s.targetName,
      시스템: s.systemType,
      메트릭: s.metricName,
      현재값: `${s.currentValue}${s.unit}`,
      상태:   s.status,
      '6개월변화': s.changeFrom6m != null ? `${s.changeFrom6m > 0 ? '+' : ''}${s.changeFrom6m}${s.unit}` : null,
      포화예측: s.monthsToFull != null ? `${s.monthsToFull}개월 후` : null,
    })), null, 2);

    const kbBlock = kbExcerpts.length
      ? `\n\n유사 사례 발췌:\n${kbExcerpts.map((e, i) => `[${i + 1}] ${e}`).join('\n')}`
      : '';

    const messages: LlmMessage[] = [
      { role: 'system', content: INSIGHT_SYSTEM },
      { role: 'user',   content: `메트릭 통계:\n${statsJson}${kbBlock}` },
    ];

    const model   = await resolveLlmModelForUseCase(conn, 'trend_insight');
    const summary = await chatOnceWithModel(model, messages);

    return {
      summary,
      stats,
      generatedAt:      new Date().toISOString(),
      cachedForSeconds: CACHE_TTL_MS / 1000,
      fromCache:        false,
    } as TrendInsightResult;
  });

  insightCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

/** 캐시 무효화 (새 샘플 수집 후 강제 갱신 시) */
export function invalidateTrendInsightCache(customerId?: number): void {
  if (!customerId) { insightCache.clear(); return; }
  for (const key of insightCache.keys()) {
    if (key.includes(`:${customerId}:`)) insightCache.delete(key);
  }
}
