/**
 * 파일: frontend/src/app.tsx
 * 역할: 메인 애플리케이션 컴포넌트. 라우팅, 레이아웃, 공통 상태 관리.
 */

import React from 'react';
import { useTweaks } from './tweaks-panel.jsx';
import { Icon } from './components/Icon.jsx';
import { Dashboard } from './components/Dashboard.jsx';
import { Workspace } from './components/Workspace.jsx';
import { MenuRail, ChannelPanel } from './components/features/sidebar/index.js';
import { TopBar } from './components/TopBar.jsx';
import { CommandK } from './components/common/CommandK.jsx';
import { Shortcuts } from './components/common/Shortcuts.jsx';
import { TweaksPanel } from './tweaks-panel.jsx';
import { Calendar } from './features/calendar/components/CalendarPage.js';
import { SupportHistory } from './features/support-history/components/SupportHistoryPage.js';
import { KnowledgeBase } from './features/knowledge-base/components/KnowledgeBasePage.js';
import { ReportPage } from './features/weekly-report/components/ReportPage.js';
import { Organization } from './features/organization/components/OrganizationPage.js';
import { MatrixPage } from './features/matrix/components/MatrixPage.js';
import { ChannelLanding } from './features/messaging/components/ChannelLanding.js';
import { SettingsPage } from './features/settings/components/SettingsPage.js';
import { ChannelProvider } from './context/ChannelContext.jsx';
import { ToastProvider } from './components/common/Toast.jsx';
import { NotificationProvider } from './features/notifications/NotificationProvider.tsx';
import { getAuthToken, setAuthToken, clearAuthToken, handleNetworkError } from './shared/api/apiClient.js';
import { UserProvider } from './contexts/UserContext.js';
import { MasterDataProvider } from './contexts/MasterDataContext.js';
import { getChannels } from './features/messaging/api/messagingApi.js';

function Login({ onLogin }) {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    setError('');

    try {
      const API_BASE = (window as any).DATABANK_API_BASE || '';
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message || '로그인에 실패했습니다');
        return;
      }
      setAuthToken(body.data.token);
      onLogin(body.data.user);
    } catch (err) {
      handleNetworkError(err);
      setError('서버에 연결할 수 없습니다');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-logo">DB</div>
        <h2>DATABANK Systems</h2>
        <div className="text-3">IT-SCO 워크스페이스 로그인</div>
        <form className="login-form" onSubmit={handleSubmit}>
          <input
            className="input"
            placeholder="사번"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
          />
          <input
            className="input"
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {error && <div style={{ color: 'var(--err)', fontSize: 12 }}>{error}</div>}
          <button
            type="submit"
            className="btn primary"
            style={{ width: '100%', height: 36 }}
            disabled={loading}
          >
            {loading ? '로그인 중...' : <><span>로그인</span> <Icon name="arrow-right" size={14}/></>}
          </button>
        </form>
        <div className="login-meta">© 2026 DATABANK Systems · v3.4.1</div>
      </div>
    </div>
  );
}

