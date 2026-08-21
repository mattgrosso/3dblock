import { describe, it, expect } from 'vitest'
import { addEntry, bestOf, isHighScore, setupKey, type ScoreEntry } from '../src/game/highscores'
import { SETUPS } from '../src/game/sets'

const entry = (score: number, at = '2026-01-01T00:00:00.000Z'): ScoreEntry => ({
  score, level: 0, layers: 0, cubes: 0, at,
})

describe('setupKey', () => {
  // Scores from different pits genuinely aren't comparable - depth alone
  // changes every score by up to 2.7x - so each setup gets its own list.
  it('gives each setup its own bucket', () => {
    const keys = SETUPS.map(setupKey)
    expect(new Set(keys).size).toBe(SETUPS.length)
    expect(keys[0]).toBe('TETRIS-5x5x12')
  })

  it('separates the same block set in different pits', () => {
    const base = SETUPS[0]!
    expect(setupKey(base)).not.toBe(setupKey({ ...base, depth: 18 }))
    expect(setupKey(base)).not.toBe(setupKey({ ...base, width: 3 }))
  })

  // Area scoring (2026-08-21) changed what a non-5x5 score is worth, so those
  // boards start over under a suffixed key; 5x5 scores are unchanged and keep
  // their history under the unsuffixed one.
  it('marks non-5x5 boards with the area-scoring era, and leaves 5x5 alone', () => {
    const base = SETUPS[0]!
    expect(setupKey({ ...base, width: 5, height: 5 })).toBe('TETRIS-5x5x12')
    expect(setupKey({ ...base, width: 3, height: 3 })).toBe('TETRIS-3x3x12-a2')
    expect(setupKey({ ...base, width: 7, height: 7 })).toBe('TETRIS-7x7x12-a2')
  })
})

describe('addEntry', () => {
  it('sorts highest first', () => {
    const list = addEntry(addEntry([], entry(100)), entry(500))
    expect(list.map((e) => e.score)).toEqual([500, 100])
  })

  it('caps the list, dropping the lowest', () => {
    let list: ScoreEntry[] = []
    for (let i = 1; i <= 15; i += 1) list = addEntry(list, entry(i * 10))
    expect(list).toHaveLength(10)
    expect(list[0]!.score).toBe(150)
    expect(list.at(-1)!.score).toBe(60)
  })

  it('keeps the earlier run ahead when scores tie', () => {
    const older = entry(200, '2026-01-01T00:00:00.000Z')
    const newer = entry(200, '2026-06-01T00:00:00.000Z')
    expect(addEntry([newer], older).map((e) => e.at)).toEqual([older.at, newer.at])
  })

  it('does not mutate the list it was given', () => {
    const original = [entry(100)]
    addEntry(original, entry(900))
    expect(original).toHaveLength(1)
  })
})

describe('isHighScore', () => {
  it('accepts anything while the table has room', () => {
    expect(isHighScore([], 1)).toBe(true)
    expect(isHighScore([entry(9999)], 5)).toBe(true)
  })

  it('rejects a score that beats nothing on a full table', () => {
    const full = Array.from({ length: 10 }, (_, i) => entry((i + 1) * 100))
    expect(isHighScore(full, 50)).toBe(false)
    expect(isHighScore(full, 150)).toBe(true)
  })

  // Every locked piece scores at least a point, so zero only happens if you
  // never placed anything - not worth a row in the table.
  it('never counts a zero', () => {
    expect(isHighScore([], 0)).toBe(false)
  })
})

describe('bestOf', () => {
  it('is zero for an empty table', () => {
    expect(bestOf([])).toBe(0)
  })

  it('finds the top score regardless of order', () => {
    expect(bestOf([entry(10), entry(900), entry(40)])).toBe(900)
  })
})
