/**
 * Full screen on phones and tablets: browsers only allow it from a tap, so with the setting on
 * (the default), the first tap anywhere enters it, and so does the next tap after the phone's back
 * gesture leaves it. On a computer it's the button's choice (Esc leaves it as usual). Inside the
 * gaming gateway the page belongs to the gateway, so only the button does it there.
 */
export default defineNuxtPlugin(() => {
  const supported = useState('fullscreen-supported', () => false)
  const active = useState('fullscreen-active', () => false)
  const progress = useProgressStore()
  const { inGateway } = useGateway()

  supported.value = fullscreenSupported()
  active.value = isFullscreen()
  const update = () => (active.value = isFullscreen())
  document.addEventListener('fullscreenchange', update)
  document.addEventListener('webkitfullscreenchange', update)

  // Already full screen as an installed app (manifest display: fullscreen).
  const appFullscreen = window.matchMedia('(display-mode: fullscreen)')

  // pointerup (not pointerdown) is what counts as a tap for touch in every browser.
  document.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'mouse' || inGateway) return
    if (!supported.value || active.value || appFullscreen.matches) return
    if (!progress.loaded || !progress.settings.fullscreen) return
    void enterFullscreen()
  }, { capture: true })
})
