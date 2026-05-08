// 오른쪽에서 슬라이드로 나타나는 패널 공통 컴포넌트

import React from 'react';
import { Icon } from '../Icon.jsx';

export function SlidePanel({ open, onClose, title, width = 400, children }) {
  React.useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div className="slide-panel-backdrop" onClick={onClose}/>
      )}
      <div className={'slide-panel' + (open ? ' open' : '')} style={{ width }}>
        <div className="slide-panel-h">
          <span className="slide-panel-title">{title}</span>
          <button className="btn icon ghost" onClick={onClose}>
            <Icon name="x" size={15}/>
          </button>
        </div>
        <div className="slide-panel-body">
          {children}
        </div>
      </div>
    </>
  );
}
