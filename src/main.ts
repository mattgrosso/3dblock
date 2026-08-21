import { Game } from './game/game'
import { Renderer } from './render/renderer'
import { PiecePreview } from './render/preview'
import { SETUPS, type Setup } from './game/sets'
import { bestOf, loadScores, recordScore, type ScoreEntry } from './game/highscores'
import { setupInstall } from './install'

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
  </div>
  <div class="panel panel--next">
    <span class="label">Next</span>
    <div id="preview"></div>
    <div class="muted" id="setup-name"></div>
    <div class="muted" id="setup-detail"></div>
  </div>
  <div class="panel panel--keys">
    <div><kbd>&larr;</kbd><kbd>&rarr;</kbd><kbd>&uarr;</kbd><kbd>&darr;</kbd> move &middot;
      <kbd>Q</kbd><kbd>W</kbd> rotate X &middot; <kbd>A</kbd><kbd>S</kbd> rotate Y &middot; <kbd>Z</kbd><kbd>X</kbd> rotate Z</div>
    <div><kbd>Space</kbd> drop &middot; <kbd>P</kbd> pause &middot; <kbd>N</kbd> new game &middot; <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> setup</div>
  </div>
  <div class="overlay" id="overlay" hidden>
    <h1 id="overlay-title">Pit full</h1>
    <p id="final"></p>
    <table class="scores" id="scores"></table>
    <p class="muted">Press <kbd>N</kbd> to play again</p>
  </div>
`
app.appendChild(hud)

const el = (id: string) => document.getElementById(id)!

let setup: Setup = SETUPS[0]!
let game: Game
let renderer: Renderer
let preview: PiecePreview
let stage: HTMLDivElement
let scores: ScoreEntry[] = []
let recorded = false

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

const start = (chosen: Setup): void => {
  setup = chosen
  preview?.dispose()
  stage?.remove()
  stage = document.createElement('div')
  stage.className = 'stage'
  app.insertBefore(stage, hud)

  game = new Game(setup)
  renderer = new Renderer(stage, game)
  preview = new PiecePreview(el('preview'))
  scores = loadScores(setup)
  recorded = false

  el('setup-name').textContent = setup.name
  el('setup-detail').textContent = `${setup.set} · ${setup.width}×${setup.height}×${setup.depth}`
  el('best').textContent = String(bestOf(scores))
  el('overlay').hidden = true

  if (import.meta.env.DEV) Object.assign(window, { game, renderer })
}

const rotations: Record<string, [Parameters<Game['rotate']>[0], Parameters<Game['rotate']>[1]]> = {
  q: ['x', 1], w: ['x', -1],
  a: ['y', 1], s: ['y', -1],
  z: ['z', 1], x: ['z', -1],
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase()

  if (key === 'n') { start(setup); return }
  if (key === '1' || key === '2' || key === '3') { start(SETUPS[Number(key) - 1]!); return }

  if (key === 'p' && game.phase === 'playing') {
    const paused = game.togglePause()
    el('overlay').hidden = !paused
    if (paused) {
      el('overlay-title').textContent = 'Paused'
      el('final').textContent = ''
      renderScoreTable()
    }
    return
  }

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

start(setup)
setupInstall()

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
    scores = recordScore(setup, entry)
    el('best').textContent = String(bestOf(scores))
    el('overlay-title').textContent = 'Pit full'
    el('final').textContent =
      `${game.score} points · level ${game.level} · ${game.layersCleared} layers`
    renderScoreTable(entry)
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
