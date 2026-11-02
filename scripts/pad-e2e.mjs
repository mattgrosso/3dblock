// Plays Blockout with a pretend controller (~/code/tools/pad-sim.mjs) and
// checks every control does what the hints say. Runs against the dev server,
// which exposes window.game:  yarn e2e:pad   (starts and stops it itself)
import { spawn } from 'node:child_process'
import { addPad, chromium, checker, hold, press, setPadId, stick, DUALSENSE } from '/Users/mjg/code/tools/pad-sim.mjs'

const PORT = 5199
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
const url = `http://localhost:${PORT}/`
for (let i = 0; i < 60; i++) { try { await fetch(url); break } catch { await new Promise(r => setTimeout(r, 250)) } }

const { ok, done } = checker('Blockout controller')
const browser = await chromium.launch()
// A Steam Deck: touchscreen and a pad. The on-screen pad must give way.
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true })
await addPad(context)
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
await page.goto(url)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForSelector('.overlay.setup')
await page.waitForTimeout(400)
const g = (f) => page.evaluate(f)

console.log('Setup screen')
ok(await page.evaluate(() => document.body.classList.contains('has-gamepad')), 'controller noticed')
ok(!(await page.locator('.touchpad').isVisible().catch(() => false)), 'on-screen touch pad hidden')
await press(page, 'up')
const focused1 = await g(() => document.activeElement?.id || document.activeElement?.tagName)
await press(page, 'down')
const focused2 = await g(() => document.activeElement?.id || document.activeElement?.tagName)
ok(focused1 !== focused2, 'd-pad moves the focus', `${focused1} → ${focused2}`)
// Walk to the start-level select and turn it up with right.
for (let i = 0; i < 12 && (await g(() => document.activeElement?.id)) !== 'setup-level'; i++) await press(page, 'down')
await press(page, 'right')
ok(await g(() => document.getElementById('setup-level')?.value) === '1', 'right changes a setting')
await press(page, 'left')
await press(page, 'Start')
ok(!(await page.locator('.overlay.setup').count()), 'Start begins the game')

console.log('Playing')
await g(() => { window.game.paused = false })
const at = () => g(() => ({ x: game.piece.x, y: game.piece.y, cubes: JSON.stringify(game.piece.cubes), played: game.cubesPlayed }))
// Slow the fall so the checks aren't racing gravity.
await g(() => { Object.defineProperty(game, 'stepTime', { get: () => 999 }) })
let a = await at(); await press(page, 'right'); let b = await at()
ok(b.x === a.x + 1 || b.x === a.x, 'd-pad right moves right (or hits the wall)', `${a.x}→${b.x}`)
a = await at(); await press(page, 'left'); b = await at()
ok(b.x === a.x - 1, 'd-pad left moves left', `${a.x}→${b.x}`)
a = await at(); await press(page, 'down'); b = await at()
ok(b.y === a.y + 1 || b.y === a.y, 'd-pad down moves down the screen', `${a.y}→${b.y}`)
await stick(page, 'left', [-1, 0], 700)
b = await at()
ok(b.x === 0 || b.x < a.x, 'holding the left stick slides all the way', `x=${b.x}`)
a = await at(); await press(page, 'RB'); b = await at()
ok(a.cubes !== b.cubes, 'RB spins the piece')
a = await at(); await press(page, 'LB'); b = await at()
ok(a.cubes !== b.cubes, 'LB spins it back')
a = await at(); await stick(page, 'right', [0, -1]); b = await at()
ok(a.cubes !== b.cubes, 'right stick up tumbles it')
a = await at(); await stick(page, 'right', [1, 0]); b = await at()
ok(a.cubes !== b.cubes, 'right stick right tumbles it the other way')
for (const btn of ['X', 'Y', 'B']) { a = await at(); await press(page, btn); b = await at(); ok(a.cubes !== b.cubes, `${btn} turns the piece`) }
a = await at(); await press(page, 'A'); await page.waitForTimeout(600); b = await at()
ok(b.played > a.played, 'A drops the piece', `${a.played}→${b.played}`)

console.log('Pause and menus')
await press(page, 'Start')
ok(await g(() => game.paused), 'Start pauses')
ok(await page.locator('#overlay').isVisible(), 'pause screen shows')
await page.waitForTimeout(750)
await press(page, 'A')
ok(!(await g(() => game.paused)), 'A resumes')
await press(page, 'View')
ok(await page.locator('.overlay.setup').count() === 1, 'View opens setup')
await press(page, 'Start')

console.log('Game over')
await g(() => { game.phase = 'over' })
await page.waitForTimeout(200)
await press(page, 'A')
ok(await g(() => game.phase) === 'over', 'the drop that ends a game does not restart it')
await page.waitForTimeout(800)
await press(page, 'A')
ok(await g(() => game.phase) === 'playing', 'A then plays again')

console.log('Labels')
ok((await page.locator('.panel--keys').innerText()).includes('LB'), 'Steam Deck pad shows Xbox labels')
await setPadId(page, DUALSENSE)
// The kind is read on connect; a new id shows on the next reconnect.
await g(() => { window.__pad.connected = false }); await page.waitForTimeout(100)
await g(() => { window.__pad.connected = true }); await page.waitForTimeout(150)
const hint = await page.locator('.panel--keys').innerText()
ok(hint.includes('✕') && hint.includes('L1'), 'DualSense shows PlayStation labels', hint.replace(/\s+/g, ' '))
if (process.env.SHOT_PAD) await page.screenshot({ path: process.env.SHOT_PAD })
await g(() => { window.__pad.connected = false }); await page.waitForTimeout(150)
ok(await page.locator('.touchpad').isVisible(), 'unplugged: the touch pad comes back')

await page.screenshot({ path: process.env.SHOT ?? '/tmp/blockout-pad.png' })
ok(!errors.length, 'no page errors', errors.join(' | '))
await browser.close()
server.kill()
process.exit(done() ? 1 : 0)
