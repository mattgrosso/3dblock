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
  // Pins piece selection: returns a value that always lands on bag index `i`,
  // whatever the size of the block set's bag.
  const always = (i: number) => () => (i + 0.5) / 100

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

  it('reports where the current piece would land', () => {
    const game = new Game({ name: 't', set: 'FLAT', width: 3, height: 3, depth: 8, random: always(0) })
    expect(game.landingZ()).toBe(7)
  })
})
