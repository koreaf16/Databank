// 빈 상태 공통 컴포넌트 — 모든 빈 상태에 "다음 행동 1개" CTA 강제

import React from 'react';
import { Icon } from '../Icon.jsx';

export function EmptyState({ icon = 'inbox', title, desc, cta, onCta, cta2, onCta2, chips }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon name={icon} size={32}/>
      </div>
      <div className="empty-state-title">{title}</div>
      {desc && <div className="empty-state-desc">{desc}</div>}
      {cta && (
        <button className="btn primary" onClick={onCta}>
          {cta}
        </button>
      )}
      {cta2 && (
        <button className="btn ghost" onClick={onCta2} style={{ marginTop: 6 }}>
          {cta2}
        </button>
      )}
      {chips && chips.length > 0 && (
        <div className="empty-state-chips">
          {chips.map((chip, i) => (
            <button key={i} className="tag" onClick={chip.onClick}>
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
