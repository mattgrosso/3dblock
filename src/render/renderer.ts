import * as THREE from 'three'
import type { Game } from '../game/game'
import { extentOf } from '../game/rotation'
import { pitGeometry, polycubeEdges, polycubeGeometry } from './geometry'
import type { Theme } from './themes'

const CELL = 1

/**
 * Draws the pit straight down its axis, the way the original does. The
 * perspective camera sits at the mouth looking in, so depth reads as things
 * getting smaller rather than as an isometric skew - which is the whole reason
 * the game is legible in 3D at all.
 */
export class Renderer {
  readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly renderer: THREE.WebGLRenderer
  private readonly locked: THREE.Group
  private readonly falling: THREE.Group
  private readonly guide: THREE.Group
  private readonly game: Game
  private readonly theme: Theme
  private readonly showGuide: boolean
  /** cubesPlayed as of the last locked-stack rebuild; -1 forces the first. */
  private lockedAt = -1

  constructor(canvasParent: HTMLElement, game: Game, theme: Theme, showGuide = false) {
    this.game = game
    this.theme = theme
    this.showGuide = showGuide
    const { width, height, depth } = game.pit

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    canvasParent.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(theme.background)

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500)
    // Backed off far enough that the whole mouth is comfortably in frame.
    const cameraDistance = Math.max(width, height) * 1.35 + 2
    this.camera.position.set(0, 0, cameraDistance)

    // Fog measured from the camera rather than from the pit, so a deep pit
    // doesn't wash its own floor out to nothing. It starts past halfway down
    // and never fully reaches the floor, which reads as distance without
    // hiding what you've stacked.
    this.scene.fog = new THREE.Fog(
      theme.background,
      cameraDistance + depth * 0.55,
      cameraDistance + depth * 1.7,
    )
    this.camera.lookAt(0, 0, -depth * 0.5)

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const key = new THREE.DirectionalLight(0xffffff, 1.1)
    key.position.set(3, 5, 8)
    this.scene.add(key)

    this.scene.add(this.buildPitFrame())

    this.locked = new THREE.Group()
    // Cell (0,0,0)'s centre in world space; the pit geometry is built in cell
    // coordinates, so parking the group here makes them line up with toWorld.
    this.locked.position.copy(this.toWorld(0, 0, 0))
    this.falling = new THREE.Group()
    this.guide = new THREE.Group()
    this.scene.add(this.locked, this.falling, this.guide)

    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  /** Pit cell -> world. Pit z runs away from the camera, into negative world z. */
  private toWorld(x: number, y: number, z: number): THREE.Vector3 {
    const { width, height } = this.game.pit
    return new THREE.Vector3(
      (x - (width - 1) / 2) * CELL,
      ((height - 1) / 2 - y) * CELL,
      -z * CELL,
    )
  }

