import { setupKey } from './highscores'
import type { Setup } from './sets'

// The global leaderboard (bug report: "We need leader boards and high
// scores"). Local per-setup high scores already existed; this is the shared
// board — one list per setup, because a 3x3x10 score and a 5x5x18 score are
// not comparable and the scoring constants explicitly differ by depth.
//
// Backed by the games hub's Firebase project over plain REST, the same
// SDK-free arrangement as bug reports: the `blockoutScores` node is public
// to read (names and numbers, nothing else), push-only to write, validated
// and score-indexed by the rules in the thunder repo's database.rules.json.

const BASE = 'https://thunderstoner-876f8-default-rtdb.firebaseio.com/blockoutScores'

export const TOP_LIMIT = 10
export const NAME_LIMIT = 20

export interface GlobalEntry {
  readonly name: string
  readonly score: number
  readonly level: number
  readonly layers: number
  /** Server timestamp, ms. */
  readonly at: number
}

/** What the database hands back, tamed: highest first, junk dropped. */
export const toBoard = (raw: unknown): GlobalEntry[] =>
  Object.values((raw ?? {}) as Record<string, Partial<GlobalEntry>>)
    .filter((e): e is GlobalEntry => typeof e?.score === 'number' && typeof e?.name === 'string')
    .map((e) => ({ name: e.name, score: e.score, level: e.level ?? 0, layers: e.layers ?? 0, at: e.at ?? 0 }))
    .sort((a, b) => (b.score - a.score) || (a.at - b.at))

/**
 * Is this run worth posting? Only a score that would actually appear on the
 * board - posting every 90-point game would just be noise in the database.
 */
export const qualifies = (board: readonly GlobalEntry[], score: number): boolean => {
  if (score <= 0) return false
  if (board.length < TOP_LIMIT) return true
  return score > board[board.length - 1]!.score
}

/** Kept to the rules' cap; whitespace-trimmed so "   " can't post. */
export const cleanName = (name: string): string => name.trim().slice(0, NAME_LIMIT)

const url = (setup: Setup, query = ''): string =>
  `${BASE}/${encodeURIComponent(setupKey(setup))}.json${query}`

export async function fetchTop(setup: Setup): Promise<GlobalEntry[]> {
  // A real indexed query - .indexOn ["score"] in the rules is what keeps
  // this from downloading the whole node to answer it.
  const response = await fetch(url(setup, `?orderBy=%22score%22&limitToLast=${TOP_LIMIT}`))
  if (!response.ok) throw new Error(`Leaderboard fetch failed: ${response.status}`)
  return toBoard(await response.json())
}

export async function submitScore(
  setup: Setup,
  entry: { name: string; score: number; level: number; layers: number },
): Promise<void> {
  const response = await fetch(url(setup), {
    method: 'POST',
    body: JSON.stringify({
      name: cleanName(entry.name),
      score: entry.score,
      level: entry.level,
      layers: entry.layers,
      at: { '.sv': 'timestamp' },
    }),
  })
  if (!response.ok) throw new Error(`Score post failed: ${response.status}`)
}

// The name travels between games; nobody wants to type it twice.
const NAME_KEY = '3dblock.playerName'

export const rememberedName = (): string => {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export const rememberName = (name: string): void => {
  try {
    localStorage.setItem(NAME_KEY, cleanName(name))
  } catch {
    // Storage blocked - they'll type it again next time, which is survivable.
  }
}
