/**
 * 파일: frontend/src/features/knowledge-base/components/register/VersionTagInput.tsx
 * 역할: 지식베이스 문서의 제품 버전 태그 입력 컴포넌트.
 */

import React from 'react';

interface Props {
  value: string[];
  onChange: (value: string[]) => void;
  suggested?: string[];
}

export function VersionTagInput({ value, onChange, suggested = [] }: Props) {
  const [input, setInput] = React.useState('');
  
  function addTag(raw: string) {
    const t = raw.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInput('');
  }

  return (
    <div className="kb-version-tags">
      {value.map(v => (
        <span key={v} className="kb-version-tag">
          {v}
          <button type="button" onClick={() => onChange(value.filter(x => x !== v))}>×</button>
        </span>
      ))}
      <input
        list="kb-ver-suggest"
        className="kb-version-input"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { 
            e.preventDefault(); 
            if (input.trim()) addTag(input); 
          }
          if (e.key === 'Backspace' && !input && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => { if (input.trim()) addTag(input); }}
        placeholder={value.length === 0 ? '예: 19c  (Enter로 추가)' : '버전 추가...'}
      />
      {suggested.length > 0 && (
        <datalist id="kb-ver-suggest">
          {suggested.filter(v => !value.includes(v)).map(v => <option key={v} value={v}/>)}
        </datalist>
      )}
    </div>
  );
}
