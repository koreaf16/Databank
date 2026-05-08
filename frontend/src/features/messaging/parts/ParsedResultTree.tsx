import React from 'react';
import { Icon } from '../../../components/Icon.jsx';

type TreeNode =
  | { id: string; kind: 'overview'; label: string; sub?: string }
  | { id: string; kind: 'draft'; label: string; sub?: string }
  | { id: string; kind: 'section'; label: string; sub?: string; sectionIndex: number }
  | { id: string; kind: 'metrics'; label: string; sub?: string; metricIndexes: number[] }
  | { id: string; kind: 'metric'; label: string; sub?: string; metricIndex: number }
  | { id: string; kind: 'json'; label: string; sub?: string };

interface ParsedResultTreeProps {
  parsed: any;
  metrics: any[];
  targets: any[];
  onMetricChange: (index: number, patch: any) => void;
  height?: string | number;
  compact?: boolean;
  hideMetricTargetSelect?: boolean;
}

interface MetricPathNode {
  id: string;
  label: string;
  children: MetricPathNode[];
  metricIndexes: number[];
}

const KIND_LABEL: Record<string, string> = {
  inspection: 'Inspection',
  summary: 'Summary',
  incident: 'Incident',
  tech: 'Tech',
  install: 'Install',
  other: 'Other',
};

const TYPE_LABEL: Record<string, string> = {
  routine: 'Routine',
  incident: 'Incident',
  install: 'Install',
  investigation: 'Investigation',
};

function statusTone(status: string): string {
  if (status === 'crit' || status === 'critical') return 'crit';
  if (status === 'warn' || status === 'warning' || status === 'watch') return 'warn';
  return 'ok';
}

function jsonPreview(value: any): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function metricPath(metric: any): string[] {
  const id = String(metric?.metricId || 'metric').trim();
  return id.split('.').map(part => part.trim()).filter(Boolean);
}

function metricValue(metric: any): string {
  if (!metric) return '-';
  return `${metric.value ?? '-'}${metric.unit || ''} · ${metric.status || 'ok'}`;
}

function sourceIndex(metric: any, index: number): number {
  return typeof metric?.__sourceIndex === 'number' ? metric.__sourceIndex : index;
}

function buildMetricTree(metrics: any[]): { roots: MetricPathNode[]; nodeMap: Map<string, MetricPathNode> } {
  const roots: MetricPathNode[] = [];
  const nodeMap = new Map<string, MetricPathNode>();

  function getNode(parts: string[], level: number, siblings: MetricPathNode[]): MetricPathNode {
    const path = parts.slice(0, level + 1).join('.');
    const id = `metric-path:${path}`;
    let node = nodeMap.get(id);
    if (!node) {
      node = { id, label: parts[level], children: [], metricIndexes: [] };
      nodeMap.set(id, node);
      siblings.push(node);
    }
    return node;
  }

  metrics.forEach((metric, index) => {
    const parts = metricPath(metric);
    let siblings = roots;
    let node: MetricPathNode | null = null;
    parts.forEach((_, level) => {
      node = getNode(parts, level, siblings);
      siblings = node.children;
    });
    if (node) node.metricIndexes.push(index);
  });

  return { roots, nodeMap };
}

function collectMetricIndexes(node: MetricPathNode): number[] {
  return [
    ...node.metricIndexes,
    ...node.children.flatMap(child => collectMetricIndexes(child)),
  ];
}

