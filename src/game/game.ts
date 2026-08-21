import { Pit, type Placement } from './pit'
import { extentOf, normalize, rotate, type Axis, type Cube, type Turn } from './rotation'
import { piecesIn, type BlockSet, type Setup } from './sets'
import type { PieceDef } from './pieces'
import { levelFor, scoreFor, stepTimeFor } from './scoring'

export type Phase = 'playing' | 'over'

/**
 * Things worth reacting to. Emitted rather than polled: a cleared layer is an
 * instant, and a watcher comparing counts between frames has to invent a way to
 * tell "two layers once" from "one layer twice".
 */
export type GameEvent = 'lock' | 'clear' | 'flush' | 'levelUp' | 'rotateBlocked' | 'gameOver'

export interface FallingPiece {
  readonly def: PieceDef
  cubes: Cube[]
  x: number
  y: number
  z: number
  /** Where the piece was when a hard drop began; null until one does. */
  dropFrom: number | null
}

export interface ClearEvent {
  readonly layers: readonly number[]
  readonly gained: number
  readonly pitEmptied: boolean
}

export interface GameOptions extends Setup {
  readonly startLevel?: number
  /** Injectable so tests can make piece selection deterministic. */
  readonly random?: () => number
}

export class Game {
  readonly pit: Pit
  readonly set: BlockSet
  private readonly bag: readonly PieceDef[]
  private readonly random: () => number
  private readonly startLevel: number

  piece!: FallingPiece
  next: PieceDef
  score = 0
  cubesPlayed = 0
  layersCleared = 0
  level: number
  phase: Phase = 'playing'
  /**
   * Pause lives on the game, not on the UI that happens to have a key bound to
   * it. Anything that can move a piece - keyboard now, touch or a bot later -
   * has to go through these methods, so the guard belongs where they are
   * rather than in each caller.
   */
  paused = false
  /** Set on the frame a clear happens, so the renderer can react to it. */
  lastClear: ClearEvent | null = null
  onEvent: ((event: GameEvent) => void) | null = null

  private sinceStep = 0
  /** Seconds the piece has been resting on its support. Locks at lockDelay. */
  private restTime = 0

  constructor(options: GameOptions) {
    this.pit = new Pit(options.width, options.height, options.depth)
    this.set = options.set
    this.bag = piecesIn(options.set)
    this.random = options.random ?? Math.random
    this.startLevel = options.startLevel ?? 0
    this.level = this.startLevel
    this.next = this.pick()
    this.spawn()
  }

  private pick(): PieceDef {
    const index = Math.min(this.bag.length - 1, Math.floor(this.random() * this.bag.length))
    return this.bag[index]!
  }

  private placement(piece: FallingPiece = this.piece): Placement {
    return { cubes: piece.cubes, x: piece.x, y: piece.y, z: piece.z }
  }

  private spawn(): void {
    const def = this.next
    this.next = this.pick()
    const cubes = normalize(def.cubes.map((c) => [...c] as unknown as Cube))
    const size = extentOf(cubes)

    const piece: FallingPiece = {
      def,
      cubes,
      // Centred in the mouth, biased the same way the original biases it.
      x: Math.floor((this.pit.width - size.width) / 2),
      y: Math.floor((this.pit.height - size.height) / 2),
      // Starts in the top layer of the pit, not floating outside it - a piece
      // in front of the mouth would loom over the camera and read as much
      // bigger than it is.
      z: 0,
      dropFrom: null,
    }
    this.piece = piece
    this.restTime = 0

    // Nowhere to put it means the pit is full.
    if (this.pit.collides(this.placement(piece))) this.phase = 'over'
  }

  private tryMove(dx: number, dy: number, dz: number): boolean {
    const candidate = {
      ...this.placement(),
      x: this.piece.x + dx,
      y: this.piece.y + dy,
      z: this.piece.z + dz,
    }
    if (this.pit.collides(candidate)) return false
    this.piece.x += dx
    this.piece.y += dy
    this.piece.z += dz
    return true
  }

  private get accepting(): boolean {
    return this.phase === 'playing' && !this.paused
  }

  togglePause(): boolean {
    if (this.phase === 'playing') this.paused = !this.paused
    return this.paused
  }

  /** True when the piece is resting on the floor or the stack. */
  private grounded(): boolean {
    return this.pit.collides({ ...this.placement(), z: this.piece.z + 1 })
  }

  /**
   * The slide window (bug report: "there should be a slight delay before it
   * locks in so that I can slide it across the bottom into gaps... the
   * faster the pieces are dropping, the shorter the delay"). A slice of the
   * gravity step so it scales with the level, clamped so it is generous
   * early and still finite at speed.
   */
  get lockDelay(): number {
    return Math.min(0.5, Math.max(0.1, this.stepTime * 0.35))
  }

