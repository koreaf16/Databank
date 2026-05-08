/**
 * 파일: frontend/src/features/organization/components/DeptView.jsx
 * 역할: 부서 상세 패널 — 통계, 하위 부서, 구성원 목록, 담당 고객사 표시.
 *       StaffRow, OrgStat 인라인 포함(소형 단일 목적 컴포넌트).
 *
 * 연관 파일:
 *   - OrganizationPage.jsx : selectedStaff 없을 때 렌더
 *   - orgUtils.js : deptSummary
 *   - components/Icon.jsx : DM 버튼 아이콘
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { deptSummary } from '../utils/orgUtils.js';

export function DeptView({ dept, staffList, allStaff, depts, positions, childDepts, assignedCustomers, resultLabel, onSelectStaff, onDM }) {
  const lead = staffList.find(s => s.id === dept?.leadId) || (allStaff || []).find(s => s.id === dept?.leadId) || null;
  const members = staffList
    .filter(s => s.id !== dept?.leadId)
    .sort((a, b) => (a.positionLevel ?? 999) - (b.positionLevel ?? 999));
  const activeCount = staffList.filter(s => s.status !== 'leave').length;

  return (
    <div className="dept-view">
      <div className="org-dept-head">
        <div>
          <h3>{dept?.name}</h3>
          <p>{deptSummary(dept, childDepts, assignedCustomers)}</p>
        </div>
        <span className="tag muted">{resultLabel}</span>
      </div>

      <div className="org-stat-grid">
        <OrgStat label="표시 인원" value={`${staffList.length}명`} />
        <OrgStat label="근무 중" value={`${activeCount}명`} />
        <OrgStat label="하위 부서" value={`${childDepts.length}개`} />
        <OrgStat label="담당 고객사" value={`${assignedCustomers.length}개`} />
      </div>

      {lead && (
        <div className="org-section">
          <div className="draft-panel-title">부서장</div>
          <StaffRow staff={lead} onSelect={onSelectStaff} onDM={onDM} />
        </div>
      )}

      {childDepts.length > 0 && (
        <div className="org-section">
          <div className="draft-panel-title">하위 부서</div>
          <div className="org-subdept-list">
            {childDepts.map(d => <span key={d.id} className="tag muted">{d.name} · {d.headcount}명</span>)}
          </div>
        </div>
      )}

      <div className="org-section">
        <div className="draft-panel-title">구성원</div>
        <div className="org-staff-list">
          {members.length === 0 && <div className="org-empty">조건에 맞는 구성원이 없습니다.</div>}
          {members.map(staff => <StaffRow key={staff.id} staff={staff} onSelect={onSelectStaff} onDM={onDM} />)}
        </div>
      </div>

      <div className="org-section">
        <div className="draft-panel-title">담당 고객사</div>
        <div className="org-chip-list">
          {assignedCustomers.length > 0 ? assignedCustomers.map(c => (
            <span key={c.id} className="tag muted xs">{c.name}</span>
          )) : <span className="text-3" style={{ fontSize: 12 }}>연결된 고객사가 없습니다.</span>}
        </div>
      </div>
    </div>
  );
}

function StaffRow({ staff, onSelect, onDM }) {
  return (
    <div className="org-staff-item" onClick={() => onSelect(staff.id)}>
      <div className="avatar" style={{ background: staff.color }}>{staff.name[0]}</div>
      <div className="org-staff-info">
        <div className="org-staff-name">
          {staff.name}
          <span className={'org-presence-dot presence-' + staff.presence} />
        </div>
        <div className="org-staff-pos">{staff.positionLabel} · {staff.deptName}</div>
      </div>
      <button className="btn ghost sm" title="DM" onClick={(e) => { e.stopPropagation(); onDM(staff); }}>
        <Icon name="message" size={14}/>
      </button>
    </div>
  );
}

function OrgStat({ label, value }) {
  return (
    <div className="org-stat">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
