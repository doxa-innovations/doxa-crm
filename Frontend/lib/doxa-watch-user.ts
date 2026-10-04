// Who made a request, for Doxa Watch. It runs for every recorded request, so it must stay cheap:
// - a request without a BetterAuth session cookie never touches the database;
// - a session is looked up once and remembered for a minute, keyed by its cookie value.

type WatchUser = { id: string; name?: string; username?: string };
type WatchRequest = { headers: Record<string, string | string[] | undefined> };

const sessionCookie = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=([^;]+)/;
const cacheTtlMs = 60_000;
const cacheMaxEntries = 500;
const cache = new Map<string, { user: WatchUser | null; expires: number }>();

export async function resolveWatchUser(request: WatchRequest): Promise<WatchUser | null> {
  const header = request.headers.cookie;
  const cookies = Array.isArray(header) ? header.join("; ") : (header ?? "");
  const token = sessionCookie.exec(cookies)?.[1];
  if (!token) {
    return null;
  }

  const now = Date.now();
  const cached = cache.get(token);
  if (cached && cached.expires > now) {
    return cached.user;
  }

  // Imported here, not at the top: lib/auth opens the database pool and needs the runtime secrets.
  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: new Headers({ cookie: cookies }) });
  const user: WatchUser | null = session
    ? {
        id: session.user.id,
        name: session.user.full_name || session.user.name || undefined,
        username: session.user.email,
      }
    : null;

  if (cache.size >= cacheMaxEntries) {
    cache.clear();
  }
  cache.set(token, { user, expires: now + cacheTtlMs });
  return user;
}
