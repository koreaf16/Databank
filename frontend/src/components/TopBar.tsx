// TopBar — appears above main content (hidden in chat mode)

import React from 'react';
import { Icon } from './Icon.jsx';
import { SlidePanel } from './common/SlidePanel.jsx';
import { useNotifications } from '../features/notifications/NotificationProvider.jsx';
import { useUser } from '../contexts/UserContext.js';

const CAT_LABELS = {
  all:     '전체',
  sla:     'SLA 임박',
  mention: '멘션',
  approve: '결재 대기',
  bot:     '봇 점검',
  system:  '시스템',
  calendar: '일정',
};

export function TopBar({ title, breadcrumbs, actions, onToggleSidebar, onHamburger, onCmdK }) {
  const me = useUser();
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [notifCat, setNotifCat] = React.useState('all');
  const { notifications: notifs, markRead, markAllRead } = useNotifications();

  const unread = notifs.filter(n => !n.read && !n.readAt).length;
  const visible = notifCat === 'all' ? notifs : notifs.filter(n => (n.cat || n.category) === notifCat);

  return (
    <div className="topbar">
      <div className="topbar-left">
        {/* 모바일 햄버거 */}
        <button
          className="btn icon ghost topbar-hamburger"
          onClick={onHamburger}
          title="메뉴"
          style={{ display: 'none' }}
        >
          <Icon name="menu" size={18}/>
        </button>
        {/* 데스크톱 사이드바 토글 */}
        <button className="btn icon ghost" onClick={onToggleSidebar} title="사이드바">
          <Icon name="sidebar" size={16}/>
        </button>
        {breadcrumbs ? (
          <div className="topbar-bread">
            {breadcrumbs.map((b, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Icon name="chevron-right" size={12} className="topbar-sep"/>}
                <span className={i === breadcrumbs.length - 1 ? 'topbar-bread-now' : 'topbar-bread-prev'}>{b}</span>
              </React.Fragment>
            ))}
          </div>
        ) : title && <h1 className="topbar-title">{title}</h1>}
      </div>
      <div className="topbar-right">
        {/* ⌘K 검색 버튼 */}
        {onCmdK && (
          <button
            className="btn ghost sm"
            onClick={onCmdK}
            title="통합 검색 (⌘K)"
            style={{ gap: 6, color: 'var(--text-3)', fontSize: 12 }}
          >
            <Icon name="search" size={13}/>
            검색
            <kbd style={{
              background: 'var(--bg-sub)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              fontSize: 10,
              padding: '1px 5px',
              fontFamily: 'var(--font-sans)',
              color: 'var(--text-4)',
            }}>⌘K</kbd>
          </button>
        )}
        {actions}
        {/* 알림 종 */}
        <button
          className="btn icon ghost"
          title="알림"
          onClick={() => setNotifOpen(true)}
          style={{ position: 'relative' }}
        >
          <Icon name="bell" size={16}/>
          {unread > 0 && <span className="topbar-bell-dot"/>}
        </button>
        <div className="avatar lg" style={{ background: me?.color || '#5b8eff' }}>{me?.initial || '?'}</div>
      </div>

      {/* 알림 슬라이드 패널 */}
      <SlidePanel open={notifOpen} onClose={() => setNotifOpen(false)} title="알림" width={360}>
        <div className="notif-panel">
          <div className="notif-panel-h">
            <span className="text-3" style={{ fontSize: 12 }}>{unread}개 읽지 않음</span>
            <button className="btn ghost xs" onClick={markAllRead}>모두 읽음</button>
          </div>
          <div className="notif-cats">
            {Object.entries(CAT_LABELS).map(([k, v]) => (
              <button
                key={k}
                className={'notif-cat-btn' + (notifCat === k ? ' on' : '')}
                onClick={() => setNotifCat(k)}
              >
                {v}
              </button>
            ))}
          </div>
          {visible.map(n => (
            <div
              key={n.id}
              className="notif-item"
              onClick={() => markRead(String(n.id))}
            >
              <div className={'notif-dot' + ((n.read || n.readAt) ? ' read' : '')}/>
              <div className="notif-body">
                <div className="notif-title">{n.title}</div>
                <div className="notif-meta">{n.meta || n.message || n.createdAt}</div>
              </div>
            </div>
          ))}
          {visible.length === 0 && (
            <div className="text-3" style={{ textAlign: 'center', padding: '24px 0', fontSize: 13 }}>
              알림이 없습니다
            </div>
          )}
        </div>
      </SlidePanel>
    </div>
  );
}

window.TopBar = TopBar;
