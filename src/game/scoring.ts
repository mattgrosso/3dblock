import { blockSetIndex, type BlockSet } from './sets'
import type { PieceDef } from './pieces'

// BlockOut's scoring, constant for constant.
//
// These factors come from BlockOut II's Game.cpp, where the source notes they
// were "coming from measurements made with the original BlockOut game" - so
// they are the 1989 behaviour, recovered, not an approximation of it. Verified
// against the community score calculator: FLAT, 5x5x12, level 0, one line ->
// 762.5 * 0.096478 * 1.0 * 0.852564 = 62.7, rounding to the 63 it reports.

const PIECE_LEVEL_FACTOR = [
  0.06699, 0.139195, 0.2198, 0.308444, 0.403897,
  0.507822, 0.619062, 0.73863, 0.865802, 1.0,
  1.133333,
] as const

const LINE_LEVEL_FACTOR = [
  0.096478, 0.163873, 0.242913, 0.328261, 0.422329,
  0.518394, 0.630405, 0.747501, 0.867087, 1.0,
  1.131653,
] as const

// Indexed by number of layers cleared at once, so index 0 is unused. Clearing
// several at once pays far more than the same layers cleared separately.
const LINE_COUNT_FACTOR = [0.0, 1.0, 3.703372, 8.104827, 14.188325, 22.144941] as const

// Indexed by pit depth, so the first six slots are padding - the shallowest
// legal pit is 6. A shallow pit is worth more because it is harder.
const DEPTH_FACTOR = [
  0, 0, 0, 0, 0, 0,
  1.557692, 1.367521, 1.217949, 1.100427, 1.0,
  0.918803, 0.852564, 0.788996, 0.737714, 0.691774,
  0.651709, 0.61485, 0.583868,
] as const

// The first three are the original's FLAT / BASIC / EXTENDED bases. TETRIS is
// ours: it plays like FLAT without the one- to three-cube freebies, so it pays
// the FLAT rate rather than inventing a new constant.
const LINE_BASE = [762.5, 875.5, 2886.25, 762.5] as const

export const MAX_LEVEL = 10

/** Emptying the pit completely pays the same as clearing two layers at once. */
export const FLUSH_BONUS_LAYERS = 2

/**
 * OUR ONE DELIBERATE DEPARTURE from the measured 1989 scoring (besides the
 * TETRIS set): the original pays the same for a 3x3x12 layer as a 5x5x12
 * layer, even though the second takes nearly three times the cubes to fill.
 * Matt's call (bug report, 2026-08-21): cross-section should matter. Linear
 * in area, normalised to the classic 5x5 - so every 5x5 score, including all
 * the published-table checks below, is bit-identical to the original.
 */
export const AREA_REFERENCE = 25

export const areaFactor = (width: number, height: number): number =>
  (width * height) / AREA_REFERENCE

export interface ScoreInput {
  readonly piece: PieceDef
  readonly set: BlockSet
  readonly level: number
  readonly width: number
  readonly height: number
  readonly depth: number
  /** Layers cleared by this piece. */
  readonly layersCleared: number
  /** Did the player hard-drop it? Only then does drop height count. */
  readonly dropped: boolean
  /**
   * How far above the floor the piece was when the drop began, in cells.
   * Ignored unless `dropped`.
   */
  readonly dropPosition: number
  readonly pitEmptied: boolean
}

const clampLevel = (level: number): number => Math.max(0, Math.min(MAX_LEVEL, level))

/**
 * Just the layer-clearing part of the score, with no piece contribution.
 *
 * This is the number the published BlockOut II score tables report, which makes
 * it the one value that can be checked against an outside source - so it's
 * exported and tested directly rather than only existing inside scoreFor.
 */
export const lineComponent = (
  set: BlockSet,
  level: number,
  depth: number,
  layersCleared: number,
  width = 5,
  height = 5,
): number => {
  const lineBase = LINE_BASE[blockSetIndex(set)] ?? LINE_BASE[0]
  const layers = Math.min(layersCleared, LINE_COUNT_FACTOR.length - 1)
  const raw =
    lineBase *
    (LINE_LEVEL_FACTOR[clampLevel(level)] ?? 0) *
    (LINE_COUNT_FACTOR[layers] ?? 0) *
    (DEPTH_FACTOR[depth] ?? 0) *
    areaFactor(width, height)
  return Math.round(raw)
}

export const scoreFor = (input: ScoreInput): number => {
  const level = clampLevel(input.level)
  const setIndex = blockSetIndex(input.set)
  const lineBase = LINE_BASE[setIndex] ?? LINE_BASE[0]
  const depthFactor = DEPTH_FACTOR[input.depth] ?? 0

  // Letting a piece fall on its own scores the low value however high it
  // started; the bonus is for committing to a drop.
  const position = input.dropped ? Math.max(0, input.dropPosition) : 0
  const fraction = input.depth > 1 ? position / (input.depth - 1) : 0
  const pieceScore =
    (input.piece.low + (input.piece.high - input.piece.low) * fraction) *
    (PIECE_LEVEL_FACTOR[level] ?? 0)

  const layers = Math.min(input.layersCleared, LINE_COUNT_FACTOR.length - 1)
  const lineScore =
    lineBase * (LINE_LEVEL_FACTOR[level] ?? 0) * (LINE_COUNT_FACTOR[layers] ?? 0)

  const flushScore = input.pitEmptied
    ? lineBase * (LINE_LEVEL_FACTOR[level] ?? 0) * (LINE_COUNT_FACTOR[FLUSH_BONUS_LAYERS] ?? 0)
    : 0

  const total =
    (lineScore + pieceScore + flushScore) * depthFactor * areaFactor(input.width, input.height)
  // Every locked piece is worth at least a point, however deep the pit.
  return Math.max(1, Math.round(total))
}

// Falling speed. The piece steps down every `stepTime` seconds, and each level
// multiplies that by 0.64 - so level 10 falls about 60x faster than level 0.
const TIME_BASE = 5.51
const TIME_LEVEL_FACTOR = 0.64

export const stepTimeFor = (level: number): number =>
  TIME_BASE * TIME_LEVEL_FACTOR ** clampLevel(level)

/** Cubes that must be played per level before the game speeds up. */
export const cubesPerLevel = (width: number, height: number): number => height * 15 + width * 15

/**
 * The original promotes from level L when cubesPlayed reaches
 * cubesPerLevel * (L + 1) - the threshold is tied to the level you're on, not
 * to how many promotions you've had. So starting high doesn't shorten the
 * climb: it's max(), not startLevel + progress.
 */
export const levelFor = (
  startLevel: number,
  cubesPlayed: number,
  width: number,
  height: number,
): number =>
  clampLevel(Math.max(startLevel, Math.floor(cubesPlayed / cubesPerLevel(width, height))))
