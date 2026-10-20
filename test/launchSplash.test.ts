import { describe, it, expect } from 'vitest'
import html from '../index.html?raw'
import main from '../src/main.ts?raw'
import viteConfig from '../vite.config.ts?raw'

// The launch splash (2026-10-20): opening the home-screen app used to show a
// plain white page until the bundle arrived. index.html now paints dark from
// the first byte, shows the icon and name inside #app until main.ts removes
// them, and hands iOS a launch image for every current iPhone screen.
// (Raw imports and import.meta.glob rather than fs: this project has no
// @types/node, and tsc checks the tests too.)
const launchImages = Object.keys(import.meta.glob('../public/launch/*.png'))
const splashIcon = Object.keys(import.meta.glob('../public/splash-icon.png'))

describe('launch splash', () => {
  it('paints the page dark before any bundled CSS loads', () => {
    const inlineStyle = html.match(/<style>([\s\S]*?)<\/style>/)![1]
    expect(inlineStyle).toMatch(/html, body \{ background-color: #0b0e14; \}/)
  })

  it('puts the splash inside #app, with an icon that exists', () => {
    const app = html.match(/<div id="app">([\s\S]*?)<\/div>\s*<script/)![1]
    expect(app).toContain('class="launch-splash"')
    expect(app).toContain('src="/splash-icon.png"')
    expect(app).toContain('Blockout')
    expect(splashIcon).toHaveLength(1)
  })

  it('removes the splash once the game is built (appendChild would leave it on top)', () => {
    expect(main).toMatch(/querySelector\('\.launch-splash'\)\?\.remove\(\)/)
  })

  it('keeps the launch images out of the service worker precache', () => {
    expect(viteConfig).toMatch(/globIgnores: \['launch\/\*\*'\]/)
  })

  it('has a launch image for each listed iPhone screen', () => {
    const links = [...html.matchAll(/<link rel="apple-touch-startup-image" href="([^"]+)" media="\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\)/g)]
    expect(links.length).toBeGreaterThanOrEqual(10)
    for (const [, href, w, h, dpr] of links) {
      expect(href).toBe(`/launch/launch-${Number(w) * Number(dpr)}x${Number(h) * Number(dpr)}.png`)
      expect(launchImages, href).toContain(`../public${href}`)
    }
    // The current Pro size (Matt's phone) is covered.
    expect(links.some(([, , w, h, dpr]) => w === '402' && h === '874' && dpr === '3')).toBe(true)
  })
})
