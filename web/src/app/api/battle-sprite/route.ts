import { NextRequest, NextResponse } from "next/server";

const ELEMENT_VISUAL: Record<string, string> = {
  fire: "surrounded by swirling flames and embers, fiery orange-red aura, burning ground beneath",
  water: "surrounded by swirling water currents and glowing bubbles, blue aqua aura, water splashes",
  grass: "surrounded by floating leaves and vines, green nature aura, blooming flowers around",
  electric: "surrounded by crackling lightning bolts and electric sparks, yellow electric aura, static energy",
  normal: "surrounded by subtle white energy aura, determined expression, ready for combat",
};

const SPECIES_VISUAL: Record<number, string> = {
  0: "cat", 1: "dog", 2: "parrot", 3: "turtle", 4: "hamster", 5: "rabbit",
  6: "fox", 7: "pomeranian", 8: "shiba inu", 9: "doge", 10: "dragon",
  11: "phoenix bird", 12: "unicorn", 13: "wolf", 14: "tiger", 15: "panda",
  16: "penguin", 17: "owl", 18: "bear", 19: "monkey", 20: "snake",
  21: "eagle", 22: "dolphin", 23: "shark", 24: "raccoon", 25: "red panda",
  26: "axolotl", 27: "capybara",
};

// Boss-specific prompts for PvE enemies
const BOSS_VISUAL: Record<string, string> = {
  "Thorn": "a small thorny plant creature with sharp leaf blades",
  "Sprout": "a young seedling warrior with vine whips",
  "Fern": "a fern-covered forest guardian with shield leaves",
  "Willow": "a graceful willow tree spirit with flowing branch arms",
  "Elderoak": "an ancient massive oak tree guardian boss, imposing with thick vine arms, bark armor, crown of autumn leaves",
  "Cinder": "a small ember salamander with glowing red scales",
  "Ash": "a volcanic ash wolf with smoldering fur",
  "Magma": "a magma golem with lava cracks on rocky body",
  "Scorch": "a scorching fire hawk with blazing wings",
  "Infernox": "a massive inferno dragon boss, engulfed in hellfire, molten armor plates",
  "Ripple": "a small water sprite with bubble shield",
  "Coral": "a coral reef seahorse knight with shell armor",
  "Tide": "a tidal wave serpent with flowing water mane",
  "Tempest": "a storm water dragon with hurricane aura",
  "Leviathan": "a colossal sea leviathan boss, ancient ocean titan with barnacle-covered armor",
  "Zapper": "a small electric mouse with sparking cheeks",
  "Volt": "an electric eel warrior with lightning coils",
  "Surge": "a surge wolf made of pure electricity",
  "Dynamo": "a dynamo eagle with thunderstorm wings",
  "Zeus": "Zeus the thunder god boss, massive electric titan with lightning crown",
  "Phantom": "a shadowy ghost with eerie purple glow",
  "Wraith": "a dark wraith with tattered cloak and scythe",
  "Shade": "a shadow panther with void-black fur",
  "Specter": "a spectral knight in corrupted armor",
  "Oblivion": "Oblivion the void lord boss, massive shadow entity consuming light",
  "Drakeling": "a young dragon hatchling with iridescent scales",
  "Wyvern": "a fearsome wyvern with razor-sharp wings",
  "Hydra": "a three-headed hydra with elemental breath",
  "Wyrm": "an ancient wyrm coiled with cosmic energy",
  "Bahamut": "Bahamut the Dragon King, legendary supreme dragon boss, golden scales, celestial wings spanning the sky",
};

function buildBattlePrompt(name: string, species: number, element: string, isBoss: boolean, personality?: string): string {
  const elVis = ELEMENT_VISUAL[element] || ELEMENT_VISUAL.normal;

  if (isBoss) {
    const bossDesc = BOSS_VISUAL[name] || `a powerful ${element} type boss monster`;
    return `${bossDesc}, in aggressive battle stance, ${elVis}, anime RPG game boss design, cel-shaded digital illustration, full body visible, menacing and powerful, dramatic ${element} colored lighting, dark atmospheric background, high quality game art, fantasy RPG, facing left`;
  }

  const speciesName = SPECIES_VISUAL[species] || "creature";
  const personalityVis = personality === "brave" ? "fierce confident stance" :
    personality === "gentle" ? "elegant graceful stance" :
    personality === "playful" ? "energetic dynamic pose" :
    "determined battle stance";

  return `A ${speciesName} creature in ${personalityVis}, ${elVis}, anime RPG game style, cel-shaded digital illustration, full body visible, game character battle sprite, vibrant colors, high quality, dark atmospheric background, fantasy RPG creature design, dramatic lighting, facing right`;
}

export async function POST(req: NextRequest) {
  const key = process.env.GROK_API_KEY;
  if (!key) return NextResponse.json({ error: "GROK_API_KEY not set" }, { status: 500 });

  const body = await req.json();
  const { name, species, element, personality, isBoss } = body;

  const prompt = buildBattlePrompt(name, species || 0, element || "normal", isBoss || false, personality);

  try {
    const res = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "grok-imagine-image",
        prompt,
        n: 1,
        response_format: "url",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Grok API failed: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const url = data.data?.[0]?.url;
    if (!url) return NextResponse.json({ error: "No image returned" }, { status: 502 });

    return NextResponse.json({ url, prompt });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
