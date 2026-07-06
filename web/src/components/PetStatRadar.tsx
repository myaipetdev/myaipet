"use client";

import { useMemo } from "react";

interface StatPoint {
  label: string;
  value: number; // 0..100
  color: string;
  icon: string;
}

interface Props {
  stats: StatPoint[];
  size?: number;
}

/**
 * Hexagonal radar chart for pet stats.
 * Renders an SVG with 6-axis polar layout. Each stat is normalized 0..100.
 */
export default function PetStatRadar({ stats, size = 280 }: Props) {
  const center = size / 2;
  const maxRadius = (size / 2) - 38; // padding for labels
  const count = stats.length;

  // Polygon points for current values
  const valuePoints = useMemo(() => {
    return stats
      .map((s, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
        const r = (Math.max(0, Math.min(100, s.value)) / 100) * maxRadius;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(" ");
  }, [stats, count, center, maxRadius]);

  // Concentric guide rings (25%, 50%, 75%, 100%)
  const rings = [0.25, 0.5, 0.75, 1].map((pct) => {
    const points = Array.from({ length: count })
      .map((_, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
        const r = pct * maxRadius;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(" ");
    return points;
  });

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(190,79,40,0.4)" />
            <stop offset="100%" stopColor="rgba(158,114,232,0.18)" />
          </radialGradient>
        </defs>

        {/* Guide rings */}
        {rings.map((points, idx) => (
          <polygon
            key={idx}
            points={points}
            fill="none"
            stroke="rgba(33,26,18,0.08)"
            strokeWidth={idx === 3 ? 1.5 : 1}
          />
        ))}

        {/* Axes */}
        {stats.map((_, i) => {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
          const x = center + maxRadius * Math.cos(angle);
          const y = center + maxRadius * Math.sin(angle);
          return (
            <line
              key={`ax-${i}`}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="rgba(33,26,18,0.07)"
              strokeWidth={1}
            />
          );
        })}

        {/* Filled value polygon */}
        <polygon
          points={valuePoints}
          fill="url(#radarFill)"
          stroke="#BE4F28"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Vertex dots + labels */}
        {stats.map((s, i) => {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
          const r = (Math.max(0, Math.min(100, s.value)) / 100) * maxRadius;
          const x = center + r * Math.cos(angle);
          const y = center + r * Math.sin(angle);
          const labelR = maxRadius + 22;
          const lx = center + labelR * Math.cos(angle);
          const ly = center + labelR * Math.sin(angle);
          return (
            <g key={`v-${i}`}>
              <circle cx={x} cy={y} r={4} fill={s.color} stroke="#fff" strokeWidth={1.5} />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={13}
                fontWeight={700}
                fill="rgba(33,26,18,0.7)"
                style={{ letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: "var(--ed-body, sans-serif)" }}
              >
                {s.label}
              </text>
              <text
                x={lx}
                y={ly + 13}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={13}
                fontWeight={600}
                fill={s.color}
                style={{ fontFamily: "var(--ed-body, sans-serif)" }}
              >
                {Math.round(s.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── 10-slot horizontal stat bar (game-style) ──
interface SlotBarProps {
  label: string;
  value: number; // 0..100
  color: string;
  icon: string;
  max?: number;
  warning?: boolean;
}

export function StatSlotBar({ label, value, color, icon, max = 100, warning }: SlotBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ marginBottom: 12 }}>
      {/* Top row: icon · label · current/max */}
      <div style={{
        display: "flex", alignItems: "baseline", gap: 8,
        marginBottom: 6,
      }}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
        <span style={{
          fontSize: 13,
          fontFamily: "var(--ed-body, sans-serif)",
          fontWeight: 700,
          color: warning ? "#dc2626" : "#211A12",
          letterSpacing: "0.02em",
          flex: 1,
        }}>
          {label}
        </span>
        <span style={{
          fontSize: 13,
          fontFamily: "var(--ed-m, ui-monospace, monospace)",
          fontWeight: 800,
          color: warning ? "#dc2626" : "#211A12",
          letterSpacing: "-0.01em",
        }}>
          {Math.round(value)}
          <span style={{ color: "rgba(33,26,18,0.35)", fontWeight: 500 }}>
            {" "}/{" "}{max}
          </span>
        </span>
      </div>

      {/* Single smooth bar — easier to read than 10 little blocks */}
      <div style={{
        height: 8, borderRadius: 6,
        background: "rgba(33,26,18,0.06)",
        overflow: "hidden",
        boxShadow: "inset 0 1px 2px rgba(0,0,0,0.04)",
      }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          borderRadius: 6,
          background: `linear-gradient(90deg, ${color} 0%, ${color}DD 100%)`,
          transition: "width 320ms cubic-bezier(.2,.8,.2,1)",
        }} />
      </div>
    </div>
  );
}
