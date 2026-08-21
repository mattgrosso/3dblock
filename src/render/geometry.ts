import * as THREE from 'three'
import type { Cube } from '../game/rotation'

/**
 * A polycube as one solid, not a bag of boxes.
 *
 * Drawing a piece as N separate cubes leaves every internal wall in the model,
 * so a bar reads as three loose blocks with seams between them rather than as
 * one shape. Faces that touch another cube of the same piece are skipped
 * entirely, which welds the piece together: the geometry produced here has only
 * the outer surface, so the wireframe drawn from it shows the silhouette and
 * real creases, and nothing where two cubes meet.
 */

interface Face {
  readonly normal: readonly [number, number, number]
  readonly corners: ReadonlyArray<readonly [number, number, number]>
}

const H = 0.5

// Corners wound counter-clockwise seen from outside, so normals face outward.
const FACES: readonly Face[] = [
  { normal: [1, 0, 0], corners: [[H, -H, H], [H, -H, -H], [H, H, -H], [H, H, H]] },
  { normal: [-1, 0, 0], corners: [[-H, -H, -H], [-H, -H, H], [-H, H, H], [-H, H, -H]] },
  { normal: [0, 1, 0], corners: [[-H, H, H], [H, H, H], [H, H, -H], [-H, H, -H]] },
  { normal: [0, -1, 0], corners: [[-H, -H, -H], [H, -H, -H], [H, -H, H], [-H, -H, H]] },
  { normal: [0, 0, 1], corners: [[-H, -H, H], [H, -H, H], [H, H, H], [-H, H, H]] },
  { normal: [0, 0, -1], corners: [[H, -H, -H], [-H, -H, -H], [-H, H, -H], [H, H, -H]] },
]

/**
 * Built in the renderer's frame, not the pit's: pit y runs down the screen and
 * pit z runs away from the camera, so both are negated here. That keeps the
 * mapping in one place - callers just position the result at the piece's
 * origin.
 */
const build = (
  cubes: readonly Cube[],
  colorOf?: (cube: Cube) => THREE.Color,
): THREE.BufferGeometry => {
  const occupied = new Set(cubes.map((c) => c.join(',')))
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  for (const cube of cubes) {
    const [cx, cy, cz] = cube
    const ox = cx
    const oy = -cy
    const oz = -cz
    const color = colorOf?.(cube)

    for (const face of FACES) {
      // The neighbour in pit coordinates, undoing the two flips above.
      const neighbour: Cube = [cx + face.normal[0], cy - face.normal[1], cz - face.normal[2]]
      if (occupied.has(neighbour.join(','))) continue

      const base = positions.length / 3
      for (const [vx, vy, vz] of face.corners) {
        positions.push(ox + vx, oy + vy, oz + vz)
        normals.push(...face.normal)
        if (color) colors.push(color.r, color.g, color.b)
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  if (colorOf) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  return geometry
}

export const polycubeGeometry = (cubes: readonly Cube[]): THREE.BufferGeometry => build(cubes)

/**
 * The locked stack as one welded surface, like the falling pieces - a face is
 * emitted only where a cell meets air, whichever piece put its neighbour there.
 * Colour rides on the vertices (one colour per cell, by layer), so a single
 * mesh renders the whole pit and a piece straddling two layers shows both
 * colours.
 */
export const pitGeometry = (
  cells: ReadonlyArray<{ x: number; y: number; z: number }>,
  colorOf: (cell: { x: number; y: number; z: number }) => THREE.Color,
): THREE.BufferGeometry =>
  build(
    cells.map((c) => [c.x, c.y, c.z] as Cube),
    ([x, y, z]) => colorOf({ x, y, z }),
  )

/** Silhouette and creases only - coplanar joins between merged faces vanish. */
export const polycubeEdges = (geometry: THREE.BufferGeometry): THREE.BufferGeometry =>
  new THREE.EdgesGeometry(geometry, 1)
