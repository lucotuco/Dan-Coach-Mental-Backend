const cache = new Map();

const MAX_CACHE_SIZE = parseInt(process.env.DAN_RETRIEVAL_CACHE_MAX || '500', 10);

export function getCachedMemory(key) {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  // LRU: mover al final
  cache.delete(key);
  cache.set(key, entry);

  return entry.value;
}

export function setCachedMemory(key, value, ttlMs) {
  // Si ya existe, actualiza y mueve al final
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });

  // evict LRU
  while (cache.size > MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}
