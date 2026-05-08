/**
 * 파일: frontend/src/features/organization/utils/orgUtils.js
 * 역할: 조직도 컴포넌트에서 공유하는 트리 탐색·직원 보강·고객사 배정 유틸.
 *
 * 연관 파일:
 *   - OrganizationPage.jsx : buildOrgTree, getDescendantDeptIds
 *   - DeptView.jsx : deptSummary, getAssignedCustomers
 *   - ProfileView.jsx : enrichStaff, inferStaffSkills, getAssignedCustomers, presenceLabel, workloadLabel
 */

export function buildOrgTree(depts, parentId) {
  return depts
    .filter(d => d.parentId === parentId)
    .map(d => ({ ...d, children: buildOrgTree(depts, d.id) }));
}

export function getDescendantDeptIds(depts, deptId) {
  const children = depts.filter(d => d.parentId === deptId);
  return children.flatMap(child => [child.id, ...getDescendantDeptIds(depts, child.id)]);
}

export function enrichStaff(staff, depts, positions) {
  if (!staff) return null;
  const dept = depts.find(d => d.id === staff.deptId);
  const position = positions.find(p => p.id === staff.position);
  return {
    ...staff,
    deptName: dept?.name || '',
    positionLabel: position?.label || staff.positionName || '',
    positionLevel: position?.level ?? 999,
    color: staff.color || '#7c5cff',
    presence: staff.status === 'leave' ? 'away' : 'online',
    skills: staff.skills || inferStaffSkills(null, dept),
  };
}

export function inferStaffSkills(engineer, dept) {
  if (engineer?.teamId === 't-dba' || dept?.name?.includes('DBA')) return ['Oracle', 'SQL 튜닝', 'RAC'];
  if (engineer?.teamId === 't-net') return ['Network', 'Firewall'];
  if (engineer?.teamId === 't-sec') return ['Security', 'WAF'];
  if (dept?.name?.includes('클라우드')) return ['VMware', 'Linux', 'Cloud'];
  if (dept?.name?.includes('AI')) return ['RAG', '자동화'];
  return ['Oracle', 'Linux', '점검'];
}

export function getAssignedCustomers(customers, staffIds) {
  return (customers || []).filter(customer => {
    if (customer.ownerUserId && staffIds.has(customer.ownerUserId)) return true;
    const people = [
      customer.primary?.id,
      customer.secondary?.id,
      ...(customer.services || []).flatMap(s => [s.primary?.id, s.secondary?.id]),
    ];
    return people.some(id => staffIds.has(id));
  });
}

export function deptSummary(dept, childDepts, customers) {
  if (!dept) return '';
  if (dept.id === 'd7') return '정기점검, 인프라 운영, 고객사 장애 초기 대응을 담당합니다.';
  if (dept.name.includes('DBA')) return 'DB 운영 표준, 성능 진단, 고난도 SQL 이슈를 지원합니다.';
  if (dept.name.includes('기술본부')) return '운영 엔지니어링과 고객사 기술 지원을 총괄합니다.';
  if (childDepts.length > 0) return `${childDepts.length}개 하위 부서와 ${customers.length}개 고객사 업무를 관리합니다.`;
  return '담당자와 바로 연결해 업무 커뮤니케이션을 시작할 수 있습니다.';
}

export function presenceLabel(presence) {
  return ({ online: '온라인', away: '자리 비움', offline: '오프라인', mixed: '혼합' })[presence] || '온라인';
}

export function workloadLabel(count) {
  if (count >= 24) return `높음 · ${count}개 고객사`;
  if (count >= 10) return `보통 · ${count}개 고객사`;
  return `여유 · ${count}개 고객사`;
}
