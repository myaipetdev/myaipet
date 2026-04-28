/**
 * Mock data for demo/showcase when backend is unavailable.
 */

export const MOCK_STATS = {
  total_users: 1847,
  total_generations: 4280,
  total_burned: "12,400",
  tx_today: 284,
  user_change: "+18.3%",
  gen_change: "+22.7%",
  burned_change: "+9.2%",
  tx_change: "+31.5%",
};

export const MOCK_ACTIVITIES = [
  { icon: "🎬", wallet: "0x1a2b...3c4d", chain: "Base", text: "Generated cinematic video of Luna the cat", time: "12s ago" },
  { icon: "🐕", wallet: "0x5e6f...7a8b", chain: "BNB", text: "Adopted a new pet: Mochi the Dog", time: "45s ago" },
  { icon: "❤️", wallet: "0x9c0d...1e2f", chain: "Base", text: "Liked 'Noodle in Space' by CryptoKitty", time: "1m ago" },
  { icon: "🎨", wallet: "0x3a4b...5c6d", chain: "Base", text: "Generated watercolor art of Pixel the Fox", time: "2m ago" },
  { icon: "💬", wallet: "0x7e8f...9a0b", chain: "BNB", text: "Commented on 'Storm's Adventure'", time: "3m ago" },
  { icon: "⬆️", wallet: "0xab12...cd34", chain: "Base", text: "Biscuit leveled up to Lv.5!", time: "4m ago" },
  { icon: "🎬", wallet: "0xef56...ab78", chain: "BNB", text: "Generated anime video of Ziggy the Parrot", time: "5m ago" },
  { icon: "🐱", wallet: "0xbc90...de12", chain: "Base", text: "Adopted a new pet: Tofu the Cat", time: "7m ago" },
  { icon: "🔥", wallet: "0xfa34...ce56", chain: "BNB", text: "Burned 50 $PET tokens", time: "8m ago" },
  { icon: "❤️", wallet: "0xad78...bf90", chain: "Base", text: "Liked 'Mango's Tea Party'", time: "10m ago" },
];

export const MOCK_PETS = [
  {
    id: 1, name: "Luna", species: 0, personality_type: "playful", level: 5,
    experience: 320, happiness: 85, energy: 72, hunger: 45, bond_level: 68,
    total_interactions: 47, current_mood: "happy", is_active: true,
  },
  {
    id: 2, name: "Mochi", species: 1, personality_type: "friendly", level: 3,
    experience: 180, happiness: 92, energy: 60, hunger: 30, bond_level: 55,
    total_interactions: 28, current_mood: "ecstatic", is_active: true,
  },
];

export const MOCK_PET_STATUS = {
  ...MOCK_PETS[0],
  recent_memories: [
    { id: 1, memory_type: "milestone", content: "Luna reached level 5! A major milestone.", emotion: "excited", importance: 5 },
    { id: 2, memory_type: "interaction", content: "Owner played with Luna. They felt joyful.", emotion: "happy", importance: 2 },
    { id: 3, memory_type: "emotion", content: "Luna had a wonderful play session in the park.", emotion: "content", importance: 3 },
    { id: 4, memory_type: "interaction", content: "Owner talked to Luna. They felt loved.", emotion: "happy", importance: 2 },
    { id: 5, memory_type: "milestone", content: "Luna was born! A new playful companion joins your journey.", emotion: "excited", importance: 5 },
  ],
};

const MOCK_PROMPTS = [
  "A cute cat playing with yarn in a cozy room with warm lighting",
  "A golden retriever surfing at sunset on a tropical beach",
  "A parrot flying through a magical rainbow forest",
  "A turtle exploring a crystal cave with glowing gems",
  "A hamster piloting a tiny spaceship through the stars",
  "A rabbit having an elegant tea party in a rose garden",
  "A fox running through golden autumn leaves in the forest",
  "A pomeranian dressed as a detective solving a mystery",
  "A cat astronaut floating in zero gravity with fish",
  "A dog riding a skateboard down a neon-lit city street",
  "A parrot DJ playing music at a sunset beach party",
  "A turtle doing yoga on a peaceful mountain top",
  "A hamster chef cooking in a tiny restaurant kitchen",
  "A rabbit painting a masterpiece in an art studio",
  "A fox reading books in a cozy library by firelight",
  "A pomeranian superhero flying over a futuristic city",
];

