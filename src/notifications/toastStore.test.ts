import { afterEach, describe, expect, it, vi } from 'vitest'
import { TOAST_DURATION_MS, notify, useToasts } from './toastStore'

afterEach(() => {
  useToasts.setState({ toasts: [] })
  vi.useRealTimers()
})

describe('notify', () => {
  it('does not repeat a visible message', () => {
    const first = notify('Could not load', 'error')
    expect(notify('Could not load', 'error')).toBe(first)
    expect(useToasts.getState().toasts).toHaveLength(1)
  })

  it('keeps at most four toasts', () => {
    for (let i = 0; i < 6; i++) notify(`message ${i}`, 'error')
    expect(useToasts.getState().toasts.map((t) => t.message)).toEqual(['message 2', 'message 3', 'message 4', 'message 5'])
  })

  it('auto-dismisses everything except errors', () => {
    vi.useFakeTimers()
    notify('saved', 'success')
    notify('failed', 'error')
    vi.advanceTimersByTime(TOAST_DURATION_MS)
    expect(useToasts.getState().toasts.map((t) => t.message)).toEqual(['failed'])
  })
})
