import { describe, it, expect } from 'vitest'
import { Pit } from '../src/game/pit'
import { Game } from '../src/game/game'
import type { Cube } from '../src/game/rotation'

const single: Cube[] = [[0, 0, 0]]

const fillLayer = (pit: Pit, z: number, value = 1): void => {
  for (let y = 0; y < pit.height; y += 1) {
    for (let x = 0; x < pit.width; x += 1) pit.set(x, y, z, value)
  }
}

describe('Pit collision', () => {
  it('rejects placements outside the walls or through the floor', () => {
    const pit = new Pit(3, 3, 6)
    expect(pit.collides({ cubes: single, x: -1, y: 0, z: 0 })).toBe(true)
    expect(pit.collides({ cubes: single, x: 3, y: 0, z: 0 })).toBe(true)
    expect(pit.collides({ cubes: single, x: 0, y: 0, z: 6 })).toBe(true)
    expect(pit.collides({ cubes: single, x: 0, y: 0, z: 0 })).toBe(false)
  })

  it('rejects overlapping an occupied cell', () => {
    const pit = new Pit(3, 3, 6)
    pit.set(1, 1, 2, 4)
    expect(pit.collides({ cubes: single, x: 1, y: 1, z: 2 })).toBe(true)
  })

})

describe('Pit layers', () => {
  it('detects a full layer only when every cell is filled', () => {
    const pit = new Pit(3, 3, 6)
    fillLayer(pit, 5)
    expect(pit.isLayerFull(5)).toBe(true)
    pit.set(0, 0, 5, 0)
    expect(pit.isLayerFull(5)).toBe(false)
  })

  it('collapses everything above a cleared layer down by one', () => {
    const pit = new Pit(2, 1, 4)
    pit.set(0, 0, 1, 7) // a lone cube up the pit
    fillLayer(pit, 3) // full floor layer
    pit.clearLayers([3])
    expect(pit.at(0, 0, 2)).toBe(7) // fell one step
    expect(pit.at(0, 0, 1)).toBe(0)
    expect(pit.isLayerFull(3)).toBe(false)
  })

  // Clearing several at once is where an off-by-one would hide: removing a low
  // layer shifts the indices of the ones above it.
  it('clears multiple layers at once without losing what sits between them', () => {
    const pit = new Pit(2, 1, 5)
    fillLayer(pit, 4)
    fillLayer(pit, 2)
    pit.set(0, 0, 3, 9) // a cube sandwiched between the two full layers
    pit.clearLayers([2, 4])
    expect(pit.fullLayers()).toEqual([])
    const survivors = [...pit.filled()]
    expect(survivors).toHaveLength(1)
    expect(survivors[0]).toMatchObject({ value: 9, z: 4 })
  })

  it('reports an empty pit only when nothing is left', () => {
    const pit = new Pit(2, 2, 4)
    expect(pit.isEmpty()).toBe(true)
    pit.set(0, 0, 0, 1)
    expect(pit.isEmpty()).toBe(false)
  })
})

describe('Pit.outOfBoundsShift', () => {
  it('is zero when the piece is entirely inside', () => {
    const pit = new Pit(5, 5, 10)
    expect(pit.outOfBoundsShift({ cubes: single, x: 2, y: 2, z: 2 })).toEqual([0, 0, 0])
  })

  it('pushes back in from each wall', () => {
    const pit = new Pit(5, 5, 10)
    expect(pit.outOfBoundsShift({ cubes: single, x: -2, y: 0, z: 0 })).toEqual([2, 0, 0])
    expect(pit.outOfBoundsShift({ cubes: single, x: 6, y: 0, z: 0 })).toEqual([-2, 0, 0])
    expect(pit.outOfBoundsShift({ cubes: single, x: 0, y: -1, z: 0 })).toEqual([0, 1, 0])
  })

  // z matters as much as x and y: a piece rotated into the floor is lifted
  // back out rather than having the rotation refused.
  it('lifts a piece back out of the floor', () => {
    const pit = new Pit(5, 5, 10)
    expect(pit.outOfBoundsShift({ cubes: single, x: 0, y: 0, z: 11 })).toEqual([0, 0, -2])
  })

  it('takes the largest push any one cube needs, per axis', () => {
    const pit = new Pit(5, 5, 10)
    const bar: Cube[] = [[0, 0, 0], [1, 0, 0], [2, 0, 0]]
    // Cubes land at x = -2, -1, 0; the worst is -2, so the whole piece moves 2.
    expect(pit.outOfBoundsShift({ cubes: bar, x: -2, y: 0, z: 0 })).toEqual([2, 0, 0])
  })
})