export function ParsedResultTree({
  parsed,
  metrics,
  targets,
  onMetricChange,
  height = 'min(680px, calc(100vh - 260px))',
  compact = false,
  hideMetricTargetSelect = false,
}: ParsedResultTreeProps) {
  const [open, setOpen] = React.useState<Record<string, boolean>>({
    draft: true,
    sections: true,
    metrics: true,
    json: false,
  });
  const [selectedId, setSelectedId] = React.useState('overview');

  const draft = parsed?.historyDraft || parsed || {};
  const sections = Array.isArray(parsed?.sections) ? parsed.sections : [];
  const metricTree = React.useMemo(() => buildMetricTree(metrics), [metrics]);

  const selectedNode = React.useMemo<TreeNode>(() => {
    if (selectedId === 'overview') return { id: 'overview', kind: 'overview', label: 'Parsing summary' };
    if (selectedId === 'draft') return { id: 'draft', kind: 'draft', label: 'History draft' };
    if (selectedId === 'json') return { id: 'json', kind: 'json', label: 'Parsed JSON' };

    const sectionMatch = selectedId.match(/^section:(\d+)$/);
    if (sectionMatch) {
      const sectionIndex = Number(sectionMatch[1]);
      return {
        id: selectedId,
        kind: 'section',
        label: sections[sectionIndex]?.title || 'Section',
        sectionIndex,
      };
    }

    const metricMatch = selectedId.match(/^metric:(\d+)$/);
    if (metricMatch) {
      const metricIndex = Number(metricMatch[1]);
      return {
        id: selectedId,
        kind: 'metric',
        label: metricPath(metrics[metricIndex]).slice(-1)[0] || metrics[metricIndex]?.label || 'Metric',
        metricIndex,
      };
    }

    const pathNode = metricTree.nodeMap.get(selectedId);
    if (pathNode) {
      return {
        id: selectedId,
        kind: 'metrics',
        label: pathNode.label,
        metricIndexes: collectMetricIndexes(pathNode),
      };
    }

    return { id: 'overview', kind: 'overview', label: 'Parsing summary' };
  }, [selectedId, sections, metrics, metricTree]);

  function toggle(id: string) {
    setOpen(current => ({ ...current, [id]: !current[id] }));
  }

  function renderMetricNode(node: MetricPathNode, level: number): React.ReactNode {
    const allIndexes = collectMetricIndexes(node);
    if (node.children.length === 0 && node.metricIndexes.length === 1) {
      const index = node.metricIndexes[0];
      const metric = metrics[index];
      return (
        <TreeButton
          key={`metric:${index}`}
          node={{ id: `metric:${index}`, kind: 'metric', label: node.label, sub: metricValue(metric), metricIndex: index }}
          level={level}
          selectedId={selectedId}
          onSelect={setSelectedId}
          tone={statusTone(metric?.status)}
        />
      );
    }

    return (
      <React.Fragment key={node.id}>
        <TreeButton
          node={{ id: node.id, kind: 'metrics', label: node.label, sub: `${allIndexes.length} items`, metricIndexes: allIndexes }}
          level={level}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {node.children.map(child => renderMetricNode(child, level + 1))}
        {node.metricIndexes.map(index => {
          const metric = metrics[index];
          return (
            <TreeButton
              key={`metric:${index}`}
              node={{ id: `metric:${index}`, kind: 'metric', label: metric?.label || metric?.rawLabel || metric?.metricId || 'Metric', sub: metricValue(metric), metricIndex: index }}
              level={level + 1}
              selectedId={selectedId}
              onSelect={setSelectedId}
              tone={statusTone(metric?.status)}
            />
          );
        })}
      </React.Fragment>
    );
  }

  const selectedMetricCount = metrics.filter(metric => metric.selected !== false).length;
  const warnCount = metrics.filter(metric => statusTone(metric.status) !== 'ok').length;

  return (
    <div
      className="parsed-tree-shell"
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? '240px minmax(0, 1fr)' : '300px minmax(0, 1fr)',
        gap: 12,
        minHeight: compact ? 460 : 540,
        height,
        maxHeight: height,
        overflow: 'hidden',
      }}
    >
      <aside className="scroll" style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-sub)', padding: 8, minHeight: 0 }}>
        <TreeButton
          node={{ id: 'overview', kind: 'overview', label: 'Parsing summary', sub: `${KIND_LABEL[parsed?.documentKind] || parsed?.documentKind || '-'} · ${Math.round((parsed?.confidence ?? 0) * 100)}%` }}
          level={0}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        <TreeGroup id="draft" label="History draft" count={draft?.summary ? 1 : 0} open={open.draft} onToggle={toggle}>
          <TreeButton node={{ id: 'draft', kind: 'draft', label: draft.summary || 'Draft fields', sub: TYPE_LABEL[draft.historyType] || draft.historyType || '-' }} level={1} selectedId={selectedId} onSelect={setSelectedId} />
        </TreeGroup>

        <TreeGroup id="sections" label="Sections" count={sections.length} open={open.sections} onToggle={toggle}>
          {sections.map((section: any, index: number) => (
            <TreeButton
              key={`section:${index}`}
              node={{ id: `section:${index}`, kind: 'section', label: section.title || `Section ${index + 1}`, sub: shortText(section.content), sectionIndex: index }}
              level={1}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ))}
        </TreeGroup>

        <TreeGroup id="metrics" label="Trend metrics" count={selectedMetricCount} open={open.metrics} onToggle={toggle}>
          {metricTree.roots.map(node => renderMetricNode(node, 1))}
        </TreeGroup>

        <TreeGroup id="json" label="Source / JSON" count={1} open={open.json} onToggle={toggle}>
          <TreeButton node={{ id: 'json', kind: 'json', label: 'Full parsed JSON', sub: 'debug' }} level={1} selectedId={selectedId} onSelect={setSelectedId} />
        </TreeGroup>
      </aside>

      <section className="scroll" style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-1)', minHeight: 0 }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 1, padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={selectedNode.kind === 'metric' || selectedNode.kind === 'metrics' ? 'pulse' : selectedNode.kind === 'json' ? 'code' : 'list'} size={15}/>
          <b>{selectedNode.label}</b>
          <span style={{ flex: 1 }}/>
          <span className="tag muted xs">{metrics.length} metrics</span>
          {warnCount > 0 && <span className="tag warn xs">{warnCount} review</span>}
        </div>
        <div style={{ padding: compact ? 12 : 16 }}>
          <DetailView
            node={selectedNode}
            parsed={parsed}
            draft={draft}
            sections={sections}
            metrics={metrics}
            targets={targets}
            onMetricChange={onMetricChange}
            hideMetricTargetSelect={hideMetricTargetSelect}
          />
        </div>
      </section>
    </div>
  );
}

