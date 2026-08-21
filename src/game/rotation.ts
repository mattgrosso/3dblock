export type Cube = readonly [number, number, number]
export type Axis = 'x' | 'y' | 'z'
export type Turn = 1 | -1

// Quarter turns on integer coordinates. Doing this with integers rather than a
// float rotation matrix matters: a piece can be rotated thousands of times in a
// game, and floating point would drift until cubes stopped landing on the grid.
const turn = (c: Cube, axis: Axis, dir: Turn): Cube => {
  const [x, y, z] = c
  if (axis === 'x') return dir === 1 ? [x, -z, y] : [x, z, -y]
  if (axis === 'y') return dir === 1 ? [z, y, -x] : [-z, y, x]
  return dir === 1 ? [-y, x, z] : [y, -x, z]
}

// Pieces are defined in the positive octant and kept there, so a piece's
// position in the pit is always the position of its bounding box corner.
export const normalize = (cubes: readonly Cube[]): Cube[] => {
  const minX = Math.min(...cubes.map((c) => c[0]))
  const minY = Math.min(...cubes.map((c) => c[1]))
  const minZ = Math.min(...cubes.map((c) => c[2]))
  return cubes.map((c) => [c[0] - minX, c[1] - minY, c[2] - minZ])
}

export const rotate = (cubes: readonly Cube[], axis: Axis, dir: Turn): Cube[] =>
  normalize(cubes.map((c) => turn(c, axis, dir)))

export interface Extent {
  readonly width: number
  readonly height: number
  readonly depth: number
}

export const extentOf = (cubes: readonly Cube[]): Extent => ({
  width: Math.max(...cubes.map((c) => c[0])) + 1,
  height: Math.max(...cubes.map((c) => c[1])) + 1,
  depth: Math.max(...cubes.map((c) => c[2])) + 1,
})

// A rotation-independent fingerprint, used to compare shapes and to count how
// many distinct orientations a piece actually has.
export const shapeKey = (cubes: readonly Cube[]): string =>
  normalize(cubes)
    .map((c) => c.join(','))
    .sort()
    .join('|')

export const orientationsOf = (cubes: readonly Cube[]): Cube[][] => {
  const seen = new Map<string, Cube[]>()
  const queue: Cube[][] = [normalize(cubes)]
  seen.set(shapeKey(cubes), queue[0]!)

  while (queue.length) {
    const current = queue.pop()!
    for (const axis of ['x', 'y', 'z'] as const) {
      for (const dir of [1, -1] as const) {
        const next = rotate(current, axis, dir)
        const key = shapeKey(next)
        if (!seen.has(key)) {
          seen.set(key, next)
          queue.push(next)
        }
      }
    }
  }
  return [...seen.values()]
}
