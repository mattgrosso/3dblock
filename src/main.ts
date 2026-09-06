import { Game } from './game/game'
import { Renderer } from './render/renderer'
import { PiecePreview } from './render/preview'
import { SETUPS } from './game/sets'
import { loadConfig, openSetup, type GameConfig } from './ui/setup'
import { setupTouchControls, supportsTouch } from './ui/touch'
import { setupBugReport } from './ui/bugreport'
import { DEFAULT_THEME, resolveTheme } from './render/themes'
import { Sound } from './sound'
import { bestOf, loadScores, recordScore, type ScoreEntry } from './game/highscores'
import { cleanName, fetchTop, qualifies, rememberName, rememberedName, submitScore, type GlobalEntry } from './game/leaderboard'
import { recordPlay } from './game/plays'
import { setupInstall } from './install'
import { setupAutoUpdate } from './appUpdate'
import { buildStamp } from './buildStamp'

const app = document.querySelector<HTMLDivElement>('#app')!

const hud = document.createElement('div')
hud.className = 'hud'
hud.innerHTML = `
  <div class="panel panel--stats">
    <div class="stat"><span>Score</span><b id="score">0</b></div>
    <div class="stat"><span>Level</span><b id="level">0</b></div>
    <div class="stat"><span>Layers</span><b id="layers">0</b></div>
    <div class="stat"><span>Cubes</span><b id="cubes">0</b></div>
    <div class="stat"><span>Best</span><b id="best">0</b></div>
    <button type="button" id="mute" class="mute" title="Mute (M)">♪</button>
  </div>
  <div class="panel panel--next">
    <span class="label">Next</span>
    <div id="preview"></div>
    <div class="muted" id="setup-name"></div>
    <div class="muted" id="setup-detail"></div>
  </div>
  <div class="panel panel--keys">
    <div><kbd>&larr;</kbd><kbd>&rarr;</kbd><kbd>&uarr;</kbd><kbd>&darr;</kbd> move &middot;
      <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> rotate X / Y / Z &middot; <kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd> reverse</div>
    <div><kbd>Space</kbd> drop &middot; <kbd>P</kbd> pause &middot; <kbd>N</kbd> new game &middot; <kbd>Esc</kbd> setup &middot; <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> presets</div>
  </div>
  <div class="overlay" id="overlay" hidden>
    <h1 id="overlay-title">Pit full</h1>
    <p id="final"></p>
    <table class="scores" id="scores"></table>
    <!-- The global board for this setup, game-over only. Local scores answer
         "my best here"; this answers "anyone's best here". -->
    <div id="global-board" hidden>
      <div class="global-board__title">World top 10</div>
      <table class="scores" id="global-scores"></table>
      <form id="post-score" hidden>
        <input id="player-name" maxlength="20" autocomplete="nickname" placeholder="Your name">
        <button type="submit" id="post-button">Post score</button>
      </form>
    </div>
    <!-- Buttons, not just key hints. On a phone the overlay covers the touch
         pad, so a keyboard-only "press N" is a dead end with no way out. -->
    <div class="overlay__actions">
      <button type="button" id="overlay-primary">Play again</button>
      <button type="button" id="overlay-setup">Change setup</button>
    </div>
  </div>
`
app.appendChild(hud)

const el = (id: string) => document.getElementById(id)!

let config: GameConfig = loadConfig() ?? { ...SETUPS[0]!, startLevel: 0, theme: DEFAULT_THEME, guide: false }
let game: Game
let renderer: Renderer
let preview: PiecePreview
let stage: HTMLDivElement
let scores: ScoreEntry[] = []
let recorded = false
const sound = new Sound()

const renderScoreTable = (highlight?: ScoreEntry): void => {
  if (!scores.length) {
    el('scores').innerHTML = '<tr><td class="muted">No scores yet</td></tr>'
    return
  }
  el('scores').innerHTML = scores
    .map((entry, i) => {
      const mine = entry === highlight ? ' class="mine"' : ''
      const date = new Date(entry.at).toLocaleDateString()
      return `<tr${mine}><td>${i + 1}</td><td>${entry.score}</td><td class="muted">lvl ${entry.level}</td><td class="muted">${entry.layers} layers</td><td class="muted">${date}</td></tr>`
    })
    .join('')
}

const togglePause = (): void => {
  if (game.phase !== 'playing') return
  const paused = game.togglePause()
  el('overlay').hidden = !paused
  if (paused) {
    el('overlay-title').textContent = 'Paused'
    el('final').textContent = ''
    el('overlay-primary').textContent = 'Resume'
    el('global-board').hidden = true // game-over only
    renderScoreTable()
  }
}

// ---- The global leaderboard (game-over overlay only) ----

let globalBoard: GlobalEntry[] = []
/** The just-finished run, while its post form is showing. */
let postable: ScoreEntry | null = null

