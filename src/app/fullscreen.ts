/** Browser full screen for the whole page (not supported on iPhone Safari). */
export const fullscreenSupported = () => typeof document !== 'undefined' && !!document.documentElement.requestFullscreen

export const isFullscreen = () => !!document.fullscreenElement

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen?.().catch(() => {})
}
