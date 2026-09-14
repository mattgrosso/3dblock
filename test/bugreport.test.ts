import { afterEach, describe, expect, it, vi } from 'vitest'
import { uidFromIdToken } from '../src/lib/anonAuth'
import { buildReport } from '../src/ui/bugreport'

// A JWT is header.payload.signature with base64url pieces; only the payload
// is read, and only for our own anonymous session's uid.
const b64url = (value: unknown): string =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = (claims: Record<string, unknown>): string => `${b64url({ alg: 'RS256' })}.${b64url(claims)}.sig`

describe('uidFromIdToken', () => {
  it('reads the uid out of the token payload', () => {
    expect(uidFromIdToken(jwt({ sub: 'anon-123', user_id: 'anon-123' }))).toBe('anon-123')
  })

  it('falls back to user_id, and to null for anything unreadable', () => {
    expect(uidFromIdToken(jwt({ user_id: 'anon-456' }))).toBe('anon-456')
    expect(uidFromIdToken(jwt({}))).toBeNull()
    expect(uidFromIdToken('not a token')).toBeNull()
    expect(uidFromIdToken('')).toBeNull()
  })
})

// Who filed it (2026-09-14). Until then a report carried no uid at all; the
// anonymous uid is stable per browser, so it still says which device a run
// of reports came from. These tests run without a DOM, so the browser
// globals the builder reads are stubbed.
describe('buildReport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('names the session and the device', () => {
    vi.stubGlobal('window', {
      location: { href: 'https://blockout.test/' },
      innerWidth: 390,
      innerHeight: 844,
      screen: { width: 393, height: 852 },
      devicePixelRatio: 3,
    })
    vi.stubGlobal('navigator', { userAgent: 'test-agent', onLine: true })

    const report = buildReport('the piece fell through', { level: 4 }, 'anon-123')
    expect(report).toMatchObject({
      transcript: 'the piece fell through',
      reporterUid: 'anon-123',
      reporterDisplayName: null,
      url: 'https://blockout.test/',
      viewport: '390x844',
      screenSize: '393x852',
      devicePixelRatio: 3,
      online: true,
      state: '{"level":4}',
    })
  })

  it('writes a null uid, not nothing, when the session could not be named', () => {
    vi.stubGlobal('window', { location: { href: 'x' }, innerWidth: 1, innerHeight: 1, screen: undefined })
    vi.stubGlobal('navigator', { userAgent: 'a', onLine: false })
    expect(buildReport('it broke', {}, null)).toMatchObject({ reporterUid: null, screenSize: '0x0', devicePixelRatio: 1 })
  })
})
