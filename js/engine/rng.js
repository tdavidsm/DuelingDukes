// Small deterministic RNG helpers. The game keeps its RNG state as a single
// integer inside the game state, so every shuffle is reproducible.

export function nextRand(holder) {
  // mulberry32; `holder.rng` is the integer state.
  let t = (holder.rng = (holder.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function makeRng(seed) {
  const holder = { rng: seed | 0 };
  const f = () => nextRand(holder);
  f.int = (n) => Math.floor(f() * n);
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(f() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return f;
}

export function shuffleWith(holder, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand(holder) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}
