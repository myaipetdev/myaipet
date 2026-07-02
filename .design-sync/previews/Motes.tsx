// Motes — a field of golden light motes rising around the pet (the ambient
// "magic companion" cue). Absolutely fills its nearest relative ancestor,
// so each cell provides a poster ground. The motes are animation-driven
// (they fade in as they rise), so a static screenshot catches them faint —
// that's the honest resting state, not a bug.
import { Motes } from "web";

function Poster({ count, bg }: { count?: number; bg: string }) {
  return (
    <div style={{ display: "inline-block", padding: 10 }}>
      <div style={{
        position: "relative", width: 240, height: 170, background: bg,
        borderRadius: 14, overflow: "hidden", boxShadow: "var(--ed-shadow-card)",
      }}>
        <Motes count={count} />
        <span style={{
          position: "absolute", left: 14, bottom: 10, fontFamily: "var(--ed-m)",
          fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: "rgba(252,233,207,.6)",
        }}>
          AMBIENT · GOLDEN MOTES
        </span>
      </div>
    </div>
  );
}

export const OnTerracotta = () => <Poster bg="#BE4F28" count={12} />;

export const OnWarmDark = () => <Poster bg="#1E1710" count={12} />;
