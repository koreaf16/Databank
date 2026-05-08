/**
 * 파일: frontend/src/features/messaging/parts/trend/helpers.ts
 * 역할: ChannelTrend 헬퍼 함수 및 상수.
 */

export const CAPACITY_KIND_LABELS: Record<string, string> = {
  tablespace: 'Tablespace', db_file: 'DB File', archive_log: 'Archive/Log',
  transaction_log: 'Log', disk_mount: 'Disk', datastore: 'Datastore',
  backup_repo: 'Backup Repo', memory: 'Memory', other: 'Other',
};

export const CAPACITY_KIND_SHORT: Record<string, string> = {
  tablespace: 'TS', db_file: 'DB', archive_log: 'ARC', transaction_log: 'LOG',
  disk_mount: 'DSK', datastore: 'DST', backup_repo: 'BKP', memory: 'MEM', other: 'ETC',
};

export function capacityTone(pct: number, warn = 80, crit = 90) {
  if (pct >= crit) return 'crit';
  if (pct >= warn) return 'warn';
  return 'ok';
}

export function formatCapacity(used: number, total: number, unit = 'GB') {
  return `${used?.toLocaleString?.() ?? used} / ${total?.toLocaleString?.() ?? total} ${unit}`;
}

export function toLatestRow(obs: any) {
  const samples = obs.samples || [];
  const latest  = samples[samples.length - 1] || { pct: 0 };
  const prev    = samples[samples.length - 2] || latest;
  return {
    ...obs,
    pct:          latest.pct ?? 0,
    used:         latest.used,
    total:        latest.total,
    delta:        (latest.pct ?? 0) - (prev.pct ?? 0),
    tone:         capacityTone(latest.pct ?? 0, obs.warn, obs.crit),
    needsReview:  false,
    monthsToCrit: (latest.pct ?? 0) < 90 ? Math.ceil((90 - (latest.pct ?? 0)) / 1.5) : 0,
    sourceTitle:  latest.sourceRef ?? latest.sourceTitle ?? '',
    sourceReportId: latest.sourceRef ?? '',
    confidence:   1,
  };
}

export function compareRisk(a: any, b: any) {
  const rank: any = { crit: 3, warn: 2, ok: 1 };
  return (rank[b.tone] - rank[a.tone]) || b.pct - a.pct;
}

// riskRow (from API) → observation shape for chart
export function riskRowToObservation(row: any, samples: any[]): any {
  return {
    id:          `${row.targetId}-${row.metricId}`,
    targetId:    row.targetId,
    metricId:    row.metricId,
    targetName:  row.targetName,
    systemType:  row.systemType,
    label:       row.metricName,
    serviceName: row.targetName,
    host:        row.hostname || '-',
    kind:        row.systemType,
    warn:        80,
    crit:        90,
    unit:        row.unit,
    samples:     samples.map(s => ({
      month:     new Date(s.collectedAt).getMonth() + 1,
      pct:       typeof s.value === 'number' ? Math.round(s.value) : s.value,
      used:      null,
      total:     null,
      sourceRef: s.sourceRef ?? '',
    })),
  };
}
