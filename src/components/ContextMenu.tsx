import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getCommand, isAvailable, isEnabled } from '../commands/commands'
import { useCommandContext } from '../commands/useCommands'
import { closeMenu, useMenu } from './contextMenuTrigger'

/** Commands offered when right-clicking a viewport, in menu order. */
const VIEWPORT_MENU = [
  'view.reset',
  'view.invert',
  'view.rotate90',
  'view.flipHorizontal',
  'view.flipVertical',
  'view.downloadPng',
  'panel.tags',
]

export function ContextMenu() {
  const position = useMenu((s) => s.position)
  return position ? <Menu x={position.x} y={position.y} /> : null
}

function Menu({ x, y }: { x: number; y: number }) {
  const { t } = useTranslation()
  const ctx = useCommandContext()
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState({ left: x, top: y })
  const commands = VIEWPORT_MENU.map(getCommand).filter((command) => isAvailable(command, ctx))

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const rect = ref.current!.getBoundingClientRect()
    setPlace({
      left: Math.max(4, Math.min(x, window.innerWidth - rect.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - rect.height - 4)),
    })
    ref.current!.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [x, y])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) closeMenu()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return closeMenu()
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      const items = [...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      const index = items.indexOf(document.activeElement as HTMLButtonElement)
      const next = event.key === 'ArrowDown' ? index + 1 : index - 1
      items[(next + items.length) % items.length]?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', closeMenu)
    window.addEventListener('resize', closeMenu)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', closeMenu)
      window.removeEventListener('resize', closeMenu)
    }
  }, [])

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={t('contextMenu.label')}
      style={place}
      className="fixed z-50 min-w-48 rounded-lg border border-slate-700 bg-slate-900 py-1 text-sm shadow-xl"
      onContextMenu={(event) => event.preventDefault()}
    >
      {commands.map((command) => {
        const key = command.keys?.[0]
        return (
          <button
            key={command.id}
            role="menuitem"
            disabled={!isEnabled(command, ctx)}
            onClick={() => {
              closeMenu()
              command.run(ctx)
            }}
            className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 focus:bg-slate-800 focus:outline-none disabled:opacity-40"
          >
            <span className="w-4 text-center text-slate-400">{command.group === 'panel' ? '🏷' : command.icon}</span>
            <span className="flex-1">{t(command.label, command.labelValues)}</span>
            {key?.length === 1 && <kbd className="text-xs text-slate-500">{key.toUpperCase()}</kbd>}
          </button>
        )
      })}
    </div>
  )
}