  /**
   * The wireframe well: a ring at every depth step plus rails down the corners
   * and cell boundaries. Without the rings there is no way to judge how far
   * down a piece has fallen.
   */
  private buildPitFrame(): THREE.Group {
    const { width, height, depth } = this.game.pit
    const group = new THREE.Group()
    const points: THREE.Vector3[] = []

    const corner = (x: number, y: number, z: number) =>
      new THREE.Vector3((x - width / 2) * CELL, (height / 2 - y) * CELL, -z * CELL + CELL / 2)

    // Depth rings.
    for (let z = 0; z <= depth; z += 1) {
      const ring = [corner(0, 0, z), corner(width, 0, z), corner(width, height, z), corner(0, height, z)]
      for (let i = 0; i < 4; i += 1) points.push(ring[i]!, ring[(i + 1) % 4]!)
    }

    // Rails along every cell boundary, so the walls read as a grid.
    for (let x = 0; x <= width; x += 1) {
      points.push(corner(x, 0, 0), corner(x, 0, depth))
      points.push(corner(x, height, 0), corner(x, height, depth))
    }
    for (let y = 0; y <= height; y += 1) {
      points.push(corner(0, y, 0), corner(0, y, depth))
      points.push(corner(width, y, 0), corner(width, y, depth))
    }

    group.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: this.theme.frame }),
      ),
    )

    // The floor, drawn solid so the bottom of the well is unmistakable.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width * CELL, height * CELL),
      new THREE.MeshBasicMaterial({ color: this.theme.floor, transparent: true, opacity: 0.85 }),
    )
    floor.position.z = -depth * CELL + CELL / 2
    group.add(floor)

    // A brighter ring at the mouth: the line you must not stack past.
    const mouth = [corner(0, 0, 0), corner(width, 0, 0), corner(width, height, 0), corner(0, height, 0)]
    const mouthPoints: THREE.Vector3[] = []
    for (let i = 0; i < 4; i += 1) mouthPoints.push(mouth[i]!, mouth[(i + 1) % 4]!)
    group.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(mouthPoints),
        new THREE.LineBasicMaterial({ color: this.theme.mouth }),
      ),
    )

    return group
  }

  /**
   * Rebuild the locked stack as one welded, layer-coloured solid. The pit only
   * changes when a piece locks, and every lock raises cubesPlayed, so that
   * counter is the cheap change detector - most frames this is a no-op.
   */
  private syncLocked(): void {
    if (this.game.cubesPlayed === this.lockedAt) return
    this.lockedAt = this.game.cubesPlayed

    this.clearGroup(this.locked)
    const cells = [...this.game.pit.filled()]
    if (!cells.length) return

    const solid = pitGeometry(cells, (cell) => this.theme.layerColor(cell.z))
    this.locked.add(
      new THREE.Mesh(solid, new THREE.MeshLambertMaterial({ vertexColors: true })),
    )
    // Creases and silhouette in the background colour, so stacked cubes keep
    // their outline without reintroducing the per-cube seams.
    this.locked.add(
      new THREE.LineSegments(
        polycubeEdges(solid),
        new THREE.LineBasicMaterial({ color: this.theme.background }),
      ),
    )
  }

  private clearGroup(group: THREE.Group): void {
    for (const child of [...group.children]) {
      group.remove(child)
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) child.geometry.dispose()
    }
  }

  private syncFalling(): void {
    this.clearGroup(this.falling)
    this.clearGroup(this.guide)
    if (this.game.phase !== 'playing') return

    const piece = this.game.piece
    const color = this.theme.pieceColor(piece.def.id)

    // One welded solid for the whole piece, so a bar looks like a bar rather
    // than three cubes with seams. Built once and shared by the piece and its
    // landing marker, which are the same shape in two places.
    const solid = polycubeGeometry(piece.cubes)
    const outline = polycubeEdges(solid)

    // Wireframe while it falls, exactly as the original draws it: head-on, a
    // solid piece would sit precisely between the camera and the spot it is
    // about to land on. It turns solid the moment it locks.
    //
    // The fill is GLASS, not air (bug report: "glass is clear but it does
    // have a visual effect on what you see through it"): a heavily darkened
    // tint of the piece colour at real opacity, so whatever is behind the
    // piece dims through it. It also WRITES DEPTH, which is what the two
    // edge passes below test against — and because everything behind the
    // piece has an earlier renderOrder, writing depth this late hides
    // nothing that matters. polygonOffset nudges the faces back a hair so
    // the edges lying ON them win the depth test cleanly.
    const faces = new THREE.Mesh(
      solid,
      new THREE.MeshBasicMaterial({
        color: color.clone().multiplyScalar(0.25),
        transparent: true,
        opacity: 0.4,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    )
    faces.position.copy(this.toWorld(piece.x, piece.y, piece.z))
    faces.renderOrder = 1
    this.falling.add(faces)

    // Hidden-line glass (bug report follow-up: "It needs to just be the
    // parts of the edge that are actually being seen through the block"):
    // the same outline is drawn twice against the body's depth. The pass
    // that survives the depth test is the directly visible portion, full
    // strength; the pass that only draws where it LOSES the depth test
    // (depthFunc Greater) is exactly the portion behind the glass, faded.
    // The split happens per fragment, so one edge can be bright where it
    // emerges and faint where the body covers it. Both are `transparent`
    // even at full opacity - that keeps them in the transparent render
    // list, AFTER the fill has written the depth they test against.
    const edgeFront = new THREE.LineSegments(
      outline,
      new THREE.LineBasicMaterial({ color, transparent: true }),
    )
    edgeFront.position.copy(faces.position)
    edgeFront.renderOrder = 2
    this.falling.add(edgeFront)

    const edgeBehind = new THREE.LineSegments(
      outline,
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.25,
        depthFunc: THREE.GreaterDepth,
        depthWrite: false,
      }),
    )
    edgeBehind.position.copy(faces.position)
    edgeBehind.renderOrder = 3
    this.falling.add(edgeBehind)

    // Off by default, on request: knowing where the piece lands is half the
    // game in the original, and the marker gives it away.
    if (this.showGuide) {
      const landing = new THREE.LineSegments(
        outline.clone(),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 }),
      )
      landing.position.copy(this.toWorld(piece.x, piece.y, this.game.landingZ()))
      this.guide.add(landing)
    }
  }

  private resize(): void {
    const width = window.innerWidth
    const height = window.innerHeight
    this.renderer.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  /** Bounding box of the next piece, for the preview panel. */
  nextPieceExtent(): ReturnType<typeof extentOf> {
    return extentOf(this.game.next.cubes)
  }

  render(): void {
    this.syncLocked()
    this.syncFalling()
    this.renderer.render(this.scene, this.camera)
  }
}
