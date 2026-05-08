/**
 * 파일: frontend/src/features/messaging/parts/trend/CapacityTrendChart.tsx
 * 역할: 용량 트렌드 SVG 라인 차트.
 */
import React from 'react';
import { capacityTone } from './helpers.js';

export function CapacityTrendChart({ observation, hoveredIdx, onHover }: any) {
  const samples = observation.samples || [];
  const W = 640, H = 200, P = { l: 36, r: 12, t: 12, b: 28 };
  const innerW = W - P.l - P.r, innerH = H - P.t - P.b;
  const ys = (v: number) => P.t + innerH - (v / 100) * innerH;
  const xs = (i: number) => P.l + (i / Math.max(1, samples.length - 1)) * innerW;
  const colW = samples.length > 1 ? innerW / (samples.length - 1) : innerW;

  const points = samples.map((s: any, i: number) => `${xs(i)},${ys(s.pct)}`);
  const path  = points.length > 1 ? `M ${points.join(' L ')}` : '';
  const area  = points.length > 1
    ? `${path} L ${xs(samples.length - 1)},${P.t + innerH} L ${xs(0)},${P.t + innerH} Z`
    : '';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 220 }}>
      <defs>
        <linearGradient id={`capacity-fill-${observation.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#356bf0" stopOpacity=".2"/>
          <stop offset="100%" stopColor="#356bf0" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map(value => (
        <g key={value}>
          <line x1={P.l} x2={W - P.r} y1={ys(value)} y2={ys(value)} stroke="var(--border)" strokeWidth=".5"/>
          <text x={P.l - 7} y={ys(value) + 3} fontSize="10" textAnchor="end" fill="var(--text-3)">{value}%</text>
        </g>
      ))}
      <line x1={P.l} x2={W - P.r} y1={ys(observation.warn)} y2={ys(observation.warn)} stroke="var(--warn)" strokeWidth=".8" strokeDasharray="4 3" opacity=".65"/>
      <line x1={P.l} x2={W - P.r} y1={ys(observation.crit)} y2={ys(observation.crit)} stroke="var(--err)" strokeWidth=".9" strokeDasharray="5 3" opacity=".7"/>
      <text x={W - P.r - 4} y={ys(observation.crit) - 4} fontSize="9.5" textAnchor="end" fill="var(--err)">위험 {observation.crit}%</text>
      {hoveredIdx !== null && (
        <rect x={xs(hoveredIdx) - colW / 2} y={P.t} width={colW} height={innerH} fill="var(--bg-sub)" opacity=".55" rx="2"/>
      )}
      {area && <path d={area} fill={`url(#capacity-fill-${observation.id})`}/>}
      {path && <path d={path} fill="none" stroke="#356bf0" strokeWidth="2"/>}
      {samples.map((sample: any, index: number) => {
        const tone = capacityTone(sample.pct, observation.warn, observation.crit);
        return (
          <g key={index}>
            <circle cx={xs(index)} cy={ys(sample.pct)} r={tone === 'crit' ? 7 : tone === 'warn' ? 5 : 3.5}
              fill={tone === 'crit' ? 'var(--err)' : tone === 'warn' ? 'var(--warn)' : '#fff'}
              stroke={tone === 'ok' ? '#356bf0' : '#fff'} strokeWidth="1.5"/>
            <text x={xs(index)} y={ys(sample.pct) - 10} fontSize="9.5" textAnchor="middle"
              fill={tone === 'crit' ? 'var(--err)' : 'var(--text-2)'} fontWeight="700">{sample.pct}</text>
          </g>
        );
      })}
      {samples.map((sample: any, index: number) => (
        <text key={index} x={xs(index)} y={H - 9} fontSize="10" textAnchor="middle"
          fill={hoveredIdx === index ? 'var(--text)' : 'var(--text-3)'}>{sample.month}월</text>
      ))}
      {samples.map((_: any, index: number) => (
        <rect key={index} x={xs(index) - colW / 2} y={P.t} width={colW} height={innerH}
          fill="transparent" onMouseEnter={() => onHover?.(index)} onMouseLeave={() => onHover?.(null)}
          style={{ cursor: 'crosshair' }}/>
      ))}
    </svg>
  );
}
