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

/**
 * Icons that show the motion the piece will actually make.
 *
 * Matt reported the old labels (X↺ X↻ Y↺ Y↻ Z↺ Z↻): "The buttons on a
 * touchscreen are labeled with little loop icons, but they don't actually
 * reflect the motion the button is gonna do. They're all just generic
 * rotation - if we're gonna have icons there, they need to actually represent
 * the motion the block will take."
 *
 * He's right: ↺ and ↻ are the same glyph on all three axes, so the only
 * information was the letter, and the letter means nothing until you already
 * know the convention.
 *
 * Each icon now draws the AXIS as a dashed line and the piece's path around it
 * as an ellipse, foreshortened the way that path actually looks from where the
 * player is sitting. The arrowhead sits on the near edge and points the way
 * the near face travels.
 *
 * The screen mapping (render/geometry.ts): pit x runs across the screen, pit y
 * runs down it, and pit z runs away from the camera - you are looking down the
 * shaft. So:
 *   x - a horizontal axis: the piece tumbles top-over-bottom  -> tall ellipse
 *   y - a vertical axis:   the piece tumbles left-over-right  -> wide ellipse
 *   z - straight into the screen: it spins flat               -> full circle
 */
const rotationIcon = (axis: Axis, dir: Turn): string => {
  const line = 'stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round"'
  const axisLine = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2.6 2.4" opacity="0.5"/>`
  // Solid triangles, not thin chevrons. The first pass drew the arrowheads as
  // two-segment strokes and the pair on each axis was indistinguishable at
  // button size - which would have left the icons exactly as uninformative as
  // the ↺/↻ glyphs they replaced, just prettier.
  const head = (points: string) => `<polygon points="${points}" fill="currentColor"/>`

  if (axis === 'z') {
    const arc = dir === 1 ? 'M12 4 A 8 8 0 1 0 20 12' : 'M12 4 A 8 8 0 1 1 4 12'
    const tip = dir === 1 ? head('20 8.4 23.2 13.4 16.8 13.4') : head('4 8.4 7.2 13.4 0.8 13.4')
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${arc}" ${line}/>${tip}</svg>`
  }

  if (axis === 'x') {
    // Horizontal axis. The pair is distinguished by which END of the loop the
    // arrowhead sits on, not merely which way its apex points - mirroring only
    // the apex produced two icons that were indistinguishable at button size
    // (checked by rendering all six side by side at 96px).
    const tip = dir === 1 ? head('9.4 1.4 15.6 4 9.4 6.6') : head('14.6 17.4 8.4 20 14.6 22.6')
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${axisLine(2, 12, 22, 12)}<ellipse cx="12" cy="12" rx="4.4" ry="8" ${line}/>${tip}</svg>`
  }

  // Vertical axis, same trick: opposite ends of the loop.
  const tip = dir === 1 ? head('17.4 9.4 20 15.6 22.6 9.4') : head('1.4 14.6 4 8.4 6.6 14.6')
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${axisLine(12, 2, 12, 22)}<ellipse cx="12" cy="12" rx="8" ry="4.4" ${line}/>${tip}</svg>`
}

const ROTATIONS: ReadonlyArray<{ label: string; axis: Axis; dir: Turn }> = [
  { label: 'Rotate forward over the horizontal axis', axis: 'x', dir: 1 },
  { label: 'Rotate back over the horizontal axis', axis: 'x', dir: -1 },
  { label: 'Rotate right around the vertical axis', axis: 'y', dir: 1 },
  { label: 'Rotate left around the vertical axis', axis: 'y', dir: -1 },
  { label: 'Spin clockwise', axis: 'z', dir: 1 },
  { label: 'Spin anticlockwise', axis: 'z', dir: -1 },
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
    const el = button('', 'touchpad__btn touchpad__btn--rotate', () => getGame().rotate(r.axis, r.dir))
    el.innerHTML = rotationIcon(r.axis, r.dir)
    // The words survive for screen readers even though the face is a picture.
    el.setAttribute('aria-label', r.label)
    el.title = r.label
    rotations.appendChild(el)
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
