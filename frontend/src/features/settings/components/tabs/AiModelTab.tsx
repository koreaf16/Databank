/**
 * 파일: frontend/src/features/settings/components/tabs/AiModelTab.tsx
 * 역할: AI 모델(LLM, 임베딩, 리랭커) 관리 화면.
 */

import React from 'react';
import { Icon } from '../../../../components/Icon.jsx';
import {
  getAiModels,
  createAiModel,
  updateAiModel,
  deleteAiModel,
} from '../../api/settingsApi.js';
import { AiModelModal } from '../AiModelModal.jsx';

const AI_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', color: '#cc785c' },
  { id: 'openai',    name: 'OpenAI',    color: '#10a37f' },
  { id: 'gemini',    name: 'Gemini',    color: '#4285f4' },
  { id: 'local',     name: 'Local',     color: '#737373' },
];

const AI_USE_CASES = [
  { id: 'summary',  label: '점검 요약',       icon: 'sparkles' },
  { id: 'classify', label: '이력 분류',       icon: 'tag' },
  { id: 'code',     label: '코드 분석',       icon: 'code' },
  { id: 'voice',    label: '음성 전사',       icon: 'mic' },
  { id: 'rag',      label: '지식베이스 검색', icon: 'search' },
  { id: 'report',   label: '리포트 생성',     icon: 'report' },
];

const MODEL_TYPE_LABELS: Record<string, string> = {
  llm: 'LLM', embedding: '임베딩', reranker: '리랭커',
};

