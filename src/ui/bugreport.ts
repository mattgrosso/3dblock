/**
 * In-app bug reporting, the same pattern as the other apps (Cinema Roll ->
 * Meal Hat -> Thunderstoner): a small always-visible button, a plain textarea,
 * and a write-only Firebase node read back by a CLI script.
 *
 * This game has no backend and no Firebase SDK, and one bug report is not a
 * reason to grow either - reports POST straight to the games hub's Realtime
 * Database over REST. The node lives in the Thunderstoner project, which
 * already collects reports for two other hub games; see `blockoutBugReports`
 * in that repo's database.rules.json for the write-only rule. Triage with
 * `yarn fetch-bug-reports` here.
 */

const ENDPOINT = 'https://thunderstoner-876f8-default-rtdb.firebaseio.com/blockoutBugReports.json'

// Offline stash, because this is an installable PWA: a report filed with no
// signal waits in localStorage and goes out on the next launch or send.
const STASH_KEY = '3dblock.pendingBugReports'
const STASH_LIMIT = 10

type Report = Record<string, unknown>

const readStash = (): Report[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STASH_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeStash = (reports: Report[]): void => {
  try {
    localStorage.setItem(STASH_KEY, JSON.stringify(reports.slice(-STASH_LIMIT)))
  } catch {
    // Storage full or blocked; a best-effort stash has nothing more to do.
  }
}

const post = async (report: Report): Promise<void> => {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    // createdAt is stamped by the server on the eventual write; a stashed
    // report keeps its clientCreatedAt as the moment it was actually filed.
    body: JSON.stringify({ ...report, createdAt: { '.sv': 'timestamp' } }),
  })
  if (!response.ok) throw new Error(`Bug report failed: ${response.status}`)
}

const flushStash = async (): Promise<void> => {
  const stash = readStash()
  if (!stash.length || !navigator.onLine) return
  let sent = 0
  for (const report of stash) {
    try {
      await post(report)
      sent += 1
    } catch {
      break // Still unreachable - keep the rest for next time.
    }
  }
  if (sent) writeStash(stash.slice(sent))
}

const buildReport = (transcript: string, state: Record<string, unknown>): Report => ({
  transcript,
  clientCreatedAt: Date.now(),
  url: window.location.href,
  userAgent: navigator.userAgent,
  viewport: `${window.innerWidth}x${window.innerHeight}`,
  devicePixelRatio: window.devicePixelRatio || 1,
  online: navigator.onLine,
  // Stringified so Firebase can't silently drop empty-object keys.
  state: JSON.stringify(state),
})

/**
 * Mount the button and panel. `snapshot` is read at send time and should
 * capture whatever would explain a bug: config, score, phase. `onOpen` lets
 * the caller pause the game so it doesn't keep falling behind the panel.
 */
export const setupBugReport = (
  snapshot: () => Record<string, unknown>,
  onOpen?: () => void,
): void => {
  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.className = 'bug-trigger'
  trigger.title = 'Report a bug'
  trigger.setAttribute('aria-label', 'Report a bug')
  trigger.textContent = '🐛'
  document.body.appendChild(trigger)

  trigger.addEventListener('click', () => {
    onOpen?.()

    const backdrop = document.createElement('div')
    backdrop.className = 'bug-backdrop'
    backdrop.innerHTML = `
      <div class="bug-panel" role="dialog" aria-modal="true" aria-label="Report a bug">
        <h2>Report a bug</h2>
        <textarea rows="5" placeholder="What happened?"></textarea>
        <p class="bug-panel__error" hidden></p>
        <div class="bug-panel__actions">
          <button type="button" class="bug-panel__cancel">Cancel</button>
          <button type="button" class="bug-panel__send">Send report</button>
        </div>
      </div>
    `
    document.body.appendChild(backdrop)

    const textarea = backdrop.querySelector('textarea')!
    const error = backdrop.querySelector<HTMLElement>('.bug-panel__error')!
    const send = backdrop.querySelector<HTMLButtonElement>('.bug-panel__send')!
    let sending = false

    const close = (): void => {
      // Never vanish mid-send; the text is the only copy until a write or the
      // stash catches it.
      if (!sending) backdrop.remove()
    }
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close() })
    backdrop.querySelector('.bug-panel__cancel')!.addEventListener('click', close)

    const finish = (message: string): void => {
      backdrop.querySelector('.bug-panel')!.innerHTML = `<p class="bug-panel__sent">${message}</p>`
      setTimeout(() => backdrop.remove(), 2200)
    }

    send.addEventListener('click', () => {
      const text = textarea.value.trim()
      if (!text || sending) return
      sending = true
      send.textContent = 'Sending…'
      error.hidden = true

      const report = buildReport(text, snapshot())
      post(report).then(
        () => {
          sending = false
          finish('Sent — thanks!')
          void flushStash()
        },
        (err: Error) => {
          sending = false
          send.textContent = 'Send report'
          if (!navigator.onLine) {
            // Stash it and say so, rather than pretending it went out. Online
            // failures don't stash - the text stays in the box for a retry,
            // and stashing would send a duplicate if the retry succeeds.
            writeStash([...readStash(), report])
            finish('Saved — it’ll send when you’re back online.')
          } else {
            // Keep the text; they just typed it and it exists nowhere else.
            error.textContent = err.message || 'Could not send that report.'
            error.hidden = false
          }
        },
      )
    })

    textarea.focus()
  })

  void flushStash()
}
