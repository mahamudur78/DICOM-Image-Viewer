import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getCommand, isAvailable, isEnabled, type CommandGroup } from '../commands/commands'
import { useCommandContext } from '../commands/useCommands'

/** A titled group of commands, separated from the next by a line. */
export interface MenuSection {
  title?: string
  commands: string[]
}

/** Groups whose commands are choices (one is active) or toggles, shown with a check mark. */
const CHECKED_GROUPS: CommandGroup[] = ['tool', 'sort', 'colormap', 'filter', 'image', 'display', 'measure']

const keyLabel = (key: string) =>
  key === ' ' ? 'Space' : key === 'escape' ? 'Esc' : key === 'delete' ? 'Del' : key.replace('ctrl+', 'Ctrl+').replace('shift+', 'Shift+').replace(/[a-z]$/, (c) => c.toUpperCase())

/**
 * A menu of commands at a screen position, kept inside the window. Closes on
 * Escape, a click outside, window blur or resize, and after running a command.
 */
export function CommandMenu({ x, y, sections, label, onClose }: { x: number; y: number; sections: MenuSection[]; label: string; onClose: () => void }) {
  const { t } = useTranslation()
  const ctx = useCommandContext()
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState({ left: x, top: y })
  const visible = sections
    .map((section) => ({ ...section, commands: section.commands.map(getCommand).filter((command) => isAvailable(command, ctx)) }))
    .filter((section) => section.commands.length > 0)

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
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        return onClose()
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      const items = [...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      const index = items.indexOf(document.activeElement as HTMLButtonElement)
      const next = event.key === 'ArrowDown' ? index + 1 : index - 1
      items[(next + items.length) % items.length]?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      style={place}
      className="fixed z-50 max-h-[80dvh] min-w-52 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 py-1 text-sm shadow-xl"
      onContextMenu={(event) => event.preventDefault()}
    >
      {visible.map((section, i) => (
        <div key={i} role="group" aria-label={section.title && t(section.title)} className={i > 0 ? 'mt-1 border-t border-slate-800 pt-1' : ''}>
          {section.title && <div className="px-3 pb-0.5 text-xs text-slate-500">{t(section.title)}</div>}
          {section.commands.map((command) => {
            const key = command.keys?.[0]
            const checkable = CHECKED_GROUPS.includes(command.group) && command.isActive !== undefined
            const radio = checkable && command.group !== 'image' && command.group !== 'display'
            const checked = command.isActive?.(ctx) ?? false
            return (
              <button
                key={command.id}
                role={radio ? 'menuitemradio' : checkable ? 'menuitemcheckbox' : 'menuitem'}
                aria-label={t(command.label, command.labelValues)}
                aria-checked={checkable ? checked : undefined}
                disabled={!isEnabled(command, ctx)}
                onClick={() => {
                  onClose()
                  command.run(ctx)
                }}
                className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 focus:bg-slate-800 focus:outline-none disabled:opacity-40"
              >
                <span className="w-4 text-center text-slate-400">
                  {checkable ? (checked ? '✓' : '') : command.group === 'panel' ? '🏷' : command.icon}
                </span>
                <span className="flex-1">{t(command.label, command.labelValues)}</span>
                {key && key.length <= 12 && !key.startsWith('arrow') && <kbd className="text-xs text-slate-500">{keyLabel(key)}</kbd>}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
