// "Am I looking at new code?" — answered on the setup screen.
//
// House standard (Matt, 2026-08-22): every app shows its version and when
// that build was made. It's the human-readable counterpart to the auto-update
// feature: after a deploy, this is how you tell whether the tab in front of
// you actually picked up the new code, without opening devtools.
//
// The timestamp is stamped at BUILD time, not page-load time — that's the
// distinction that makes it useful. A tab left open for a week shows the
// build it is still running, so a stale one is obvious at a glance.

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

const pad = (n: number): string => String(n).padStart(2, '0')

// "Aug 22, 1:32 AM" — local time, because the question is always "is this
// newer than the deploy I just did?", which is asked in local time. The year
// appears only when it isn't the current one, so the common case stays short.
export const formatBuildTime = (
  value: Date | string | null | undefined,
  now: Date = new Date(),
): string | null => {
  const date = value instanceof Date ? value : new Date(value as string)
  if (!value || Number.isNaN(date.getTime())) return null

  const hour24 = date.getHours()
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12
  const meridiem = hour24 < 12 ? 'AM' : 'PM'
  const year = date.getFullYear() === now.getFullYear() ? '' : `, ${date.getFullYear()}`
  return `${MONTHS[date.getMonth()]} ${date.getDate()}${year}, ${hour}:${pad(date.getMinutes())} ${meridiem}`
}

export interface BuildStampParts {
  readonly version?: string | null
  readonly buildTime?: Date | string | null
  readonly now?: Date
}

// The one line every app renders: "v0.1.0 · built Aug 22, 1:32 AM".
// Degrades rather than disappearing — a missing version or an unparseable
// timestamp still leaves something true on screen.
export const buildStampText = ({ version, buildTime, now }: BuildStampParts = {}): string => {
  const when = formatBuildTime(buildTime, now)
  const parts: string[] = []
  if (version) parts.push(`v${version}`)
  if (when) parts.push(`built ${when}`)
  return parts.join(' · ')
}

// Injected by vite.config.ts at build time (see the `define` block); both are
// undefined outside a Vite pipeline, which is exactly the degraded case above.
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : null
export const BUILD_TIME = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : null

export const buildStamp = (): string =>
  buildStampText({ version: APP_VERSION, buildTime: BUILD_TIME })
