// A silent anonymous Firebase session over plain REST - no SDK, matching
// this app's zero-dependency character.
//
// Why it exists (2026-08-29): Firebase's rules scanner emails daily about
// any database path writable without auth, and Matt chose real auth over
// muting the alerts. Blockout has no sign-in of any kind - it's a 1989
// video game - so the leaderboard and bug-report rules now require
// `auth != null` and THIS module satisfies them invisibly: one anonymous
// account per browser, minted on first use, refreshed when stale, cached in
// localStorage so it survives reloads.
//
// The Web API key is public by design (it identifies the project; the rules
// are the security) - the same key every hub game ships in its bundle.

const API_KEY = 'AIzaSyAyBC1IibnpntEw6ffu5158-5proIHQ2wA'
const SIGNUP = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`
const REFRESH = `https://securetoken.googleapis.com/v1/token?key=${API_KEY}`

const STORE_KEY = '3dblock.anonSession'

interface StoredSession {
  readonly idToken: string
  readonly refreshToken: string
  /** ms epoch after which idToken should not be trusted. */
  readonly staleAt: number
}

const read = (): StoredSession | null => {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession
    return parsed.idToken && parsed.refreshToken ? parsed : null
  } catch {
    return null
  }
}

const write = (session: StoredSession | null): void => {
  try {
    if (session) localStorage.setItem(STORE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORE_KEY)
  } catch {
    // Storage blocked: the session just won't survive a reload.
  }
}

// Tokens live an hour; refresh with ten minutes to spare so a token handed
// to a caller is never mid-expiry by the time its request lands.
const lifetime = (expiresIn: string | number): number =>
  Date.now() + (Number(expiresIn) || 3600) * 1000 - 10 * 60 * 1000

const mint = async (): Promise<StoredSession> => {
  const response = await fetch(SIGNUP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  })
  if (!response.ok) throw new Error(`Anonymous sign-in failed: ${response.status}`)
  const data = await response.json()
  return { idToken: data.idToken, refreshToken: data.refreshToken, staleAt: lifetime(data.expiresIn) }
}

const refresh = async (session: StoredSession): Promise<StoredSession> => {
  const response = await fetch(REFRESH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`,
  })
  if (!response.ok) throw new Error(`Token refresh failed: ${response.status}`)
  const data = await response.json()
  return { idToken: data.id_token, refreshToken: data.refresh_token, staleAt: lifetime(data.expires_in) }
}

/**
 * A currently-valid ID token, from cache, refresh, or a fresh account - in
 * that order. A deleted anonymous account (cleared by Firebase's stale-user
 * cleanup, or by the browser losing storage) falls through to a new one:
 * the identity carries nothing, so a new one costs nothing.
 */
export async function anonToken (): Promise<string> {
  const cached = read()
  if (cached && Date.now() < cached.staleAt) return cached.idToken
  if (cached) {
    try {
      const renewed = await refresh(cached)
      write(renewed)
      return renewed.idToken
    } catch {
      write(null)
    }
  }
  const fresh = await mint()
  write(fresh)
  return fresh.idToken
}

/** Append the auth token to an RTDB REST url (which may already carry a query). */
export async function withAuth (url: string): Promise<string> {
  const token = await anonToken()
  return `${url}${url.includes('?') ? '&' : '?'}auth=${encodeURIComponent(token)}`
}
