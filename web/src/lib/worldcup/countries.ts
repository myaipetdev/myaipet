/**
 * World Cup 2026 national-pet skins — curated country → symbol + flag palette.
 *
 * Design rules (owner-approved):
 *   - Every country gets a POSITIVE, ICONIC national symbol (no monsters/yokai).
 *     Tone must be consistent and respectful across all nations — World Cup
 *     national pride is sensitive.
 *   - Flag colors are injected into the generation prompt (prompt engineering),
 *     so a pet renders in its country's palette.
 *
 * The prompt fragment is ADDITIVE — it themes the user's existing pet rather
 * than replacing it ("reimagined with the spirit of …"), so it composes whether
 * the backend uses image-to-image (pet photo as reference) or text-only.
 */

export interface WorldCupCountry {
  /** ISO-ish short code, used as the stable id. */
  code: string;
  name: string;
  /** Flag emoji for the grid. */
  flag: string;
  /** Positive, iconic national animal/symbol. */
  animal: string;
  /** Flag palette as hex (primary first) — drives prompt + UI accent. */
  colors: string[];
  /** Human-readable palette for the prompt (e.g. "red and white"). */
  paletteWords: string;
}

// Curated list — World Cup 2026 nations + major footballing countries.
export const WORLD_CUP_COUNTRIES: WorldCupCountry[] = [
  { code: "KR", name: "South Korea", flag: "🇰🇷", animal: "tiger", colors: ["#CD2E3A", "#0047A0", "#000000"], paletteWords: "red, blue, black and white" },
  { code: "JP", name: "Japan", flag: "🇯🇵", animal: "fox (kitsune) / red-crowned crane", colors: ["#BC002D", "#FFFFFF"], paletteWords: "crimson red and white" },
  { code: "CN", name: "China", flag: "🇨🇳", animal: "dragon / giant panda", colors: ["#DE2910", "#FFDE00"], paletteWords: "red and gold" },
  { code: "US", name: "USA", flag: "🇺🇸", animal: "bald eagle", colors: ["#B22234", "#3C3B6E", "#FFFFFF"], paletteWords: "red, white and navy blue" },
  { code: "MX", name: "Mexico", flag: "🇲🇽", animal: "golden eagle", colors: ["#006847", "#CE1126", "#FFFFFF"], paletteWords: "green, white and red" },
  { code: "CA", name: "Canada", flag: "🇨🇦", animal: "beaver / loon", colors: ["#FF0000", "#FFFFFF"], paletteWords: "red and white" },
  { code: "BR", name: "Brazil", flag: "🇧🇷", animal: "jaguar / toucan", colors: ["#009C3B", "#FFDF00", "#002776"], paletteWords: "green, yellow and blue" },
  { code: "AR", name: "Argentina", flag: "🇦🇷", animal: "puma", colors: ["#75AADB", "#FFFFFF", "#F6B40E"], paletteWords: "sky blue, white and sun gold" },
  { code: "UY", name: "Uruguay", flag: "🇺🇾", animal: "rhea / hornero bird", colors: ["#0038A8", "#FFFFFF", "#FCD116"], paletteWords: "blue, white and sun gold" },
  { code: "CO", name: "Colombia", flag: "🇨🇴", animal: "Andean condor", colors: ["#FCD116", "#003893", "#CE1126"], paletteWords: "yellow, blue and red" },
  { code: "FR", name: "France", flag: "🇫🇷", animal: "rooster (le coq gaulois)", colors: ["#0055A4", "#FFFFFF", "#EF4135"], paletteWords: "blue, white and red" },
  { code: "EN", name: "England", flag: "🏴", animal: "lion", colors: ["#FFFFFF", "#CE1124"], paletteWords: "white and red" },
  { code: "DE", name: "Germany", flag: "🇩🇪", animal: "eagle (Bundesadler)", colors: ["#000000", "#DD0000", "#FFCE00"], paletteWords: "black, red and gold" },
  { code: "ES", name: "Spain", flag: "🇪🇸", animal: "bull", colors: ["#AA151B", "#F1BF00"], paletteWords: "red and gold" },
  { code: "IT", name: "Italy", flag: "🇮🇹", animal: "wolf", colors: ["#008C45", "#FFFFFF", "#CD212A"], paletteWords: "green, white and red" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱", animal: "lion", colors: ["#AE1C28", "#FFFFFF", "#21468B"], paletteWords: "red, white and blue" },
  { code: "PT", name: "Portugal", flag: "🇵🇹", animal: "rooster of Barcelos", colors: ["#006600", "#FF0000"], paletteWords: "green and red" },
  { code: "BE", name: "Belgium", flag: "🇧🇪", animal: "lion", colors: ["#000000", "#FAE042", "#ED2939"], paletteWords: "black, gold and red" },
  { code: "HR", name: "Croatia", flag: "🇭🇷", animal: "marten (kuna)", colors: ["#FF0000", "#FFFFFF", "#171796"], paletteWords: "red, white and blue" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭", animal: "St. Bernard dog", colors: ["#D52B1E", "#FFFFFF"], paletteWords: "red and white" },
  { code: "PL", name: "Poland", flag: "🇵🇱", animal: "white eagle", colors: ["#FFFFFF", "#DC143C"], paletteWords: "white and crimson" },
  { code: "DK", name: "Denmark", flag: "🇩🇰", animal: "mute swan", colors: ["#C60C30", "#FFFFFF"], paletteWords: "red and white" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦", animal: "falcon", colors: ["#006C35", "#FFFFFF"], paletteWords: "green and white" },
  { code: "MA", name: "Morocco", flag: "🇲🇦", animal: "Barbary lion", colors: ["#C1272D", "#006233"], paletteWords: "red and green" },
  { code: "SN", name: "Senegal", flag: "🇸🇳", animal: "lion", colors: ["#00853F", "#FDEF42", "#E31B23"], paletteWords: "green, yellow and red" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬", animal: "eagle", colors: ["#008751", "#FFFFFF"], paletteWords: "green and white" },
  { code: "GH", name: "Ghana", flag: "🇬🇭", animal: "black star eagle", colors: ["#CE1126", "#FCD116", "#006B3F"], paletteWords: "red, gold and green" },
  { code: "CM", name: "Cameroon", flag: "🇨🇲", animal: "lion", colors: ["#007A5E", "#CE1126", "#FCD116"], paletteWords: "green, red and yellow" },
  { code: "EG", name: "Egypt", flag: "🇪🇬", animal: "eagle of Saladin", colors: ["#CE1126", "#FFFFFF", "#000000"], paletteWords: "red, white and black" },
  { code: "AU", name: "Australia", flag: "🇦🇺", animal: "kangaroo", colors: ["#00843D", "#FFCD00"], paletteWords: "green and gold" },
  { code: "TH", name: "Thailand", flag: "🇹🇭", animal: "elephant", colors: ["#A51931", "#FFFFFF", "#2D2A4A"], paletteWords: "red, white and blue" },
];

export function getCountry(code: string): WorldCupCountry | undefined {
  return WORLD_CUP_COUNTRIES.find((c) => c.code === code);
}

/**
 * Real flag image from flagcdn (emoji flags don't render on many platforms).
 * Codes are ISO alpha-2; England is the one subdivision (gb-eng).
 */
export function flagUrl(c: WorldCupCountry, w: 80 | 160 | 320 = 160): string {
  const slug = c.code.toLowerCase() === "en" ? "gb-eng" : c.code.toLowerCase();
  return `https://flagcdn.com/w${w}/${slug}.png`;
}

/**
 * Build the additive prompt fragment that themes a pet as a country's symbol.
 * Kept separate so both the client (preview) and server (generation) agree.
 */
export function buildCountryPromptFragment(c: WorldCupCountry): string {
  return [
    `reimagined with the spirit of ${c.name}'s national ${c.animal}`,
    `${c.paletteWords} flag-color palette`,
    `subtle World Cup 2026 celebration theme, sporty and proud`,
    `keep it the same adorable pet character, high quality, vibrant`,
  ].join(", ");
}
