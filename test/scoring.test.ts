import { describe, it, expect } from 'vitest'
import { cubesPerLevel, levelFor, lineComponent, scoreFor, stepTimeFor } from '../src/game/scoring'
import { PIECES } from '../src/game/pieces'
import type { BlockSet } from '../src/game/sets'

// A single cube, so the piece component is as small as possible and the line
// component dominates - that is what the published tables report.
const singleCube = PIECES[0]!

const lineScore = (
  set: BlockSet,
  level: number,
  depth: number,
  layersCleared: number,
  width = 5,
  height = 5,
): number =>
  scoreFor({
    piece: singleCube,
    set,
    level,
    width,
    height,
    depth,
    layersCleared,
    dropped: false,
    dropPosition: 0,
    pitEmptied: false,
  })

describe('lineComponent, against the published BlockOut II score tables', () => {
  // These are read straight off the community score calculator at
  // blockout.net, which is why this is the one test here that checks against
  // something outside this codebase rather than against our own arithmetic.
  it('matches FLAT 5x5x12 across the level range', () => {
    expect(lineComponent('FLAT', 0, 12, 1)).toBe(63)
    expect(lineComponent('FLAT', 1, 12, 1)).toBe(107)
    expect(lineComponent('FLAT', 10, 12, 1)).toBe(736)
  })

  it('matches the multi-layer jumps, which pay far more than a multiple', () => {
    expect(lineComponent('FLAT', 0, 12, 2)).toBe(232)
    expect(lineComponent('FLAT', 0, 12, 3)).toBe(508)
    expect(lineComponent('FLAT', 0, 12, 2)).toBeGreaterThan(3 * lineComponent('FLAT', 0, 12, 1))
  })

  it('matches BASIC and EXTENDED at level 0', () => {
    expect(lineComponent('BASIC', 0, 12, 1)).toBe(72)
    expect(lineComponent('EXTENDED', 0, 12, 1)).toBe(237)
  })

  it('pays more in a shallow pit and less in a deep one', () => {
    expect(lineComponent('FLAT', 0, 6, 1)).toBe(115)
    expect(lineComponent('FLAT', 0, 18, 1)).toBe(43)
  })

  // Our deliberate departure (2026-08-21): the original pays 3x3x12 and
  // 5x5x12 identically; here cross-section scales the score linearly, with
  // 5x5 as the reference so every published-table check above still holds.
  describe('area scoring', () => {
    it('pays proportionally to the cross-section, 5x5 unchanged', () => {
      expect(lineComponent('FLAT', 0, 12, 1, 5, 5)).toBe(63)
      expect(lineComponent('FLAT', 0, 12, 1, 3, 3)).toBe(Math.round(62.7 * (9 / 25)))
      expect(lineComponent('FLAT', 0, 12, 1, 7, 7)).toBe(Math.round(62.7 * (49 / 25)))
    })

    it('applies to the whole scoreFor total the same way', () => {
      const five = lineScore('FLAT', 0, 12, 1, 5, 5)
      const three = lineScore('FLAT', 0, 12, 1, 3, 3)
      expect(three / five).toBeCloseTo(9 / 25, 1)
    })
  })

  it('scores nothing for clearing no layers', () => {
    expect(lineComponent('FLAT', 5, 12, 0)).toBe(0)
  })
})

describe('scoreFor', () => {
  it('is the line score plus the piece, so it beats the line alone', () => {
    expect(lineScore('FLAT', 0, 12, 1)).toBeGreaterThan(lineComponent('FLAT', 0, 12, 1))
  })

  it('still pays at least a point for a piece that clears nothing', () => {
    expect(lineScore('FLAT', 0, 18, 0)).toBeGreaterThanOrEqual(1)
  })
})

describe('scoreFor, drop bonus', () => {
  const drop = (dropped: boolean, dropPosition: number): number =>
    scoreFor({
      piece: PIECES[4]!,
      set: 'FLAT',
      level: 0,
      width: 5,
      height: 5,
      depth: 12,
      layersCleared: 0,
      dropped,
      dropPosition,
      pitEmptied: false,
    })

  // The original zeroes the drop position unless the player actually dropped,
  // so a piece that merely fell from the top earns nothing extra.
  it('ignores height entirely when the piece was not hard-dropped', () => {
    expect(drop(false, 11)).toBe(drop(false, 0))
  })

  it('pays more the higher the drop started', () => {
    expect(drop(true, 11)).toBeGreaterThan(drop(true, 5))
    expect(drop(true, 5)).toBeGreaterThan(drop(true, 0))
  })

})

describe('scoreFor, emptying the pit', () => {
  it('adds a two-layer bonus on top of the layers actually cleared', () => {
    const base = { piece: singleCube, set: 'FLAT' as const, level: 0, width: 5, height: 5, depth: 12, layersCleared: 1, dropped: false, dropPosition: 0 }
    const plain = scoreFor({ ...base, pitEmptied: false })
    const flushed = scoreFor({ ...base, pitEmptied: true })
    expect(flushed - plain).toBe(lineComponent('FLAT', 0, 12, 2))
  })
})

describe('stepTimeFor', () => {
  it('starts at the original 5.51 seconds per step', () => {
    expect(stepTimeFor(0)).toBeCloseTo(5.51, 5)
  })

  it('gets 0.64x faster per level, and stops speeding up at 10', () => {
    expect(stepTimeFor(1)).toBeCloseTo(5.51 * 0.64, 5)
    expect(stepTimeFor(10)).toBeCloseTo(5.51 * 0.64 ** 10, 5)
    expect(stepTimeFor(99)).toBeCloseTo(stepTimeFor(10), 5)
  })

  it('is dramatically faster by the top level', () => {
    expect(stepTimeFor(0) / stepTimeFor(10)).toBeGreaterThan(60)
  })
})

describe('levelFor', () => {
  it('needs 15 cubes per pit row and column', () => {
    expect(cubesPerLevel(5, 5)).toBe(150)
    expect(cubesPerLevel(3, 3)).toBe(90)
  })

  it('promotes once enough cubes have been played', () => {
    expect(levelFor(0, 0, 5, 5)).toBe(0)
    expect(levelFor(0, 149, 5, 5)).toBe(0)
    expect(levelFor(0, 150, 5, 5)).toBe(1)
    expect(levelFor(0, 450, 5, 5)).toBe(3)
  })

  // Starting at level 5 does not mean five levels of credit: the original ties
  // the threshold to the level you're on, so a high start is pure difficulty.
  it('does not shorten the climb when starting high', () => {
    expect(levelFor(5, 0, 5, 5)).toBe(5)
    expect(levelFor(5, 150, 5, 5)).toBe(5)
    expect(levelFor(5, 900, 5, 5)).toBe(6)
  })

  it('caps at level 10', () => {
    expect(levelFor(0, 1_000_000, 5, 5)).toBe(10)
  })
})
