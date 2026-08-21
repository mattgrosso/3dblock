import { Game } from './game/game'
import { Renderer } from './render/renderer'
import { SETUPS, type Setup } from './game/sets'

const app = document.querySelector<HTMLDivElement>('#app')!

const hud = document.createElement('div')
hud.className = 'hud'
hud.innerHTML = `
  <div class="panel panel--stats">
    <div class="stat"><span>Score</span><b id="score">0</b></div>
    <div class="stat"><span>Level</span><b id="level">0</b></div>
    <div class="stat"><span>Layers</span><b id="layers">0</b></div>
    <div class="stat"><span>Cubes</span><b id="cubes">0</b></div>
  </div>
  <div class="panel panel--setup">
    <div id="setup-name"></div>
    <div class="muted" id="setup-detail"></div>
  </div>
  <div class="panel panel--keys">
    <div><kbd>&larr;</kbd><kbd>&rarr;</kbd><kbd>&uarr;</kbd><kbd>&darr;</kbd> move</div>
    <div><kbd>Q</kbd><kbd>W</kbd> rotate X &middot; <kbd>A</kbd><kbd>S</kbd> rotate Y &middot; <kbd>Z</kbd><kbd>X</kbd> rotate Z</div>
    <div><kbd>Space</kbd> drop &middot; <kbd>N</kbd> new game &middot; <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> setup</div>
  </div>
  <div class="overlay" id="overlay" hidden>
    <h1>Pit full</h1>
    <p id="final"></p>
    <p class="muted">Press <kbd>N</kbd> to play again</p>
  </div>
`
app.appendChild(hud)

const el = (id: string) => document.getElementById(id)!

let setup: Setup = SETUPS[0]!
let game: Game
let renderer: Renderer
let stage: HTMLDivElement

const start = (chosen: Setup): void => {
  setup = chosen
  stage?.remove()
  stage = document.createElement('div')
  stage.className = 'stage'
  app.insertBefore(stage, hud)

  game = new Game(setup)
  renderer = new Renderer(stage, game)

  // A handle for poking at a running game from the console. Also the only way
  // to drive it from an automated browser: a background tab gets no
  // requestAnimationFrame callbacks at all, so the loop below simply doesn't
  // run and nothing on screen changes however many keys you send.
  if (import.meta.env.DEV) {
    Object.assign(window, { game, renderer })
  }
  el('setup-name').textContent = setup.name
  el('setup-detail').textContent =
    `${setup.set} · ${setup.width}×${setup.height}×${setup.depth}`
  el('overlay').hidden = true
}

const rotations: Record<string, [Parameters<Game['rotate']>[0], Parameters<Game['rotate']>[1]]> = {
  q: ['x', 1],
  w: ['x', -1],
  a: ['y', 1],
  s: ['y', -1],
  z: ['z', 1],
  x: ['z', -1],
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase()

  if (key === 'n') {
    start(setup)
    return
  }
  if (key === '1' || key === '2' || key === '3') {
    start(SETUPS[Number(key) - 1]!)
    return
  }
  if (game.phase !== 'playing') return

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

let last = performance.now()
const loop = (now: number): void => {
  // Clamped so a backgrounded tab doesn't return and instantly drop a piece
  // through the whole pit in one catch-up step.
  const dt = Math.min((now - last) / 1000, 0.25)
  last = now

  game.update(dt)
  renderer.render()

  el('score').textContent = String(game.score)
  el('level').textContent = String(game.level)
  el('layers').textContent = String(game.layersCleared)
  el('cubes').textContent = String(game.cubesPlayed)

  if (game.phase === 'over' && el('overlay').hidden) {
    el('overlay').hidden = false
    el('final').textContent = `${game.score} points · level ${game.level} · ${game.layersCleared} layers`
  }

  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
