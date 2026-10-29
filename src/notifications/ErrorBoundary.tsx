import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from '../i18n'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Shown in a smaller box when the boundary wraps one part of the page. */
  compact?: boolean
}

/** Shows a message with a reload button instead of a blank page when rendering crashes. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Viewer crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className={`grid place-items-center p-6 text-center ${this.props.compact ? 'h-full' : 'h-dvh bg-slate-950'}`}>
        <div className="max-w-md">
          <h1 className="text-lg font-semibold text-slate-100">{t('messages.crashTitle')}</h1>
          <p className="mt-2 text-sm text-slate-400">{t('messages.crashBody')}</p>
          <pre className="mt-3 overflow-auto rounded bg-slate-900 p-2 text-left text-xs text-red-300">{this.state.error.message}</pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            {t('messages.reload')}
          </button>
        </div>
      </div>
    )
  }
}
