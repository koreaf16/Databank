/**
 * 파일: backend/src/modules/knowledge-base/services/generator/llmRouter.ts
 * 역할: AI_MODELS llm 기본 모델로 LLM 엔드포인트를 스트리밍/비스트리밍 호출한다.
 *       endpoint는 전체 URL(예: http://host/v1/chat/completions)로 저장된다.
 *       chatOnceWithModel / streamChatWithModel 은 모델 인자를 직접 받아 useCase별 호출에 사용.
 *
 * 연관 파일:
 *   - services/ai/aiModelResolver.ts              : resolveModel, resolveLlmModelForUseCase, ModelConfig
 *   - services/generator/promptBuilder.ts         : LlmMessage
 *   - routes/kbSearchRoutes.ts                    : /ask 에서 호출
 *   - modules/messaging/services/channelAssistant : streamChatWithModel
 *   - modules/messaging/services/taskExtractor    : chatOnceWithModel(responseFormat:'json')
 *   - modules/metrics/services/trendInsight       : chatOnceWithModel
 */

import axios from 'axios';
import { resolveModel } from '../ai/aiModelResolver.js';
import type { ModelConfig } from '../ai/aiModelResolver.js';
import type { LlmMessage } from './promptBuilder.js';

export interface StreamChunk {
  token: string;
  done: boolean;
}

// ── Thinking 제어 토큰 주입 ──────────────────────────────────────────────────

interface InjectionResult {
  messages: LlmMessage[];
  extraPayload: Record<string, any>;
}

function applyThinkingInjection(model: ModelConfig, messages: LlmMessage[]): InjectionResult {
  const mode   = model.thinkingMode;
  const family = model.thinkingFamily;

  if (mode === 'auto' || family === 'none') {
    return { messages, extraPayload: {} };
  }

  const sysIdx = messages.findIndex(m => m.role === 'system');
  const prependToSystem = (prefix: string): LlmMessage[] => {
    if (sysIdx >= 0) {
      return messages.map((m, i) =>
        i === sysIdx ? { ...m, content: prefix + m.content } : m,
      );
    }
    return [{ role: 'system' as const, content: prefix }, ...messages];
  };

  if (family === 'qwen36') {
    // froggeric 템플릿이 <|think_on|> / <|think_off|> 를 가로채서 thinking 모드 전환.
    // chat_template_kwargs 는 LM Studio / vLLM 에서 추가로 처리됨 (OpenAI 경로 전용).
    const token = mode === 'on' ? '<|think_on|>' : '<|think_off|>';
    return {
      messages:     prependToSystem(token),
      extraPayload: { chat_template_kwargs: { enable_thinking: mode === 'on' } },
    };
  }

  if (family === 'gemma4') {
    // <|think|> 를 시스템 앞에 붙이면 ON, 없으면 OFF (Gemma 4 기본 동작).
    if (mode === 'on') {
      return { messages: prependToSystem('<|think|>'), extraPayload: {} };
    }
    return { messages, extraPayload: {} };
  }

  return { messages, extraPayload: {} };
}

// ── Think 블록 스트리퍼 ──────────────────────────────────────────────────────

const THINK_OPENERS = ['<think>', '<thinking>', '<|think_on|>'];
const THINK_CLOSERS = ['</think>', '</thinking>', '<|think_off|>'];
const MAX_PEEK = Math.max(...[...THINK_OPENERS, ...THINK_CLOSERS].map(t => t.length));

interface ThinkStripper {
  feed(chunk: string): string;
  flush(): string;
}

