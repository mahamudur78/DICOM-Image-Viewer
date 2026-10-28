import { useTranslation } from 'react-i18next'
import { CommandMenu, type MenuSection } from './CommandMenu'
import { closeMenu, useMenu } from './contextMenuTrigger'

/** Commands offered when right-clicking a viewport, in sections separated by a line. */
const VIEWPORT_MENU: MenuSection[] = [
  { commands: ['view.reset', 'view.invert', 'rotate.left', 'view.rotate90', 'view.flipHorizontal', 'view.flipVertical', 'view.downloadPng'] },
  { commands: ['zoom.fit', 'zoom.100', 'window.auto'] },
  { commands: ['cine.toggle', 'cine.playAll'] },
  { title: 'sort.title', commands: ['sort.instance', 'sort.position', 'sort.time', 'sort.fileName'] },
  { title: 'menus.measurements', commands: ['measure.deleteSelected', 'measure.copy', 'measure.paste', 'measure.undo', 'measure.redo'] },
  { commands: ['panel.tags', 'panel.measurements'] },
]

export function ContextMenu() {
  const { t } = useTranslation()
  const position = useMenu((s) => s.position)
  if (!position) return null
  return <CommandMenu x={position.x} y={position.y} sections={VIEWPORT_MENU} label={t('contextMenu.label')} onClose={closeMenu} />
}