const MOCK_WALLETS = [
  "0x1a2b3c4d5e6f7890abcdef1234567890abcdef12",
  "0xabcdef1234567890abcdef1234567890abcdef12",
  "0x9876543210fedcba9876543210fedcba98765432",
  "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  "0xcafebabecafebabecafebabecafebabecafebabe",
  "0x1111222233334444555566667777888899990000",
  "0xaabbccddeeff00112233445566778899aabbccdd",
];

const MOCK_NAMES = ["CryptoKitty", "PetLover42", "Web3Degen", "AIPetFan", "BlockchainBro", "NFTWhale", "DeFiDog"];
const MOCK_COMMENTS_TEXT = [
  "So cute!", "Love this style!", "Amazing generation!", "Your pet is adorable",
  "This is incredible", "How did you get this quality?", "Best one I've seen today!",
  "Wow the cinematic style is perfect", "Need to try this with my pet",
];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const MOCK_STYLES = ["Cinematic", "Anime", "Watercolor", "3D Render", "Sketch", "Oil Paint", "Pixel Art"];

export const MOCK_IMAGES = [
  { url: "/gallery/cat_astro.jpg", ratio: "1:1", prompt: "Cat astronaut floating in zero gravity with tiny fish companions", style: "Cinematic" },
  { url: "/gallery/cat_cloud.jpg", ratio: "1:1", prompt: "Fluffy cat sleeping on a bed of clouds at golden hour", style: "Watercolor" },
  { url: "/gallery/cat_dj.jpg", ratio: "1:1", prompt: "Cool cat DJ spinning records at a neon-lit underground club", style: "3D Render" },
  { url: "/gallery/cat_moon.jpg", ratio: "1:1", prompt: "Mystical cat sitting on a crescent moon in a starfield", style: "Anime" },
  { url: "/gallery/cat_painter.jpg", ratio: "1:1", prompt: "Artistic cat with a beret painting a self-portrait in a Paris studio", style: "Oil Paint" },
  { url: "/gallery/corgi_sunflower.jpg", ratio: "1:1", prompt: "Happy corgi running through a golden sunflower field at sunrise", style: "Cinematic" },
  { url: "/gallery/dog_skate.jpg", ratio: "1:1", prompt: "Rad dog on a skateboard doing tricks in a neon city street", style: "3D Render" },
  { url: "/gallery/dog_space.jpg", ratio: "1:1", prompt: "Brave dog in a spacesuit exploring an alien planet", style: "Cinematic" },
  { url: "/gallery/dragon_cat.jpg", ratio: "1:1", prompt: "Mythical dragon-cat hybrid breathing colorful fire in a fantasy realm", style: "Anime" },
  { url: "/gallery/fox_autumn.jpg", ratio: "1:1", prompt: "Elegant fox walking through a forest of crimson autumn leaves", style: "Watercolor" },
  { url: "/gallery/fox_witch.jpg", ratio: "1:1", prompt: "Mysterious fox witch casting spells in a moonlit enchanted forest", style: "Anime" },
  { url: "/gallery/friends_picnic.jpg", ratio: "1:1", prompt: "Adorable group of pets having a picnic in a magical meadow", style: "Watercolor" },
  { url: "/gallery/hamster_ship.jpg", ratio: "1:1", prompt: "Tiny hamster captain steering a grand sailing ship through stormy seas", style: "3D Render" },
  { url: "/gallery/hamster_sushi.jpg", ratio: "1:1", prompt: "Chef hamster making sushi in a cute tiny Japanese restaurant", style: "Anime" },
  { url: "/gallery/owl_library.jpg", ratio: "1:1", prompt: "Wise owl reading ancient books in a cozy candlelit library", style: "Oil Paint" },
  { url: "/gallery/parrot_cave.jpg", ratio: "1:1", prompt: "Adventurous parrot exploring a glowing crystal cave", style: "Cinematic" },
  { url: "/gallery/penguin_slide.jpg", ratio: "1:1", prompt: "Playful penguin sliding down a rainbow ice slide into the sea", style: "3D Render" },
  { url: "/gallery/pom_balloon.jpg", ratio: "1:1", prompt: "Fluffy pomeranian floating over a city holding colorful balloons", style: "Anime" },
  { url: "/gallery/pom_hero.jpg", ratio: "1:1", prompt: "Heroic pomeranian in a superhero cape protecting the city at night", style: "Cinematic" },
  { url: "/gallery/rabbit_samurai.jpg", ratio: "1:1", prompt: "Honorable rabbit samurai meditating under a cherry blossom tree", style: "Anime" },
  { url: "/gallery/rabbit_tea.jpg", ratio: "1:1", prompt: "Elegant rabbit hosting a Victorian tea party in a rose garden", style: "Watercolor" },
  { url: "/gallery/turtle_forest.jpg", ratio: "1:1", prompt: "Ancient turtle with a tiny forest growing on its shell", style: "Oil Paint" },
  { url: "/gallery/turtle_zen.jpg", ratio: "1:1", prompt: "Peaceful turtle meditating on a rock surrounded by lotus flowers", style: "Watercolor" },
  { url: "/gallery/wolf_moon.jpg", ratio: "1:1", prompt: "Majestic wolf howling at a full moon over a snowy mountain range", style: "Cinematic" },
  { url: "/gallery/pet_cat.jpg", ratio: "1:1", prompt: "Cute cat portrait with dreamy bokeh background", style: "Sketch" },
  { url: "/gallery/pet_dog.jpg", ratio: "1:1", prompt: "Playful golden retriever in a sunny garden", style: "3D Render" },
  { url: "/gallery/pet_fox.jpg", ratio: "1:1", prompt: "Charming red fox in a magical forest clearing", style: "Anime" },
  { url: "/gallery/pet_hamster.jpg", ratio: "1:1", prompt: "Tiny hamster holding a sunflower seed with both paws", style: "Pixel Art" },
  { url: "/gallery/pet_parrot.jpg", ratio: "1:1", prompt: "Colorful tropical parrot perched on a mossy branch", style: "Watercolor" },
  { url: "/gallery/pet_pom.jpg", ratio: "1:1", prompt: "Fluffy pomeranian portrait with soft studio lighting", style: "Cinematic" },
  { url: "/gallery/pet_rabbit.jpg", ratio: "1:1", prompt: "Gentle white rabbit sitting among wildflowers", style: "Oil Paint" },
  { url: "/gallery/pet_turtle.jpg", ratio: "1:1", prompt: "Wise sea turtle gliding through crystal blue waters", style: "3D Render" },
];