export default function App() {
  const TWEAK_DEFAULTS = {
    "theme": "light",
    "tone": "a",
    "primaryColor": "#356bf0",
    "density": "regular",
    "sidebarWidth": 260,
    "sidebarCollapsed": false,
    "sidebarPattern": "slack",
    "role": "engineer"
  };

  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [currentUser, setCurrentUser] = React.useState<any>(null);
  const [authChecked, setAuthChecked] = React.useState(false);
  const [nav, setNav] = React.useState('msg');
  const [myCustomers, setMyCustomers] = React.useState<any[]>([]);
  const [channel, setChannel] = React.useState<any>(null);
  const [cmdkOpen, setCmdkOpen] = React.useState(false);
  const [mobSidebar, setMobSidebar] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);

  const [isServerDown, setIsServerDown] = React.useState(false);

  function applyUser(user) {
    setCurrentUser(user);
    if (user.rbacRoleLabel) {
      const role = user.rbacRoleLabel.includes('팀장') || user.rbacRoleLabel.includes('부서장') ? 'manager'
        : user.rbacRoleLabel.includes('관리') ? 'admin'
        : 'engineer';
      setTweak('role', role);
    }
    setAuthChecked(true);
    // 고객사 채널 로드
    getChannels({ kind: 'customer' })
      .then(rows => {
        const list = Array.isArray(rows) ? rows : (rows?.items ?? []);
        setMyCustomers(list);
        setChannel((prev: any) => prev ?? list[0] ?? null);
      })
      .catch(() => {});
  }

  function handleLogout() {
    clearAuthToken();
    setCurrentUser(null);
    setMyCustomers([]);
    setChannel(null);
  }

  // 세션 복원 및 전역 이벤트 리스너
  React.useEffect(() => {
    const handleDown = () => setIsServerDown(true);
    const handleUnauthorized = () => {
      handleLogout();
      setAuthChecked(true);
    };

    window.addEventListener('db-server-down', handleDown);
    window.addEventListener('db-unauthorized', handleUnauthorized);

    const token = getAuthToken();
    if (!token) { setAuthChecked(true); return; }
    const API_BASE = (window as any).DATABANK_API_BASE || '';
    fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(body => {
        if (body?.ok && body?.data) applyUser(body.data);
        else { handleLogout(); setAuthChecked(true); }
      })
      .catch((err) => { 
        handleNetworkError(err);
        handleLogout(); 
        setAuthChecked(true); 
      });

    return () => {
      window.removeEventListener('db-server-down', handleDown);
      window.removeEventListener('db-unauthorized', handleUnauthorized);
    };
  }, []);

  const goChannel = (c) => { setChannel(c); setNav('msg'); setMobSidebar(false); };
  const openDMChannel = (nextChannel) => { setNav('msg'); setChannel(nextChannel); };

  if (!authChecked) return <div className="app-loading">잠시만 기다려주세요...</div>;

  const isChat = nav === 'msg';
  const showChannelPanel = isChat || ['home', 'cal', 'hist', 'kb', 'mat'].includes(nav);

  const pageTitleMap = {
    home: '홈', cal: '일정 관리', hist: '지원 이력', kb: '지식베이스',
    rep: '보고서', mat: '작업 현황표', org: '조직도',
    set: '관리설정',
  };

  const msgBadge = myCustomers.reduce((n: number, c: any) => n + (c.unread || 0), 0);

  const mainContent = !currentUser ? <Login onLogin={applyUser}/> : (
    <MasterDataProvider>
    <div className="app">
      {mobSidebar && <div className="sb-mob-backdrop" onClick={() => setMobSidebar(false)}/>}

      <aside className={`sb sb-v3${tweaks.sidebarPattern === 'discord' ? ' sb-discord' : tweaks.sidebarPattern === 'teams' ? ' sb-teams' : ''}`}>
        <MenuRail
          role={tweaks.role}
          currentNav={nav}
          onNav={n => { setNav(n); setMobSidebar(false); }}
          onLogout={handleLogout}
          msgBadge={msgBadge}
        />
        {(nav === 'home' || nav === 'msg') && (
          <ChannelPanel
            tweaks={tweaks}
            currentChannel={isChat ? channel?.id : null}
            onChannel={goChannel}
            customers={myCustomers}
            onAddCustomer={(c) => setMyCustomers(prev => [...prev, c])}
            onRemoveCustomer={(id) => setMyCustomers(prev => prev.filter(c => c.id !== id))}
            onCmdK={() => setCmdkOpen(true)}
            onShortcuts={() => setShortcutsOpen(true)}
            onLogout={handleLogout}
          />
        )}
      </aside>

      <main className="main">
        {!isChat && nav !== 'home' && (
          <TopBar
            title={pageTitleMap[nav]}
            onToggleSidebar={() => setTweak('sidebarCollapsed', !tweaks.sidebarCollapsed)}
            onHamburger={() => setMobSidebar(v => !v)}
            onCmdK={() => setCmdkOpen(true)}
          />
        )}

        {nav === 'home' && <Dashboard onNav={setNav} onChannel={goChannel}/>}
        {nav === 'msg' && (channel ? <Workspace channel={channel} role={tweaks.role} onClose={() => setChannel(null)} onCmdK={() => setCmdkOpen(true)} onGoChannel={goChannel}/> : <ChannelLanding />)}
        {nav === 'cal' && <Calendar fromChannel={channel}/>}
        {nav === 'hist' && <SupportHistory fromChannel={channel}/>}
        {nav === 'kb' && <KnowledgeBase fromChannel={channel}/>}
        {nav === 'rep' && <ReportPage/>}
        {nav === 'mat' && <MatrixPage fromChannel={channel}/>}
        {nav === 'org' && <Organization onOpenDM={openDMChannel} role={tweaks.role}/>}
        {nav === 'set' && <SettingsPage role={tweaks.role}/>}
      </main>

      <CommandK
        open={cmdkOpen}
        onClose={() => setCmdkOpen(false)}
        onNav={setNav}
      />
      <Shortcuts open={shortcutsOpen} onClose={() => setShortcutsOpen(false)}/>
    </div>
    </MasterDataProvider>
  );

  return (
    <>
    <ToastProvider>
    <NotificationProvider>
    <UserProvider me={currentUser}>
    <ChannelProvider channel={channel} nav={nav} setNav={setNav} setChannel={setChannel}>
      {mainContent}
    </ChannelProvider>
    </UserProvider>
    </NotificationProvider>
    </ToastProvider>

    {isServerDown && (
      <div className="server-down-overlay">
        <div className="server-down-card">
          <Icon name="alert-triangle" size={48} color="var(--err)" />
          <h2>서버 연결 실패</h2>
          <p>백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해 주세요.</p>
          <button className="btn primary" style={{ marginTop: 8 }} onClick={() => window.location.reload()}>
            다시 시도
          </button>
        </div>
      </div>
    )}

    <TweaksPanel title="Tweaks">
      {/* Tweaks content simplified for brevity */}
    </TweaksPanel>
    </>
  );
}
