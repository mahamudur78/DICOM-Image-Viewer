import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'warning' | 'error'

export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  id: number
  kind: ToastKind
  message: string
  action?: ToastAction
}

interface ToastState {
  toasts: Toast[]
  dismiss: (id: number) => void
}

/** How long plain toasts stay; errors and toasts with an action stay until dismissed. */
export const TOAST_DURATION_MS = 7000
const MAX_TOASTS = 4

let nextId = 1

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))

/**
 * Shows a message. A message that is already visible is not repeated (e.g.
 * the same load error reported by several viewports).
 */
export function notify(message: string, kind: ToastKind = 'warning', action?: ToastAction) {
  const { toasts, dismiss } = useToasts.getState()
  const existing = toasts.find((toast) => toast.message === message && toast.kind === kind)
  if (existing) return existing.id

  const toast = { id: nextId++, kind, message, action }
  useToasts.setState({ toasts: [...toasts, toast].slice(-MAX_TOASTS) })
  if (kind !== 'error' && !action) setTimeout(() => dismiss(toast.id), TOAST_DURATION_MS)
  return toast.id
}