function TreeGroup({ id, label, count, open, onToggle, children }: any) {
  return (
    <div style={{ marginTop: 6 }}>
      <button
        className="btn ghost sm"
        style={{ width: '100%', justifyContent: 'flex-start', padding: '5px 6px', fontSize: 12, fontWeight: 800 }}
        onClick={() => onToggle(id)}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12}/>
        <span>{label}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-3)' }}>{count}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

function TreeButton({ node, level, selectedId, onSelect, tone }: { node: TreeNode; level: number; selectedId: string; onSelect: (id: string) => void; tone?: string }) {
  const selected = selectedId === node.id;
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      style={{
        width: '100%',
        display: 'grid',
        gridTemplateColumns: '16px minmax(0, 1fr)',
        gap: 6,
        alignItems: 'start',
        padding: '7px 8px',
        paddingLeft: 8 + level * 16,
        border: '1px solid ' + (selected ? 'var(--brand-300)' : 'transparent'),
        borderRadius: 6,
        background: selected ? 'var(--brand-50)' : 'transparent',
        color: 'var(--text-1)',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 99, marginTop: 5, background: tone === 'crit' ? 'var(--err)' : tone === 'warn' ? 'var(--warn)' : selected ? 'var(--brand-500)' : 'var(--border-2)' }}/>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.label}</span>
        {node.sub && <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{node.sub}</span>}
      </span>
    </button>
  );
}

