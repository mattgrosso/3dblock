import { PIECES, type PieceDef } from './pieces'

// The original's three block sets in the order BlockOut numbers them, plus our
// own TETRIS set appended after - appended, not inserted, because the scoring
// constants are indexed by this order and the first three must keep theirs.
export const BLOCK_SETS = ['FLAT', 'BASIC', 'EXTENDED', 'TETRIS'] as const
export type BlockSet = (typeof BLOCK_SETS)[number]

// The one-cube-thick four-cube pieces: the classic tetrominoes. Under free 3D
// rotation S/Z are the same piece and so are L/J - flipping over is just a
// rotation out of the plane - so there are five, not seven.
const TETROMINO_IDS = new Set([3, 6, 7, 8, 9])

export const piecesIn = (set: BlockSet): readonly PieceDef[] => {
  if (set === 'FLAT') return PIECES.filter((p) => p.flat)
  if (set === 'BASIC') return PIECES.filter((p) => p.basic)
  if (set === 'TETRIS') return PIECES.filter((p) => TETROMINO_IDS.has(p.id))
  return PIECES
}

export const blockSetIndex = (set: BlockSet): number => BLOCK_SETS.indexOf(set)

// The three setups BlockOut II scores against plus a Tetris one of our own,
// kept as named presets so a high score always refers to a known configuration.
export interface Setup {
  readonly name: string
  readonly set: BlockSet
  readonly width: number
  readonly height: number
  readonly depth: number
}

export const SETUPS: readonly Setup[] = [
  // First because it's the default: the familiar game, before the deep cuts.
  { name: 'Tetris', set: 'TETRIS', width: 5, height: 5, depth: 12 },
  { name: 'Flat Fun', set: 'FLAT', width: 5, height: 5, depth: 12 },
  { name: '3D Mania', set: 'BASIC', width: 3, height: 3, depth: 10 },
  { name: 'Out of Control', set: 'EXTENDED', width: 5, height: 5, depth: 10 },
]

// The original allows anything in these ranges; the scoring tables are only
// defined over them, so they're limits rather than suggestions.
export const PIT_LIMITS = {
  minSide: 3,
  maxSide: 7,
  minDepth: 6,
  maxDepth: 18,
} as const
