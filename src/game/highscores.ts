import type { Setup } from './sets'

// The original keeps a separate high score list per pit-and-set combination,
// which is the only honest way to do it: a 3x3x10 score and a 5x5x18 score are
// not comparable, and the scoring constants explicitly differ by depth.

export interface ScoreEntry {
  readonly score: number
  readonly level: number
  readonly layers: number
  readonly cubes: number
  /** ISO timestamp, passed in rather than read from the clock, so it's testable. */
  readonly at: string
}

export const MAX_ENTRIES = 10

// The `-a2` suffix marks the area-scored era (2026-08-21): non-5x5 pits now
// pay proportionally to their cross-section, so their old boards are in a
// different currency and stay frozen under the unsuffixed key. 5x5 scores
// are bit-identical before and after, so those boards keep their history.
export const setupKey = (setup: Setup): string =>
  `${setup.set}-${setup.width}x${setup.height}x${setup.depth}` +
  (setup.width * setup.height === 25 ? '' : '-a2')

/** Highest first; ties broken by the older run, which got there first. */
export const addEntry = (
  entries: readonly ScoreEntry[],
  entry: ScoreEntry,
  limit = MAX_ENTRIES,
): ScoreEntry[] =>
  [...entries, entry]
    .sort((a, b) => (b.score - a.score) || (Date.parse(a.at) - Date.parse(b.at)))
    .slice(0, limit)

export const isHighScore = (
  entries: readonly ScoreEntry[],
  score: number,
  limit = MAX_ENTRIES,
): boolean => {
  if (score <= 0) return false
  if (entries.length < limit) return true
  return entries.some((entry) => score > entry.score)
}

export const bestOf = (entries: readonly ScoreEntry[]): number =>
  entries.reduce((best, entry) => Math.max(best, entry.score), 0)

const STORAGE_PREFIX = '3dblock.scores.'

/**
 * localStorage can throw or be entirely absent - private browsing, a full
 * quota, an embedded webview. None of that should cost you the game you're
 * playing, so every path here degrades to an empty list.
 */
export const loadScores = (setup: Setup): ScoreEntry[] => {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + setupKey(setup))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is ScoreEntry => typeof e === 'object' && e !== null && typeof (e as ScoreEntry).score === 'number',
    )
  } catch {
    return []
  }
}

export const saveScores = (setup: Setup, entries: readonly ScoreEntry[]): void => {
  try {
    localStorage.setItem(STORAGE_PREFIX + setupKey(setup), JSON.stringify(entries))
  } catch {
    // Nothing useful to do: the run still counted on screen.
  }
}

export const recordScore = (setup: Setup, entry: ScoreEntry): ScoreEntry[] => {
  const updated = addEntry(loadScores(setup), entry)
  saveScores(setup, updated)
  return updated
}