describe('Pit.dropDistance', () => {
  it('drops to the floor in an empty pit', () => {
    const pit = new Pit(3, 3, 6)
    expect(pit.dropDistance({ cubes: single, x: 1, y: 1, z: 0 })).toBe(5)
  })

  it('stops on top of the stack', () => {
    const pit = new Pit(3, 3, 6)
    fillLayer(pit, 5)
    expect(pit.dropDistance({ cubes: single, x: 1, y: 1, z: 0 })).toBe(4)
  })

})

describe('Game', () => {
  // Pins piece selection to a known bag index. The size has to be passed in:
  // Game picks with floor(random() * bag.length), so a fraction that lands on
  // index 2 in an 8-piece bag lands somewhere else entirely in a 41-piece one.
  const FLAT_BAG = 8
  const always = (index: number, bagSize = FLAT_BAG) => () => (index + 0.5) / bagSize
  // Bag index 2 of the FLAT set is the three-cube bar - long enough that
  // rotating it near a wall actually needs a kick.
  const BAR = 2

  it('starts playable with a piece in the top layer of the pit', () => {
    const game = new Game({ name: 't', set: 'FLAT', width: 5, height: 5, depth: 12 })
    expect(game.phase).toBe('playing')
    expect(game.piece.z).toBe(0)
    expect(game.score).toBe(0)
  })

  it('locks a piece at the floor and spawns the next', () => {
    const game = new Game({ name: 't', set: 'FLAT', width: 3, height: 3, depth: 6, random: always(0) })
    const first = game.piece
    game.hardDrop()
    expect(game.piece).not.toBe(first)
    expect(game.cubesPlayed).toBe(1)
    expect([...game.pit.filled()]).toHaveLength(1)
    expect(game.score).toBeGreaterThan(0)
  })

  it('clears a layer and scores for it', () => {
    // A 1x1 pit means a single cube fills a whole layer.
    const game = new Game({ name: 't', set: 'FLAT', width: 1, height: 1, depth: 6, random: always(0) })
    game.hardDrop()
    expect(game.layersCleared).toBe(1)
    expect(game.pit.isEmpty()).toBe(true)
  })

  it('ends the game when a piece cannot get past the mouth', () => {
    const game = new Game({ name: 't', set: 'FLAT', width: 2, height: 2, depth: 4, random: always(0) })
    // Fill the pit, then hollow out one full-depth column away from where
    // pieces spawn. That leaves no layer complete - so nothing clears and the
    // pit stays full - while the spawn point itself is blocked.
    for (let z = 0; z < game.pit.depth; z += 1) {
      for (let y = 0; y < game.pit.height; y += 1) {
        for (let x = 0; x < game.pit.width; x += 1) game.pit.set(x, y, z, 1)
      }
      game.pit.set(1, 1, z, 0)
    }
    game.hardDrop()
    expect(game.pit.fullLayers()).toEqual([])
    expect(game.phase).toBe('over')
  })

  it('steps the piece down as time passes', () => {
    const game = new Game({ name: 't', set: 'FLAT', width: 5, height: 5, depth: 12, random: always(0) })
    const before = game.piece.z
    game.update(game.stepTime * 3 + 0.001)
    expect(game.piece.z).toBe(before + 3)
  })

  it('will not move a piece through a wall', () => {
    const game = new Game({ name: 't', set: 'FLAT', width: 3, height: 3, depth: 8, random: always(0) })
    for (let i = 0; i < 10; i += 1) game.move(-1, 0)
    expect(game.piece.x).toBe(0)
    expect(game.move(-1, 0)).toBe(false)
  })

  it('kicks a rotation back off the wall rather than refusing it', () => {
    const game = new Game({ name: 't', set: 'FLAT', width: 3, height: 3, depth: 10, random: always(BAR) })
    // Shove the piece hard against the left wall, then turn it so it would
    // stick out. The original shifts it back in instead of rejecting.
    for (let i = 0; i < 5; i += 1) game.move(-1, 0)
    expect(game.piece.x).toBe(0)
    expect(game.rotate('z', 1)).toBe(true)
    for (const [cx] of game.piece.cubes) expect(game.piece.x + cx).toBeGreaterThanOrEqual(0)
  })

  it('refuses a rotation that still does not fit after the kick', () => {
    const game = new Game({ name: 't', set: 'FLAT', width: 3, height: 3, depth: 10, random: always(BAR) })
    // Wall the piece in on both sides: there is nowhere for a kick to go.
    for (let z = 0; z < game.pit.depth; z += 1) {
      for (let y = 0; y < game.pit.height; y += 1) {
        game.pit.set(0, y, z, 1)
        game.pit.set(2, y, z, 1)
      }
    }
    const before = game.piece.cubes.map((c) => c.join(','))
    expect(game.rotate('z', 1)).toBe(false)
    expect(game.piece.cubes.map((c) => c.join(','))).toEqual(before)
  })

  // The guard is on the game rather than on whatever has a key bound to it,
  // so a second input path can't accidentally bypass it.
  it('ignores every input while paused, and resumes cleanly', () => {
    const game = new Game({ name: 't', set: 'FLAT', width: 5, height: 5, depth: 12, random: always(0) })
    const { x, y, z } = game.piece

    expect(game.togglePause()).toBe(true)
    expect(game.move(1, 0)).toBe(false)
    expect(game.rotate('x', 1)).toBe(false)
    game.hardDrop()
    game.update(60)
    expect(game.piece).toMatchObject({ x, y, z })
    expect(game.cubesPlayed).toBe(0)

    expect(game.togglePause()).toBe(false)
    expect(game.move(1, 0)).toBe(true)
  })

  it('will not pause a finished game', () => {
    const game = new Game({ name: 't', set: 'FLAT', width: 1, height: 1, depth: 6, random: always(1) })
    game.phase = 'over'
    expect(game.togglePause()).toBe(false)
    expect(game.paused).toBe(false)
  })

  it('reports where the current piece would land', () => {
    const game = new Game({ name: 't', set: 'FLAT', width: 3, height: 3, depth: 8, random: always(0) })
    expect(game.landingZ()).toBe(7)
  })
})

