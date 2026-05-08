/**
 * 파일: frontend/src/features/organization/components/ProfileView.jsx
 * 역할: 직원 개인 프로필 패널 — 연락처, 기술, 담당 고객사, DM/메일/전화 버튼.
 *       관리자는 RBAC 권한 역할을 인라인으로 변경 가능.
 *
 * 연관 파일:
 *   - OrganizationPage.jsx : selectedStaff 있을 때 렌더
 *   - orgUtils.js : enrichStaff, getAssignedCustomers, presenceLabel, workloadLabel
 *   - components/Icon.jsx : 아이콘
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { enrichStaff, getAssignedCustomers, presenceLabel, workloadLabel } from '../utils/orgUtils.js';

const RBAC_ROLES = [
  { id: 'admin',    label: '관리자',   color: '#e2435d' },
  { id: 'manager',  label: '팀장',     color: '#7c5cff' },
  { id: 'engineer', label: '엔지니어', color: '#5b8eff' },
  { id: 'sales',    label: '영업',     color: '#15a06a' },
];

function RoleBadge({ roleId, label, color }) {
  const role = RBAC_ROLES.find(r => r.id === roleId);
  const bg = color || role?.color || '#aaa';
  const text = label || role?.label || roleId || '미지정';
  const style = roleId
    ? { background: bg + '22', color: bg, border: `1px solid ${bg}44`, borderRadius: 6, padding: '1px 8px', fontSize: 12, fontWeight: 600 }
    : { background: 'var(--bg-2)', color: 'var(--text-3)', borderRadius: 6, padding: '1px 8px', fontSize: 12 };
  return <span style={style}>{text}</span>;
}

export function ProfileView({ staff, customers, depts, positions, isAdmin, onBack, onDM, onUpdateStaff }) {
  const profile = enrichStaff(staff, depts || [], positions || []);
  const assignedCustomers = getAssignedCustomers(customers, new Set([staff.id])).slice(0, 12);
  const [updating, setUpdating] = React.useState(false);

  async function handleRoleChange(e) {
    const newRoleId = e.target.value || null;
    setUpdating(true);
    try {
      await onUpdateStaff?.(staff.id, { rbacRoleId: newRoleId });
    } finally {
      setUpdating(false);
    }
  }

  async function handlePositionChange(e) {
    const newPosId = e.target.value ? Number(e.target.value) : null;
    setUpdating(true);
    try {
      await onUpdateStaff?.(staff.id, { positionId: newPosId });
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="profile-view">
      <div className="panel-h org-profile-nav">
        <button className="btn ghost sm" onClick={onBack}><Icon name="arrow-left" size={14}/> 목록</button>
        <span className={'org-presence presence-' + profile.presence}>{presenceLabel(profile.presence)}</span>
      </div>

      <div className="profile-header">
        <div className="profile-avatar" style={{ background: profile.color }}>{staff.name[0]}</div>
        <h2>{staff.name}</h2>
        <div className="text-3">{profile.positionLabel} · {profile.deptName}</div>
        <div className="org-skill-row">
          {profile.skills.map(skill => <span key={skill} className="tag muted xs">{skill}</span>)}
        </div>
      </div>

      <div className="profile-actions">
        <button className="profile-action-btn" onClick={() => onDM(profile)}>
          <div className="icon-box"><Icon name="message" size={20}/></div>
          <span>DM</span>
        </button>
        <a className="profile-action-btn" href={`mailto:${staff.email}`}>
          <div className="icon-box"><Icon name="mail" size={20}/></div>
          <span>메일</span>
        </a>
        <a className="profile-action-btn" href={`tel:${staff.phone}`}>
          <div className="icon-box"><Icon name="phone" size={20}/></div>
          <span>전화</span>
        </a>
        <button className="profile-action-btn">
          <div className="icon-box"><Icon name="calendar" size={20}/></div>
          <span>일정 초대</span>
        </button>
        <button className="profile-action-btn" onClick={() => document.getElementById(`profile-customers-${staff.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}>
          <div className="icon-box"><Icon name="building" size={20}/></div>
          <span>고객사</span>
        </button>
      </div>

      <div className="profile-details">
        <div className="profile-field">
          <span>이메일</span>
          <b>{staff.email}</b>
        </div>
        <div className="profile-field">
          <span>연락처</span>
          <b>{staff.phone}</b>
        </div>
        <div className="profile-field">
          <span>입사일</span>
          <b>{staff.joined}</b>
        </div>
        <div className="profile-field">
          <span>직급</span>
          {isAdmin ? (
            <select
              className="input"
              style={{ padding: '2px 6px', fontSize: 13, height: 'auto' }}
              value={staff.positionId || ''}
              disabled={updating}
              onChange={handlePositionChange}
            >
              <option value="">미지정</option>
              {positions.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          ) : (
            <b>{profile.positionLabel}</b>
          )}
        </div>
        <div className="profile-field">
          <span>권한</span>
          {isAdmin ? (
            <select
              className="input"
              style={{ padding: '2px 6px', fontSize: 13, height: 'auto' }}
              value={staff.rbacRoleId || ''}
              disabled={updating}
              onChange={handleRoleChange}
            >
              <option value="">미지정</option>
              {RBAC_ROLES.map(r => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          ) : (
            <RoleBadge roleId={staff.rbacRoleId} label={staff.rbacRoleLabel} color={staff.rbacRoleColor} />
          )}
        </div>
        <div className="profile-field">
          <span>업무 부하</span>
          <b>{workloadLabel(assignedCustomers.length)}</b>
        </div>
        <div className="profile-field" id={`profile-customers-${staff.id}`}>
          <span>담당 고객사 ({assignedCustomers.length})</span>
          <div className="org-chip-list">
            {assignedCustomers.length > 0 ? (
              assignedCustomers.map(c => <span key={c.id} className="tag muted xs">{c.name}</span>)
            ) : (
              <span className="text-3" style={{ fontSize: 12 }}>담당 고객사 없음</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