const renderGlobalTable = (highlight?: { name: string; score: number }): void => {
  const rows = globalBoard.map((entry, i) => {
    const mine = highlight && entry.name === highlight.name && entry.score === highlight.score
    return `<tr${mine ? ' class="mine"' : ''}><td>${i + 1}</td><td class="global-name"></td><td>${entry.score}</td><td class="muted">lvl ${entry.level}</td></tr>`
  }).join('')
  el('global-scores').innerHTML = rows || '<tr><td class="muted">No scores posted yet — be first</td></tr>'
  // Names are other people's text: they go in as textContent, never markup.
  const nameCells = el('global-scores').querySelectorAll('.global-name')
  globalBoard.forEach((entry, i) => { nameCells[i]!.textContent = entry.name })
}

const showGlobalBoard = async (entry: ScoreEntry): Promise<void> => {
  const board = el('global-board')
  board.hidden = true
  el('post-score').hidden = true
  postable = null

  // Offline or refused: the overlay simply stays local, as before.
  try {
    globalBoard = await fetchTop(config)
  } catch {
    return
  }
  // A slow fetch can outlive the screen it was for.
  if (game.phase !== 'over') return

  renderGlobalTable()
  board.hidden = false

  if (qualifies(globalBoard, entry.score)) {
    postable = entry
    const input = el('player-name') as HTMLInputElement
    input.value = rememberedName()
    el('post-score').hidden = false
  }
}

const start = (chosen: GameConfig): void => {
  config = chosen
  preview?.dispose()
  stage?.remove()
  stage = document.createElement('div')
  stage.className = 'stage'
  app.insertBefore(stage, hud)

  game = new Game({ ...config, startLevel: config.startLevel })
  // A game counts toward the start screen's "most popular" once a piece has
  // actually landed - not on start, or every press of N and 1-4 while
  // flipping between presets would count as a game. Dev runs stay out of
  // the production tally.
  let counted = import.meta.env.DEV
  game.onEvent = (event) => {
    sound.handle(event)
    if (event === 'lock' && !counted) {
      counted = true
      recordPlay(config).catch(() => { /* a lost count is a rounding error */ })
    }
  }
  // Resolved per game, which is what makes 'Random' a new look every round.
  const theme = resolveTheme(config.theme)
  renderer = new Renderer(stage, game, theme, config.guide)
  preview = new PiecePreview(el('preview'), theme)
  scores = loadScores(config)
  recorded = false

  el('setup-name').textContent = config.name
  el('setup-detail').textContent =
    `${config.set} · ${config.width}×${config.height}×${config.depth}`
    + (config.startLevel ? ` · from level ${config.startLevel}` : '')
  el('best').textContent = String(bestOf(scores))
  el('overlay').hidden = true
  el('global-board').hidden = true

  if (import.meta.env.DEV) Object.assign(window, { game, renderer })
}

// A/S/D turn each axis one way; the key above each turns it back. Keeping the
// pairs in columns rather than in a row means the reverse of any rotation is
// always the key directly above it.
// One glyph, two unmistakable states. The old muted glyph was ♪ plus a
// combining slash, which some systems render identically to plain ♪ - the
// strikethrough now comes from CSS (.mute--off), which always draws.
const renderMute = (muted: boolean): void => {
  el('mute').textContent = '♪'
  el('mute').classList.toggle('mute--off', muted)
  el('mute').title = muted ? 'Unmute (M)' : 'Mute (M)'
}

const rotations: Record<string, [Parameters<Game['rotate']>[0], Parameters<Game['rotate']>[1]]> = {
  a: ['x', 1], q: ['x', -1],
  s: ['y', 1], w: ['y', -1],
  d: ['z', 1], e: ['z', -1],
}

window.addEventListener('keydown', (event) => {
  // Typing in a form control - the bug-report textarea, the setup selects -
  // must not rotate pieces or restart the game.
  if (
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLSelectElement
  ) return

  const key = event.key.toLowerCase()

  // Any key is a user gesture, which is the only thing that can start audio.
  void sound.unlock()

  if (key === 'm') { renderMute(sound.toggleMute()); void sound.confirm(); return }
  if (key === 'n') { start(config); return }
  // Not 'S' - that is already rotate-Y.
  if (key === 'escape') { openSetup(config, start); return }
  if (key >= '1' && key <= String(SETUPS.length)) {
    start({ ...SETUPS[Number(key) - 1]!, startLevel: 0, theme: config.theme, guide: config.guide })
    return
  }

  if (key === 'p' && game.phase === 'playing') { togglePause(); return }

  if (game.phase !== 'playing' || game.paused) return

  switch (event.key) {
    case 'ArrowLeft': game.move(-1, 0); break
    case 'ArrowRight': game.move(1, 0); break
    case 'ArrowUp': game.move(0, -1); break
    case 'ArrowDown': game.move(0, 1); break
    case ' ': game.hardDrop(); break
    default: {
      const rotation = rotations[key]
      if (rotation) game.rotate(rotation[0], rotation[1])
      else return
    }
  }
  // Arrow keys and space scroll the page otherwise, which fights the game.
  event.preventDefault()
})

