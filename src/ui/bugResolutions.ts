import { withAuth, cachedAnonUid } from '../lib/anonAuth'

// The reply half of the bug button (2026-09-21, ported from Cinema Roll):
// `yarn resolve-bug-report <id> --understood ... --fixed ...` writes a
// plain-language notice under the reporter's uid at bugReportResolutions,
// and the next launch from the same browser shows it once. Same REST-only
// shape as the report itself: the anonymous session that filed the report
// is the one the rules let read the reply (auth.uid === $uid). Dismissing
// marks it seen; the text stays as the record of what was fixed.

const DB = 'https://thunderstoner-876f8-default-rtdb.firebaseio.com'
const NODE = 'bugReportResolutions'
const APP = '3dblock'

export interface Resolution {
  id: string
  app?: string
  understood?: string
  fixed?: string
  reportSnippet?: string
  resolvedAt?: number
  seen?: boolean
}

/** This app's unseen notices, oldest first. The node is shared project-wide. */
export const unseenResolutions = (
  entries: Record<string, Omit<Resolution, 'id'> | null> | null | undefined,
  app = APP,
): Resolution[] =>
  Object.entries(entries ?? {})
    .filter(([, value]) => value && !value.seen && (!value.app || value.app === app))
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => (a.resolvedAt ?? 0) - (b.resolvedAt ?? 0))

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

const formatDate = (timestamp: number): string =>
  new Date(timestamp).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })

const render = (notices: Resolution[], onDismiss: () => void): void => {
  const backdrop = document.createElement('div')
  backdrop.className = 'bug-backdrop bug-resolution-backdrop'
  const cards = notices.map((n) => `
    <div class="bug-resolution-notice">
      ${n.reportSnippet ? `<p class="bug-resolution-notice__quote">You said: \u201c${escapeHtml(n.reportSnippet)}\u201d</p>` : ''}
      ${n.understood ? `<p class="bug-resolution-notice__section"><span class="bug-resolution-notice__label">What was going wrong</span>${escapeHtml(n.understood)}</p>` : ''}
      ${n.fixed ? `<p class="bug-resolution-notice__section"><span class="bug-resolution-notice__label">What we did about it</span>${escapeHtml(n.fixed)}</p>` : ''}
      ${n.resolvedAt ? `<p class="bug-resolution-notice__date">Fixed ${formatDate(n.resolvedAt)}</p>` : ''}
    </div>`).join('')
  backdrop.innerHTML = `
    <div class="bug-panel bug-resolution-panel" role="dialog" aria-modal="true" aria-label="A bug you reported was fixed">
      <h2>${notices.length === 1 ? 'A bug you reported is fixed' : 'Bugs you reported are fixed'}</h2>
      <p class="bug-resolution-panel__thanks">Thanks for telling us \u2014 here\u2019s what happened.</p>
      ${cards}
      <div class="bug-panel__actions">
        <button type="button" class="bug-panel__send bug-resolution-panel__ok">Got it, thanks</button>
      </div>
    </div>`
  document.body.appendChild(backdrop)
  const close = (): void => { backdrop.remove(); onDismiss() }
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close() })
  backdrop.querySelector('.bug-resolution-panel__ok')!.addEventListener('click', close)
}

/**
 * Look for notices addressed to this browser and show them. Only looks when
 * an anonymous session already exists - no report was ever filed otherwise.
 * `onOpen` lets the caller pause the game behind the panel.
 */
export const checkResolutions = async (onOpen?: () => void): Promise<void> => {
  const uid = cachedAnonUid()
  if (!uid) return
  let notices: Resolution[]
  try {
    const response = await fetch(await withAuth(`${DB}/${NODE}/${uid}.json`))
    if (!response.ok) return
    notices = unseenResolutions(await response.json())
  } catch {
    return
  }
  if (!notices.length) return
  onOpen?.()
  render(notices, () => {
    const updates: Record<string, boolean> = {}
    notices.forEach((n) => { updates[`${uid}/${n.id}/seen`] = true })
    void withAuth(`${DB}/${NODE}.json`)
      .then((url) => fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) }))
      .catch(() => { /* marked on a later launch instead */ })
  })
}
