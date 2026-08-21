import type { Game } from '../game/game'
import type { Axis, Turn } from '../game/rotation'

/**
 * On-screen controls, because the game is installable on a phone and a
 * keyboard-only 3D Tetris on a home screen is just a picture of one.
 *
 * Buttons rather than gestures, deliberately. Six rotations across three axes
 * plus four directions is eleven distinct actions; there is no gesture
 * vocabulary that maps to that without being a memory test, and guessing wrong
 * in this game costs you the piece.
 */

const ROTATIONS: ReadonlyArray<{ label: string; axis: Axis; dir: Turn }> = [
  { label: 'X↺', axis: 'x', dir: 1 },
  { label: 'X↻', axis: 'x', dir: -1 },
  { label: 'Y↺', axis: 'y', dir: 1 },
  { label: 'Y↻', axis: 'y', dir: -1 },
  { label: 'Z↺', axis: 'z', dir: 1 },
  { label: 'Z↻', axis: 'z', dir: -1 },
]

const MOVES: ReadonlyArray<{ label: string; dx: number; dy: number; area: string }> = [
  { label: '↑', dx: 0, dy: -1, area: 'up' },
  { label: '←', dx: -1, dy: 0, area: 'left' },
  { label: '→', dx: 1, dy: 0, area: 'right' },
  { label: '↓', dx: 0, dy: 1, area: 'down' },
]

/**
 * `?touch=1` forces the pad on. Feature detection can't be simulated from a
 * page, so without an override there's no way to check these controls outside a
 * real phone - and it also rescues touchscreen laptops, which report a coarse
 * pointer only sometimes.
 */
export const supportsTouch = (): boolean =>
  new URLSearchParams(window.location.search).get('touch') === '1' ||
  window.matchMedia('(pointer: coarse)').matches ||
  navigator.maxTouchPoints > 0

export const setupTouchControls = (getGame: () => Game, onPause: () => void): HTMLElement => {
  const pad = document.createElement('div')
  pad.className = 'touchpad'

  const button = (label: string, className: string, onPress: () => void): HTMLButtonElement => {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = className
    el.textContent = label
    // pointerdown, not click: it fires immediately instead of after the ~300ms
    // the browser spends deciding whether this was a double-tap, which at
    // level 8 is most of a step.
    el.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      onPress()
    })
    return el
  }

  const dpad = document.createElement('div')
  dpad.className = 'touchpad__dpad'
  for (const move of MOVES) {
    const el = button(move.label, `touchpad__btn touchpad__btn--${move.area}`, () =>
      getGame().move(move.dx, move.dy),
    )
    el.style.gridArea = move.area
    dpad.appendChild(el)
  }

  const rotations = document.createElement('div')
  rotations.className = 'touchpad__rotations'
  for (const r of ROTATIONS) {
    rotations.appendChild(
      button(r.label, 'touchpad__btn touchpad__btn--rotate', () => getGame().rotate(r.axis, r.dir)),
    )
  }

  const drop = button('DROP', 'touchpad__btn touchpad__btn--drop', () => getGame().hardDrop())

  // Without this there is no way off the board on a phone. Pause is the only
  // route to the overlay mid-game, and the overlay is the only route to
  // "change setup" or a fresh game.
  const pause = button('❚❚', 'touchpad__btn touchpad__btn--pause', onPause)

  const centre = document.createElement('div')
  centre.className = 'touchpad__centre'
  centre.append(drop, pause)

  pad.append(dpad, centre, rotations)
  document.body.appendChild(pad)
  // Drive the layout off the pad actually existing rather than off a media
  // query. They can disagree - a touchscreen laptop reports a fine pointer,
  // and the ?touch=1 override bypasses the query entirely - and when they do,
  // you get both the pad and the keyboard hints stacked on each other.
  document.body.classList.add('has-touchpad')
  return pad
}
