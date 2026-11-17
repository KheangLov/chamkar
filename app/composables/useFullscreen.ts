/**
 * Full screen: the whole page, with the browser's address bar and the phone's status bar hidden.
 * Uses the Fullscreen API (with Safari's prefixed version for iPad). iPhone has no Fullscreen API
 * for pages, so there `supported` stays false and Add to Home Screen is the way to full screen.
 * The state is kept up to date by app/plugins/fullscreen.client.ts.
 */
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitFullscreenEnabled?: boolean
  webkitExitFullscreen?: () => Promise<void> | void
}
type FsElement = HTMLElement & {
  webkitRequestFullscreen?: (options?: FullscreenOptions) => Promise<void> | void
}

export function fullscreenSupported(): boolean {
  if (!import.meta.client) return false
  const doc = document as FsDocument
  return !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled)
}

export function isFullscreen(): boolean {
  if (!import.meta.client) return false
  const doc = document as FsDocument
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement)
}

/** Must be called from a tap, click or key press: browsers refuse full screen otherwise. */
export async function enterFullscreen(): Promise<void> {
  if (!fullscreenSupported() || isFullscreen()) return
  const el = document.documentElement as FsElement
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
    else await el.webkitRequestFullscreen?.()
  }
  catch {
    // Refused (no tap, or blocked by the browser or an embedding page): stay as we are.
  }
}

export async function exitFullscreen(): Promise<void> {
  if (!isFullscreen()) return
  const doc = document as FsDocument
  try {
    if (doc.exitFullscreen) await doc.exitFullscreen()
    else await doc.webkitExitFullscreen?.()
  }
  catch {
    // Already left.
  }
}

export function useFullscreen() {
  const supported = useState('fullscreen-supported', () => false)
  const active = useState('fullscreen-active', () => false)
  const progress = useProgressStore()

  /** The full-screen button: also remembers the choice, so taps don't bring it back once turned off. */
  async function toggle() {
    if (active.value) {
      progress.setSetting('fullscreen', false)
      await exitFullscreen()
    }
    else {
      progress.setSetting('fullscreen', true)
      await enterFullscreen()
    }
  }

  return { supported, active, toggle }
}