function DetailView({ node, parsed, draft, sections, metrics, targets, onMetricChange, hideMetricTargetSelect }: any) {
  if (node.kind === 'overview') {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <SummaryGrid items={[
          ['Document kind', KIND_LABEL[parsed?.documentKind] || parsed?.documentKind || '-'],
          ['Confidence', `${Math.round((parsed?.confidence ?? 0) * 100)}%`],
          ['History type', TYPE_LABEL[draft?.historyType] || draft?.historyType || '-'],
          ['Service', draft?.service || parsed?.service || '-'],
          ['Sections', `${sections.length}`],
          ['Metrics', `${metrics.length}`],
        ]}/>
        <TextBlock title="Summary" value={draft?.summary || parsed?.summary || '-'} />
      </div>
    );
  }

  if (node.kind === 'draft') {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <SummaryGrid items={[
          ['Service', draft?.service || '-'],
          ['Type', TYPE_LABEL[draft?.historyType] || draft?.historyType || '-'],
          ['Support mode', draft?.supportMode || '-'],
          ['Priority', draft?.priority || '-'],
          ['Start', draft?.startTime || '-'],
          ['End', draft?.endTime || '-'],
        ]}/>
        <TextBlock title="Summary" value={draft?.summary || '-'} />
        <TextBlock title="Findings" value={draft?.finding || '-'} />
        <TextBlock title="Action" value={draft?.action || '-'} />
      </div>
    );
  }

  if (node.kind === 'section') {
    const section = sections[node.sectionIndex] || {};
    return <TextBlock title={section.title || 'Section'} value={section.content || '-'} tall />;
  }

  if (node.kind === 'metrics') {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {node.metricIndexes.map((index: number) => (
          <MetricEditor
            key={index}
            metric={metrics[index]}
            index={index}
            targets={targets}
            onMetricChange={onMetricChange}
            hideTargetSelect={hideMetricTargetSelect}
          />
        ))}
      </div>
    );
  }

  if (node.kind === 'metric') {
    return (
      <MetricEditor
        metric={metrics[node.metricIndex]}
        index={node.metricIndex}
        targets={targets}
        onMetricChange={onMetricChange}
        expanded
        hideTargetSelect={hideMetricTargetSelect}
      />
    );
  }

  return (
    <pre style={{ margin: 0, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-sub)', overflow: 'auto', maxHeight: 520, fontSize: 11, lineHeight: 1.5 }}>
      {jsonPreview(parsed)}
    </pre>
  );
}

function MetricEditor({ metric, index, targets, onMetricChange, expanded, hideTargetSelect }: any) {
  if (!metric) return null;
  const target = targets.find((item: any) => String(item.targetId) === String(metric.targetId));
  const editIndex = sourceIndex(metric, index);
  const summaryItems: Array<[string, string]> = [
    ['metricId', metric.metricId || '-'],
    ['dimension', [metric.dimensionKey, metric.dimensionValue].filter(Boolean).join('=') || '-'],
    ['status', metric.status || 'ok'],
    ['evidence', metric.evidence || '-'],
  ];
  if (metric.serverLabel) summaryItems.unshift(['server', metric.serverLabel]);
  if (hideTargetSelect) summaryItems.push(['target', target?.name || '-']);

  return (
    <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-sub)', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={metric.selected !== false} onChange={event => onMetricChange(editIndex, { selected: event.target.checked })}/>
        <b style={{ fontSize: 13 }}>{metric.label || metric.rawLabel || metric.metricId}</b>
        <span className={`capacity-pct ${statusTone(metric.status)}`} style={{ marginLeft: 'auto' }}>{metric.value}{metric.unit || ''}</span>
      </div>
      <SummaryGrid items={summaryItems}/>
      {!hideTargetSelect && (
        <label className="form-label">
          <span>Monitoring target</span>
          <select
            className="input sm"
            value={metric.targetId ?? ''}
            disabled={metric.selected === false}
            onChange={event => onMetricChange(editIndex, { targetId: event.target.value ? Number(event.target.value) : null })}
          >
            <option value="">Select target</option>
            {targets.map((item: any) => <option key={item.targetId} value={item.targetId}>{item.name}</option>)}
          </select>
        </label>
      )}
      {expanded && <TextBlock title="Source evidence" value={metric.evidence || '-'} />}
    </div>
  );
}

function SummaryGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
      {items.map(([label, value]) => (
        <div key={label} style={{ padding: 9, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-1)', minWidth: 0 }}>
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginBottom: 3 }}>{label}</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, overflowWrap: 'anywhere' }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function TextBlock({ title, value, tall }: { title: string; value: string; tall?: boolean }) {
  return (
    <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-sub)' }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.65, color: 'var(--text-2)', minHeight: tall ? 260 : undefined }}>{value}</div>
    </div>
  );
}

function shortText(value: string): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > 48 ? `${text.slice(0, 48)}...` : text;
}
