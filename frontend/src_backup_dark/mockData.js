/**
 * Mock data for demo/showcase when backend is unavailable.
 */

export const MOCK_STATS = {
  total_users: 1247,
  total_generations: 8934,
  total_burned: "12,450",
  tx_today: 342,
  user_change: "+12.3%",
  gen_change: "+8.7%",
  burned_change: "+5.2%",
  tx_change: "+15.1%",
};

export const MOCK_ACTIVITIES = [
  { icon: "🎬", wallet: "0x1a2b...3c4d", chain: "Base", text: "Generated cinematic video of Luna the cat", time: "12s ago" },
  { icon: "🐕", wallet: "0x5e6f...7g8h", chain: "BNB", text: "Adopted a new pet: Mochi the Dog", time: "45s ago" },
  { icon: "❤️", wallet: "0x9i0j...1k2l", chain: "Base", text: "Liked 'Noodle in Space' by CryptoKitty", time: "1m ago" },
  { icon: "🎨", wallet: "0x3m4n...5o6p", chain: "Base", text: "Generated watercolor art of Pixel the Fox", time: "2m ago" },
  { icon: "💬", wallet: "0x7q8r...9s0t", chain: "BNB", text: "Commented on 'Storm's Adventure'", time: "3m ago" },
  { icon: "⬆️", wallet: "0xab12...cd34", chain: "Base", text: "Biscuit leveled up to Lv.5!", time: "4m ago" },
  { icon: "🎬", wallet: "0xef56...gh78", chain: "BNB", text: "Generated anime video of Ziggy the Parrot", time: "5m ago" },
  { icon: "🐱", wallet: "0xij90...kl12", chain: "Base", text: "Adopted a new pet: Tofu the Cat", time: "7m ago" },
  { icon: "🔥", wallet: "0xmn34...op56", chain: "BNB", text: "Burned 50 $PET tokens", time: "8m ago" },
  { icon: "❤️", wallet: "0xqr78...st90", chain: "Base", text: "Liked 'Mango's Tea Party'", time: "10m ago" },
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

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const MOCK_STYLES = ["Cinematic", "Anime", "Watercolor", "3D Render", "Sketch"];

// Kawaii/Chibi style pet avatars
const MOCK_IMAGES = [
  { url: "/gallery/pet_cat.jpg", ratio: "1:1" },
  { url: "/gallery/pet_dog.jpg", ratio: "1:1" },
  { url: "/gallery/pet_parrot.jpg", ratio: "1:1" },
  { url: "/gallery/pet_turtle.jpg", ratio: "1:1" },
  { url: "/gallery/pet_hamster.jpg", ratio: "1:1" },
  { url: "/gallery/pet_rabbit.jpg", ratio: "1:1" },
  { url: "/gallery/pet_fox.jpg", ratio: "1:1" },
  { url: "/gallery/pet_pom.jpg", ratio: "1:1" },
];

export const MOCK_SOCIAL_FEED = {
  items: Array.from({ length: 24 }, (_, i) => ({
    generation_id: i + 1,
    pet_type: i % 8,
    style: i % 5,
    style_name: MOCK_STYLES[i % 5],
    prompt: MOCK_PROMPTS[i % MOCK_PROMPTS.length],
    photo_url: MOCK_IMAGES[i % MOCK_IMAGES.length].url,
    video_url: null,
    wallet_address: MOCK_WALLETS[i % MOCK_WALLETS.length],
    display_name: MOCK_NAMES[i % MOCK_NAMES.length],
    likes_count: randomInt(12, 480),
    comments_count: randomInt(0, 24),
    is_liked: i % 3 === 0,
    duration: [3, 5, 10][i % 3],
    aspect_ratio: MOCK_IMAGES[i % MOCK_IMAGES.length].ratio,
    gen_type: i % 5 === 0 ? "video" : "image",
    created_at: new Date(Date.now() - randomInt(1, 168) * 3600000).toISOString(),
  })),
  total: 24,
  page: 1,
  page_size: 24,
};

export const MOCK_INTERACT_RESPONSES = {
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
