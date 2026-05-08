/**
 * 파일: frontend/src/features/knowledge-base/components/KbCategoryNode.jsx
 * 역할: 지식베이스 카테고리 트리의 단일 노드. 재귀 렌더링으로 자식 노드 표시.
 *
 * 연관 파일:
 *   - KnowledgeBasePage.jsx : 루트 카테고리 목록에서 렌더
 *   - kbUtils.js : descendantCategoryIds, byOrder
 *   - components/Icon.jsx : 아이콘
 */

import React from 'react';
import { Icon } from '../../../components/Icon.jsx';
import { descendantCategoryIds, byOrder } from '../utils/kbUtils.js';

export function KbCategoryNode({ cat, categories, docs, selectedId, onSelect, onAdd, onRename, onRemove, depth = 0 }) {
  const [open, setOpen] = React.useState(true);
  const children = categories.filter(c => c.parentId === cat.id).sort(byOrder);
  const ids = new Set([cat.id, ...descendantCategoryIds(categories, cat.id)]);
  const count = docs.filter(d => ids.has(d.categoryId)).length;
  return (
    <div className="kb-cat-node">
      <div className={'kb-cat-row' + (selectedId === cat.id ? ' on' : '')} style={{ paddingLeft: 8 + depth * 14 }}>
        <button className="kb-cat-toggle" onClick={() => setOpen(!open)}>
          {children.length > 0 ? <Icon name={open ? 'chevron-down' : 'chevron-right'} size={11}/> : <span/>}
        </button>
        <button className="kb-cat-main" onClick={() => onSelect(cat.id)}>
          <Icon name={cat.icon || 'book'} size={13}/>
          <span>{cat.name}</span>
          <b>{count}</b>
        </button>
        <button className="kb-cat-action" title="하위 카테고리" onClick={() => onAdd(cat.id)}><Icon name="plus" size={11}/></button>
        <button className="kb-cat-action" title="수정" onClick={() => onRename(cat)}><Icon name="edit" size={11}/></button>
        <button className="kb-cat-action" title="삭제" onClick={() => onRemove(cat)}><Icon name="trash" size={11}/></button>
      </div>
      {open && children.map(child => (
        <KbCategoryNode key={child.id} cat={child} categories={categories} docs={docs} selectedId={selectedId}
          onSelect={onSelect} onAdd={onAdd} onRename={onRename} onRemove={onRemove} depth={depth + 1}/>
      ))}
    </div>
  );
}
