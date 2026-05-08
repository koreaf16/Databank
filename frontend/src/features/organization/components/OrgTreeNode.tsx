/**
 * 파일: frontend/src/features/organization/components/OrgTreeNode.jsx
 * 역할: 조직 트리의 단일 노드. 재귀 렌더링으로 하위 부서 표시.
 *
 * 연관 파일:
 *   - OrganizationPage.jsx : 루트 노드 목록에서 렌더
 *   - components/Icon.jsx : 화살표 아이콘
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';

export function OrgTreeNode({ node, selectedId, onSelect }) {
  const [open, setOpen] = React.useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = node.id === selectedId;

  return (
    <div className="org-tree-node">
      <div className={`org-node-item ${isSelected ? 'on' : ''}`} onClick={() => onSelect(node.id)}>
        {hasChildren ? (
          <button className="org-toggle" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
            <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
          </button>
        ) : <div style={{ width: 18 }} />}
        <span className="org-node-name">{node.name}</span>
        <span className="tag muted xs" style={{ marginLeft: 'auto' }}>{node.headcount}</span>
      </div>
      {hasChildren && open && (
        <div className="org-node-children">
          {node.children.map(child => (
            <OrgTreeNode key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
