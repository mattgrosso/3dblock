/**
 * New-version auto-reload, ported from Cinema Roll (its `src/utils/appUpdate.js`
 * and the App.vue wiring, by way of Rewatchr's Vite adaptation).
 *
 * The problem it solves here was already reported once: "I don't hear sounds"
 * on a build that shipped sound (2026-08-21). The service worker autoUpdates,
 * but the PAGE keeps running whatever build it booted with until a reload, so
 * a tab left open sits a deploy behind indefinitely. The first fix was a
 * `controllerchange` listener that reloaded when no cubes had been played;
 * this module supersedes it and keeps its guard as one clause of a broader
 * safety check.
 *
 * Detection does NOT trust service-worker lifecycle hooks. With
 * `registerType: 'autoUpdate'` a new worker activates immediately, which makes
 * the classic "an update is waiting" hooks a race that the page usually loses.
 * Instead this compares deploys directly: fetch index.html with a cache-busting
 * param (which misses the Workbox precache entry and so actually reaches the
 * network), read the entry bundle filename out of it, and compare against the
 * bundle THIS page loaded. Vite's hashed `assets/index-*.js` is the version
 * fingerprint.
 *
 * Applying is polite, because this is a game and a reload costs a run: one
 * attempt per detected bundle (sessionStorage, so a stuck worker can't
 * reload-loop), immediately only if the page was opened or foregrounded
 * moments ago, otherwise only after a quiet stretch — and never at an unsafe
 * moment (see `isSafeMomentForReload`). Every failure is silent.
 */

import type { Phase } from './game/game'

const BUNDLE_RE = /assets\/index-[A-Za-z0-9_-]+\.js/
const ATTEMPT_KEY = '3dblock.auto-update-attempted-for'
const FRESH_MS = 5000
const QUIET_MS = 25000
const POLL_MS = 5000
const CHECK_INTERVAL_MS = 30 * 60 * 1000

/** Just enough of a `Game` to judge whether a run is worth protecting. */
export interface RunState {
  readonly phase: Phase
  readonly cubesPlayed: number
}

export interface SafetyContext {
  /** The current run, or null before one exists. */
  run?: RunState | null
  activeElement?: { tagName?: string } | null
  /** The bug-report modal is up. */
  bugModalOpen?: boolean
  /** The game-over "post your score" form is showing and unanswered. */
  nameEntryOpen?: boolean
}

export const extractBundleName = (html: string | null | undefined): string | null =>
  html?.match?.(BUNDLE_RE)?.[0] ?? null

/** The bundle THIS page is running, read off its own script tags. */
export const currentBundleName = (doc: Document = document): string | null => {
  for (const script of doc.querySelectorAll('script[src]')) {
    const match = (script.getAttribute('src') ?? '').match(BUNDLE_RE)
    if (match) return match[0]
  }
  return null
}

/**
 * A run in progress is anything that would be lost. Deliberately broad: a
 * PAUSED game loses just as much as a falling one, so pause is not a licence
 * to reload. Zero cubes played is the exception — nothing has been committed
 * to the pit yet, which is exactly the case the old `controllerchange`
 * listener took the update in.
 */
const runInProgress = (run: RunState | null | undefined): boolean =>
  Boolean(run && run.phase === 'playing' && run.cubesPlayed > 0)

const nameEntryShowing = (doc: Document): boolean => {
  const board = doc.getElementById('global-board') as HTMLElement | null
  const form = doc.getElementById('post-score') as HTMLElement | null
  return Boolean(board && !board.hidden && form && !form.hidden)
}

/**
 * Is RIGHT NOW a safe moment to reload out from under the player? Injectable
 * for tests; the defaults read the live page. Unsafe whenever:
 *  - a run is in progress (playing, any cube landed — paused included),
 *  - the game-over name-entry form is up (a reload eats the unposted score),
 *  - the bug-report modal is open (that text exists nowhere else yet),
 *  - a form control has focus (they're typing).
 * Safe: the setup screen, a game over whose score is dealt with, and a fresh
 * game nobody has landed a cube in.
 */
export const isSafeMomentForReload = ({
  run = null,
  activeElement = typeof document === 'undefined' ? null : document.activeElement,
  bugModalOpen = typeof document === 'undefined' ? false : Boolean(document.querySelector('.bug-backdrop')),
  nameEntryOpen = typeof document === 'undefined' ? false : nameEntryShowing(document),
}: SafetyContext = {}): boolean => {
  const tag = activeElement?.tagName ?? ''
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return false
  if (bugModalOpen) return false
  if (nameEntryOpen) return false
  if (runInProgress(run)) return false
  return true
}

