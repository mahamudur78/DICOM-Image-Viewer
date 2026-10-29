// Messages between DicomLens windows of this browser (a series opened in its
// own window, e.g. on a second monitor). Files are sent as File objects; the
// windows then keep slices and window/level in step when linked.

/** Set in a window opened for one series: `?window=<id>`. */
export const secondaryWindowId = new URLSearchParams(location.search).get('window')

export type WindowMessage =
  | { type: 'hello'; windowId: string }
  | { type: 'files'; windowId: string; files: File[]; seriesId: string }
  | { type: 'slice'; from: string; frameOfReferenceUID: string; position: number[]; normal: number[] }
  | { type: 'voi'; from: string; lower: number; upper: number }

/** This window's id in messages. */
export const thisWindowId = secondaryWindowId ?? `main-${Math.random().toString(36).slice(2)}`

let channel: BroadcastChannel | null | undefined

export function windowChannel() {
  if (channel === undefined) channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('dicomlens-windows') : null
  return channel
}

export const postWindowMessage = (message: WindowMessage) => windowChannel()?.postMessage(message)

export function onWindowMessage(listener: (message: WindowMessage) => void) {
  const handler = (event: MessageEvent<WindowMessage>) => listener(event.data)
  windowChannel()?.addEventListener('message', handler)
  return () => windowChannel()?.removeEventListener('message', handler)
}
