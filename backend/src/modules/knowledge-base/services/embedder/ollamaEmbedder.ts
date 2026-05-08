/**
 * 파일: backend/src/modules/knowledge-base/services/embedder/ollamaEmbedder.ts
 * 역할: 임베딩 API 호출. ModelConfig.endpoint를 그대로 사용 (경로 조합 없음).
 *       응답은 OpenAI({data:[{embedding}]})와 Ollama({embeddings:[]}) 두 형식 모두 처리.
 *
 * 연관 파일:
 *   - services/ai/aiModelResolver.ts  : ModelConfig 제공
 *   - services/embedder/batchEmbedder : 배치 처리
 */

import axios from 'axios';
import { env } from '../../../../config/env.js';
import type { ModelConfig } from '../ai/aiModelResolver.js';

export interface EmbedResult {
  embedding: number[];
  model: string;
}

function getEndpoint(cfg?: ModelConfig): string {
  return (cfg?.endpoint ?? '').replace(/\/$/, '');
}
function getModel(cfg?: ModelConfig): string {
  return cfg?.modelName ?? env.KB_EMBED_MODEL;
}
function getHeaders(cfg?: ModelConfig): Record<string, string> {
  return cfg?.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {};
}

function extractVectors(data: any, modelName: string): number[][] {
  // OpenAI: { data: [{ embedding: [...] }] }
  if (Array.isArray(data.data) && data.data[0]?.embedding) {
    return data.data.map((d: any) => d.embedding);
  }
  // Ollama: { embeddings: [[...]] } 또는 { embedding: [...] }
  if (Array.isArray(data.embeddings)) return data.embeddings;
  if (Array.isArray(data.embedding)) return [data.embedding];
  // TEI: [[...]] 직접 반환
  if (Array.isArray(data) && Array.isArray(data[0])) return data;
  throw new Error(`임베딩 응답 형식을 알 수 없습니다 (model: ${modelName})`);
}

/** 텍스트 하나를 임베딩 벡터로 변환 */
export async function embedText(text: string, cfg?: ModelConfig): Promise<EmbedResult> {
  const endpoint = getEndpoint(cfg);
  const modelName = getModel(cfg);
  if (!endpoint) throw new Error('임베딩 엔드포인트가 설정되지 않았습니다. AI 모델 설정을 확인하세요.');
  const response = await axios.post(
    endpoint,
    { model: modelName, input: text },
    { timeout: 30_000, headers: getHeaders(cfg) },
  );
  return { embedding: extractVectors(response.data, modelName)[0], model: modelName };
}

/** 다중 텍스트를 한 번에 임베딩 */
export async function embedTexts(texts: string[], cfg?: ModelConfig): Promise<EmbedResult[]> {
  if (texts.length === 0) return [];
  const endpoint = getEndpoint(cfg);
  const modelName = getModel(cfg);
  if (!endpoint) throw new Error('임베딩 엔드포인트가 설정되지 않았습니다. AI 모델 설정을 확인하세요.');
  const response = await axios.post(
    endpoint,
    { model: modelName, input: texts },
    { timeout: 60_000, headers: getHeaders(cfg) },
  );
  const rows = extractVectors(response.data, modelName);
  if (rows.length !== texts.length) {
    return Promise.all(texts.map((t) => embedText(t, cfg)));
  }
  return rows.map((emb) => ({ embedding: emb, model: modelName }));
}
