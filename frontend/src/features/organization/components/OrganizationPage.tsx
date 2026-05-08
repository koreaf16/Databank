/**
 * 파일: frontend/src/features/organization/components/OrganizationPage.jsx
 * 역할: 조직도 메인 페이지. Oracle API에서 부서/직원/고객사를 로드해 트리뷰/차트뷰로 표시.
 *
 * 연관 파일:
 *   - app.jsx : nav==='org' 일 때 렌더
 *   - OrgChartView.jsx, OrgTreeNode.jsx, DeptView.jsx, ProfileView.jsx : 하위 UI
 *   - orgUtils.js : buildOrgTree, getDescendantDeptIds, enrichStaff, getAssignedCustomers
 *   - api/orgCustomerApi.js : getDepartments, getUsers, getCustomers
 *   - components/Icon.jsx, Dashboard.jsx : 아이콘, Segment
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { getDepartments, getUsers, getPositions, updateUser } from '../api/orgApi.js';
import { getCustomers } from '../../customers/api/customersApi.js';
import { OrgChartView } from './OrgChartView.jsx';
import { OrgTreeNode } from './OrgTreeNode.jsx';
import { DeptView } from './DeptView.jsx';
import { ProfileView } from './ProfileView.jsx';
import {
  buildOrgTree,
  getDescendantDeptIds,
  enrichStaff,
  getAssignedCustomers,
} from '../utils/orgUtils.js';

// ── 원본 API 행 → UI 표준 형식 변환 ───────────────────────────────────────────

function normalizeOrgPayload(deptRows, userRows, customerRows, positionRows) {
  const sourceUsers = Array.isArray(userRows) ? userRows : [];
  const sourceDepts = Array.isArray(deptRows) ? deptRows : [];
  const sourceCustomers = Array.isArray(customerRows) ? customerRows : [];
  const sourcePositions = Array.isArray(positionRows) ? positionRows : [];

  const positions = sourcePositions.map(pos => ({
    id: String(pos.id),
    label: pos.name,
    level: Number(pos.sortOrder),
  }));

  const staffList = sourceUsers.map(user => ({
    id: asKey(user.id),
    name: String(user.name || user.username || user.id || '').trim(),
    email: String(user.email || '').trim(),
    phone: String(user.phone || '').trim(),
    deptId: asKey(user.deptId),
    position: asKey(user.positionId),
    positionLabel: String(user.positionLabel || user.position || '미지정').trim(),
    joined: formatJoinedDate(user.sourceCreatedAt),
    status: Number(user.enabled) === 0 ? 'leave' : 'active',
    adminType: String(user.adminType || '').trim(),
    useType: String(user.useType || '').trim(),
    positionName: String(user.position || '').trim(),
    rbacRoleId: String(user.rbacRoleId || '').trim() || null,
    rbacRoleLabel: String(user.rbacRoleLabel || '').trim() || null,
    rbacRoleColor: String(user.rbacRoleColor || '').trim() || null,
  })).filter(user => user.id && user.name && user.deptId);

  const headcountByDeptId = new Map();
  staffList.forEach(staff => {
    headcountByDeptId.set(staff.deptId, (headcountByDeptId.get(staff.deptId) || 0) + 1);
  });

  const depts = sourceDepts.map((dept, index) => {
    const deptId = asKey(dept.id);
    const memberCount = Number(dept.memberCount);
    return {
      ...dept,
      id: deptId,
      name: String(dept.name || '').trim(),
      parentId: asNullableKey(dept.parentId),
      sortOrder: Number.isFinite(Number(dept.sortOrder)) ? Number(dept.sortOrder) : index,
      enabled: Number(dept.enabled) === 0 ? 0 : 1,
      headcount: Number.isFinite(memberCount) ? memberCount : (headcountByDeptId.get(deptId) || 0),
    };
  }).filter(dept => dept.id && dept.name);

  const customers = sourceCustomers.map(customer => {
    const main = String(customer.customerMain || '').trim();
    const sub = String(customer.customerSub || '').trim();
    return {
      id: asKey(customer.id),
      name: main && sub ? `${main} (${sub})` : (main || sub || `고객사-${customer.id}`),
      customerMain: main,
      customerSub: sub,
      ownerUserId: asNullableKey(customer.ownerUserId),
      enabled: Number(customer.enabled) === 0 ? 0 : 1,
    };
  }).filter(customer => customer.id);

  return { depts, staffList, positions, customers };
}

function asKey(value) {
  const out = String(value ?? '').trim();
  return out || null;
}

function asNullableKey(value) {
  return asKey(value) || null;
}

function formatJoinedDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export function Organization({ onOpenDM, onChannel, role }) {
  const [selectedDeptId, setSelectedDeptId] = React.useState(null);
  const [selectedStaffId, setSelectedStaffId] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [positionFilter, setPositionFilter] = React.useState('all');
  const [includeChildren, setIncludeChildren] = React.useState(true);
  const [viewMode, setViewMode] = React.useState('tree');
  const [depts, setDepts] = React.useState([]);
  const [staffList, setStaffList] = React.useState([]);
  const [positions, setPositions] = React.useState([]);
  const [customers, setCustomers] = React.useState([]);
  const [orgLoading, setOrgLoading] = React.useState(false);
  const [orgError, setOrgError] = React.useState('');
  const openDM = onOpenDM || onChannel;

  const loadOrgData = React.useCallback(async () => {
    setOrgLoading(true);
    setOrgError('');
    try {
      const [deptRows, userRows, customerRows, positionRows] = await Promise.all([
        getDepartments(false),
        getUsers({ includeDisabled: false }),
        getCustomers(false),
        getPositions(true),
      ]);
      const normalized = normalizeOrgPayload(deptRows, userRows, customerRows, positionRows);
      setDepts(normalized.depts);
      setStaffList(normalized.staffList);
      setPositions(normalized.positions);
      setCustomers(normalized.customers);
      setSelectedDeptId(prev => (
        normalized.depts.some(dept => dept.id === prev)
          ? prev
          : normalized.depts[0]?.id || null
      ));
    } catch (error: any) {
      setOrgError(error.message || '조직도 데이터를 불러오지 못했습니다.');
      setSelectedDeptId(prev => prev || null);
    } finally {
      setOrgLoading(false);
    }
  }, []);

  React.useEffect(() => { loadOrgData(); }, [loadOrgData]);

  React.useEffect(() => {
    if (selectedDeptId == null && depts.length > 0) setSelectedDeptId(depts[0].id);
  }, [depts, selectedDeptId]);

  React.useEffect(() => {
    if (selectedStaffId && !staffList.some(staff => staff.id === selectedStaffId)) {
      setSelectedStaffId(null);
    }
  }, [selectedStaffId, staffList]);

  const deptMap = React.useMemo(() => new Map(depts.map(d => [d.id, d])), [depts]);
  const tree = React.useMemo(() => buildOrgTree(depts, null), [depts]);
  const selectedDept = deptMap.get(selectedDeptId) || depts[0];
  const selectedStaff = staffList.find(s => s.id === selectedStaffId);
  const selectedDeptIds = React.useMemo(() => {
    if (!selectedDept) return new Set();
    return new Set(includeChildren ? [selectedDept.id, ...getDescendantDeptIds(depts, selectedDept.id)] : [selectedDept.id]);
  }, [depts, includeChildren, selectedDept]);
  const childDepts = depts.filter(d => d.parentId === selectedDept?.id);

  const staffWithMeta = React.useMemo(() => staffList.map(staff => enrichStaff(staff, depts, positions)), [staffList, depts, positions]);
  const filteredStaff = staffWithMeta.filter(staff => {
    const keyword = query.trim().toLowerCase();
    const matchesDept = selectedDeptIds.has(staff.deptId);
    const matchesPosition = positionFilter === 'all' || staff.position === positionFilter;
    const matchesQuery = !keyword || [
      staff.name, staff.email, staff.phone, staff.deptName, staff.positionLabel,
      ...(staff.skills || []),
    ].filter(Boolean).join(' ').toLowerCase().includes(keyword);
    return matchesDept && matchesPosition && matchesQuery;
  }).sort((a, b) => (a.positionLevel ?? 999) - (b.positionLevel ?? 999));

  const deptCustomers = React.useMemo(() => {
    const staffIds = new Set(staffWithMeta.filter(s => selectedDeptIds.has(s.deptId)).map(s => s.id));
    return getAssignedCustomers(customers, staffIds).slice(0, 12);
  }, [customers, selectedDeptIds, staffWithMeta]);

  function handleDM(staff) {
    if (!openDM) return;
    openDM({
      id: `dm-${staff.id}`, name: staff.name, initial: staff.name[0],
      color: staff.color || '#7c5cff',
      presence: staff.presence || (staff.status === 'leave' ? 'away' : 'online'),
      unread: 0, lastActive: '방금', isTemp: true, kind: 'dm', staffId: staff.id,
    });
  }

  const isAdmin = role === 'admin';

  return (
    <div className="page-pad scroll" style={{ height: '100%' }}>
      <div className="page-h org-page-h">
        <div>
          <div className="page-eyebrow">데이타뱅크시스템즈 · 총 {staffList.length}명</div>
          <h1 className="page-title">조직</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn" onClick={loadOrgData} disabled={orgLoading}>
            <Icon name="refresh" size={14}/> {orgLoading ? '로딩 중..' : '현행화'}
          </button>
          <div className="seg">
            <button className={'seg-btn' + (viewMode === 'tree' ? ' on' : '')} onClick={() => setViewMode('tree')}>트리뷰</button>
            <button className={'seg-btn' + (viewMode === 'chart' ? ' on' : '')} onClick={() => setViewMode('chart')}>차트뷰</button>
          </div>
          {isAdmin && (
            <>
              <button className="btn"><Icon name="download" size={14}/> 내보내기</button>
              <button className="btn primary"><Icon name="plus" size={14}/> 부서 추가</button>
            </>
          )}
        </div>
      </div>

      {orgError && (
        <div className="card" style={{ marginBottom: 10, color: 'var(--text-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="alert" size={14} />
            <span>{orgError}</span>
          </div>
        </div>
      )}

      {viewMode === 'chart' && (
        <div className="org-chart-view card">
          <OrgChartView depts={depts} staffList={staffList} selectedId={selectedDeptId} onSelect={id => { setSelectedDeptId(id); setSelectedStaffId(null); }}/>
        </div>
      )}

      {viewMode === 'tree' && <div className="org-layout">
        <section className="card org-tree-panel">
          <div className="org-toolbar">
            <div className="org-search-box">
              <Icon name="search" size={14} />
              <input type="text" placeholder="직원, 부서, 기술 검색" value={query} onChange={e => setQuery(e.target.value)} />
            </div>
            <div className="org-filter-row">
              <select className="input" value={positionFilter} onChange={e => setPositionFilter(e.target.value)}>
                <option value="all">전체 직급</option>
                {positions.map(pos => <option key={pos.id} value={pos.id}>{pos.label}</option>)}
              </select>
              <label className="org-check">
                <input type="checkbox" checked={includeChildren} onChange={e => setIncludeChildren(e.target.checked)}/>
                하위 포함
              </label>
            </div>
          </div>
          <div className="org-tree-scroll">
            {tree.map(node => (
              <OrgTreeNode
                key={node.id}
                node={node}
                selectedId={selectedDept?.id}
                onSelect={(id) => { setSelectedDeptId(id); setSelectedStaffId(null); }}
              />
            ))}
          </div>
        </section>

        <section className="card org-detail-panel">
          {selectedStaff ? (
            <ProfileView
              staff={selectedStaff}
              customers={customers}
              depts={depts}
              positions={positions}
              isAdmin={isAdmin}
              onBack={() => setSelectedStaffId(null)}
              onDM={handleDM}
              onUpdateStaff={async (staffId, patch) => {
                await updateUser(staffId, patch);
                await loadOrgData();
              }}
            />
          ) : (
            <DeptView
              dept={selectedDept}
              staffList={filteredStaff}
              allStaff={staffWithMeta}
              depts={depts}
              positions={positions}
              childDepts={childDepts}
              assignedCustomers={deptCustomers}
              resultLabel={query || positionFilter !== 'all' ? '필터 결과' : includeChildren ? '선택 부서와 하위 부서' : '선택 부서'}
              onSelectStaff={setSelectedStaffId}
              onDM={handleDM}
            />
          )}
        </section>
      </div>}
    </div>
  );
}
