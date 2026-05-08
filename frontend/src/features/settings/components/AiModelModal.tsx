import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { probeAiEndpoint } from '../api/settingsApi.js';

const THINKING_MODES = [
  { id: 'auto', label: 'Auto (모델 기본)' },
  { id: 'on',   label: '강제 ON' },
  { id: 'off',  label: '강제 OFF' },
];

const THINKING_FAMILIES = [
  { id: 'none',   label: '해당 없음' },
  { id: 'qwen36', label: 'Qwen 3.6 (think_on/off 토큰)' },
  { id: 'gemma4', label: 'Gemma 4 (think 토큰)' },
];

const KNOWN_MODELS: Record<string, string[]> = {
  anthropic: [
    'claude-opus-4-7',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
    'claude-opus-4-5',
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
  ],
  gemini: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ],
};

function extractBaseUrl(url: string) {
  try { return new URL(url).origin; } catch { return url; }
}

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

export function AiModelModal({ mode, model, onClose, onSave, onDelete }: any) {
  const [form, setForm] = React.useState(() => ({
    name:           model?.name || '',
    provider:       model?.provider || 'openai',
    modelType:      model?.modelType || 'llm',
    endpoint:       model?.endpoint || '',
    apiKey:         model?.apiKey || '',
    useCases:       model?.useCases || [],
    tokenLimit:     model?.tokenLimit || 0,
    costMonth:      model?.costMonth || 0,
    isDefault:      Boolean(model?.isDefault),
    status:         model?.status || 'active',
    thinkingMode:   model?.thinkingMode   || 'auto',
    thinkingFamily: model?.thinkingFamily || 'none',
  }));
  const [saving, setSaving] = React.useState(false);
  const [keyShow, setKeyShow] = React.useState(false);
  const [familyTouched, setFamilyTouched] = React.useState(Boolean(model?.thinkingFamily && model.thinkingFamily !== 'none'));
  const [probing, setProbing] = React.useState(false);
  const [probeModels, setProbeModels] = React.useState<string[]>([]);
  const [probeError, setProbeError] = React.useState('');

  function setField(field: string, value: any) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // 모델 이름 변경 시 thinking family 자동 추정 (사용자가 직접 설정한 경우는 유지)
  React.useEffect(() => {
    if (familyTouched) return;
    const lower = form.name.toLowerCase();
    if (/qwen.?3/.test(lower)) {
      setForm(p => ({ ...p, thinkingFamily: 'qwen36' }));
    } else if (lower.includes('gemma')) {
      setForm(p => ({ ...p, thinkingFamily: 'gemma4' }));
    } else {
      setForm(p => ({ ...p, thinkingFamily: 'none' }));
    }
  }, [form.name, familyTouched]);

  React.useEffect(() => {
    setProbeModels([]);
    setProbeError('');

    if (KNOWN_MODELS[form.provider]) {
      setProbeModels(KNOWN_MODELS[form.provider]);
      return;
    }

    // local/openai: endpoint에서 origin 파싱 가능할 때만 probe
    let baseUrl = '';
    try {
      baseUrl = new URL(form.endpoint).origin;
    } catch {
      return;
    }
    if (!baseUrl || baseUrl === 'null') return;

    setProbing(true);
    const timer = setTimeout(async () => {
      try {
        const providerParam = form.provider === 'local' ? 'auto' : 'openai';
      const models: any[] = await probeAiEndpoint(baseUrl, providerParam);
        setProbeModels(models.map((m: any) => m.name || m.id || String(m)));
        setProbeError('');
      } catch {
        setProbeError('모델 목록을 가져오지 못했습니다.');
      } finally {
        setProbing(false);
      }
    }, 700);

    return () => { clearTimeout(timer); setProbing(false); };
  }, [form.provider, form.endpoint]);

  function toggleUseCase(ucId: string) {
    setForm((prev) => {
      const ucs = new Set(prev.useCases);
      if (ucs.has(ucId)) ucs.delete(ucId);
      else ucs.add(ucId);
      return { ...prev, useCases: Array.from(ucs) };
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.provider || !form.modelType) return;
    setSaving(true);
    try {
      await onSave({
        ...form,
        name: form.name.trim(),
        endpoint: form.endpoint.trim() || null,
        apiKey: form.apiKey.trim() || null,
        tokenLimit: Number(form.tokenLimit) || 0,
        costMonth: Number(form.costMonth) || 0,
      });
    } catch (err: any) {
      alert(err.message || '저장 중 오류가 발생했습니다.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        style={{ width: 640 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="modal-h">
          <div className="modal-title">AI 모델 {mode === 'edit' ? '수정' : '추가'}</div>
          <button type="button" className="btn icon ghost" onClick={onClose} disabled={saving}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="form-label">
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                모델 식별자 (ID/Name) *
                {probing && <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 400 }}>조회 중...</span>}
              </span>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="예: gpt-4-turbo"
                autoFocus
                required
              />
              {probeError && (
                <div style={{ fontSize: 11, color: 'var(--err)', marginTop: 4 }}>{probeError}</div>
              )}
              {probeModels.length > 0 && (
                <div style={{
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  background: 'var(--bg-elev)',
                  marginTop: 4,
                  maxHeight: 180,
                  overflowY: 'auto',
                }}>
                  {probeModels.map((modelName) => (
                    <button
                      key={modelName}
                      type="button"
                      className="btn ghost"
                      style={{ width: '100%', justifyContent: 'flex-start', padding: '7px 12px', fontSize: 12, borderRadius: 0 }}
                      onClick={() => { setField('name', modelName); setProbeModels([]); }}
                    >
                      {modelName}
                    </button>
                  ))}
                </div>
              )}
            </label>
            <label className="form-label">
              <span>제공자 (Provider) *</span>
              <select
                className="input"
                value={form.provider}
                onChange={(e) => setField('provider', e.target.value)}
              >
                {AI_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              <span>모델 유형 *</span>
              <select
                className="input"
                value={form.modelType}
                onChange={(e) => setField('modelType', e.target.value)}
              >
                <option value="llm">LLM (대규모 언어 모델)</option>
                <option value="embedding">임베딩 (Embedding)</option>
                <option value="reranker">리랭커 (Reranker)</option>
              </select>
            </label>
            <label className="form-label">
              <span>상태</span>
              <select
                className="input"
                value={form.status}
                onChange={(e) => setField('status', e.target.value)}
              >
                <option value="active">활성</option>
                <option value="inactive">비활성</option>
              </select>
            </label>
          </div>

          {form.modelType === 'llm' && (
            <div style={{ padding: '12px 14px', background: 'var(--bg-sub)', border: '1px solid var(--border)', borderRadius: 8, display: 'grid', gap: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>추론(Thinking) 제어</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label className="form-label">
                  <span>Thinking Family</span>
                  <select
                    className="input"
                    value={form.thinkingFamily}
                    onChange={(e) => { setField('thinkingFamily', e.target.value); setFamilyTouched(true); }}
                  >
                    {THINKING_FAMILIES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </label>
                <label className="form-label">
                  <span>Thinking Mode</span>
                  <select
                    className="input"
                    value={form.thinkingMode}
                    disabled={form.thinkingFamily === 'none'}
                    onChange={(e) => setField('thinkingMode', e.target.value)}
                  >
                    {THINKING_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </label>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                Auto = 모델 기본 동작 / ON·OFF = 제어 토큰 시스템 프롬프트 주입. 응답의 &lt;think&gt; 블록은 자동 제거됩니다.
              </div>
            </div>
          )}

          <div style={{ padding: '12px 14px', background: 'var(--bg-sub)', border: '1px solid var(--border)', borderRadius: 8, display: 'grid', gap: 12 }}>
            <label className="form-label">
              <span>API 엔드포인트 URL</span>
              <input
                className="input"
                value={form.endpoint}
                onChange={(e) => setField('endpoint', e.target.value)}
                placeholder="https://api.openai.com/v1/chat/completions"
                type="url"
              />
            </label>
            <label className="form-label">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>API 키 (인증 토큰)</span>
                <button
                  type="button"
                  className="btn xs ghost"
                  onClick={() => setKeyShow(!keyShow)}
                  tabIndex={-1}
                >
                  <Icon name={keyShow ? 'eye-off' : 'eye'} size={12} /> {keyShow ? '숨기기' : '보기'}
                </button>
              </div>
              <input
                className="input"
                type={keyShow ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(e) => setField('apiKey', e.target.value)}
                placeholder={mode === 'edit' && !form.apiKey ? '수정하지 않음 (기존 키 유지)' : 'sk-...'}
                autoComplete="new-password"
              />
            </label>
          </div>

          <div className="form-label">
            <span>사용 목적 (Use Cases)</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {AI_USE_CASES.map((uc) => {
                const checked = form.useCases.includes(uc.id);
                return (
                  <button
                    key={uc.id}
                    type="button"
                    className={`chip-toggle ${checked ? 'on' : ''}`}
                    onClick={() => toggleUseCase(uc.id)}
                  >
                    <Icon name={uc.icon} size={12} /> {uc.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="form-label">
              <span>월별 토큰 한도 (Hard Limit)</span>
              <input
                className="input"
                type="number"
                min="0"
                value={form.tokenLimit}
                onChange={(e) => setField('tokenLimit', e.target.value)}
                placeholder="제한 없음 = 0"
              />
            </label>
            <label className="form-label">
              <span>예상 월 고정 비용 (원)</span>
              <input
                className="input"
                type="number"
                min="0"
                value={form.costMonth}
                onChange={(e) => setField('costMonth', e.target.value)}
                placeholder="예: 50000"
              />
            </label>
          </div>

          <label className="org-check" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginTop: 4 }}>
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setField('isDefault', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--brand-500)' }}
            />
            이 모델을 해당 유형의 기본(Default) 모델로 설정합니다.
          </label>
        </div>
        <div className="modal-foot">
          {mode === 'edit' && onDelete && (
            <button
              type="button"
              className="btn danger ghost"
              style={{ marginRight: 'auto' }}
              onClick={async () => {
                if (window.confirm(`"${form.name}" 모델을 삭제하시겠습니까?`)) {
                  setSaving(true);
                  try {
                    await onDelete(model.id);
                  } catch (err: any) {
                    alert(err.message || '삭제에 실패했습니다.');
                    setSaving(false);
                  }
                }
              }}
            >
              삭제
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button type="submit" className="btn primary" disabled={saving || !form.name.trim()}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </form>
    </div>
  );
}
