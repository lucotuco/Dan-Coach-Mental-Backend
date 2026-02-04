const cache = new Map();

export function getCachedMemory(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCachedMemory(key, value, ttlMs) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}
