import { PIECES, type PieceDef } from './pieces'

// The three block sets, in the order BlockOut numbers them - the order matters,
// because the scoring constants are indexed by it.
export const BLOCK_SETS = ['FLAT', 'BASIC', 'EXTENDED'] as const
export type BlockSet = (typeof BLOCK_SETS)[number]

export const piecesIn = (set: BlockSet): readonly PieceDef[] => {
  if (set === 'FLAT') return PIECES.filter((p) => p.flat)
  if (set === 'BASIC') return PIECES.filter((p) => p.basic)
  return PIECES
}

export const blockSetIndex = (set: BlockSet): number => BLOCK_SETS.indexOf(set)

// The three setups BlockOut II scores against, kept as named presets so a high
// score always refers to a known configuration.
export interface Setup {
  readonly name: string
  readonly set: BlockSet
  readonly width: number
  readonly height: number
  readonly depth: number
}

export const SETUPS: readonly Setup[] = [
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
