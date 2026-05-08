/**
 * 파일: backend/src/modules/knowledge-base/services/ai/aiModelResolver.ts
 * 역할: AI_MODELS 테이블에서 MODEL_TYPE별 기본 모델 설정을 조회한다.
 *       동일 프로세스 내 Map 캐시 사용(모델 업데이트 시 clearModelCache() 호출).
 *       조회 실패 시 env 폴백. resolveLlmModelForUseCase는 use case별 모델 선택 지원.
 *
 * 연관 파일:
 *   - schema/aiModelSchema.ts                    : AI_MODELS DDL
 *   - services/embedder/ollamaEmbedder           : embed 모델 설정
 *   - services/retriever/rerankRetriever         : rerank 모델 설정
 *   - services/generator/llmRouter               : LLM 모델 설정
 *   - config/env.ts                              : 폴백 기본값
 *   - modules/messaging/services/channelAssistant: channel_assistant useCase
 *   - modules/messaging/services/taskExtractor   : task_extractor useCase
 *   - modules/metrics/services/trendInsight      : trend_insight useCase
 */

import { env } from '../../../../config/env.js';

export type ThinkingMode   = 'auto' | 'on' | 'off';
export type ThinkingFamily = 'none' | 'qwen36' | 'gemma4';

export interface ModelConfig {
  endpoint:       string;
  modelName:      string;
  apiKey:         string | null;
  provider:       string;
  thinkingMode:   ThinkingMode;
  thinkingFamily: ThinkingFamily;
}

// 60초 TTL 캐시 — 모델 설정 변경 후 1분 내 자동 반영
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { config: ModelConfig; expiresAt: number }>();

/** 캐시 전체 초기화 (테스트용) */
export function clearModelCache(): void {
  cache.clear();
}

/**
 * AI_MODELS에서 MODEL_TYPE = :type AND IS_DEFAULT = 1 AND STATUS = 'active' 인 행 조회.
 * 없으면 env 기본값으로 폴백.
 */
export async function resolveModel(
  connection: any,
  modelType: 'embedding' | 'reranker' | 'llm',
): Promise<ModelConfig> {
  const cached = cache.get(modelType);
  if (cached && cached.expiresAt > Date.now()) return cached.config;

  try {
    const oracledb = (await import('oracledb')).default;
    const result = await connection.execute(
      `SELECT NAME AS "name", ENDPOINT AS "endpoint", API_KEY AS "apiKey", PROVIDER AS "provider",
              THINKING_MODE AS "thinkingMode", THINKING_FAMILY AS "thinkingFamily"
       FROM AI_MODELS
       WHERE MODEL_TYPE = :mtype AND STATUS = 'active'
       ORDER BY IS_DEFAULT DESC, CREATED_AT ASC
       FETCH FIRST 1 ROWS ONLY`,
      { mtype: modelType },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    const row = result.rows?.[0];
    if (row && row['name']) {
      const config: ModelConfig = {
        endpoint:       (row['endpoint'] ?? '').replace(/\/$/, ''),
        modelName:      row['name'],
        apiKey:         row['apiKey'] ?? null,
        provider:       (row['provider'] ?? 'local').toLowerCase(),
        thinkingMode:   normalizeThinkingMode(row['thinkingMode']),
        thinkingFamily: normalizeThinkingFamily(row['thinkingFamily']),
      };
      cache.set(modelType, { config, expiresAt: Date.now() + CACHE_TTL_MS });
      return config;
    }
  } catch {
    // DB 조회 실패 시 env 폴백 (조용히 처리)
  }

  // env 폴백
  const fallback = buildFallback(modelType);
  cache.set(modelType, { config: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
  return fallback;
}

function normalizeThinkingMode(v: any): ThinkingMode {
  return v === 'on' || v === 'off' ? v : 'auto';
}

function normalizeThinkingFamily(v: any): ThinkingFamily {
  return v === 'qwen36' || v === 'gemma4' ? v : 'none';
}

function buildFallback(modelType: string): ModelConfig {
  const names: Record<string, string> = {
    embedding: env.KB_EMBED_MODEL,
    llm:       env.KB_LLM_MODEL,
    reranker:  'bge-reranker-v2-m3',
  };
  return {
    endpoint:       '',
    modelName:      names[modelType] ?? modelType,
    apiKey:         null,
    provider:       'local',
    thinkingMode:   'auto',
    thinkingFamily: 'none',
  };
}

function rowToConfig(row: any): ModelConfig {
  return {
    endpoint:       (row['endpoint'] ?? '').replace(/\/$/, ''),
    modelName:      row['name'],
    apiKey:         row['apiKey'] ?? null,
    provider:       (row['provider'] ?? 'local').toLowerCase(),
    thinkingMode:   normalizeThinkingMode(row['thinkingMode']),
    thinkingFamily: normalizeThinkingFamily(row['thinkingFamily']),
  };
}

/**
 * useCase('channel_assistant' | 'task_extractor' | 'trend_insight' 등)에 맞는 LLM 모델 조회.
 * 1. USE_CASES LIKE '%useCase%' 인 활성 LLM 모델 우선
 * 2. 없으면 IS_DEFAULT = 1 인 활성 LLM 모델 fallback
 * 3. 그것도 없으면 throw — silent failure 금지
 */
export async function resolveLlmModelForUseCase(
  connection: any,
  useCase: string,
): Promise<ModelConfig> {
  const cacheKey = `usecase:${useCase}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.config;

  const oracledb = (await import('oracledb')).default;

  const useCaseResult = await connection.execute(
    `SELECT NAME AS "name", ENDPOINT AS "endpoint", API_KEY AS "apiKey", PROVIDER AS "provider",
            THINKING_MODE AS "thinkingMode", THINKING_FAMILY AS "thinkingFamily"
     FROM AI_MODELS
     WHERE MODEL_TYPE = 'llm'
       AND STATUS = 'active'
       AND USE_CASES LIKE '%' || :useCase || '%'
     ORDER BY IS_DEFAULT DESC, CREATED_AT ASC
     FETCH FIRST 1 ROWS ONLY`,
    { useCase },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );

  const row = useCaseResult.rows?.[0];
  if (row && row['name']) {
    const config = rowToConfig(row);
    cache.set(cacheKey, { config, expiresAt: Date.now() + CACHE_TTL_MS });
    return config;
  }

  const defaultResult = await connection.execute(
    `SELECT NAME AS "name", ENDPOINT AS "endpoint", API_KEY AS "apiKey", PROVIDER AS "provider",
            THINKING_MODE AS "thinkingMode", THINKING_FAMILY AS "thinkingFamily"
     FROM AI_MODELS
     WHERE MODEL_TYPE = 'llm'
       AND STATUS = 'active'
       AND IS_DEFAULT = 1
     ORDER BY CREATED_AT ASC
     FETCH FIRST 1 ROWS ONLY`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );

  const fallbackRow = defaultResult.rows?.[0];
  if (fallbackRow && fallbackRow['name']) {
    const config = rowToConfig(fallbackRow);
    cache.set(cacheKey, { config, expiresAt: Date.now() + CACHE_TTL_MS });
    return config;
  }

  throw new Error(
    `useCase '${useCase}' 에 사용 가능한 LLM 모델이 없습니다. AI 모델 설정을 확인하세요.`,
  );
}