const MOCK_NAMES_RICH = [
  "lunarpaws", "grokitty", "web3wolf", "nftfox_", "petsoul",
  "cosmicorgi", "haiku_hamster", "0xrabbit", "defi_doge", "aipet_max",
  "pixelparrot", "blockcat", "turtledao", "mochi_irl", "shibaweb3",
  "foxmint", "cryptoneko", "petclaw_dev", "onchainpom", "solarpet",
];

export const MOCK_SOCIAL_FEED = {
  items: MOCK_IMAGES.map((img, i) => ({
    generation_id: i + 1,
    pet_type: i % 8,
    style: i % 7,
    style_name: img.style,
    prompt: img.prompt,
    photo_url: img.url,
    video_url: null,
    wallet_address: MOCK_WALLETS[i % MOCK_WALLETS.length],
    display_name: MOCK_NAMES_RICH[i % MOCK_NAMES_RICH.length],
    likes_count: i < 5 ? randomInt(200, 980) : i < 12 ? randomInt(50, 350) : randomInt(8, 180),
    comments_count: randomInt(0, 32),
    is_liked: i % 4 === 0,
    duration: [3, 5, 10][i % 3],
    aspect_ratio: img.ratio,
    gen_type: "image",
    created_at: new Date(Date.now() - randomInt(1, 168) * 3600000).toISOString(),
  })),
  total: 32,
  page: 1,
  page_size: 32,
};

