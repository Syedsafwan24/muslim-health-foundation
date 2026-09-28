const LIMIT = 10;
const WINDOW_MS = 15 * 60 * 1000;

// ponytail: per-process in-memory counter — correct only while the app runs as the single pm2
// fork process (ecosystem.config.cjs) and forgets everything on restart. With more processes or
// hosts, move this to the proxy (nginx `limit_req` on /login and /api/auth) or a shared store.
const failures = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}

/** True once this client address has had LIMIT failed sign-ins in the last 15 minutes. */
export function loginThrottled(ip: string | null): boolean {
  return recent(ip ?? "unknown", Date.now()).length >= LIMIT;
}

export function noteLoginFailure(ip: string | null): void {
  const now = Date.now();
  const key = ip ?? "unknown";
  failures.set(key, [...recent(key, now), now]);
  if (failures.size > 10_000) for (const k of [...failures.keys()]) recent(k, now); // sweep stale keys
}
