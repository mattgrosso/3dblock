import { SETUPS, type Setup } from './sets'
import { setupKey } from './highscores'
import { withAuth } from '../lib/anonAuth'

// Which preset should you pick? (bug report 2026-09-02: "It would be cool if
// the start screen highlighted some categories. Like it could indicate which
// one is most popular, which one is most active, which one has the most
// achievable high score.")
//
// The leaderboard can't answer the first two: it only ever sees runs good
// enough for a top ten. So every game that gets as far as landing a piece
// bumps a counter here - `blockoutPlays/<setupKey>/total` for all time and
// `.../days/<YYYY-MM-DD>` for recency - via the database's server-side
// increment, so two players finishing at once don't lose a count. The rules
// pin each write to exactly +1. Only the named presets are counted; a custom
// pit has no button to put a badge on.
//
// The third badge comes straight off the world boards: one top entry per
// preset, which is one tiny indexed read each.

const BASE = 'https://thunderstoner-876f8-default-rtdb.firebaseio.com'

export interface PlayTally {
  readonly total?: number
  readonly days?: Readonly<Record<string, number>>
}

/** What the start screen reads: tallies and #1 scores, both by setupKey. */
export interface HighlightSource {
  readonly plays: Readonly<Record<string, PlayTally | null | undefined>>
  readonly records: Readonly<Record<string, number | undefined>>
}

/** Each field is a setupKey, or absent when there isn't enough to say. */
export interface Highlights {
  readonly popular?: string
  readonly active?: string
  readonly beatable?: string
  /** The record itself, so the badge can say what there is to beat. */
  readonly beatableScore?: number
}

/** Badges appear only once the numbers mean something. */
export const MIN_POPULAR = 5
export const MIN_ACTIVE = 3
export const ACTIVE_DAYS = 7

/** Local calendar date, the way the player experiences "today". */
export const dayKey = (date: Date): string => {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const recentDays = (today: string): Set<string> => {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number]
  const keys = new Set<string>()
  for (let i = 0; i < ACTIVE_DAYS; i++) {
    keys.add(dayKey(new Date(y, m - 1, d - i)))
  }
  return keys
}

/** The key whose value is strictly the best, or undefined on a tie. */
const unique = (
  scored: readonly (readonly [string, number])[],
  better: (a: number, b: number) => boolean,
): string | undefined => {
  let best: readonly [string, number] | undefined
  let tied = false
  for (const entry of scored) {
    if (!best || better(entry[1], best[1])) { best = entry; tied = false }
    else if (entry[1] === best[1]) tied = true
  }
  return best && !tied ? best[0] : undefined
}

/**
 * Pure, so it can be tested against made-up tallies. `today` is a dayKey.
 *
 * - popular: the most games ever, all time.
 * - active: the most games in the last ACTIVE_DAYS days, today included.
 * - beatable: the lowest world #1 score - the record that takes the least to
 *   take. The presets score in different currencies (depth and pit area both
 *   change the payout), so this is "smallest number to beat", not "easiest
 *   game"; the badge shows the number so nobody has to guess what it means.
 *
 * Each needs a clear winner: a tie says nothing, so it shows nothing.
 */
export const pickHighlights = (
  source: HighlightSource,
  today: string,
  setups: readonly Setup[] = SETUPS,
): Highlights => {
  const keys = setups.map(setupKey)
  const recent = recentDays(today)

  const totals = keys.map((k) => [k, Number(source.plays[k]?.total) || 0] as const)
  const actives = keys.map((k) => {
    const days = source.plays[k]?.days ?? {}
    const n = Object.entries(days).reduce((sum, [day, count]) => sum + (recent.has(day) ? Number(count) || 0 : 0), 0)
    return [k, n] as const
  })
  const records = keys
    .map((k) => [k, source.records[k]] as const)
    .filter((e): e is readonly [string, number] => typeof e[1] === 'number' && e[1] > 0)

  const popular = unique(totals.filter((e) => e[1] >= MIN_POPULAR), (a, b) => a > b)
  const active = unique(actives.filter((e) => e[1] >= MIN_ACTIVE), (a, b) => a > b)
  // One board alone isn't "easiest to beat", it's just the only one.
  const beatable = records.length >= 2 ? unique(records, (a, b) => a < b) : undefined

  const result: { popular?: string; active?: string; beatable?: string; beatableScore?: number } = {}
  if (popular) result.popular = popular
  if (active) result.active = active
  if (beatable) {
    result.beatable = beatable
    result.beatableScore = records.find((e) => e[0] === beatable)![1]
  }
  return result
}

const isPreset = (setup: Setup): boolean => SETUPS.some((s) => setupKey(s) === setupKey(setup))

/**
 * One game, counted. Fire-and-forget: a lost count is a rounding error, and
 * nothing about the game in progress should wait on the network.
 */
export const recordPlay = async (setup: Setup, now = new Date()): Promise<void> => {
  if (!isPreset(setup)) return
  const bump = { '.sv': { increment: 1 } }
  await fetch(await withAuth(`${BASE}/blockoutPlays/${encodeURIComponent(setupKey(setup))}.json`), {
    method: 'PATCH',
    body: JSON.stringify({ total: bump, [`days/${dayKey(now)}`]: bump }),
  })
}

const topScore = async (setup: Setup): Promise<number | undefined> => {
  const key = encodeURIComponent(setupKey(setup))
  const response = await fetch(await withAuth(`${BASE}/blockoutScores/${key}.json?orderBy=%22score%22&limitToLast=1`))
  if (!response.ok) return undefined
  const raw = (await response.json() ?? {}) as Record<string, { score?: unknown }>
  const scores = Object.values(raw).map((e) => e?.score).filter((s): s is number => typeof s === 'number')
  return scores.length ? Math.max(...scores) : undefined
}

// The setup screen opens on every Esc; the numbers don't move that fast.
const CACHE_MS = 5 * 60 * 1000
let cached: { at: number; value: Highlights } | null = null

/** The badges for the start screen; empty when offline or refused. */
export const fetchHighlights = async (now = new Date()): Promise<Highlights> => {
  if (cached && now.getTime() - cached.at < CACHE_MS) return cached.value
  try {
    const [playsResponse, ...tops] = await Promise.all([
      fetch(await withAuth(`${BASE}/blockoutPlays.json`)),
      ...SETUPS.map(topScore),
    ])
    const plays = playsResponse.ok ? ((await playsResponse.json() ?? {}) as HighlightSource['plays']) : {}
    const records: Record<string, number | undefined> = {}
    SETUPS.forEach((s, i) => { records[setupKey(s)] = tops[i] })
    const value = pickHighlights({ plays, records }, dayKey(now))
    cached = { at: now.getTime(), value }
    return value
  } catch {
    return {}
  }
}