function createThinkStripper(): ThinkStripper {
  let buf     = '';
  let inThink = false;

  function findEarliest(s: string, list: string[]): { idx: number; tag: string } | null {
    let best: { idx: number; tag: string } | null = null;
    for (const tag of list) {
      const i = s.indexOf(tag);
      if (i >= 0 && (best === null || i < best.idx)) best = { idx: i, tag };
    }
    return best;
  }

  // tail 에 부분 태그 시작이 있으면 그 길이만큼 hold해서 다음 청크를 기다림.
  function tailHoldLen(s: string): number {
    const all = [...THINK_OPENERS, ...THINK_CLOSERS];
    for (let len = Math.min(MAX_PEEK - 1, s.length); len > 0; len--) {
      const tail = s.slice(s.length - len);
      if (all.some(t => t.startsWith(tail))) return len;
    }
    return 0;
  }

  return {
    feed(chunk: string): string {
      buf += chunk;
      let out = '';
      while (true) {
        if (inThink) {
          const close = findEarliest(buf, THINK_CLOSERS);
          if (!close) {
            const hold = tailHoldLen(buf);
            buf = buf.slice(buf.length - hold);
            break;
          }
          buf     = buf.slice(close.idx + close.tag.length);
          inThink = false;
          continue;
        }
        const open = findEarliest(buf, THINK_OPENERS);
        if (!open) {
          const hold = tailHoldLen(buf);
          out += buf.slice(0, buf.length - hold);
          buf  = buf.slice(buf.length - hold);
          break;
        }
        out    += buf.slice(0, open.idx);
        buf     = buf.slice(open.idx + open.tag.length);
        inThink = true;
      }
      return out;
    },
    flush(): string {
      const remaining = inThink ? '' : buf;
      buf     = '';
      inThink = false;
      return remaining;
    },
  };
}

// <think> 블록을 한 번에 제거 (비스트리밍 응답용).
// JSON 파싱 전에 반드시 먼저 호출해야 함 — Qwen3.6은 <think>...</think>{json} 순서로 출력.
function stripThinkBlocksOnce(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
    .replace(/<\|think_on\|>[\s\S]*?<\|think_off\|>/g, '')
    .trim();
}

// ── 스트리밍 공통 파서 ────────────────────────────────────────────────────────

function parseStreamLines(
  buffer: string,
  isOpenAI: boolean,
  stripper: ThinkStripper,
  onToken: (chunk: StreamChunk) => void,
  fullTextRef: { value: string },
): string {
  const lines = buffer.split('\n');
  const remaining = lines.pop() ?? '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === 'data: [DONE]') continue;
    try {
      const raw  = isOpenAI && trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
      const json = JSON.parse(raw);

      let token = '';
      let done  = false;

      if (isOpenAI) {
        token = json?.choices?.[0]?.delta?.content ?? '';
        done  = json?.choices?.[0]?.finish_reason != null;
      } else {
        token = json?.message?.content ?? '';
        done  = json?.done ?? false;
      }

      if (token) {
        fullTextRef.value += token;
        const visible = stripper.feed(token);
        if (visible) onToken({ token: visible, done: false });
      }
      if (done) {
        const tail = stripper.flush();
        if (tail) onToken({ token: tail, done: false });
        onToken({ token: '', done: true });
      }
    } catch { /* 불완전한 JSON 라인 무시 */ }
  }

  return remaining;
}

// ── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * Ollama /api/chat 스트리밍 호출.
 * connection: AI_MODELS에서 llm 모델 설정 조회에 사용.
 */
export async function streamChat(
  connection: any,
  messages: LlmMessage[],
  onToken: (chunk: StreamChunk) => void,
): Promise<string> {
  const cfg = await resolveModel(connection, 'llm');
  const url = cfg.endpoint;
  if (!url) throw new Error('LLM 엔드포인트가 설정되지 않았습니다. AI 모델 설정을 확인하세요.');

  const { messages: finalMessages, extraPayload } = applyThinkingInjection(cfg, messages);
  const isOpenAI = url.includes('/v1/chat') || url.includes('/v1/messages');
  const headers  = cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {};
  const payload  = isOpenAI
    ? { model: cfg.modelName, messages: finalMessages, stream: true, temperature: 0.1, top_p: 0.9, max_tokens: 8192, ...extraPayload }
    : { model: cfg.modelName, messages: finalMessages, stream: true, options: { temperature: 0.1, top_p: 0.9, num_predict: 8192 } };

  const response = await axios.post(url, payload, { responseType: 'stream', timeout: 120_000, headers });

  const fullTextRef = { value: '' };
  const stripper    = createThinkStripper();

  return new Promise<string>((resolve, reject) => {
    let buffer = '';
    response.data.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      buffer  = parseStreamLines(buffer, isOpenAI, stripper, onToken, fullTextRef);
    });
    response.data.on('end',   () => resolve(fullTextRef.value));
    response.data.on('error', reject);
  });
}