describe('Game events', () => {
  const always = (index: number, bagSize = 8) => () => (index + 0.5) / bagSize

  const record = (game: Game): string[] => {
    const seen: string[] = []
    game.onEvent = (e) => seen.push(e)
    return seen
  }

  it('reports a lock, and a clear when a layer completes', () => {
    // 1x1 pit: one cube fills a layer outright, so it locks, clears and
    // empties the pit all at once.
    const game = new Game({ name: 't', set: 'FLAT', width: 1, height: 1, depth: 6, random: always(0) })
    const seen = record(game)
    game.hardDrop()
    expect(seen).toContain('lock')
    expect(seen).toContain('flush')
    // flush and clear are exclusive: emptying the pit is the bigger event.
    expect(seen).not.toContain('clear')
  })

  it('reports a clear without a flush when the pit still has cubes in it', () => {
    // 2x1, so a layer needs both cells - otherwise every stray cube is itself a
    // full layer and the pit always ends up empty.
    const game = new Game({ name: 't', set: 'FLAT', width: 2, height: 1, depth: 6, random: always(0) })
    game.pit.set(1, 0, 5, 5) // half the floor layer, waiting to be completed
    game.pit.set(1, 0, 2, 5) // a leftover that no clear will reach
    const seen = record(game)
    game.hardDrop()
    expect(seen).toContain('clear')
    expect(seen).not.toContain('flush')
    expect(game.pit.isEmpty()).toBe(false)
  })

  it('reports a blocked rotation', () => {
    const game = new Game({ name: 't', set: 'FLAT', width: 3, height: 3, depth: 10, random: always(2) })
    for (let z = 0; z < game.pit.depth; z += 1) {
      for (let y = 0; y < game.pit.height; y += 1) {
        game.pit.set(0, y, z, 1)
        game.pit.set(2, y, z, 1)
      }
    }
    const seen = record(game)
    expect(game.rotate('z', 1)).toBe(false)
    expect(seen).toContain('rotateBlocked')
  })

  it('says nothing about rotations that succeed', () => {
    const game = new Game({ name: 't', set: 'FLAT', width: 5, height: 5, depth: 12, random: always(2) })
    const seen = record(game)
    expect(game.rotate('z', 1)).toBe(true)
    expect(seen).not.toContain('rotateBlocked')
  })

  it('reports game over exactly once', () => {
    const game = new Game({ name: 't', set: 'FLAT', width: 2, height: 2, depth: 4, random: always(0) })
    for (let z = 0; z < game.pit.depth; z += 1) {
      for (let y = 0; y < game.pit.height; y += 1) {
        for (let x = 0; x < game.pit.width; x += 1) game.pit.set(x, y, z, 1)
      }
      game.pit.set(1, 1, z, 0)
    }
    const seen = record(game)
    game.hardDrop()
    expect(seen.filter((e) => e === 'gameOver')).toHaveLength(1)
  })
})