// ── AI 모델 테스트 (브라우저 직접 fetch) ──
async function testModelDirect(model: any): Promise<{ latencyMs: number; snippet: string }> {
  const url = (model.endpoint || '').replace(/\/$/, '');
  if (!url) throw new Error('엔드포인트가 없습니다.');
  const mt = model.modelType || 'llm';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  const authH = model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {};
  const post = (body: any, headers: Record<string, string> = {}) =>
    fetch(url, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const chk = async (r: Response) => { if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${r.status}`); } return r.json(); };

  try {
    const start = Date.now();
    let snippet = '';

    if (mt === 'embedding') {
      if (model.provider === 'anthropic') throw new Error('Anthropic은 임베딩 API를 제공하지 않습니다');
      const d: any = await chk(await post(model.provider === 'gemini' ? { content: { parts: [{ text: '안녕' }] } } : { input: '안녕', model: model.name }, authH));
      const vec = d.embedding?.values ?? d.data?.[0]?.embedding ?? d.embeddings?.[0] ?? (Array.isArray(d) ? d[0] : null);
      snippet = `벡터 ${Array.isArray(vec) ? vec.length : '?'}차원`;
    } else if (mt === 'reranker') {
      const d: any = await chk(await post({ query: '테스트', documents: ['A', 'B'], model: model.name }, authH));
      const res = d.results ?? (Array.isArray(d) ? d : []);
      snippet = `점수: [${res.slice(0,2).map((x: any) => (x.score ?? 0).toFixed(2)).join(', ')}]`;
    } else {
      if (model.provider === 'anthropic') {
        const d = await chk(await post({ model: model.name, max_tokens: 50, messages: [{ role: 'user', content: '안녕' }] }, { 'x-api-key': model.apiKey || '', 'anthropic-version': '2023-06-01' }));
        snippet = d.content?.[0]?.text || '응답 완료';
      } else if (model.provider === 'gemini') {
        const d = await chk(await post({ contents: [{ parts: [{ text: '안녕' }] }], generationConfig: { maxOutputTokens: 50 } }));
        snippet = d.candidates?.[0]?.content?.parts?.[0]?.text || '응답 완료';
      } else {
        const d = await chk(await post({ model: model.name, max_tokens: 50, messages: [{ role: 'user', content: '안녕' }] }, authH));
        snippet = d.choices?.[0]?.message?.content || d.message?.content || d.response || '응답 완료';
      }
    }
    clearTimeout(timer);
    return { latencyMs: Date.now() - start, snippet };
  } catch (err: any) {
    clearTimeout(timer);
    throw new Error(err.name === 'AbortError' ? '시간 초과' : err.message);
  }
}

export function AiModelTab() {
  const [models, setModels] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [editOpen, setEditOpen] = React.useState<any>(null);
  const [keyShow, setKeyShow] = React.useState<Record<string, boolean>>({});
  const [testState, setTestState] = React.useState<any>(null);

  const totalCost = models.reduce((s, m: any) => s + (m.costMonth || 0), 0);
  const totalTokens = models.reduce((s, m: any) => s + (m.tokensUsed || 0), 0);
  const activeCount = models.filter((m: any) => m.status === 'active').length;

  const loadModels = React.useCallback(async () => {
    setLoading(true);
    try { setModels(await getAiModels()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { loadModels(); }, [loadModels]);

  async function toggleStatus(id) {
    const m: any = models.find((x: any) => x.id === id);
    if (!m) return;
    try {
      const saved = await updateAiModel(id, { status: m.status === 'active' ? 'inactive' : 'active' });
      setModels((list: any) => list.map((x: any) => x.id === id ? saved : x));
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleTest(m) {
    setTestState({ id: m.id, loading: true });
    try {
      const r = await testModelDirect(m);
      setTestState({ id: m.id, loading: false, success: true, ...r });
    } catch (err: any) {
      setTestState({ id: m.id, loading: false, success: false, error: err.message });
    }
  }

  return (
    <div className="tab-pane">
      <div className="set-h">
        <div>
          <h2>AI 모델 관리</h2>
          <p className="text-3">활성 {activeCount}개 · 월 사용량 {(totalTokens/1000000).toFixed(1)}M 토큰</p>
        </div>
        <button className="btn primary" onClick={() => setEditOpen({ mode: 'add' })}>
          <Icon name="plus" size={13}/> 모델 추가
        </button>
      </div>

      <div className="kpi-row" style={{ marginBottom: 20 }}>
        <div className="kpi-card"><div className="kpi-l">월 토큰 사용</div><div className="kpi-v">{(totalTokens/1000000).toFixed(1)}M</div></div>
        <div className="kpi-card"><div className="kpi-l">월 예상 비용</div><div className="kpi-v">₩{totalCost.toLocaleString()}</div></div>
        <div className="kpi-card"><div className="kpi-l">활성 모델</div><div className="kpi-v">{activeCount} / {models.length}</div></div>
      </div>

      {loading ? (
        <div className="text-3" style={{ textAlign: 'center', padding: 40 }}>불러오는 중...</div>
      ) : (
        <div className="ai-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {models.map((m: any) => {
            const provider = AI_PROVIDERS.find(p => p.id === m.provider) || { name: 'Unknown', color: '#888' };
            const usage = m.tokenLimit ? Math.round(m.tokensUsed / m.tokenLimit * 100) : 0;
            return (
              <div key={m.id} className={'ai-card card' + (m.status === 'inactive' ? ' off' : '')} style={{ padding: 16 }}>
                <div className="ai-card-h" style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <div className="ai-prov" style={{ width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, background: provider.color }}>
                    {provider.name[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {m.name}
                      {m.isDefault && <span className="tag install xs">기본</span>}
                      {m.modelType === 'llm' && m.thinkingFamily && m.thinkingFamily !== 'none' && (
                        <span className="tag muted xs" title={`Thinking Family: ${m.thinkingFamily}`}>
                          think·{m.thinkingMode}
                        </span>
                      )}
                    </div>
                    <div className="text-3" style={{ fontSize: 12 }}>{provider.name} · {MODEL_TYPE_LABELS[m.modelType] || 'LLM'}</div>
                  </div>
                  <button className={'pill-toggle' + (m.status !== 'inactive' ? ' on' : '')} onClick={() => toggleStatus(m.id)}>
                    <span className="pill-dot"/>
                  </button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                  {(m.useCases || []).map((uc: string) => {
                    const u = AI_USE_CASES.find(x => x.id === uc);
                    return <span key={uc} className="tag muted xs"><Icon name={u?.icon || 'tag'} size={10} style={{ marginRight: 3 }}/>{u?.label}</span>;
                  })}
                </div>

                <div className="text-3" style={{ fontSize: 12, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>토큰 사용량</span>
                    <span>{(m.tokensUsed/1000000).toFixed(2)}M / {(m.tokenLimit/1000000).toFixed(0)}M</span>
                  </div>
                  <div className="ai-usage-bar" style={{ height: 4, background: 'var(--bg-2)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, usage)}%`, height: '100%', background: 'var(--brand-500)' }}/>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn sm ghost" style={{ flex: 1 }} onClick={() => handleTest(m)}>테스트</button>
                  <button className="btn sm ghost" onClick={() => setEditOpen({ mode: 'edit', model: m })}>수정</button>
                </div>

                {testState?.id === m.id && !testState.loading && (
                  <div style={{ marginTop: 8, fontSize: 11, color: testState.success ? 'var(--ok)' : 'var(--err)' }}>
                    {testState.success ? `성공 (${testState.latencyMs}ms): ${testState.snippet}` : testState.error}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editOpen && (
        <AiModelModal
          mode={editOpen.mode}
          model={editOpen.model}
          onClose={() => setEditOpen(null)}
          onSave={async (payload) => {
            if (editOpen.mode === 'edit') {
              await updateAiModel(editOpen.model.id, payload);
            } else {
              await createAiModel(payload);
            }
            await loadModels();
            setEditOpen(null);
          }}
          onDelete={async (id) => {
            await deleteAiModel(id);
            await loadModels();
            setEditOpen(null);
          }}
        />
      )}
    </div>
  );
}
