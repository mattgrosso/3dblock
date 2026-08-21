import { describe, it, expect } from 'vitest'
import { nameFor, normalizeConfig } from '../src/ui/setup'
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
