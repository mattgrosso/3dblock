/**
 * Controller support (Matt, 2026-11-02: playing the hub games on a Steam
 * Deck, Blockout first). The Gamepad API has no button events, only
 * connection ones, so the pads are polled every frame and turned into
 * actions here; main.ts decides what an action means on the screen showing.
 *
 * In play:
 *   left stick / d-pad   move (held, it repeats)
 *   right stick          tumble the piece: up/down over the horizontal axis,
 *                        left/right around the vertical one (a flick per turn)
 *   LB / RB              spin anticlockwise / clockwise
 *   A                    drop
 *   Start                pause      View / Select   setup
 * In menus: d-pad to choose, A to pick, Y for the second button.
 *
 * Buttons are read by POSITION (the standard layout), so A means "the bottom
 * face button" on every pad; only the labels shown change with the pad.
 */

export type PadKind = 'xbox' | 'playstation' | 'switch' | 'generic'

export type PadAction =
  | 'up' | 'down' | 'left' | 'right'
  | 'a' | 'b' | 'x' | 'y'
  | 'spinLeft' | 'spinRight'
  | 'tumbleUp' | 'tumbleDown' | 'tumbleLeft' | 'tumbleRight'
  | 'start' | 'view'

export const MOVES: readonly PadAction[] = ['up', 'down', 'left', 'right']
export const REPEAT_DELAY_MS = 170
export const REPEAT_RATE_MS = 60
export const STICK_DEADZONE = 0.5

/** W3C "standard" button indexes. */
const BUTTONS: Record<number, PadAction> = {
  0: 'a', 1: 'b', 2: 'x', 3: 'y',
  4: 'spinLeft', 5: 'spinRight',
  8: 'view', 9: 'start',
  12: 'up', 13: 'down', 14: 'left', 15: 'right',
}

/**
 * Which family of pad, from its id string, for the labels. A Steam Deck with
 * Steam Input on shows every pad as a virtual Xbox one, so that reads as
 * Xbox - which is what its buttons then are.
 */
export const padKind = (id = ''): PadKind => {
  const s = id.toLowerCase()
  // Xbox first: "Xbox Wireless Controller" also contains Sony's bare "Wireless Controller".
  if (/xbox|xinput|045e|microsoft/.test(s)) return 'xbox'
  if (/pro controller|joy-con|nintendo|057e/.test(s)) return 'switch'
  if (/dualsense|dualshock|playstation|wireless controller|054c/.test(s)) return 'playstation'
  return 'generic'
}

export const GLYPHS: Record<PadKind, { a: string; b: string; x: string; y: string; lb: string; rb: string; start: string; view: string }> = {
  xbox: { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', start: '☰', view: 'View' },
  generic: { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', start: 'Start', view: 'Select' },
  playstation: { a: '✕', b: '○', x: '□', y: '△', lb: 'L1', rb: 'R1', start: 'Options', view: 'Create' },
  switch: { a: 'B', b: 'A', x: 'Y', y: 'X', lb: 'L', rb: 'R', start: '+', view: '−' },
}

interface PadLike { buttons: ReadonlyArray<{ pressed: boolean } | undefined>; axes: ReadonlyArray<number> }

/** What one pad is holding right now. Pure, so it is tested without a browser. */
export const heldActions = (pad: PadLike | null | undefined): Set<PadAction> => {
  const held = new Set<PadAction>()
  if (!pad) return held
  pad.buttons.forEach((button, i) => {
    const action = BUTTONS[i]
    if (button?.pressed && action) held.add(action)
  })
  const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes
  if (lx < -STICK_DEADZONE) held.add('left')
  if (lx > STICK_DEADZONE) held.add('right')
  if (ly < -STICK_DEADZONE) held.add('up')
  if (ly > STICK_DEADZONE) held.add('down')
  if (rx < -STICK_DEADZONE) held.add('tumbleLeft')
  if (rx > STICK_DEADZONE) held.add('tumbleRight')
  if (ry < -STICK_DEADZONE) held.add('tumbleUp')
  if (ry > STICK_DEADZONE) held.add('tumbleDown')
  return held
}

/**
 * "Held now" into "fires this frame": every action fires on the press; moves
 * also repeat while held, after a short pause. Everything else is one per press.
 */
export const createRepeater = (delay = REPEAT_DELAY_MS, rate = REPEAT_RATE_MS) => {
  const since = new Map<PadAction, { pressedAt: number; firedAt: number }>()
  return {
    tick(held: ReadonlySet<PadAction>, now: number): PadAction[] {
      const fired: PadAction[] = []
      for (const action of held) {
        const entry = since.get(action)
        if (!entry) {
          since.set(action, { pressedAt: now, firedAt: now })
          fired.push(action)
        } else if (MOVES.includes(action) && now - entry.pressedAt >= delay && now - entry.firedAt >= rate) {
          entry.firedAt = now
          fired.push(action)
        }
      }
      for (const action of [...since.keys()]) if (!held.has(action)) since.delete(action)
      return fired
    },
    reset(): void { since.clear() },
  }
}

/** Poll the pads every frame. `onPadChange` hears the pad's kind, or null when the last one goes. */
export const attachGamepad = (
  onAction: (action: PadAction) => void,
  onPadChange: (kind: PadKind | null) => void,
): void => {
  if (!('getGamepads' in navigator)) return
  const repeater = createRepeater()
  let kind: PadKind | null = null
  const poll = (): void => {
    const pads = Array.from(navigator.getGamepads()).filter((p): p is Gamepad => !!p)
    const now: PadKind | null = pads.length ? padKind(pads[0]!.id) : null
    if (now !== kind) { kind = now; repeater.reset(); onPadChange(kind) }
    const held = new Set<PadAction>()
    for (const pad of pads) heldActions(pad).forEach((a) => held.add(a))
    // A hidden tab still polls if a frame comes, but nothing should fire there.
    if (!document.hidden) repeater.tick(held, performance.now()).forEach(onAction)
    requestAnimationFrame(poll)
  }
  requestAnimationFrame(poll)
  window.addEventListener('blur', () => repeater.reset())
}
