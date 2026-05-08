// 고객사 검색+리스트박스 공통 컴포넌트

import React from 'react';
import { Icon } from '../Icon.jsx';

export function CustomerCombobox({ value, onChange, options = [], placeholder = '전체 고객사', style, disabled }) {
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef();

  React.useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setQ('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // options: [{ value, label }] 또는 string[]
  const normalized = options.map(o => typeof o === 'string' ? { value: o, label: o } : o);
  const filtered = q
    ? normalized.filter(o => o.label.toLowerCase().includes(q.toLowerCase()))
    : normalized;
  const selectedLabel = normalized.find(o => o.value === value)?.label || '';

  function select(v) {
    onChange(v);
    setOpen(false);
    setQ('');
  }

  return (
    <div
      ref={ref}
      style={{ position: 'relative', opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : undefined, ...style }}
    >
      <div style={{ position: 'relative' }}>
        <Icon name="search" size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }}/>
        <input
          className="input sm"
          value={open ? q : selectedLabel}
          placeholder={placeholder}
          style={{ paddingLeft: 24, paddingRight: value ? 22 : 10, width: '100%', boxSizing: 'border-box' }}
          onFocus={() => { setQ(''); setOpen(true); }}
          onChange={e => setQ(e.target.value)}
          readOnly={!open}
        />
        {value && (
          <button
            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
            onMouseDown={e => { e.preventDefault(); onChange(null); setQ(''); setOpen(false); }}
          >✕</button>
        )}
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 3px)', left: 0, zIndex: 400,
          background: 'var(--bg-elev)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', boxShadow: '0 6px 20px rgba(0,0,0,.12)',
          minWidth: '100%', width: 'max-content', maxWidth: 280, maxHeight: 240, overflowY: 'auto',
        }}>
          {filtered.map(opt => (
            <div
              key={opt.value}
              style={{
                padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                color: opt.value === value ? 'var(--brand-500)' : 'var(--text)',
                background: opt.value === value ? 'var(--brand-50)' : 'transparent',
              }}
              onMouseDown={e => { e.preventDefault(); select(opt.value); }}
            >
              {opt.label}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-3)' }}>결과 없음</div>
          )}
        </div>
      )}
    </div>
  );
}
