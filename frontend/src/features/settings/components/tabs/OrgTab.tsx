/**
 * 파일: frontend/src/features/settings/components/tabs/OrgTab.tsx
 * 역할: 조직도 관리(부서 트리 CRUD) 화면.
 */

import React from 'react';
import { Icon } from '../../../../components/Icon.jsx';
import {
  getDepartments,
  getUsers,
  getPositions,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from '../../api/settingsApi.js';

export function OrgTab() {
  const [depts, setDepts] = React.useState([]);
  const [users, setUsers] = React.useState([]);
  const [positions, setPositions] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState<number | string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [modal, setModal] = React.useState<any>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [deptRows, userRows, posRows] = await Promise.all([
        getDepartments(true),
        getUsers({ includeDisabled: true }),
        getPositions(true),
      ]);
      const deptList = Array.isArray(deptRows) ? deptRows : [];
      const userList = Array.isArray(userRows) ? userRows : [];
      setDepts(deptList);
      setUsers(userList);
      setPositions(Array.isArray(posRows) ? posRows : []);
      setSelectedId((prev) => {
        if (deptList.some((dept) => String(dept.id) === String(prev))) return prev;
        return deptList[0]?.id ?? null;
      });
    } catch (loadError: any) {
      setError(loadError.message || '부서 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const selected = depts.find((dept: any) => String(dept.id) === String(selectedId)) || null;
  const children = depts.filter((dept: any) => String(dept.parentId) === String(selectedId));
  const positionSortMap = React.useMemo(() => {
    const m = new Map<string, number>();
    (positions as any[]).forEach((p, i) => m.set(String(p.id), p.sortOrder ?? i));
    return m;
  }, [positions]);
  const members = React.useMemo(() =>
    (users as any[])
      .filter(u => String(u.deptId) === String(selectedId))
      .sort((a, b) => (positionSortMap.get(String(a.positionId)) ?? 999) - (positionSortMap.get(String(b.positionId)) ?? 999)),
    [users, selectedId, positionSortMap],
  );
  const tree = React.useMemo(() => buildDeptTree(depts, null, 0), [depts]);

  async function saveDept(payload: any) {
    setSaving(true);
    setError('');
    try {
      if (modal?.mode === 'edit' && modal.dept) {
        await updateDepartment(modal.dept.id, payload);
      } else {
        await createDepartment(payload);
      }
      await loadData();
      setModal(null);
    } catch (saveError: any) {
      setError(saveError.message || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function disableDept() {
    if (!selected) return;
    if (!window.confirm(`"${(selected as any).name}" 부서를 비활성화하시겠어요?`)) return;
    setSaving(true);
    setError('');
    try {
      await deleteDepartment((selected as any).id);
      await loadData();
    } catch (deleteError: any) {
      setError(deleteError.message || '비활성화에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tab-pane">
      <div className="set-h">
        <div>
          <h2>조직도 관리</h2>
          <p className="text-3">부서 트리 구조를 관리하고 소속 직원을 확인합니다.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={loadData} disabled={loading || saving}>
            <Icon name="refresh" size={13} /> 새로고침
          </button>
          <button
            className="btn primary"
            onClick={() => setModal({ mode: 'add', parentId: (selected as any)?.id ?? null })}
            disabled={saving}
          >
            <Icon name="plus" size={13} /> 부서 추가
          </button>
        </div>
      </div>

      {error && (
        <div className="card card-pad" style={{ marginBottom: 12, color: 'var(--err)' }}>
          {error}
        </div>
      )}

      <div className="set-cols" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 8, minHeight: 480 }}>
          {loading ? (
            <div className="cust-empty">로딩 중...</div>
          ) : (
            <DeptTree nodes={tree} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </div>
        <div className="card">
          <div className="card-h">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="users" size={14} />
              <h3 style={{ margin: 0 }}>{(selected as any)?.name || '—'}</h3>
              <span className="tag muted">{members.length}명</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn icon ghost sm"
                onClick={() => selected && setModal({ mode: 'edit', dept: selected })}
                disabled={!selected || saving}
                title="수정"
              >
                <Icon name="edit" size={13} />
              </button>
              <button
                className="btn icon ghost sm"
                onClick={disableDept}
                disabled={!selected || saving || (selected as any)?.parentId == null}
                title="비활성화"
              >
                <Icon name="trash" size={13} />
              </button>
            </div>
          </div>
          <div style={{ padding: 16 }}>
            <div className="detail-row" style={{ marginBottom: 16 }}>
              <div className="text-3" style={{ fontSize: 12, marginBottom: 8 }}>하위 부서</div>
              {children.length === 0 ? <span className="text-3" style={{ fontSize: 13 }}>없음</span> : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {children.map((dept: any) => (
                    <button key={dept.id} className="tag muted" style={{ cursor: 'pointer', border: 'none' }} onClick={() => setSelectedId(dept.id)}>
                      {dept.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="detail-row">
              <div className="text-3" style={{ fontSize: 12, marginBottom: 8 }}>직원 ({members.length}명)</div>
              {members.length === 0
                ? <span className="text-3" style={{ fontSize: 13 }}>이 부서에 직접 소속된 직원이 없습니다 (하위 부서 확인)</span>
                : (
                  <div className="set-staff-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                    {members.map((user: any) => (
                      <div key={user.id} className="set-staff-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 6 }}>
                        <span className="avatar" style={{ background: '#5b8eff', width: 28, height: 28, fontSize: 11 }}>
                          {String(user.name || user.username || 'U')[0].toUpperCase()}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {user.name || user.username}
                          </div>
                          <div className="text-3" style={{ fontSize: 11 }}>{user.positionLabel || user.position || '-'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          </div>
        </div>
      </div>

      {modal && (
        <DeptModal
          mode={modal.mode}
          dept={modal.dept}
          parentId={modal.parentId}
          departments={depts}
          onClose={() => setModal(null)}
          onSave={saveDept}
          saving={saving}
        />
      )}
    </div>
  );
}

function buildDeptTree(depts: any[], parentId: number | string | null, depth: number): any[] {
  return depts
    .filter((dept) => {
      if (parentId == null) return dept.parentId == null;
      return String(dept.parentId) === String(parentId);
    })
    .sort((left, right) => {
      const orderDiff = Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
      if (orderDiff !== 0) return orderDiff;
      return String(left.name || '').localeCompare(String(right.name || ''));
    })
    .map((dept) => ({
      ...dept,
      depth,
      kids: buildDeptTree(depts, dept.id, depth + 1),
    }));
}

function DeptTree({ nodes, selectedId, onSelect }: any) {
  return (
    <div className="dept-tree">
      {nodes.map((node: any) => (
        <DeptNode key={node.id} node={node} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}

function DeptNode({ node, selectedId, onSelect }: any) {
  const [open, setOpen] = React.useState(true);
  const hasChildren = node.kids && node.kids.length > 0;
  return (
    <div className={`dept-node${String(selectedId) === String(node.id) ? ' on' : ''}`}>
      <div
        className="dept-row"
        style={{ paddingLeft: 6 + ((node.depth || 0) * 14), cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 4 }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
            onClick={(event) => {
              event.stopPropagation();
              setOpen((prev) => !prev);
            }}
          >
            <Icon name={open ? 'chevron-down' : 'chevron-right'} size={11} />
          </button>
        ) : (
          <div style={{ width: 11 }} />
        )}
        <Icon name="users" size={12} className="text-3" />
        <span className="dept-name" style={{ fontSize: 13 }}>{node.name}</span>
      </div>
      {hasChildren && open && node.kids.map((kid: any) => (
        <DeptNode key={kid.id} node={kid} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}

function DeptModal({ mode, dept, parentId, departments, onSave, onClose, saving }: any) {
  const [name, setName] = React.useState(dept?.name || '');
  const initialParentId = dept ? dept.parentId : parentId;
  const [formParentId, setFormParentId] = React.useState(
    initialParentId == null ? '' : String(initialParentId),
  );
  const [sortOrder, setSortOrder] = React.useState(Number(dept?.sortOrder || 0));
  const [enabled, setEnabled] = React.useState(Number(dept?.enabled ?? 1) !== 0);

  function submit(event: any) {
    event.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      parentId: formParentId === '' ? null : Number(formParentId),
      sortOrder: Number(sortOrder || 0),
      enabled,
    });
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" style={{ width: 500 }} onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="modal-h">
          <div className="modal-title">{mode === 'edit' ? '부서 정보 수정' : '새 부서 추가'}</div>
          <button type="button" className="btn icon ghost" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 20 }}>
          <label className="form-label">
            <span>부서명 *</span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="예: 기술지원팀"
              autoFocus
              required
            />
          </label>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '16px', background: 'var(--bg-sub)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <label className="form-label">
              <span>상위 부서</span>
              <select
                className="input"
                value={formParentId}
                onChange={(event) => setFormParentId(event.target.value)}
              >
                <option value="">최상위 (루트)</option>
                {departments
                  .filter((item: any) => (mode === 'edit' ? String(item.id) !== String(dept?.id) : true))
                  .map((item: any) => (
                    <option key={item.id} value={String(item.id)}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="form-label">
              <span>출력 순서</span>
              <input
                className="input"
                type="number"
                value={sortOrder}
                onChange={(event) => setSortOrder(Number(event.target.value))}
              />
            </label>
          </div>

          <label className="org-check" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--brand-500)' }}
            />
            부서 활성화 상태 유지
          </label>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button type="submit" className="btn primary" disabled={saving || !name.trim()}>
            {saving ? '처리 중...' : '저장'}
          </button>
        </div>
      </form>
    </div>
  );
}
