import * as THREE from 'three'
import type { PieceDef } from '../game/pieces'
import { normalize, type Cube } from '../game/rotation'
import { polycubeEdges, polycubeGeometry } from './geometry'

/**
 * The next piece, shown from an angle and slowly turning.
 *
 * Deliberately not the head-on view the pit uses. Straight down the well a
 * piece's depth is invisible - an L lying flat and an L standing up its own
 * axis look identical - so a preview drawn from the play camera would be
 * actively misleading. Turning it is the cheapest way to make the third
 * dimension legible before you commit.
 */
export class PiecePreview {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly pivot = new THREE.Group()
  private shown: PieceDef | null = null

  constructor(parent: HTMLElement, size = 132) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(size, size)
    this.renderer.setClearColor(0x000000, 0)
    parent.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
    this.camera.position.set(4.4, 3.4, 5.2)
    this.camera.lookAt(0, 0, 0)

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const key = new THREE.DirectionalLight(0xffffff, 1.0)
    key.position.set(2, 4, 3)
    this.scene.add(key, this.pivot)
  }

  private build(def: PieceDef): void {
    for (const child of [...this.pivot.children]) {
      this.pivot.remove(child)
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) child.geometry.dispose()
    }

    const cubes = normalize(def.cubes.map((c) => [...c] as unknown as Cube))
    const color = new THREE.Color().setHSL(((def.id + 1) * 0.137) % 1, 0.62, 0.55)

    // The same welded geometry the pit uses, so the preview and the piece that
    // arrives are recognisably the same object.
    const solid = polycubeGeometry(cubes)

    // Centre it on the pivot so it spins about itself rather than orbiting off
    // the edge of the panel.
    solid.computeBoundingBox()
    const centre = new THREE.Vector3()
    solid.boundingBox!.getCenter(centre)
    solid.translate(-centre.x, -centre.y, -centre.z)

    const mesh = new THREE.Mesh(solid, new THREE.MeshLambertMaterial({ color }))
    this.pivot.add(mesh)

    const edges = new THREE.LineSegments(
      polycubeEdges(solid),
      new THREE.LineBasicMaterial({ color: 0x0b0e14 }),
    )
    this.pivot.add(edges)

    // Pull the camera back for the bigger pieces so a five-cube bar still fits.
    const size = new THREE.Vector3()
    solid.boundingBox!.getSize(size)
    const distance = 5.5 + Math.max(size.x, size.y, size.z) * 0.75
    this.camera.position.setLength(distance)
  }

  render(next: PieceDef, dt: number): void {
    if (next !== this.shown) {
      this.build(next)
      this.shown = next
      this.pivot.rotation.set(0.35, 0.6, 0)
    }
    this.pivot.rotation.y += dt * 0.6
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
