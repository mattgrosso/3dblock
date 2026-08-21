import { describe, it, expect } from 'vitest'
import { extentOf, normalize, orientationsOf, rotate, shapeKey, type Cube } from '../src/game/rotation'
import { PIECES } from '../src/game/pieces'
import { piecesIn } from '../src/game/sets'

const cubesOf = (id: number): Cube[] => PIECES[id]!.cubes.map((c) => [...c] as unknown as Cube)

describe('rotate', () => {
  it('returns a piece to itself after four quarter turns', () => {
    for (const piece of PIECES) {
      for (const axis of ['x', 'y', 'z'] as const) {
        let shape = piece.cubes.map((c) => [...c] as unknown as Cube)
        const start = shapeKey(shape)
        for (let i = 0; i < 4; i += 1) shape = rotate(shape, axis, 1)
        expect(shapeKey(shape)).toBe(start)
      }
    }
  })

  it('undoes itself when turned back the other way', () => {
    for (const piece of PIECES) {
      for (const axis of ['x', 'y', 'z'] as const) {
        const shape = piece.cubes.map((c) => [...c] as unknown as Cube)
        expect(shapeKey(rotate(rotate(shape, axis, 1), axis, -1))).toBe(shapeKey(shape))
      }
    }
  })

  it('never loses or gains a cube', () => {
    for (const piece of PIECES) {
      const shape = rotate(rotate(cubesOf(piece.id), 'x', 1), 'z', -1)
      expect(shape).toHaveLength(piece.cubes.length)
      expect(new Set(shape.map((c) => c.join(','))).size).toBe(piece.cubes.length)
    }
  })

  // Integer-only rotation is the whole point: after a long sequence every cube
  // must still be exactly on the lattice, with no accumulated drift.
  it('keeps coordinates exact over a long sequence of turns', () => {
    let shape = cubesOf(40)
    const axes = ['x', 'y', 'z'] as const
    for (let i = 0; i < 500; i += 1) {
      shape = rotate(shape, axes[i % 3]!, i % 2 === 0 ? 1 : -1)
    }
    for (const c of shape) {
      for (const v of c) expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('turns a vertical bar into a horizontal one around z', () => {
    const bar: Cube[] = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 2, 0],
    ]
    expect(shapeKey(rotate(bar, 'z', 1))).toBe(shapeKey([[0, 0, 0], [1, 0, 0], [2, 0, 0]]))
  })
})

describe('normalize', () => {
  it('moves a shape into the positive octant without changing it', () => {
    const shifted: Cube[] = [
      [-3, 2, -1],
      [-3, 3, -1],
    ]
    expect(normalize(shifted)).toEqual([
      [0, 0, 0],
      [0, 1, 0],
    ])
  })
})

describe('extentOf', () => {
  it('measures the bounding box', () => {
    expect(extentOf([[0, 0, 0], [1, 0, 0], [1, 2, 3]])).toEqual({ width: 2, height: 3, depth: 4 })
  })
})

describe('the piece data itself', () => {
  it('has all 41 polycubes with the documented set sizes', () => {
    expect(PIECES).toHaveLength(41)
    expect(piecesIn('FLAT')).toHaveLength(8)
    expect(piecesIn('BASIC')).toHaveLength(7)
    expect(piecesIn('EXTENDED')).toHaveLength(41)
    expect(piecesIn('TETRIS')).toHaveLength(5)
  })

  // What makes the flat set flat. If this ever fails, a piece was mis-copied.
  it('keeps every FLAT piece one cube thick', () => {
    for (const piece of piecesIn('FLAT')) {
      expect(extentOf(piece.cubes).depth).toBe(1)
    }
  })

  // What makes the Tetris set Tetris: exactly the one-thick four-cube pieces.
  // Five, not seven - S/Z and L/J are the same piece once you can rotate out
  // of the plane. No single cube, no bars shorter than four.
  it('keeps every TETRIS piece a four-cube tetromino', () => {
    for (const piece of piecesIn('TETRIS')) {
      expect(piece.cubes).toHaveLength(4)
      expect(extentOf(piece.cubes).depth).toBe(1)
    }
  })

  it('defines every piece in the positive octant with no repeated cube', () => {
    for (const piece of PIECES) {
      expect(new Set(piece.cubes.map((c) => c.join(','))).size).toBe(piece.cubes.length)
      for (const c of piece.cubes) for (const v of c) expect(v).toBeGreaterThanOrEqual(0)
    }
  })

  it('is made of 1 to 5 cubes, and scores more for being dropped', () => {
    for (const piece of PIECES) {
      expect(piece.cubes.length).toBeGreaterThanOrEqual(1)
      expect(piece.cubes.length).toBeLessThanOrEqual(5)
      expect(piece.high).toBeGreaterThanOrEqual(piece.low)
    }
  })

  // Pieces run up to five cubes long, so plenty of them are too big for a 3x3
  // mouth as defined. What has to hold is that each one can always be *turned*
  // to fit - a long bar stands on end and goes down the pit. Without this the
  // smallest legal pit would deal unplayable pieces.
  it('can always be turned to fit the smallest legal pit', () => {
    for (const piece of PIECES) {
      const fits = orientationsOf(piece.cubes).some((shape) => {
        const size = extentOf(shape)
        return size.width <= 3 && size.height <= 3
      })
      expect(fits, `piece ${piece.id} cannot fit a 3x3 mouth`).toBe(true)
    }
  })
})

describe('orientationsOf', () => {
  it('finds one orientation for a single cube', () => {
    expect(orientationsOf([[0, 0, 0]])).toHaveLength(1)
  })

  it('finds three for a straight bar - one per axis', () => {
    expect(orientationsOf([[0, 0, 0], [0, 1, 0], [0, 2, 0]])).toHaveLength(3)
  })

  it('never exceeds the 24 rotations of a cube', () => {
    for (const piece of PIECES) {
      expect(orientationsOf(piece.cubes).length).toBeLessThanOrEqual(24)
    }
  })
})
