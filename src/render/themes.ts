import * as THREE from 'three'

/**
 * Colour themes. A theme owns every colour in the scene: the well itself, the
 * falling piece, and the palette the locked stack is painted with.
 *
 * Locked cubes are coloured by the LAYER they sit in, the way the original
 * does it - so one piece can end up wearing two colours, and a glance at the
 * stack tells you its height the same way contour lines tell you altitude.
 */
export interface Theme {
  readonly name: string
  readonly background: number
  /** The pit's wireframe grid. */
  readonly frame: number
  /** The bright ring at the mouth of the pit. */
  readonly mouth: number
  readonly floor: number
  /** Colour of a locked cube, by the depth layer it occupies. */
  layerColor(z: number): THREE.Color
  /** Colour of the falling piece, its landing guide, and the preview. */
  pieceColor(id: number): THREE.Color
}

const paletteTheme = (
  name: string,
  scene: { background: number; frame: number; mouth: number; floor: number },
  palette: readonly number[],
): Theme => ({
  name,
  ...scene,
  layerColor: (z) => new THREE.Color(palette[z % palette.length]!),
  pieceColor: (id) => new THREE.Color(palette[id % palette.length]!),
})

export const THEMES: readonly Theme[] = [
  // Saturated hues on the existing midnight-blue well. The golden-angle hue
  // step keeps neighbouring layers far apart on the wheel, which is the whole
  // point of colouring by layer.
  {
    name: 'Neon',
    background: 0x0b0e14,
    frame: 0x3d4f73,
    mouth: 0x6ea8ff,
    floor: 0x121826,
    layerColor: (z) => new THREE.Color().setHSL((z * 0.618034) % 1, 1.0, 0.6),
    pieceColor: (id) => new THREE.Color().setHSL(((id + 1) * 0.618034) % 1, 0.95, 0.62),
  },
  // The 1989 look: pure primaries on black, grey wireframe.
  paletteTheme(
    'Arcade',
    { background: 0x000005, frame: 0x8890a0, mouth: 0xffffff, floor: 0x101018 },
    [0xff2222, 0xffdd00, 0x22cc44, 0x00cccc, 0x3355ff, 0xdd44dd],
  ),
  paletteTheme(
    'Candy',
    { background: 0x1a0f2e, frame: 0x6a4d9e, mouth: 0xff8ad8, floor: 0x241540 },
    [0xff5fa2, 0x4de3c1, 0xffd166, 0x6ec6ff, 0xc792ea, 0xff8a5c],
  ),
  paletteTheme(
    'Ember',
    { background: 0x160c08, frame: 0x7a4a30, mouth: 0xffb454, floor: 0x221008 },
    [0xff6b35, 0xffd166, 0xef476f, 0xff9770, 0xf9c74f, 0xe63946],
  ),
]

export const RANDOM_THEME = 'Random'

/** What the setup screen offers: every theme, plus a new one each game. */
export const THEME_CHOICES: readonly string[] = [...THEMES.map((t) => t.name), RANDOM_THEME]

export const DEFAULT_THEME = THEMES[0]!.name

/** 'Random' resolves to a concrete theme; so does anything unrecognised. */
export const resolveTheme = (choice: string, random: () => number = Math.random): Theme =>
  THEMES.find((t) => t.name === choice) ?? THEMES[Math.floor(random() * THEMES.length)]!
