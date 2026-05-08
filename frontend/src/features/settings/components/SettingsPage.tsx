/**
 * 파일: frontend/src/features/settings/components/SettingsPage.tsx
 * 역할: 관리설정 메인 레이아웃 및 탭 전환 관리.
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { AiModelTab } from './tabs/AiModelTab.js';
import { RbacTab } from './tabs/RbacTab.js';
import { AuditLogTab } from './tabs/AuditLogTab.js';
import { OrgTab } from './tabs/OrgTab.js';
import { StaffTab } from './tabs/StaffTab.js';
import { ReportTemplates } from '../../../components/ReportMasterTemplates.jsx';
import { CustomerMgmtPage } from '../../customers/components/CustomerMgmtPage.js';

const SECTIONS = [
  { group: '조직 & 사람', items: [
    { id: 'org',   label: '조직도 관리', icon: 'users' },
    { id: 'staff', label: '직원 관리',   icon: 'user' },
  ]},
  { group: '서비스 운영', items: [
    { id: 'customers', label: '고객사 관리',   icon: 'building' },
    { id: 'reporttpl', label: '내역서 템플릿', icon: 'report' },
  ]},
  { group: '시스템', items: [
    { id: 'ai',    label: 'AI 모델 관리',     icon: 'sparkles' },
    { id: 'rbac',  label: '권한 관리 (RBAC)', icon: 'shield' },
    { id: 'audit', label: '감사 로그',         icon: 'history' },
  ]},
];

export function SettingsPage({ role = 'admin' }) {
  const [tab, setTab] = React.useState('org');
  const [search, setSearch] = React.useState('');

  const filteredSections = React.useMemo(() => {
    return SECTIONS.map(sec => ({
      ...sec,
      items: sec.items.filter(i => !search || i.label.includes(search))
    })).filter(sec => sec.items.length > 0);
  }, [search]);

  const activeTab = tab;

  return (
    <div className="set-wrap" style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <aside className="set-side" style={{ width: 240, borderRight: '1px solid var(--border)', background: 'var(--bg-1)', display: 'flex', flexDirection: 'column' }}>
        <div className="set-side-h" style={{ padding: '16px 20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="settings" size={14} />
          <span>관리설정</span>
        </div>
        <div className="set-side-search" style={{ padding: '0 16px 16px' }}>
          <div style={{ position: 'relative' }}>
            <Icon name="search" size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }}/>
            <input
              className="input sm"
              placeholder="설정 검색"
              style={{ paddingLeft: 28, width: '100%' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="scroll" style={{ flex: 1, padding: '0 12px 20px' }}>
          {filteredSections.map(sec => (
            <div key={sec.group} className="set-side-grp" style={{ marginBottom: 16 }}>
              <div className="set-side-glabel" style={{ padding: '4px 8px', fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{sec.group}</div>
              {sec.items.map(i => (
                <button
                  key={i.id}
                  className={'set-side-item' + (activeTab === i.id ? ' on' : '')}
                  style={{
                    width: '100%', padding: '7px 8px', borderRadius: 6, border: 'none',
                    display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer',
                    color: activeTab === i.id ? 'var(--brand-500)' : 'var(--text)',
                    background: activeTab === i.id ? 'var(--brand-50)' : 'transparent',
                    textAlign: 'left'
                  }}
                  onClick={() => setTab(i.id)}
                >
                  <Icon name={i.icon} size={14} />
                  <span>{i.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <main className="set-main scroll" style={{ flex: 1, background: 'var(--bg-main)', padding: '24px 32px' }}>
        <div className="set-bc" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>
          <span>관리설정</span>
          <Icon name="chevron-right" size={10} />
          <b style={{ color: 'var(--text)' }}>{SECTIONS.flatMap(s => s.items).find(i => i.id === activeTab)?.label}</b>
        </div>

        <div className="tab-content">
          {activeTab === 'org'       && <OrgTab />}
          {activeTab === 'staff'     && <StaffTab />}
          {activeTab === 'customers' && <CustomerMgmtPage />}
          {activeTab === 'reporttpl' && <ReportTemplates role={role} />}
          {activeTab === 'ai'        && <AiModelTab />}
          {activeTab === 'rbac'      && <RbacTab />}
          {activeTab === 'audit'     && <AuditLogTab />}
        </div>
      </main>
    </div>
  );
}
