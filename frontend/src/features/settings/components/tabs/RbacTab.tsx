/**
 * 파일: frontend/src/features/settings/components/tabs/RbacTab.tsx
 * 역할: 권한 관리(RBAC) 매트릭스 화면.
 */

import React from 'react';
import { Icon } from '../../../../components/Icon.jsx';
import {
  getRbacRoles,
  getRbacPermissions,
  getRbacMatrix,
  updateRbacMatrix,
} from '../../api/settingsApi.js';

export function RbacTab() {
  const [roles, setRoles] = React.useState([]);
  const [groups, setGroups] = React.useState([]);
  const [matrix, setMatrix] = React.useState<Record<string, any>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [r, p, m] = await Promise.all([
        getRbacRoles(),
        getRbacPermissions(),
        getRbacMatrix(),
      ]);
      setRoles(r || []);
      setGroups(p || []);
      setMatrix(m || {});
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  async function toggle(roleId: string, permId: string) {
    const current = !!matrix[roleId]?.[permId];
    const next = !current;

    setMatrix(prev => ({
      ...prev,
      [roleId]: { ...prev[roleId], [permId]: next }
    }));

    try {
      setSaving(true);
      await updateRbacMatrix(roleId, permId, next ? 'true' : 'false');
    } catch (err: any) {
      alert(err.message);
      setMatrix(prev => ({
        ...prev,
        [roleId]: { ...prev[roleId], [permId]: current }
      }));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-3" style={{ textAlign: 'center', padding: 40 }}>불러오는 중...</div>;

  return (
    <div className="tab-pane">
      <div className="set-h">
        <div>
          <h2>권한 관리 (RBAC)</h2>
          <p className="text-3">역할별 기능 접근 권한을 설정합니다. 변경 사항은 즉시 반영됩니다.</p>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="rbac-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', position: 'sticky', left: 0, zIndex: 10 }}>기능 / 권한</th>
              {roles.map((r: any) => (
                <th key={r.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)' }}>
                  <div style={{ color: r.color, fontWeight: 700 }}>{r.label}</div>
                  <div className="text-3" style={{ fontSize: 10, fontWeight: 400 }}>{r.id}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group: any) => (
              <React.Fragment key={group.id}>
                <tr style={{ background: 'var(--bg-2)' }}>
                  <td colSpan={roles.length + 1} style={{ padding: '8px 16px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                    {group.label}
                  </td>
                </tr>
                {(group.perms || []).map((p: any) => (
                  <tr key={p.id} className="hover-row">
                    <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', position: 'sticky', left: 0, background: 'inherit', zIndex: 5 }}>
                      <div style={{ fontSize: 13 }}>{p.label}</div>
                      <div className="text-3" style={{ fontSize: 11 }}>{p.id}</div>
                    </td>
                    {roles.map((r: any) => {
                      const val = matrix[r.id]?.[p.id];
                      const isTrue = !!val;
                      return (
                        <td key={r.id} style={{ textAlign: 'center', borderBottom: '1px solid var(--border)', padding: 0 }}>
                          <button
                            className={'rbac-cell-btn' + (isTrue ? ' on' : '')}
                            style={{
                              width: '100%', height: 48, border: 'none', background: 'none', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s'
                            }}
                            disabled={saving}
                            onClick={() => toggle(r.id, p.id)}
                          >
                            <div className={'rbac-check-box' + (isTrue ? ' on' : '')} style={{
                              width: 18, height: 18, borderRadius: 4, border: '2px solid var(--border)',
                              background: isTrue ? r.color : 'transparent', borderColor: isTrue ? r.color : 'var(--border)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                              {isTrue && <Icon name="check" size={12} style={{ color: '#fff' }}/>}
                            </div>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
