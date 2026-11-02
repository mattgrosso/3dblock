import { describe, expect, it } from 'vitest'
import { createRepeater, heldActions, padKind, GLYPHS, REPEAT_DELAY_MS, REPEAT_RATE_MS } from '../src/ui/gamepad'

const pad = (pressed: number[] = [], axes: number[] = [0, 0, 0, 0]) => ({
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
  axes,
})

describe('padKind', () => {
  it('names the family from the id', () => {
    expect(padKind('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)')).toBe('xbox')
    expect(padKind('Sony Interactive Entertainment DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('playstation')
    expect(padKind('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)')).toBe('switch')
    // Steam Input's virtual pad on a Steam Deck.
    expect(padKind('Microsoft X-Box 360 pad 0 (STANDARD GAMEPAD Vendor: 28de Product: 11ff)')).toBe('xbox')
    expect(padKind('Some Pad')).toBe('generic')
  })
  it('labels the bottom face button for each family', () => {
    expect(GLYPHS.xbox.a).toBe('A')
    expect(GLYPHS.playstation.a).toBe('✕')
    expect(GLYPHS.switch.a).toBe('B')
  })
})

describe('heldActions', () => {
  it('reads buttons by position', () => {
    expect([...heldActions(pad([0, 4, 9]))].sort()).toEqual(['a', 'spinLeft', 'start'])
    expect([...heldActions(pad([12, 15]))].sort()).toEqual(['right', 'up'])
  })
  it('reads both sticks past the dead zone', () => {
    expect([...heldActions(pad([], [-0.9, 0.2, 0, 0]))]).toEqual(['left'])
    expect([...heldActions(pad([], [0, 0, 0.8, -0.8]))].sort()).toEqual(['tumbleRight', 'tumbleUp'])
    expect(heldActions(pad([], [0.3, -0.3, 0.3, 0.3])).size).toBe(0)
  })
  it('is empty without a pad', () => {
    expect(heldActions(null).size).toBe(0)
  })
})

describe('createRepeater', () => {
  it('fires a press once, and repeats only moves', () => {
    const r = createRepeater()
    const held = new Set(['left', 'a', 'tumbleUp'] as const)
    expect(r.tick(held, 0).sort()).toEqual(['a', 'left', 'tumbleUp'])
    expect(r.tick(held, REPEAT_DELAY_MS - 1)).toEqual([])
    expect(r.tick(held, REPEAT_DELAY_MS)).toEqual(['left'])
    expect(r.tick(held, REPEAT_DELAY_MS + REPEAT_RATE_MS)).toEqual(['left'])
  })
  it('fires again after a release', () => {
    const r = createRepeater()
    expect(r.tick(new Set(['a'] as const), 0)).toEqual(['a'])
    expect(r.tick(new Set(), 10)).toEqual([])
    expect(r.tick(new Set(['a'] as const), 20)).toEqual(['a'])
  })
})
