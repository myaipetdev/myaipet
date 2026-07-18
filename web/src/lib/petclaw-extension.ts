export const PETCLAW_EXTENSION_VERSION = "2.3.2";

export const PETCLAW_EXTENSION_STEPS = [
  { n: 1, title: "Download", desc: 'Click "Download Extension" below to get the ZIP file.' },
  { n: 2, title: "Unzip", desc: "Extract the ZIP to any folder on your computer — remember where you put it." },
  { n: 3, title: "Open Extensions", desc: "In Chrome, go to chrome://extensions." },
  { n: 4, title: "Developer Mode", desc: 'Flip the "Developer mode" toggle on, top-right of that page.' },
  { n: 5, title: "Load Unpacked", desc: 'Click "Load unpacked" and select the unzipped folder.' },
  { n: 6, title: "Pin & Pair", desc: 'Pin the pet. Sign in to MY AI PET, generate a 30-day extension token in PetClaw → "Connect PetClaw clients", then paste it into Settings → Connection.' },
  { n: 7, title: "Allow One Site", desc: "Open the site, then choose Extension → Settings → Website Access → Allow. Access is per scheme and domain. MY AI PET, private/local network addresses, and a built-in list of common sensitive domains are blocked. Keep access off on every other sensitive page." },
] as const;
