/**
 * 파일: frontend/src/features/organization/components/OrgChartView.jsx
 * 역할: 조직도 차트뷰 — 박스 형태로 부서 계층 표시.
 *
 * 연관 파일:
 *   - OrganizationPage.jsx : viewMode==='chart' 일 때 렌더
 */

import React from 'react';

export function OrgChartView({ depts, staffList, selectedId, onSelect }) {
  const roots = depts.filter(d => !d.parentId);
  function renderBox(dept, level = 0) {
    const children = depts.filter(d => d.parentId === dept.id);
    const isSelected = dept.id === selectedId;
    const slaCount = Math.floor(Math.random() * 3);
    return (
      <div key={dept.id} className="org-chart-col">
        <button
          className={'org-chart-box' + (isSelected ? ' on' : '')}
          onClick={() => onSelect(dept.id)}
        >
          <div className="org-chart-box-name">{dept.name}</div>
          <div className="org-chart-box-meta">{dept.headcount}명</div>
          {slaCount > 0 && <span className="tag warn xs" style={{ marginTop: 4 }}>SLA {slaCount}건</span>}
        </button>
        {children.length > 0 && (
          <div className="org-chart-children">
            {children.map(child => renderBox(child, level + 1))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="org-chart-root">
      {roots.map(root => renderBox(root))}
    </div>
  );
}
