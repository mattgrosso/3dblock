import type { Cube } from './rotation'

// The well. x and y span the opening, z runs away from the player: z === 0 is
// the mouth of the pit, z === depth - 1 is the floor. Pieces fall towards
// increasing z, which is why "down" in this file never means -y.

export const EMPTY = 0

export interface Placement {
  readonly cubes: readonly Cube[]
  readonly x: number
  readonly y: number
  readonly z: number
}

export class Pit {
  readonly width: number
  readonly height: number
  readonly depth: number
  // Cell values are 0 for empty, otherwise the id of the piece that filled it,
  // offset by 1 so that colours survive a layer collapse.
  private cells: Int8Array

  constructor(width: number, height: number, depth: number) {
    this.width = width
    this.height = height
    this.depth = depth
    this.cells = new Int8Array(width * height * depth)
  }

  private index(x: number, y: number, z: number): number {
    return x + y * this.width + z * this.width * this.height
  }

  at(x: number, y: number, z: number): number {
    return this.cells[this.index(x, y, z)] ?? EMPTY
  }

  set(x: number, y: number, z: number, value: number): void {
    this.cells[this.index(x, y, z)] = value
  }

  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height && z >= 0 && z < this.depth
  }

  /** True if the placement is off the walls, through the floor, or overlapping. */
  collides(p: Placement): boolean {
    return p.cubes.some(([cx, cy, cz]) => {
      const x = p.x + cx
      const y = p.y + cy
      const z = p.z + cz
      if (!this.inside(x, y, z)) return true
      return this.at(x, y, z) !== EMPTY
    })
  }

  /**
   * How far this placement would have to shift, per axis, to bring every cube
   * back inside the walls. Each axis takes the largest push any single cube
   * needs; axes that are already fine stay zero.
   *
   * This is the original's rotation kick. When a rotation puts a piece through
   * a wall or the floor, BlockOut doesn't search for somewhere that fits - it
   * computes exactly this displacement, tries it once, and gives up if that
   * still doesn't work. Note it includes z, so a piece rotating into the floor
   * gets lifted rather than refused.
   */
  outOfBoundsShift(p: Placement): [number, number, number] {
    let sx = 0
    let sy = 0
    let sz = 0

    const widen = (value: number, current: number): number =>
      Math.abs(value) > Math.abs(current) ? value : current

    for (const [cx, cy, cz] of p.cubes) {
      const x = p.x + cx
      const y = p.y + cy
      const z = p.z + cz
      if (x < 0) sx = widen(-x, sx)
      else if (x >= this.width) sx = widen(this.width - x - 1, sx)
      if (y < 0) sy = widen(-y, sy)
      else if (y >= this.height) sy = widen(this.height - y - 1, sy)
      if (z < 0) sz = widen(-z, sz)
      else if (z >= this.depth) sz = widen(this.depth - z - 1, sz)
    }
    return [sx, sy, sz]
  }

  lock(p: Placement, value: number): void {
    for (const [cx, cy, cz] of p.cubes) {
      const x = p.x + cx
      const y = p.y + cy
      const z = p.z + cz
      if (this.inside(x, y, z)) this.set(x, y, z, value)
    }
  }

  isLayerFull(z: number): boolean {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (this.at(x, y, z) === EMPTY) return false
      }
    }
    return true
  }

  fullLayers(): number[] {
    const full: number[] = []
    for (let z = 0; z < this.depth; z += 1) if (this.isLayerFull(z)) full.push(z)
    return full
  }

  /**
   * Remove the given layers; everything above them slides down the pit.
   *
   * Order matters. Collapsing layer z shifts every layer above it - that is,
   * every *smaller* z - down by one, while layers below it don't move. So the
   * layers are cleared smallest z first: each collapse only disturbs indices
   * that have already been dealt with, leaving the ones still to come valid.
   * Going the other way silently clears the wrong layers when a piece completes
   * two at once.
   */
  clearLayers(layers: readonly number[]): void {
    for (const z of [...layers].sort((a, b) => a - b)) {
      for (let zz = z; zz > 0; zz -= 1) {
        for (let y = 0; y < this.height; y += 1) {
          for (let x = 0; x < this.width; x += 1) {
            this.set(x, y, zz, this.at(x, y, zz - 1))
          }
        }
      }
      for (let y = 0; y < this.height; y += 1) {
        for (let x = 0; x < this.width; x += 1) this.set(x, y, 0, EMPTY)
      }
    }
  }

  isEmpty(): boolean {
    return this.cells.every((c) => c === EMPTY)
  }

  /** Every filled cell, for the renderer. */
  *filled(): Generator<{ x: number; y: number; z: number; value: number }> {
    for (let z = 0; z < this.depth; z += 1) {
      for (let y = 0; y < this.height; y += 1) {
        for (let x = 0; x < this.width; x += 1) {
          const value = this.at(x, y, z)
          if (value !== EMPTY) yield { x, y, z, value }
        }
      }
    }
  }

  /** How far a placement can fall before it would hit something. */
  dropDistance(p: Placement): number {
    let distance = 0
    while (!this.collides({ ...p, z: p.z + distance + 1 })) distance += 1
    return distance
  }

  reset(): void {
    this.cells = new Int8Array(this.width * this.height * this.depth)
  }
}