/**
 * One auto-attempt per detected target bundle, ever — if the reload doesn't
 * actually land on the new version (stuck worker, cache oddity), do nothing
 * rather than loop.
 */
export const shouldAutoAttempt = (
  targetBundle: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = window.sessionStorage,
): boolean => {
  try {
    if (storage.getItem(ATTEMPT_KEY) === targetBundle) return false
    storage.setItem(ATTEMPT_KEY, targetBundle)
    return true
  } catch {
    return true // storage unavailable: still better to try once than never
  }
}

/**
 * Waits until no service worker install is in flight, so the reload lands on
 * the NEW app instead of a mixed old/new state. Capped; failures never block.
 */
export const waitForNewWorker = async (timeoutMs = 15000): Promise<void> => {
  try {
    const registration = await navigator.serviceWorker?.getRegistration?.()
    if (!registration) return
    await registration.update().catch(() => {})
    const deadline = Date.now() + timeoutMs
    while ((registration.installing ?? registration.waiting) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  } catch {
    // Any surprise here must never eat the reload itself.
  }
}

/**
 * Wire the whole thing up. `getRun` is a getter rather than a value because
 * `start()` replaces the Game object on every new round.
 */
export const setupAutoUpdate = (getRun: () => RunState | null): void => {
  if (!import.meta.env.PROD) return

  let lastActivityAt = Date.now()
  let lastBecameVisibleAt = Date.now()
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let checking = false

  const safeNow = (): boolean => isSafeMomentForReload({ run: getRun() })

  const reloadForUpdate = async (): Promise<void> => {
    await waitForNewWorker()
    location.reload()
  }

  const armAutoUpdate = (targetBundle: string): void => {
    if (!shouldAutoAttempt(targetBundle)) return

    // Fresh moment (just launched or just foregrounded): nothing is in flight
    // yet, so take it now rather than making them wait for a quiet stretch.
    if (Date.now() - lastBecameVisibleAt < FRESH_MS && safeNow()) {
      void reloadForUpdate()
      return
    }

    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(() => {
      if (Date.now() - lastActivityAt > QUIET_MS && safeNow()) {
        if (pollTimer) clearInterval(pollTimer)
        pollTimer = null
        void reloadForUpdate()
      }
    }, POLL_MS)
  }

  const checkForUpdate = async (): Promise<void> => {
    if (checking) return
    checking = true
    try {
      // Nudge the worker too; harmless if there's nothing new.
      const registration = await navigator.serviceWorker?.getRegistration?.()
      await registration?.update()?.catch?.(() => {})

      const running = currentBundleName()
      if (!running) return
      const response = await fetch(`/index.html?updateCheck=${Date.now()}`, { cache: 'no-store' })
      if (!response.ok) return
      const deployed = extractBundleName(await response.text())
      if (deployed && deployed !== running) armAutoUpdate(deployed)
    } catch {
      // Offline or blocked — try again on the next trigger.
    } finally {
      checking = false
    }
  }

  // visibilitychange alone is unreliable on iOS home-screen PWAs; pageshow and
  // focus are more consistent, and the interval backstops all three.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      lastBecameVisibleAt = Date.now()
      void checkForUpdate()
    }
  })
  window.addEventListener('pageshow', () => {
    lastBecameVisibleAt = Date.now()
    void checkForUpdate()
  })
  window.addEventListener('focus', () => void checkForUpdate())
  window.addEventListener('online', () => void checkForUpdate())
  setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS)

  // A new worker taking over is strong evidence a deploy landed, so it's a
  // useful TRIGGER — but only a trigger. The bundle comparison still decides
  // whether anything changed, and the safety rules still decide when to act;
  // that's what this replaced the old unconditional controllerchange reload
  // with. (The first visit's controllerchange, where the initial worker claims
  // the page, is not an update — a check there simply finds nothing new.)
  navigator.serviceWorker?.addEventListener?.('controllerchange', () => void checkForUpdate())

  const noteActivity = (): void => {
    lastActivityAt = Date.now()
  }
  for (const eventName of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) {
    window.addEventListener(eventName, noteActivity, { passive: true })
  }

  void checkForUpdate()
}
