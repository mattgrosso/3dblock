import type { GameEvent } from './game/game'

/**
 * The original game's sounds, taken from BlockOut II's `sounds/` directory
 * (GPLv2+, same licence as this project).
 *
 * BlockOut II ships two themes and picks between them by setting: its own, and
 * an emulation of the 1989 game's. The `*2` files are the second - the code
 * reaches for those under `SOUND_BLOCKOUT` - so those are the ones here.
 */
const CLIPS = {
  clear: '/sounds/line2.wav',
  flush: '/sounds/empty2.wav',
  levelUp: '/sounds/level2.wav',
  gameOver: '/sounds/welldone2.wav',
  rotateBlocked: '/sounds/hit.wav',
} as const

type ClipName = keyof typeof CLIPS

const MUTE_KEY = '3dblock.muted'

export class Sound {
  private context: AudioContext | null = null
  private buffers = new Map<ClipName, AudioBuffer>()
  private muted: boolean

  constructor() {
    this.muted = this.readMuted()
  }

  private readMuted(): boolean {
    try {
      return localStorage.getItem(MUTE_KEY) === '1'
    } catch {
      return false
    }
  }

  get isMuted(): boolean {
    return this.muted
  }

  toggleMute(): boolean {
    this.muted = !this.muted
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0')
    } catch {
      // Preference only; not worth surfacing.
    }
    return this.muted
  }

  /**
   * Must be called from a real user gesture. Browsers start an AudioContext
   * suspended and only let a gesture resume it, so building one at load time
   * gives you a context that silently never plays anything.
   */
  async unlock(): Promise<void> {
    if (this.context) {
      if (this.context.state === 'suspended') await this.context.resume()
      return
    }
    try {
      this.context = new AudioContext()
      await Promise.all(
        (Object.keys(CLIPS) as ClipName[]).map(async (name) => {
          const response = await fetch(CLIPS[name])
          const buffer = await this.context!.decodeAudioData(await response.arrayBuffer())
          this.buffers.set(name, buffer)
        }),
      )
    } catch {
      // No audio device, blocked context, a decode failure - all of which are
      // reasons to be quiet, none of which should stop the game.
      this.context = null
    }
  }

  play(name: ClipName): void {
    if (this.muted || !this.context) return
    const buffer = this.buffers.get(name)
    if (!buffer) return
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.connect(this.context.destination)
    source.start()
  }

  /** Not every game event has a sound - `lock` fires constantly and would grate. */
  handle(event: GameEvent): void {
    if (event in CLIPS) this.play(event as ClipName)
  }

  /**
   * Audible proof-of-life for the mute toggle (bug report 2026-08-21: silence
   * plus an ambiguous icon left no way to tell whether sound worked at all).
   * Call after toggling, from inside the same gesture: unmuting plays a blip
   * immediately; muting stays silent because play() checks the flag.
   */
  async confirm(): Promise<void> {
    await this.unlock()
    this.play('rotateBlocked')
  }
}
