import { useEffect } from 'react'
import { useViewportRegistry } from '../cornerstone/viewportRegistry'
import { useSettings } from '../store/settingsStore'
import { useViewportDisplay } from '../store/viewportDisplayStore'
import { useViewer } from '../store/viewerStore'
import { commandContext, commandForKey, isEnabled, type CommandContext } from './commands'

/** Command context that re-renders the caller whenever it may have changed. */
export function useCommandContext(): CommandContext {
  useViewer()
  // Commands read settings (links, display toggles, window presets) and the viewport filters.
  useSettings((s) => s.links)
  useSettings((s) => s.display)
  useSettings((s) => s.presets)
  useViewportDisplay((s) => s.filters)
  useViewportRegistry((s) => s.kinds)
  return commandContext()
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLSelectElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable)

/** Global keyboard shortcuts, active while a study is open. */
export function useKeyboardShortcuts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      // Space on a focused button presses that button.
      if (event.key === ' ' && event.target instanceof HTMLButtonElement) return
      const ctx = commandContext()
      const command = commandForKey(event.key.toLowerCase(), ctx)
      if (!command || !isEnabled(command, ctx)) return
      command.run(ctx)
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
