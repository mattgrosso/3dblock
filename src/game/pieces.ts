// The 41 polycubes of BlockOut, with their scoring weights and set membership.
//
// Transcribed from BlockOut II's InitPolyCube.cpp (Jean-Luc Pons, GPLv2+), whose
// own constants were, per its source comments, measured from the original 1989
// game. Coordinates are cube offsets in the piece's own frame: x and y span the
// pit's cross-section, z runs along the fall axis. Every FLAT piece has z === 0
// - that is what makes it flat - and a test pins it.
//
// `high` is the score for a piece hard-dropped from the very top, `low` for one
// that simply landed. See scoring.ts for how they combine.

export interface PieceDef {
  readonly id: number
  readonly cubes: ReadonlyArray<readonly [number, number, number]>
  readonly high: number
  readonly low: number
  readonly flat: boolean
  readonly basic: boolean
}

export const PIECES: readonly PieceDef[] = [
  { id: 0, high: 156, low: 14, flat: true, basic: false, cubes: [[0, 0, 0]] },
  { id: 1, high: 156, low: 14, flat: true, basic: false, cubes: [[0, 0, 0], [0, 1, 0]] },
  { id: 2, high: 307, low: 27, flat: true, basic: false, cubes: [[0, 0, 0], [0, 1, 0], [0, 2, 0]] },
  { id: 3, high: 307, low: 27, flat: false, basic: false, cubes: [[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0]] },
  { id: 4, high: 624, low: 53, flat: false, basic: false, cubes: [[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0], [0, 4, 0]] },
  { id: 5, high: 307, low: 27, flat: true, basic: true, cubes: [[0, 0, 0], [1, 0, 0], [1, 1, 0]] },
  { id: 6, high: 156, low: 14, flat: true, basic: false, cubes: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]] },
  { id: 7, high: 461, low: 40, flat: true, basic: true, cubes: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0]] },
  { id: 8, high: 461, low: 40, flat: true, basic: true, cubes: [[1, 0, 0], [2, 0, 0], [0, 1, 0], [1, 1, 0]] },
  { id: 9, high: 307, low: 27, flat: true, basic: true, cubes: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0]] },
  { id: 10, high: 921, low: 79, flat: false, basic: false, cubes: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0], [2, 2, 0]] },
  { id: 11, high: 921, low: 79, flat: false, basic: false, cubes: [[2, 0, 0], [0, 1, 0], [1, 1, 0], [2, 1, 0], [2, 2, 0]] },
  { id: 12, high: 921, low: 79, flat: false, basic: false, cubes: [[2, 0, 0], [0, 1, 0], [1, 1, 0], [2, 1, 0], [1, 2, 0]] },
  { id: 13, high: 921, low: 79, flat: false, basic: false, cubes: [[1, 0, 0], [2, 0, 0], [1, 1, 0], [0, 2, 0], [1, 2, 0]] },
  { id: 14, high: 780, low: 66, flat: false, basic: false, cubes: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0], [2, 2, 0]] },
  { id: 15, high: 780, low: 66, flat: false, basic: false, cubes: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 2, 0], [1, 3, 0]] },
  { id: 16, high: 921, low: 79, flat: false, basic: false, cubes: [[1, 0, 0], [0, 1, 0], [1, 1, 0], [1, 2, 0], [1, 3, 0]] },
  { id: 17, high: 1248, low: 105, flat: false, basic: false, cubes: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 2, 0], [0, 2, 0]] },
  { id: 18, high: 461, low: 40, flat: false, basic: false, cubes: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [1, 2, 0]] },
  { id: 19, high: 921, low: 79, flat: false, basic: false, cubes: [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0]] },
  { id: 20, high: 1402, low: 118, flat: false, basic: false, cubes: [[1, 0, 0], [0, 1, 0], [1, 1, 0], [2, 1, 0], [1, 2, 0]] },
  { id: 21, high: 1379, low: 131, flat: false, basic: false, cubes: [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [1, 2, 1]] },
  { id: 22, high: 1379, low: 131, flat: false, basic: false, cubes: [[1, 0, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [0, 2, 1]] },
  { id: 23, high: 965, low: 92, flat: false, basic: false, cubes: [[0, 1, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1], [1, 2, 1]] },
  { id: 24, high: 965, low: 92, flat: false, basic: false, cubes: [[1, 1, 0], [1, 0, 1], [1, 1, 1], [1, 2, 1], [0, 2, 1]] },
  { id: 25, high: 965, low: 92, flat: false, basic: false, cubes: [[1, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [1, 2, 1]] },
  { id: 26, high: 1379, low: 131, flat: false, basic: false, cubes: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 2, 1]] },
  { id: 27, high: 1379, low: 131, flat: false, basic: false, cubes: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 2, 1]] },
  { id: 28, high: 1103, low: 105, flat: false, basic: false, cubes: [[1, 1, 0], [1, 2, 0], [0, 0, 1], [0, 1, 1], [1, 1, 1]] },
  { id: 29, high: 1103, low: 105, flat: false, basic: false, cubes: [[0, 1, 0], [0, 2, 0], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { id: 30, high: 1379, low: 131, flat: false, basic: false, cubes: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 2, 1], [0, 2, 1]] },
  { id: 31, high: 1379, low: 131, flat: false, basic: false, cubes: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 2, 1], [1, 2, 1]] },
  { id: 32, high: 552, low: 53, flat: false, basic: true, cubes: [[1, 0, 0], [1, 0, 1], [0, 0, 1], [0, 1, 1]] },
  { id: 33, high: 552, low: 53, flat: false, basic: true, cubes: [[1, 0, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1]] },
  { id: 34, high: 552, low: 53, flat: false, basic: true, cubes: [[1, 0, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1]] },
  { id: 35, high: 827, low: 79, flat: false, basic: false, cubes: [[1, 1, 0], [0, 1, 1], [1, 1, 1], [1, 0, 1], [1, 2, 1]] },
  { id: 36, high: 461, low: 40, flat: false, basic: false, cubes: [[1, 0, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]] },
  { id: 37, high: 1103, low: 105, flat: false, basic: false, cubes: [[1, 0, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [1, 2, 1]] },
  { id: 38, high: 1103, low: 105, flat: false, basic: false, cubes: [[1, 0, 0], [1, 1, 0], [0, 1, 1], [1, 1, 1], [1, 2, 1]] },
  { id: 39, high: 1103, low: 105, flat: false, basic: false, cubes: [[1, 1, 0], [1, 2, 0], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { id: 40, high: 1379, low: 131, flat: false, basic: false, cubes: [[0, 0, 0], [1, 1, 0], [0, 0, 1], [0, 1, 1], [1, 1, 1]] },
]
