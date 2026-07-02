// CollectibleFrame — the heart of the system: a pet photo presented as a
// foil-stamped collectible artifact (cream mat, gold keyline, holo sheen,
// gloss sweep, gold LEVEL seal, floating shadow). Compositions mirror real
// usage on My Pet / Home / World Cup. Photo is the production mascot asset.
import { CollectibleFrame } from "web";

const PHOTO = "https://app.myaipet.ai/mascot.jpg";

// The seal and floating shadow overflow the mat — every cell pads for them.
const pad: React.CSSProperties = { padding: "28px 32px 44px", display: "inline-block" };

export const Hero = () => (
  <div style={pad}>
    <CollectibleFrame photoUrl={PHOTO} level={5} speciesLabel="POMERANIAN" elementLabel="GRASS" width={280} />
  </div>
);

export const FlatNoFloat = () => (
  <div style={pad}>
    <CollectibleFrame photoUrl={PHOTO} level={12} speciesLabel="SHIBA INU" elementLabel="FIRE" width={240} tilt={0} float={false} />
  </div>
);

export const TeamSeal = () => (
  <div style={pad}>
    <CollectibleFrame photoUrl={PHOTO} level="BR" sealLabel="TEAM" speciesLabel="MOCHI · BRAZIL" width={240} tilt={2.2} float={false} />
  </div>
);

export const PrintProof = () => (
  <div style={pad}>
    <CollectibleFrame photoUrl={PHOTO} level={1} speciesLabel="HATCHLING" elementLabel="NORMAL" width={220} tilt={-1.5} float={false} holo={false} seal={false} />
  </div>
);