export const MOCK_TRENDING_TAGS = [
  { tag: "#space", count: 847 }, { tag: "#anime", count: 621 },
  { tag: "#watercolor", count: 518 }, { tag: "#cinematic", count: 492 },
  { tag: "#samurai", count: 384 }, { tag: "#moonlit", count: 341 },
  { tag: "#3drender", count: 298 }, { tag: "#neon", count: 276 },
  { tag: "#fantasy", count: 253 }, { tag: "#cozy", count: 219 },
  { tag: "#witchy", count: 187 }, { tag: "#pixelart", count: 164 },
];

export const MOCK_TOP_CREATORS = [
  { name: "lunarpaws", avatar: "/gallery/cat_moon.jpg", works: 48, likes: 9420 },
  { name: "grokitty", avatar: "/gallery/cat_astro.jpg", works: 37, likes: 7830 },
  { name: "0xrabbit", avatar: "/gallery/rabbit_samurai.jpg", works: 29, likes: 5610 },
  { name: "web3wolf", avatar: "/gallery/wolf_moon.jpg", works: 24, likes: 4890 },
  { name: "cosmicorgi", avatar: "/gallery/corgi_sunflower.jpg", works: 21, likes: 3740 },
  { name: "haiku_hamster", avatar: "/gallery/hamster_sushi.jpg", works: 18, likes: 2980 },
];

export const MOCK_COMMUNITY_STATS = {
  total_works: "4,280",
  active_pets: "1,847",
  likes_today: "892",
  creators: "412",
};

export const MOCK_INTERACT_RESPONSES: any = {
  feed: {
    response_text: "Luna munches happily on the treats! Her tail wags with delight as she savors every bite.",
    stat_changes: { happiness: 5, energy: 3, hunger: -25, experience: 10, bond: 3 },
    memory_created: "Owner fed Luna. They felt grateful.",
  },
  play: {
    response_text: "Luna chases the ball with incredible enthusiasm! She does a little victory dance when she catches it.",
    stat_changes: { happiness: 15, energy: -10, hunger: 5, experience: 15, bond: 5 },
    memory_created: "Owner played with Luna. They felt joyful.",
  },
  talk: {
    response_text: "Luna tilts her head and listens intently. She seems to understand every word and purrs softly in response.",
    stat_changes: { happiness: 8, energy: 0, hunger: 0, experience: 8, bond: 10 },
    memory_created: "Owner talked to Luna. They felt loved.",
  },
  pet: {
    response_text: "Luna leans into your hand and closes her eyes. A deep, content purr rumbles through her whole body.",
    stat_changes: { happiness: 12, energy: 2, hunger: 0, experience: 5, bond: 8 },
    memory_created: "Owner petted Luna. They felt content.",
  },
  walk: {
    response_text: "Luna trots alongside you with a spring in her step! She stops to sniff every flower along the path.",
    stat_changes: { happiness: 10, energy: -8, hunger: 8, experience: 12, bond: 5 },
    memory_created: "Luna went for a wonderful walk.",
  },
  train: {
    response_text: "Luna focuses hard and nails the new trick! She looks proud of herself and waits for praise.",
    stat_changes: { happiness: 5, energy: -12, hunger: 5, experience: 25, bond: 4 },
    memory_created: "Luna completed training successfully.",
  },
};
