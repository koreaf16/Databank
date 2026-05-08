/**
 * 파일: frontend/src/features/settings/components/tabs/StaffTab.tsx
 * 역할: 직원 관리(사용자 CRUD) 화면.
 */

import React from 'react';
import { Icon } from '../../../../components/Icon.jsx';
import {
  getUsers,
  getDepartments,
  getPositions,
  createUser,
  updateUser,
  deleteUser,
} from '../../api/settingsApi.js';

const RBAC_ROLES = [
  { id: 'admin',    label: '관리자' },
  { id: 'manager',  label: '팀장' },
  { id: 'engineer', label: '엔지니어' },
  { id: 'sales',    label: '영업' },
];
const RBAC_LABEL: Record<string, string> = Object.fromEntries(RBAC_ROLES.map(r => [r.id, r.label]));

export function StaffTab() {
  const [users, setUsers] = React.useState([]);
  const [depts, setDepts] = React.useState([]);
  const [positions, setPositions] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [deptFilter, setDeptFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [modal, setModal] = React.useState<any>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [userRows, deptRows, posRows] = await Promise.all([
        getUsers({ includeDisabled: true }),
        getDepartments(true),
        getPositions(true),
      ]);
      setUsers(Array.isArray(userRows) ? userRows : []);
      setDepts(Array.isArray(deptRows) ? deptRows : []);
      setPositions(Array.isArray(posRows) ? posRows : []);
    } catch (loadError: any) {
      setError(loadError.message || '직원 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const positionSortMap = React.useMemo(() => {
    const m = new Map<string, number>();
    (positions as any[]).forEach((p, i) => m.set(String(p.id), p.sortOrder ?? i));
    return m;
  }, [positions]);

  const filtered = React.useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (users as any[]).filter(user => {
      if (deptFilter !== 'all' && String(user.deptId) !== deptFilter) return false;
      if (statusFilter === 'enabled' && Number(user.enabled) === 0) return false;
      if (statusFilter === 'disabled' && Number(user.enabled) !== 0) return false;
      if (!keyword) return true;
      const source = [
        user.name,
        user.username,
        user.email,
        user.department,
        user.positionLabel,
        user.position,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return source.includes(keyword);
    }).sort((a, b) => (positionSortMap.get(String(a.positionId)) ?? 999) - (positionSortMap.get(String(b.positionId)) ?? 999));
  }, [users, search, deptFilter, statusFilter, positionSortMap]);

  async function saveUser(payload: any, id?: number) {
    setSaving(true);
    setError('');
    try {
      if (id != null) {
        await updateUser(id, payload);
      } else {
        await createUser(payload);
      }
      await loadData();
      setModal(null);
    } catch (saveError: any) {
      setError(saveError.message || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function disableUser(user: any) {
    if (!window.confirm(`"${user.name || user.username}" 사용자를 비활성화하시겠어요?`)) return;
    setSaving(true);
    setError('');
    try {
      await deleteUser(user.id);
      await loadData();
    } catch (deleteError: any) {
      setError(deleteError.message || '비활성화에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  const activeCount = users.filter((user: any) => Number(user.enabled) !== 0).length;

  return (
    <div className="tab-pane">
      <div className="set-h">
        <div>
          <h2>사용자 관리</h2>
          <p className="text-3">시스템 사용자 계정 및 권한을 관리합니다. (활성 {activeCount}명)</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={loadData} disabled={loading || saving}>
            <Icon name="refresh" size={13} /> 새로고침
          </button>
          <button className="btn primary" onClick={() => setModal({ mode: 'add' })} disabled={saving}>
            <Icon name="plus" size={13} /> 직원 추가
          </button>
        </div>
      </div>

      {error && (
        <div className="card card-pad" style={{ marginBottom: 12, color: 'var(--err)' }}>
          {error}
        </div>
      )}

      <div className="cm-toolbar" style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <div className="cm-search" style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }}/>
          <input
            className="input sm"
            style={{ paddingLeft: 32, width: '100%' }}
            placeholder="직원 검색"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select className="input sm" value={deptFilter} onChange={(event) => setDeptFilter(event.target.value)} style={{ width: 160 }}>
          <option value="all">전체 부서</option>
          {depts.map((dept: any) => (
            <option key={dept.id} value={String(dept.id)}>
              {dept.name}
            </option>
          ))}
        </select>
        <select className="input sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ width: 120 }}>
          <option value="all">전체 상태</option>
          <option value="enabled">활성</option>
          <option value="disabled">비활성</option>
        </select>
        <div style={{ flex: 1 }} />
        <span className="text-3" style={{ fontSize: 12 }}>
          {filtered.length}명
        </span>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div className="cust-empty">로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div className="cust-empty">직원이 없습니다.</div>
        ) : (
          <table className="hist-table">
            <thead>
              <tr>
                <th style={{ width: 200 }}>이름</th>
                <th style={{ width: 120 }}>계정</th>
                <th style={{ width: 140 }}>부서</th>
                <th style={{ width: 120 }}>직급</th>
                <th style={{ width: 100 }}>권한</th>
                <th>이메일</th>
                <th style={{ width: 92 }}>상태</th>
                <th style={{ width: 86 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((user: any) => (
                <tr key={user.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="avatar" style={{ background: '#5b8eff' }}>
                        {String(user.name || user.username || 'U')[0].toUpperCase()}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{user.name || '-'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-2" style={{ fontSize: 12 }}>{user.username}</td>
                  <td>{user.department || '-'}</td>
                  <td>{user.positionLabel || user.position || '-'}</td>
                  <td><span className="tag muted xs">{RBAC_LABEL[user.rbacRoleId] || '-'}</span></td>
                  <td className="text-2" style={{ fontSize: 12 }}>{user.email || '-'}</td>
                  <td>
                    {Number(user.enabled) === 0 ? (
                      <span className="tag muted">비활성</span>
                    ) : (
                      <span className="tag install">
                        <span className="dot ok" /> 활성
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        className="btn icon ghost sm"
                        onClick={() => setModal({ mode: 'edit', user })}
                        disabled={saving}
                      >
                        <Icon name="edit" size={12} />
                      </button>
                      <button
                        className="btn icon ghost sm"
                        onClick={() => disableUser(user)}
                        disabled={saving || Number(user.enabled) === 0}
                      >
                        <Icon name="trash" size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <StaffModal
          mode={modal.mode}
          user={modal.user}
          departments={depts}
          positions={positions}
          saving={saving}
          onSave={saveUser}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function StaffModal({ mode, user, departments, positions, saving, onSave, onClose }: any) {
  const [form, setForm] = React.useState(() => ({
    username: user?.username || '',
    name: user?.name || '',
    deptId: user?.deptId == null ? String(departments[0]?.id || '') : String(user.deptId),
    email: user?.email || '',
    positionId: user?.positionId == null ? '' : String(user.positionId),
    rbacRoleId: user?.rbacRoleId || '',
    useType: user?.useType || '',
    enabled: Number(user?.enabled ?? 1) !== 0,
  }));

  function setField(field: string, value: any) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function submit(event: any) {
    event.preventDefault();
    if (!form.username.trim() || !form.name.trim() || !form.deptId) return;

    const payload = {
      username: form.username.trim(),
      name: form.name.trim(),
      deptId: Number(form.deptId),
      email: form.email.trim() || null,
      positionId: form.positionId === '' ? null : Number(form.positionId),
      rbacRoleId: form.rbacRoleId || null,
      useType: form.useType.trim() || null,
      enabled: Boolean(form.enabled),
    };

    onSave(payload, user?.id);
  }

  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        style={{ width: 620 }}
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="modal-h">
          <div className="modal-title">{mode === 'edit' ? '직원 정보 수정' : '새 직원 등록'}</div>
          <button type="button" className="btn icon ghost" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <label className="form-label">
              <span>계정 ID *</span>
              <input
                className="input"
                value={form.username}
                onChange={(event) => setField('username', event.target.value)}
                placeholder="사번 또는 아이디"
                autoFocus
                required
              />
            </label>
            <label className="form-label">
              <span>이름 *</span>
              <input
                className="input"
                value={form.name}
                onChange={(event) => setField('name', event.target.value)}
                placeholder="성함 입력"
                required
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '16px', background: 'var(--bg-sub)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <label className="form-label">
              <span>소속 부서 *</span>
              <select
                className="input"
                value={form.deptId}
                onChange={(event) => setField('deptId', event.target.value)}
              >
                {departments.map((dept: any) => (
                  <option key={dept.id} value={String(dept.id)}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              <span>직급</span>
              <select
                className="input"
                value={form.positionId}
                onChange={(event) => setField('positionId', event.target.value)}
              >
                <option value="">선택 없음</option>
                {positions.map((p: any) => (
                  <option key={p.id} value={String(p.id)}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="form-label">
              <span>시스템 권한</span>
              <select
                className="input"
                value={form.rbacRoleId}
                onChange={(event) => setField('rbacRoleId', event.target.value)}
              >
                <option value="">선택 없음</option>
                {RBAC_ROLES.map(r => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </label>
            <label className="form-label">
              <span>사용 유형</span>
              <input
                className="input"
                value={form.useType}
                onChange={(event) => setField('useType', event.target.value)}
                placeholder="예: engineer, manager"
              />
            </label>
          </div>

          <label className="form-label">
            <span>이메일 주소</span>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(event) => setField('email', event.target.value)}
              placeholder="example@databank.co.kr"
            />
          </label>

          <label className="org-check" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={Boolean(form.enabled)}
              onChange={(event) => setField('enabled', event.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--brand-500)' }}
            />
            계정 활성화 상태 유지
          </label>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={saving || !form.username.trim() || !form.name.trim() || !form.deptId}
          >
            {saving ? '처리 중...' : '저장'}
          </button>
        </div>
      </form>
    </div>
  );
}
