/**
 * @module components/features/sidebar/MenuRail
 * @description 64px 좌측 메뉴 레일. 항상 표시. 아이콘+레이블+미읽음 배지.
 *   home/msg일 때만 채널 패널이 옆에 열림. 나머지는 레일 단독.
 * @usage <MenuRail role="manager" currentNav={nav} onNav={setNav} onLogout={fn} msgBadge={n}/>
 * @related ChannelPanel.jsx, app.jsx
 */
import React from 'react';
import { Icon } from '../../Icon.jsx';

const NAV_ITEMS = [
  { id: 'home', label: '홈',     icon: 'home' },
  null, // 구분선
  { id: 'cal',  label: '일정',   icon: 'calendar' },
  { id: 'hist', label: '지원',   icon: 'history' },
  { id: 'kb',   label: '지식',   icon: 'book' },
  { id: 'rep',  label: '보고',   icon: 'report' },
  { id: 'mat',  label: '현황표', icon: 'grid' },
  { id: 'org',  label: '조직도', icon: 'users' },
  { id: 'set',  label: '설정',   icon: 'settings' },
];

export function MenuRail({ role, currentNav, onNav, onLogout, msgBadge = 0 }) {

  return (
    <div className="sb-rail">
      <div className="sb-rail-logo">
        <div className="sb-rail-logo-mark">DB</div>
      </div>

      <nav className="sb-rail-nav">
        {NAV_ITEMS.map((item, idx) => {
          if (!item) return <div key={`sep-${idx}`} className="sb-rail-sep"/>;
          if (item.roles && !item.roles.includes(role)) return null;

          const badge = item.id === 'msg' ? msgBadge : 0;

          return (
            <button
              key={item.id}
              className={`sb-rail-btn${currentNav === item.id ? ' on' : ''}`}
              onClick={() => onNav(item.id)}
              title={item.label}
            >
              <Icon name={item.icon} size={18}/>
              <span className="sb-rail-label">{item.label}</span>
              {badge > 0 && (
                <span className="sb-rail-badge">{badge > 99 ? '99+' : badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="sb-rail-bottom">
        <button
          className="sb-rail-btn"
          title="로그아웃"
          onClick={onLogout}
          style={{ minHeight: 40 }}
        >
          <Icon name="logout" size={18}/>
        </button>
      </div>
    </div>
  );
}
