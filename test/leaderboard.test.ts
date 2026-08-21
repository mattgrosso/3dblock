import { describe, it, expect } from 'vitest'
import { cleanName, qualifies, toBoard, TOP_LIMIT, type GlobalEntry } from '../src/game/leaderboard'

const entry = (score: number, name = 'p', at = 0): GlobalEntry =>
  ({ name, score, level: 0, layers: 0, at })

describe('toBoard', () => {
  it('turns the database object into a highest-first list', () => {
    const board = toBoard({
      a: { name: 'A', score: 10, at: 5 },
      b: { name: 'B', score: 30, level: 2, layers: 1, at: 1 },
      c: { name: 'C', score: 20, at: 2 },
    })
    expect(board.map((e) => e.name)).toEqual(['B', 'C', 'A'])
    expect(board[0]).toMatchObject({ level: 2, layers: 1 })
  })

  it('breaks ties in favour of whoever got there first', () => {
    const board = toBoard({
      later: { name: 'later', score: 10, at: 9 },
      first: { name: 'first', score: 10, at: 1 },
    })
    expect(board.map((e) => e.name)).toEqual(['first', 'later'])
  })

  // The node is world-writable by design; whatever lands in it must not be
  // able to crash the overlay.
  it('drops entries that are not shaped like scores', () => {
    const board = toBoard({
      ok: { name: 'ok', score: 5 },
      junk1: { name: 'no score' },
      junk2: { score: 5 },
      junk3: 'what',
      junk4: null,
    })
    expect(board.map((e) => e.name)).toEqual(['ok'])
  })

  it('is empty for an empty node', () => {
    expect(toBoard(null)).toEqual([])
  })
})

describe('qualifies', () => {
  it('accepts anything positive while the board has room', () => {
    expect(qualifies([], 1)).toBe(true)
    expect(qualifies([entry(9999)], 5)).toBe(true)
  })

  it('requires beating the last place on a full board', () => {
    const full = Array.from({ length: TOP_LIMIT }, (_, i) => entry((10 - i) * 100))
    expect(qualifies(full, 100)).toBe(false) // ties last place - not on the board
    expect(qualifies(full, 101)).toBe(true)
  })

  it('never posts a zero', () => {
    expect(qualifies([], 0)).toBe(false)
  })
})

describe('cleanName', () => {
  it('trims and caps at the rules limit', () => {
    expect(cleanName('  Matt  ')).toBe('Matt')
    expect(cleanName('x'.repeat(50))).toHaveLength(20)
    expect(cleanName('   ')).toBe('')
  })
})
