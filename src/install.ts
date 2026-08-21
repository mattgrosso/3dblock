/**
 * Add-to-home-screen, ported from Thunderstoner's InstallPrompt so all three
 * games on the hub behave the same way.
 *
 * There is no single API for this. Android/Chrome fires `beforeinstallprompt`,
 * which can be captured and replayed for a genuine one-tap install. iOS Safari
 * has no JS hook at all - Apple keeps "Add to Home Screen" a manual Share-sheet
 * action on purpose - so the closest a page can get is showing exactly which
 * taps to make. Everything below is those two paths and nothing else.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const isIos = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)

/**
 * `navigator.standalone` is iOS Safari's own non-standard flag for "launched
 * from a home-screen icon"; matchMedia covers everything else. Someone who
 * already installed this shouldn't be offered it again.
 */
const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const iosPanel = (): HTMLElement => {
  const backdrop = document.createElement('div')
  backdrop.className = 'install-backdrop'
  backdrop.innerHTML = `
    <div class="install-panel" role="dialog" aria-label="Add to Home Screen">
      <h2>Add to Home Screen</h2>
      <ol>
        <li>Tap <strong>Share</strong> in Safari's toolbar</li>
        <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
        <li>Tap <strong>Add</strong></li>
      </ol>
      <p class="muted">Safari only — iOS doesn't let Chrome or other browsers do
      this. That's an Apple restriction, not something this site controls.</p>
      <button type="button" class="install-panel__close">Got it</button>
    </div>
  `
  const close = (): void => backdrop.remove()
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close() })
  backdrop.querySelector('.install-panel__close')!.addEventListener('click', close)
  return backdrop
}

export const setupInstall = (): void => {
  if (isStandalone()) return

  let deferred: BeforeInstallPromptEvent | null = null

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'install-button'
  button.hidden = true
  button.title = 'Add Blockout to your home screen'
  button.innerHTML = 'Install'
  document.body.appendChild(button)

  const showIosSteps = (): void => {
    document.body.appendChild(iosPanel())
  }

  const promptInstall = async (): Promise<void> => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    deferred = null
    button.hidden = true
  }

  button.addEventListener('click', () => {
    if (deferred) void promptInstall()
    else if (isIos()) showIosSteps()
  })

  // Set by the hub's "Install" link on aroundtableround.com. A page can only
  // trigger its *own* origin's install prompt - beforeinstallprompt never fires
  // cross-origin - so the hub can't do this itself; it just sends people here
  // with ?install=1 and this skips them straight to the real flow rather than
  // making them hunt for a second button.
  const wantsAutoInstall = new URLSearchParams(window.location.search).get('install') === '1'

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    button.hidden = false
    if (wantsAutoInstall) void promptInstall()
  })

  if (isIos()) {
    button.hidden = false
    if (wantsAutoInstall) showIosSteps()
  }
}