  move(dx: number, dy: number): boolean {
    if (!this.accepting) return false
    const moved = this.tryMove(dx, dy, 0)
    // A successful slide re-opens the window - that is the whole point of
    // the delay. (Stalling forever this way is possible and fine.)
    if (moved) this.restTime = 0
    return moved
  }

  rotate(axis: Axis, dir: Turn): boolean {
    if (!this.accepting) return false
    const rotated = rotate(this.piece.cubes, axis, dir)
    const candidate = { ...this.placement(), cubes: rotated }

    if (!this.pit.collides(candidate)) {
      this.piece.cubes = rotated
      return true
    }

    // The original's kick, and its only one: push back by exactly the amount
    // the piece is sticking out, try that once, and refuse the rotation if it
    // still doesn't fit. Searching a spread of nearby offsets instead would
    // let rotations succeed that the real game rejects.
    const [sx, sy, sz] = this.pit.outOfBoundsShift(candidate)
    if (sx === 0 && sy === 0 && sz === 0) {
      this.emit('rotateBlocked')
      return false
    }

    const shifted = { ...candidate, x: candidate.x + sx, y: candidate.y + sy, z: candidate.z + sz }
    if (this.pit.collides(shifted)) {
      this.emit('rotateBlocked')
      return false
    }

    this.piece.cubes = rotated
    this.piece.x = shifted.x
    this.piece.y = shifted.y
    this.piece.z = shifted.z
    this.restTime = 0
    return true
  }

  /** One step down. Returns false if the piece is resting instead. */
  stepDown(): boolean {
    if (!this.accepting) return false
    return this.tryMove(0, 0, 1)
  }

  /**
   * Drop to the floor - but don't lock yet. The slide window applies to a
   * hard drop too, by request: "This should even be true when I hit the
   * space bar." A second press while resting commits immediately, so space
   * space is still the fast way to slam a piece home.
   */
  hardDrop(): void {
    if (!this.accepting) return
    const distance = this.pit.dropDistance(this.placement())

    if (distance === 0) {
      // Already resting: this press is the commit. dropFrom is left alone so
      // a real drop's height bonus survives the confirming press.
      this.lock()
      return
    }

    this.piece.dropFrom = this.dropPosition()
    this.piece.z += distance
    this.restTime = 0
  }

  /** Cells between the piece and the floor - the original's `dropPos`. */
  private dropPosition(): number {
    const size = extentOf(this.piece.cubes)
    return Math.max(0, this.pit.depth - 1 - (this.piece.z + size.depth - 1))
  }

  /** Where the piece would land, for the guide markers. */
  landingZ(): number {
    return this.piece.z + this.pit.dropDistance(this.placement())
  }

  private emit(event: GameEvent): void {
    this.onEvent?.(event)
  }

  private lock(): void {
    this.pit.lock(this.placement(), this.piece.def.id + 1)
    this.cubesPlayed += this.piece.def.cubes.length

    const layers = this.pit.fullLayers()
    if (layers.length) this.pit.clearLayers(layers)
    const pitEmptied = layers.length > 0 && this.pit.isEmpty()

    const gained = scoreFor({
      piece: this.piece.def,
      set: this.set,
      level: this.level,
      depth: this.pit.depth,
      layersCleared: layers.length,
      dropped: this.piece.dropFrom !== null,
      dropPosition: this.piece.dropFrom ?? 0,
      pitEmptied,
    })

    this.score += gained
    this.layersCleared += layers.length
    this.lastClear = layers.length || pitEmptied ? { layers, gained, pitEmptied } : null

    const previousLevel = this.level
    this.level = levelFor(this.startLevel, this.cubesPlayed, this.pit.width, this.pit.height)

    this.emit('lock')
    if (pitEmptied) this.emit('flush')
    else if (layers.length) this.emit('clear')
    if (this.level > previousLevel) this.emit('levelUp')

    this.spawn()
    if (this.phase === 'over') this.emit('gameOver')
  }

  get stepTime(): number {
    return stepTimeFor(this.level)
  }

  /** Advance by `dt` seconds. */
  update(dt: number): void {
    if (!this.accepting) return

    // Resting on something: the slide window runs instead of gravity.
    if (this.grounded()) {
      this.sinceStep = 0
      this.restTime += dt
      if (this.restTime >= this.lockDelay) this.lock()
      return
    }

    this.restTime = 0
    this.sinceStep += dt
    while (this.sinceStep >= this.stepTime && this.accepting) {
      this.sinceStep -= this.stepTime
      // Landing mid-burst starts the rest window on the next frame rather
      // than swallowing the remainder as instant lock time.
      if (!this.stepDown()) break
    }
  }
}
