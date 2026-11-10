export const commonWords = [
  "alpha", "beta", "gamma", "delta", "omega", "nexus", "vertex", "pixel", "pulse", "echo",
  "logic", "spark", "cloud", "zenith", "quantum", "stellar", "nova", "flux", "rift", "vibe",
  "orbit", "prism", "cyber", "data", "flow", "grid", "node", "core", "peak", "aura",
  "swift", "bright", "clear", "smart", "bold", "prime", "grand", "super", "hyper", "ultra",
  "meta", "open", "free", "easy", "pure", "fresh", "cool", "epic", "wild", "fast",
  "path", "link", "gate", "way", "zone", "field", "stream", "ocean", "river", "forest",
  "mountain", "valley", "star", "moon", "sun", "sky", "earth", "wind", "fire", "water",
  "tech", "code", "app", "web", "site", "blog", "hub", "net", "dot", "com",
  "blue", "green", "red", "gold", "silver", "black", "white", "gray", "neon", "glow",
  "think", "create", "build", "launch", "grow", "learn", "share", "connect", "explore", "solve",
  "future", "vision", "impact", "power", "energy", "force", "spirit", "dream", "idea", "mind",
  "daily", "weekly", "monthly", "yearly", "now", "today", "tomorrow", "always", "ever", "never",
  "small", "large", "tiny", "huge", "mini", "maxi", "pro", "lite", "plus", "extra",
  "simple", "easy", "quick", "fast", "slow", "hard", "soft", "heavy", "light", "strong",
  "work", "life", "play", "fun", "joy", "love", "peace", "hope", "faith", "luck",
  "team", "group", "club", "crew", "squad", "unit", "cell", "base", "camp", "home",
  "city", "town", "land", "world", "globe", "space", "time", "life", "soul", "heart",
  "bird", "cat", "dog", "fish", "lion", "tiger", "bear", "wolf", "eagle", "hawk",
  "tree", "flower", "leaf", "root", "seed", "fruit", "berry", "nut", "grain", "wheat",
  "gold", "iron", "steel", "copper", "brass", "glass", "stone", "rock", "clay", "sand"
];

export const getRandomWord = () => {
  return commonWords[Math.floor(Math.random() * commonWords.length)];
};
