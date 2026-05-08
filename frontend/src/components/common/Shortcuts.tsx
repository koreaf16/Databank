// Keyboard shortcuts reference modal (? key)

import React from 'react';
import { Icon } from '../Icon.jsx';

const SHORTCUT_GROUPS = [
  {
    label: '탐색',
    items: [
      { keys: ['⌘K'], desc: '통합 검색 열기' },
      { keys: ['?'], desc: '단축키 안내 (이 창)' },
      { keys: ['Esc'], desc: '모달 / 패널 닫기' },
    ],
  },
  {
    label: '화면 이동',
    items: [
      { keys: ['G', 'H'], desc: '홈' },
      { keys: ['G', 'C'], desc: '채널' },
      { keys: ['G', 'A'], desc: '일정관리' },
      { keys: ['G', 'I'], desc: '지원이력' },
      { keys: ['G', 'K'], desc: '지식베이스' },
      { keys: ['G', 'R'], desc: '주간보고' },
      { keys: ['G', 'M'], desc: '작업현황표' },
    ],
  },
  {
    label: '작업',
    items: [
      { keys: ['N'], desc: '이력 빠른 등록' },
      { keys: ['E'], desc: '선택 항목 편집' },
      { keys: ['⌘Enter'], desc: '폼 제출 / 등록' },
      { keys: ['⌘Z'], desc: '되돌리기' },
    ],
  },
  {
    label: '보기',
    items: [
      { keys: ['⌘['], desc: '사이드바 접기 / 펼치기' },
      { keys: ['⌘↑'], desc: '이전 메뉴' },
      { keys: ['⌘↓'], desc: '다음 메뉴' },
    ],
  },
];

export function Shortcuts({ open, onClose }) {
  React.useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-h">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'var(--brand-500)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="command" size={18}/>
            </div>
            <div>
              <div className="modal-title">키보드 단축키</div>
              <div className="text-3" style={{ fontSize: 11, marginTop: 2 }}>시스템 전반에서 사용 가능한 단축키 안내입니다.</div>
            </div>
          </div>
          <button className="btn icon ghost" onClick={onClose}><Icon name="x" size={18}/></button>
        </div>
        
        <div className="modal-body" style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px 40px', maxHeight: '70vh' }}>
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.label}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--brand-600)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                {group.label}
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {group.items.map(item => (
                  <div key={item.desc} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>{item.desc}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {item.keys.map((k, i) => (
                        <React.Fragment key={k}>
                          {i > 0 && <span style={{ fontSize: 10, color: 'var(--text-4)', fontWeight: 700 }}>+</span>}
                          <kbd style={{ 
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            minWidth: 24, height: 24, padding: '0 6px',
                            background: 'var(--bg-sub)', border: '1px solid var(--border)', borderBottomWidth: 3,
                            borderRadius: '4px', fontSize: 11, fontWeight: 700, color: 'var(--text-1)',
                            fontFamily: 'var(--font-mono, monospace)', boxShadow: '0 1px 0 rgba(0,0,0,0.05)'
                          }}>{k}</kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-foot" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: 11 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-400)' }}></div>
            일부 단축키는 현재 화면에 따라 다르게 동작할 수 있습니다.
          </div>
          <button className="btn primary sm" onClick={onClose} style={{ minWidth: 80 }}>확인</button>
        </div>
      </div>
    </div>
  );
}

window.Shortcuts = Shortcuts;
