import { BLOCK_SETS, PIT_LIMITS, SETUPS, type BlockSet, type Setup } from '../game/sets'
import { MAX_LEVEL } from '../game/scoring'

export interface GameConfig extends Setup {
  readonly startLevel: number
}

const STORAGE_KEY = '3dblock.config'

const DEFAULT_CONFIG: GameConfig = { ...SETUPS[0]!, startLevel: 0 }

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(value)))

/** Anything stored could be from an older build or hand-edited; clamp it all. */
export const normalizeConfig = (raw: unknown): GameConfig => {
  const c = (raw ?? {}) as Partial<GameConfig>
  const set: BlockSet = BLOCK_SETS.includes(c.set as BlockSet) ? (c.set as BlockSet) : 'FLAT'
  const width = clamp(Number(c.width) || 5, PIT_LIMITS.minSide, PIT_LIMITS.maxSide)
  const height = clamp(Number(c.height) || 5, PIT_LIMITS.minSide, PIT_LIMITS.maxSide)
  const depth = clamp(Number(c.depth) || 12, PIT_LIMITS.minDepth, PIT_LIMITS.maxDepth)
  const startLevel = clamp(Number(c.startLevel) || 0, 0, MAX_LEVEL)
  return { name: nameFor({ set, width, height, depth }), set, width, height, depth, startLevel }
}

/**
 * A configuration that matches one of the three scored setups takes its name,
 * however it was arrived at - so building 5x5x12 FLAT by hand still records a
 * "Flat Fun" score rather than a separate "Custom" one.
 */
export const nameFor = (pit: Omit<Setup, 'name'>): string => {
  const known = SETUPS.find(
    (s) => s.set === pit.set && s.width === pit.width && s.height === pit.height && s.depth === pit.depth,
  )
  return known ? known.name : 'Custom'
}

export const loadConfig = (): GameConfig | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? normalizeConfig(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export const saveConfig = (config: GameConfig): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Not worth interrupting a game over.
  }
}

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i)

const options = (values: number[], selected: number): string =>
  values.map((v) => `<option value="${v}"${v === selected ? ' selected' : ''}>${v}</option>`).join('')

const SET_BLURB: Record<BlockSet, string> = {
  FLAT: '8 pieces, all one cube thick',
  BASIC: '7 simple solids',
  EXTENDED: 'all 41 pieces',
}

export const openSetup = (
  current: GameConfig | null,
  onStart: (config: GameConfig) => void,
): void => {
  const config = current ?? DEFAULT_CONFIG
  const root = document.createElement('div')
  root.className = 'overlay setup'
  root.innerHTML = `
    <div class="setup__panel">
      <h1>Blockout</h1>
      <p class="muted">Polycubes fall into a well. Fill a whole layer to clear it.</p>

      <div class="setup__presets">
        ${SETUPS.map(
          (s, i) => `<button type="button" class="setup__preset" data-preset="${i}">
            <b>${s.name}</b><span class="muted">${s.set} · ${s.width}×${s.height}×${s.depth}</span>
          </button>`,
        ).join('')}
      </div>

      <label class="setup__row">
        <span>Block set</span>
        <select id="setup-set">
          ${BLOCK_SETS.map(
            (s) => `<option value="${s}"${s === config.set ? ' selected' : ''}>${s} — ${SET_BLURB[s]}</option>`,
          ).join('')}
        </select>
      </label>

      <div class="setup__row setup__row--pit">
        <span>Pit</span>
        <div class="setup__pit">
          <select id="setup-width">${options(range(PIT_LIMITS.minSide, PIT_LIMITS.maxSide), config.width)}</select>
          <i>×</i>
          <select id="setup-height">${options(range(PIT_LIMITS.minSide, PIT_LIMITS.maxSide), config.height)}</select>
          <i>×</i>
          <select id="setup-depth">${options(range(PIT_LIMITS.minDepth, PIT_LIMITS.maxDepth), config.depth)}</select>
        </div>
      </div>

      <label class="setup__row">
        <span>Start level</span>
        <select id="setup-level">${options(range(0, MAX_LEVEL), config.startLevel)}</select>
      </label>

      <p class="setup__note muted" id="setup-note"></p>

      <button type="button" class="setup__start" id="setup-start">Play</button>
    </div>
  `
  document.body.appendChild(root)

  const sel = <T extends HTMLElement>(id: string): T => root.querySelector<T>('#' + id)!
  const setSel = sel<HTMLSelectElement>('setup-set')
  const widthSel = sel<HTMLSelectElement>('setup-width')
  const heightSel = sel<HTMLSelectElement>('setup-height')
  const depthSel = sel<HTMLSelectElement>('setup-depth')
  const levelSel = sel<HTMLSelectElement>('setup-level')

  const read = (): GameConfig =>
    normalizeConfig({
      set: setSel.value,
      width: Number(widthSel.value),
      height: Number(heightSel.value),
      depth: Number(depthSel.value),
      startLevel: Number(levelSel.value),
    })

  // Both of these surprise people, so say them out loud rather than letting
  // someone discover them from a scoreboard that doesn't add up.
  const describe = (): void => {
    const c = read()
    const parts = [`${c.name} — scores are kept per set and pit size.`]
    parts.push(
      c.depth <= 8
        ? 'A shallow pit scores much more per layer.'
        : c.depth >= 15
          ? 'A deep pit is forgiving, and scores less per layer.'
          : 'Only depth changes the score — width and height do not.',
    )
    if (c.startLevel > 0) parts.push('Starting high is pure difficulty: it does not shorten the climb.')
    sel<HTMLElement>('setup-note').textContent = parts.join(' ')
  }

  for (const el of [setSel, widthSel, heightSel, depthSel, levelSel]) {
    el.addEventListener('change', describe)
  }

  root.querySelectorAll<HTMLButtonElement>('.setup__preset').forEach((button) => {
    button.addEventListener('click', () => {
      const preset = SETUPS[Number(button.dataset.preset)]!
      setSel.value = preset.set
      widthSel.value = String(preset.width)
      heightSel.value = String(preset.height)
      depthSel.value = String(preset.depth)
      describe()
    })
  })

  const start = (): void => {
    const chosen = read()
    saveConfig(chosen)
    root.remove()
    onStart(chosen)
  }

  sel<HTMLButtonElement>('setup-start').addEventListener('click', start)
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') start()
  })

  describe()
  sel<HTMLButtonElement>('setup-start').focus()
}