// First visit gets the setup screen; after that it starts straight into
// whatever you last played, since that's what you almost always want.
const stored = loadConfig()
el('overlay-primary').addEventListener('click', () => {
  // One button, two jobs: resume a paused game, restart a finished one.
  if (game.phase === 'playing' && game.paused) togglePause()
  else start(config)
})
el('overlay-setup').addEventListener('click', () => {
  if (game.paused) game.togglePause()
  el('overlay').hidden = true
  openSetup(config, start)
})

el('post-score').addEventListener('submit', (event) => {
  event.preventDefault()
  const entry = postable
  const name = cleanName((el('player-name') as HTMLInputElement).value)
  if (!entry || !name) return

  const button = el('post-button') as HTMLButtonElement
  button.disabled = true
  button.textContent = 'Posting…'

  submitScore(config, { name, score: entry.score, level: entry.level, layers: entry.layers }).then(
    async () => {
      rememberName(name)
      postable = null
      el('post-score').hidden = true
      // Re-read rather than splice locally, so what's shown is what the
      // board actually holds - including anyone who posted meanwhile.
      try {
        globalBoard = await fetchTop(config)
      } catch { /* the local render below still shows the pre-post board */ }
      renderGlobalTable({ name, score: entry.score })
      button.disabled = false
      button.textContent = 'Post score'
    },
    () => {
      // Keep the form; the score is still theirs to post on a retry.
      button.disabled = false
      button.textContent = 'Try again'
    },
  )
})

el('mute').addEventListener('click', () => {
  renderMute(sound.toggleMute())
  // Unmuting answers with a blip - the toggle proves itself audibly.
  void sound.confirm()
})
renderMute(sound.isMuted)
// A pointer press is a gesture too - on a phone it's the only one there is.
window.addEventListener('pointerdown', () => void sound.unlock(), { once: true })

start(config)
setupInstall()
setupBugReport(
  () => ({
    config,
    score: game.score,
    level: game.level,
    layers: game.layersCleared,
    cubes: game.cubesPlayed,
    phase: game.phase,
    paused: game.paused,
    touch: document.body.classList.contains('has-touchpad'),
    build: buildStamp(),
  }),
  // Pause before the panel opens, or the piece keeps falling while they type.
  () => { if (game.phase === 'playing' && !game.paused) togglePause() },
)
if (supportsTouch()) setupTouchControls(() => game, togglePause)
if (!stored) openSetup(config, start)

// The service worker autoUpdates, but the PAGE keeps running whatever build
// it booted with until a reload - which is how "I don't hear sounds" happened
// on a build that shipped sound: the tab was one deploy behind (2026-08-21).
// That was first patched with a controllerchange listener that reloaded when
// no cubes had been played; appUpdate.ts now owns the whole job - it notices a
// deploy by comparing bundle filenames rather than trusting worker lifecycle
// events, and only reloads at a moment that costs the player nothing.
setupAutoUpdate(() => game)

/**
 * One frame's worth of work, separated from the requestAnimationFrame driver
 * so it can be stepped by hand. A hidden tab gets no rAF callbacks at all, so
 * without this there is no way to advance the game from a console or an
 * automated browser - and every symptom looks like broken input.
 */
const frame = (dt: number): void => {
  game.update(dt)
  renderer.render()
  preview.render(game.next, game.paused ? 0 : dt)

  el('score').textContent = String(game.score)
  el('level').textContent = String(game.level)
  el('layers').textContent = String(game.layersCleared)
  el('cubes').textContent = String(game.cubesPlayed)

  if (game.phase === 'over' && !recorded) {
    recorded = true
    const entry: ScoreEntry = {
      score: game.score,
      level: game.level,
      layers: game.layersCleared,
      cubes: game.cubesPlayed,
      at: new Date().toISOString(),
    }
    scores = recordScore(config, entry)
    el('best').textContent = String(bestOf(scores))
    el('overlay-title').textContent = 'Pit full'
    el('overlay-primary').textContent = 'Play again'
    el('final').textContent =
      `${game.score} points · level ${game.level} · ${game.layersCleared} layers`
    renderScoreTable(entry)
    void showGlobalBoard(entry)
    el('overlay').hidden = false
  }
}

if (import.meta.env.DEV) Object.assign(window, { frame })

let last = performance.now()
const loop = (now: number): void => {
  // Clamped so a tab that was hidden for a while doesn't come back and drop a
  // piece through the whole pit in one catch-up step.
  const dt = Math.min((now - last) / 1000, 0.25)
  last = now
  frame(dt)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
