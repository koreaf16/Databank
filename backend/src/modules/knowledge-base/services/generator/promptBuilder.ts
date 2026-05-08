/**
 * 파일: backend/src/modules/knowledge-base/services/generator/promptBuilder.ts
 * 역할: 하이브리드 검색 청크를 LLM 프롬프트로 변환한다.
 *       인용 번호 [N]을 강제하는 시스템 프롬프트 포함.
 *
 * 연관 파일:
 *   - services/retriever/hybridFusion  : FusedChunk
 *   - services/generator/llmRouter     : buildMessages 결과를 LLM에 전달
 */

import type { FusedChunk } from '../retriever/hybridFusion.js';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `당신은 기업 지식베이스 검색 도우미입니다.
아래에 번호가 매겨진 청크(참고 자료)를 바탕으로 사용자 질문에 답변하세요.

규칙:
1. 모든 문단과 SQL 예시 설명 끝에는 반드시 [1], [2] 형식의 청크 번호를 최소 1개 인용하세요. 인용 없는 문장은 작성하지 마세요.
2. 제공된 청크에 없는 내용은 "제공된 자료에서 확인할 수 없습니다"라고 답하세요.
3. 여러 청크가 관련될 때는 [1][3]처럼 복수 인용도 허용합니다.
4. 답변은 한국어로 작성하세요.
5. 8문단 이내로 간결하게 답하고, 필요한 SQL 예시는 검증된 구문만 제시한 뒤 종료하세요.`;

/**
 * 청크 목록을 번호 붙인 컨텍스트 블록으로 변환.
 * [#N] (출처: docId headingPath pageFROM쪽)
 */
function buildContextBlock(chunks: FusedChunk[]): string {
  return chunks
    .map((c, i) => {
      const loc = [
        c.docId,
        c.headingPath ?? '',
        c.pageFrom != null ? `${c.pageFrom}쪽` : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `[#${i + 1}] (출처: ${loc})\n${c.contentText}`;
    })
    .join('\n\n---\n\n');
}

/** LLM에 전달할 메시지 배열 구성 */
export function buildMessages(query: string, chunks: FusedChunk[]): LlmMessage[] {
  const context = buildContextBlock(chunks);
  const userContent = `[참고 자료]\n${context}\n\n[질문]\n${query}`;

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
}
