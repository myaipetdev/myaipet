// GoldSeal — the embossed gold-foil rarity/level seal. It positions itself
// absolutely at the top-right of its nearest relative ancestor (that's how
// CollectibleFrame mounts it), so every composition provides a paper card
// to stamp. Numbers zero-pad; strings print verbatim (TEAM / BR).
import { GoldSeal } from "web";

function Paper({ children, w = 190, h = 120 }: { children?: any; w?: number; h?: number }) {
  return (
    <div style={{ display: "inline-block", padding: "22px 26px 14px 10px" }}>
      <div style={{
        position: "relative", width: w, height: h, background: "#FBF6EC",
        borderRadius: 10, boxShadow: "var(--ed-shadow-card)",
      }}>
        {children}
      </div>
    </div>
  );
}

export const Level = () => (
  <Paper><GoldSeal level={5} /></Paper>
);

export const TeamBadge = () => (
  <Paper><GoldSeal level="BR" label="TEAM" /></Paper>
);

export const Large = () => (
  <Paper w={220} h={140}><GoldSeal level={27} size={88} /></Paper>
);

export const Small = () => (
  <Paper w={150} h={100}><GoldSeal level={1} size={46} /></Paper>
);
