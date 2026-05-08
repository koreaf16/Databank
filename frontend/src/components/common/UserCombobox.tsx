/**
 * 파일: frontend/src/components/common/UserCombobox.tsx
 * 역할: 사용자 검색 및 선택을 위한 콤보박스 컴포넌트.
 */

import React from 'react';
import { Icon } from '../Icon.jsx';

interface UserOption {
  value: number | string;
  label: string;
  subLabel?: string;
}

interface UserComboboxProps {
  value: number | string | null;
  onChange: (value: number | string | null) => void;
  options: UserOption[];
  placeholder?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}

export function UserCombobox({
  value,
  onChange,
  options = [],
  placeholder = '사용자 선택',
  style,
  disabled
}: UserComboboxProps) {
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQ('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = q
    ? options.filter(o =>
        o.label.toLowerCase().includes(q.toLowerCase()) ||
        (o.subLabel && o.subLabel.toLowerCase().includes(q.toLowerCase()))
      )
    : options;

  const selectedLabel = options.find(o => o.value === value)?.label || '';

  function select(v: number | string) {
    onChange(v);
    setOpen(false);
    setQ('');
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : undefined,
        ...style
      }}
    >
      <div style={{ position: 'relative' }}>
        <Icon
          name="search"
          size={12}
          style={{
            position: 'absolute',
            left: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-4)',
            pointerEvents: 'none'
          }}
        />
        <input
          className="input sm"
          value={open ? q : selectedLabel}
          placeholder={placeholder}
          style={{
            paddingLeft: 24,
            paddingRight: value ? 22 : 10,
            width: '100%',
            boxSizing: 'border-box'
          }}
          onFocus={() => {
            setQ('');
            setOpen(true);
          }}
          onChange={e => setQ(e.target.value)}
          readOnly={!open}
        />
        {value && (
          <button
            type="button"
            style={{
              position: 'absolute',
              right: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-3)',
              fontSize: 13,
              padding: '0 2px',
              lineHeight: 1
            }}
            onMouseDown={e => {
              e.preventDefault();
              onChange(null);
              setQ('');
              setOpen(false);
            }}
          >
            ✕
          </button>
        )}
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 3px)',
            left: 0,
            zIndex: 400,
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: '0 6px 20px rgba(0,0,0,.12)',
            minWidth: '100%',
            width: 'max-content',
            maxWidth: 280,
            maxHeight: 240,
            overflowY: 'auto'
          }}
        >
          {filtered.map(opt => (
            <div
              key={opt.value}
              style={{
                padding: '7px 12px',
                cursor: 'pointer',
                fontSize: 13,
                color: opt.value === value ? 'var(--brand-500)' : 'var(--text)',
                background: opt.value === value ? 'var(--brand-50)' : 'transparent',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8
              }}
              onMouseDown={e => {
                e.preventDefault();
                select(opt.value);
              }}
            >
              <span>{opt.label}</span>
              {opt.subLabel && (
                <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{opt.subLabel}</span>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-3)' }}>
              결과 없음
            </div>
          )}
        </div>
      )}
    </div>
  );
}
