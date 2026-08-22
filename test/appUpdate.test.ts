import { describe, it, expect } from 'vitest'
import {
  extractBundleName,
  isSafeMomentForReload,
  shouldAutoAttempt,
} from '../src/appUpdate'

describe('extractBundleName', () => {
  // Verified against this repo's own dist/index.html, which Vite emits as
  // `<script type="module" crossorigin src="/assets/index-<hash>.js">`.
  it('finds the Vite entry bundle in served html', () => {
    const html = `
      <link rel="stylesheet" crossorigin href="/assets/index-TFtEpMRv.css">
      <script type="module" crossorigin src="/assets/index-CLQqS6am.js"></script>
    `
    expect(extractBundleName(html)).toBe('assets/index-CLQqS6am.js')
  })

  it('ignores the stylesheet, which shares the index- prefix', () => {
    expect(extractBundleName('<link href="/assets/index-TFtEpMRv.css">')).toBeNull()
  })

  it('returns null when nothing matches', () => {
    expect(extractBundleName('<html>maintenance</html>')).toBeNull()
    expect(extractBundleName(null)).toBeNull()
  })
})

describe('isSafeMomentForReload', () => {
  const idle = {
    run: null,
    activeElement: { tagName: 'BODY' },
    bugModalOpen: false,
    nameEntryOpen: false,
  } as const

  it('is safe on the setup screen, with no game yet', () => {
    expect(isSafeMomentForReload(idle)).toBe(true)
  })

  // The case the old controllerchange listener reloaded in: the game is
  // running but nothing has landed, so there is nothing to lose.
  it('is safe in a game with no cubes played', () => {
    expect(isSafeMomentForReload({ ...idle, run: { phase: 'playing', cubesPlayed: 0 } })).toBe(true)
  })

  it('is unsafe once a single cube has been played', () => {
    expect(isSafeMomentForReload({ ...idle, run: { phase: 'playing', cubesPlayed: 4 } })).toBe(false)
  })

  // A paused game loses exactly as much as a falling one - pause is not a
  // licence to reload.
  it('is unsafe mid-game even though the piece is not falling', () => {
    expect(isSafeMomentForReload({ ...idle, run: { phase: 'playing', cubesPlayed: 40 } })).toBe(false)
  })

  it('is safe after game over once the score is dealt with', () => {
    expect(isSafeMomentForReload({ ...idle, run: { phase: 'over', cubesPlayed: 120 } })).toBe(true)
  })

  it('is unsafe while the game-over name entry is up', () => {
    expect(
      isSafeMomentForReload({ ...idle, run: { phase: 'over', cubesPlayed: 120 }, nameEntryOpen: true }),
    ).toBe(false)
  })

  it('is unsafe while the bug-report modal is open', () => {
    expect(isSafeMomentForReload({ ...idle, bugModalOpen: true })).toBe(false)
  })

  it('is unsafe while a form control has focus', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(isSafeMomentForReload({ ...idle, activeElement: { tagName } })).toBe(false)
    }
  })

  it('tolerates a missing active element', () => {
    expect(isSafeMomentForReload({ ...idle, activeElement: null })).toBe(true)
  })
})

describe('shouldAutoAttempt', () => {
  const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem'> => {
    const data = new Map<string, string>()
    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => { data.set(key, value) },
    }
  }

  it('allows one attempt per target bundle', () => {
    const storage = memoryStorage()
    expect(shouldAutoAttempt('assets/index-AAA.js', storage)).toBe(true)
    expect(shouldAutoAttempt('assets/index-AAA.js', storage)).toBe(false)
  })

  it('gives a further deploy a fresh attempt', () => {
    const storage = memoryStorage()
    expect(shouldAutoAttempt('assets/index-AAA.js', storage)).toBe(true)
    expect(shouldAutoAttempt('assets/index-BBB.js', storage)).toBe(true)
  })

  // Private-mode sessionStorage throws on write; better to try once than to
  // never update at all.
  it('still attempts when storage is unavailable', () => {
    const broken = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    }
    expect(shouldAutoAttempt('assets/index-AAA.js', broken)).toBe(true)
  })
})