/** 비스트리밍 호출. 전체 응답 텍스트를 반환. */
export async function chatOnce(connection: any, messages: LlmMessage[]): Promise<string> {
  const cfg = await resolveModel(connection, 'llm');
  const url = cfg.endpoint;
  if (!url) throw new Error('LLM 엔드포인트가 설정되지 않았습니다. AI 모델 설정을 확인하세요.');

  const { messages: finalMessages, extraPayload } = applyThinkingInjection(cfg, messages);
  const isOpenAI = url.includes('/v1/chat') || url.includes('/v1/messages');
  const headers  = cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {};
  const payload  = isOpenAI
    ? { model: cfg.modelName, messages: finalMessages, stream: false, temperature: 0.1, top_p: 0.9, max_tokens: 8192, ...extraPayload }
    : { model: cfg.modelName, messages: finalMessages, stream: false, options: { temperature: 0.1, top_p: 0.9, num_predict: 8192 } };

  const response = await axios.post(url, payload, { timeout: 120_000, headers });
  const raw = response.data?.choices?.[0]?.message?.content
           ?? response.data?.message?.content
           ?? '';
  return stripThinkBlocksOnce(raw);
}

/**
 * 모델 인자 직접 수령 비스트리밍 호출.
 * opts.responseFormat = 'json' 시:
 *   - OpenAI provider → response_format: { type: 'json_object' }
 *   - 그 외(Ollama/Anthropic) → 시스템 프롬프트 강제 + 파싱 실패 재시도 1회
 */
