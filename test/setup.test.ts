import { describe, it, expect } from 'vitest'
import { nameFor, normalizeConfig, scoreLines, SCORE_LINES } from '../src/ui/setup'
import { SETUPS, PIT_LIMITS } from '../src/game/sets'
import { setupKey } from '../src/game/highscores'
import { THEME_CHOICES } from '../src/render/themes'

describe('nameFor', () => {
  it('recognises each scored setup', () => {
    for (const setup of SETUPS) {
      expect(nameFor(setup)).toBe(setup.name)
    }
  })

  // Reaching 5x5x12 FLAT through the dropdowns is the same game as picking
  // "Flat Fun", so it has to land in the same high-score table rather than a
  // parallel "Custom" one.
  it('names a hand-built configuration after the preset it matches', () => {
    const built = { set: 'FLAT' as const, width: 5, height: 5, depth: 12 }
    expect(nameFor(built)).toBe('Flat Fun')
    const flatFun = SETUPS.find((s) => s.name === 'Flat Fun')!
    expect(setupKey({ ...built, name: nameFor(built) })).toBe(setupKey(flatFun))
  })

  it('calls anything else Custom', () => {
    expect(nameFor({ set: 'FLAT', width: 7, height: 3, depth: 9 })).toBe('Custom')
    // Same pit, different set - not the same game.
    expect(nameFor({ set: 'EXTENDED', width: 5, height: 5, depth: 12 })).toBe('Custom')
  })
})

describe('normalizeConfig', () => {
  it('keeps a valid configuration intact', () => {
    const config = normalizeConfig({ set: 'EXTENDED', width: 6, height: 4, depth: 15, startLevel: 3 })
    expect(config).toMatchObject({ set: 'EXTENDED', width: 6, height: 4, depth: 15, startLevel: 3 })
  })

  // Stored config is just a string in localStorage - it can be from an older
  // build, hand-edited, or absent. None of that should produce a pit the
  // renderer or the scoring tables can't handle.
  it('clamps out-of-range dimensions to the legal pit', () => {
    const tiny = normalizeConfig({ set: 'FLAT', width: 1, height: 99, depth: 2, startLevel: -5 })
    expect(tiny.width).toBe(PIT_LIMITS.minSide)
    expect(tiny.height).toBe(PIT_LIMITS.maxSide)
    expect(tiny.depth).toBe(PIT_LIMITS.minDepth)
    expect(tiny.startLevel).toBe(0)
  })

  it('caps the starting level at 10', () => {
    expect(normalizeConfig({ startLevel: 99 }).startLevel).toBe(10)
  })

  it('falls back to a playable default for junk', () => {
    for (const junk of [null, undefined, {}, { set: 'NONSENSE' }, 'nope', 42]) {
      const config = normalizeConfig(junk)
      expect(['TETRIS', 'FLAT', 'BASIC', 'EXTENDED']).toContain(config.set)
      expect(config.width).toBeGreaterThanOrEqual(PIT_LIMITS.minSide)
      expect(config.depth).toBeGreaterThanOrEqual(PIT_LIMITS.minDepth)
      expect(config.depth).toBeLessThanOrEqual(PIT_LIMITS.maxDepth)
    }
  })

  // The landing preview is OFF unless someone explicitly turned it on —
  // knowing where a piece lands is half the game.
  it('defaults the landing preview off, and only an explicit true turns it on', () => {
    expect(normalizeConfig({}).guide).toBe(false)
    expect(normalizeConfig({ guide: 'yes' }).guide).toBe(false)
    expect(normalizeConfig({ guide: true }).guide).toBe(true)
  })

  // Theme names change; whatever is stored has to resolve to something the
  // renderer can actually paint with.
  it('keeps a known theme and replaces an unknown one', () => {
    expect(normalizeConfig({ theme: 'Random' }).theme).toBe('Random')
    expect(THEME_CHOICES).toContain(normalizeConfig({ theme: 'Vantablack' }).theme)
    expect(THEME_CHOICES).toContain(normalizeConfig({}).theme)
  })

  it('always produces a depth the scoring table covers', () => {
    for (let d = -10; d <= 40; d += 1) {
      const { depth } = normalizeConfig({ depth: d })
      expect(depth).toBeGreaterThanOrEqual(PIT_LIMITS.minDepth)
      expect(depth).toBeLessThanOrEqual(PIT_LIMITS.maxDepth)
    }
  })
})

// Bug report (2026-09-11): "It would be cool to be able to see the high
// scores on the setup page for whatever setup I have selected."
describe('scoreLines', () => {
  const local = [
    { score: 49838, level: 8, layers: 46, cubes: 1260, at: '2026-09-11T14:53:30.000Z' },
    { score: 12000, level: 3, layers: 12, cubes: 300, at: '2026-09-01T10:00:00.000Z' },
    { score: 9000, level: 2, layers: 9, cubes: 200, at: '2026-08-20T10:00:00.000Z' },
    { score: 100, level: 0, layers: 1, cubes: 20, at: '2026-08-01T10:00:00.000Z' },
  ]
  const world = [
    { name: 'Seth', score: 61200, level: 9, layers: 50, at: 1 },
    { name: 'Matt', score: 49838, level: 8, layers: 46, at: 2 },
  ]

  it('shows the top few of each board, best first as given', () => {
    const lines = scoreLines(local, world)
    expect(lines.you).toHaveLength(SCORE_LINES)
    expect(lines.you[0]).toMatch(/^49,838 · lvl 8 · /)
    expect(lines.world).toEqual(['Seth · 61,200', 'Matt · 49,838'])
  })

  it('leaves the date off a run whose timestamp is unreadable', () => {
    const lines = scoreLines([{ ...local[0]!, at: 'not a date' }], [])
    expect(lines.you).toEqual(['49,838 · lvl 8'])
  })

  it('returns nothing for an empty board, so the screen can say so', () => {
    expect(scoreLines([], [])).toEqual({ you: [], world: [] })
  })

  // Names are other people's input. They travel as text and are inserted
  // as textContent - a name like this must never become markup.
  it('passes a name through untouched, as text', () => {
    const lines = scoreLines([], [{ name: '<b>x</b>', score: 5, level: 0, layers: 0, at: 0 }])
    expect(lines.world).toEqual(['<b>x</b> · 5'])
  })
})
