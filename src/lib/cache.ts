/**
 * Tiny in-memory TTL cache for expensive server-side work (astronomy
 * computations, third-party API fan-outs). Single-user app, single process —
 * a Map is all we need. Entries store the in-flight promise so concurrent
 * callers dedupe; failures are evicted so the next call retries.
 */

interface Entry {
  expires: number;
  value: Promise<unknown>;
}

const store = new Map<string, Entry>();

export function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T> | T
): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;

  const value = Promise.resolve().then(fn);
  store.set(key, { expires: Date.now() + ttlMs, value });
  value.catch(() => {
    // Don't cache failures — but only evict if this promise is still current.
    if (store.get(key)?.value === value) store.delete(key);
  });
  return value;
}

export function bust(key: string) {
  store.delete(key);
}

export function bustPrefix(prefix: string) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