export async function chatOnceWithModel(
  model: ModelConfig,
  messages: LlmMessage[],
  opts?: { responseFormat?: 'json' },
): Promise<string> {
  const url = model.endpoint;
  if (!url) throw new Error('LLM 엔드포인트가 설정되지 않았습니다. AI 모델 설정을 확인하세요.');

  const isOpenAI       = url.includes('/v1/chat') || url.includes('/v1/messages');
  const useJson        = opts?.responseFormat === 'json';
  const isOpenAIProvider = model.provider === 'openai';
  const headers        = model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {};

  // 1. JSON 모드 지시 (Ollama/Anthropic)
  let jsonMessages = messages;
  if (useJson && !isOpenAIProvider) {
    const jsonInstruction = '반드시 유효한 JSON 형식으로만 응답하라. JSON 외 다른 텍스트 없음.';
    const sysIdx = jsonMessages.findIndex(m => m.role === 'system');
    if (sysIdx >= 0) {
      jsonMessages = jsonMessages.map((m, i) =>
        i === sysIdx ? { ...m, content: m.content + '\n\n' + jsonInstruction } : m,
      );
    } else {
      jsonMessages = [{ role: 'system' as const, content: jsonInstruction }, ...jsonMessages];
    }
  }

  // 2. Thinking 토큰 주입 (JSON 지시 적용 후)
  const { messages: finalMessages, extraPayload } = applyThinkingInjection(model, jsonMessages);

  const jsonMaxTokens = 8192;
  const payload = isOpenAI
    ? {
        model: model.modelName, messages: finalMessages, stream: false,
        temperature: 0.1, top_p: 0.9, max_tokens: jsonMaxTokens,
        ...(useJson && isOpenAIProvider ? { response_format: { type: 'json_object' } } : {}),
        ...extraPayload,
      }
    : {
        model: model.modelName, messages: finalMessages, stream: false,
        options: { temperature: 0.1, top_p: 0.9, num_predict: jsonMaxTokens },
      };

  const res = await axios.post(url, payload, { timeout: 120_000, headers });
  const rawText: string = res.data?.choices?.[0]?.message?.content
                       ?? res.data?.message?.content
                       ?? '';

  // 3. Think 블록 제거 — JSON 파싱 전에 먼저 (Qwen3.6은 <think>...</think>{json} 순서)
  const text = stripThinkBlocksOnce(rawText);

  if (!useJson || isOpenAIProvider) return text;

  try {
    JSON.parse(text);
    return text;
  } catch {
    const strongInstruction = '반드시 유효한 JSON만 출력하라. 설명 없음. ``` 없음.';
    const sysIdx = messages.findIndex(m => m.role === 'system');
    const retryBase: LlmMessage[] = sysIdx >= 0
      ? messages.map((m, i) => i === sysIdx ? { ...m, content: strongInstruction + '\n\n' + m.content } : m)
      : [{ role: 'system' as const, content: strongInstruction }, ...messages];
    const retryMessages: LlmMessage[] = [
      ...retryBase,
      ...(text
        ? [
            { role: 'assistant' as const, content: text },
            { role: 'user'      as const, content: '위 응답을 유효한 JSON으로 다시 작성하라.' },
          ]
        : []),
    ];

    const { messages: retryFinal, extraPayload: retryExtra } = applyThinkingInjection(model, retryMessages);
    const retryPayload = isOpenAI
      ? { model: model.modelName, messages: retryFinal, stream: false, temperature: 0, max_tokens: 8192, ...retryExtra }
      : { model: model.modelName, messages: retryFinal, stream: false, options: { temperature: 0, num_predict: 8192 } };

    const retryRes = await axios.post(url, retryPayload, { timeout: 120_000, headers });
    const retryRaw: string = retryRes.data?.choices?.[0]?.message?.content
                          ?? retryRes.data?.message?.content
                          ?? '';
    const retryText = stripThinkBlocksOnce(retryRaw);
    JSON.parse(retryText); // 두 번째 실패 시 throw — silent failure 금지
    return retryText;
  }
}

/** 모델 인자 직접 수령 스트리밍 호출. */
export async function streamChatWithModel(
  model: ModelConfig,
  messages: LlmMessage[],
  onToken: (chunk: StreamChunk) => void,
): Promise<string> {
  const url = model.endpoint;
  if (!url) throw new Error('LLM 엔드포인트가 설정되지 않았습니다. AI 모델 설정을 확인하세요.');

  const { messages: finalMessages, extraPayload } = applyThinkingInjection(model, messages);
  const isOpenAI = url.includes('/v1/chat') || url.includes('/v1/messages');
  const headers  = model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {};
  const payload  = isOpenAI
    ? { model: model.modelName, messages: finalMessages, stream: true, temperature: 0.1, top_p: 0.9, max_tokens: 8192, ...extraPayload }
    : { model: model.modelName, messages: finalMessages, stream: true, options: { temperature: 0.1, top_p: 0.9, num_predict: 8192 } };

  const response = await axios.post(url, payload, { responseType: 'stream', timeout: 120_000, headers });

  // fullText 는 raw(think 포함) — 디버깅용. 호출자에게 노출하지 말 것.
  const fullTextRef = { value: '' };
  const stripper    = createThinkStripper();

  return new Promise<string>((resolve, reject) => {
    let buffer = '';
    response.data.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      buffer  = parseStreamLines(buffer, isOpenAI, stripper, onToken, fullTextRef);
    });
    response.data.on('end',   () => resolve(fullTextRef.value));
    response.data.on('error', reject);
  });
}
