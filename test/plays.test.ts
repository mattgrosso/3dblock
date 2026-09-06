import { describe, it, expect } from 'vitest'
import { dayKey, pickHighlights, MIN_ACTIVE, MIN_POPULAR, type HighlightSource } from '../src/game/plays'
import { setupKey } from '../src/game/highscores'
import { SETUPS } from '../src/game/sets'
import { badgeLabels } from '../src/ui/setup'

const [tetris, flat, mania, control] = SETUPS.map(setupKey) as [string, string, string, string]
const TODAY = '2026-09-05'

const source = (
  plays: HighlightSource['plays'] = {},
  records: HighlightSource['records'] = {},
): HighlightSource => ({ plays, records })

describe('dayKey', () => {
  it('is the local calendar date, zero-padded', () => {
    expect(dayKey(new Date(2026, 0, 3, 23, 59))).toBe('2026-01-03')
    expect(dayKey(new Date(2026, 11, 25))).toBe('2026-12-25')
  })
})

describe('pickHighlights', () => {
  it('says nothing about an empty database', () => {
    expect(pickHighlights(source(), TODAY)).toEqual({})
  })

  // A preset with two plays is not "most popular", it's merely the only one.
  it('waits for enough plays before crowning a most popular preset', () => {
    expect(pickHighlights(source({ [tetris]: { total: MIN_POPULAR - 1 } }), TODAY)).toEqual({})
    expect(pickHighlights(source({ [tetris]: { total: MIN_POPULAR } }), TODAY)).toEqual({ popular: tetris })
  })

  it('picks the preset with the most games all time', () => {
    const plays = { [tetris]: { total: 40 }, [flat]: { total: 55 }, [mania]: { total: 12 } }
    expect(pickHighlights(source(plays), TODAY).popular).toBe(flat)
  })

  it('shows no popular badge on a tie', () => {
    const plays = { [tetris]: { total: 40 }, [flat]: { total: 40 } }
    expect(pickHighlights(source(plays), TODAY).popular).toBeUndefined()
  })

  it('counts only the last seven days, today included, for most active', () => {
    const plays: HighlightSource['plays'] = {
      // Lots of games, all too old to count.
      [tetris]: { total: 500, days: { '2026-08-28': 100, '2026-08-01': 400 } },
      // Fewer, but this week.
      [flat]: { total: 10, days: { '2026-08-30': 1, '2026-09-05': 2 } },
      [mania]: { total: 10, days: { '2026-08-29': 2 } },
    }
    const picked = pickHighlights(source(plays), TODAY)
    expect(picked.active).toBe(flat)
    expect(picked.popular).toBe(tetris)
  })

  it('needs a few recent games before calling anything active', () => {
    const plays = { [flat]: { total: 10, days: { [TODAY]: MIN_ACTIVE - 1 } } }
    expect(pickHighlights(source(plays), TODAY).active).toBeUndefined()
  })

  it('handles the week wrapping a month boundary', () => {
    const plays = { [flat]: { total: 10, days: { '2026-08-31': 2, '2026-09-01': 1 } } }
    expect(pickHighlights(source(plays), '2026-09-02').active).toBe(flat)
  })

  it('names the lowest world record as the easiest to beat', () => {
    const records = { [tetris]: 43713, [flat]: 45702, [mania]: 7145, [control]: 12706 }
    const picked = pickHighlights(source({}, records), TODAY)
    expect(picked.beatable).toBe(mania)
    expect(picked.beatableScore).toBe(7145)
  })

  it('does not call a lone board the easiest', () => {
    expect(pickHighlights(source({}, { [mania]: 7145 }), TODAY).beatable).toBeUndefined()
  })

  it('ignores custom pits and junk-shaped tallies', () => {
    const plays = {
      'FLAT-7x7x18-a2': { total: 999 },
      [tetris]: { total: 'lots' as unknown as number, days: { [TODAY]: 'many' as unknown as number } },
      [flat]: { total: 6 },
      [mania]: null,
    }
    expect(pickHighlights(source(plays), TODAY)).toEqual({ popular: flat })
  })
})

describe('badgeLabels', () => {
  it('stacks several badges on one preset', () => {
    const labels = badgeLabels({ popular: tetris, active: tetris, beatable: mania, beatableScore: 7145 })
    expect(labels[tetris]!.map((b) => b.text)).toEqual(['Most popular', 'Most active'])
    expect(labels[mania]!.map((b) => b.text)).toEqual(['Easiest record to beat · 7,145'])
    expect(labels[flat]).toBeUndefined()
  })
})
