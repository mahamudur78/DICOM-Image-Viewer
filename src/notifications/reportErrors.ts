import { t } from '../i18n'
import { notify } from './toastStore'

/**
 * Errors that escape React and Cornerstone callbacks are logged by the
 * browser anyway; during development they are also shown as toasts.
 */
export function reportUnhandledErrors() {
  if (!import.meta.env.DEV) return
  const report = (error: unknown) => notify(t('messages.unexpectedError', { error: String(error) }), 'error')
  window.addEventListener('error', (event) => report(event.error ?? event.message))
  window.addEventListener('unhandledrejection', (event) => report(event.reason))
}
