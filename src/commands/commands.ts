// Every user action, defined once. Toolbar buttons, keyboard shortcuts and
// the viewport context menu are all built from this list.
import { LAYOUTS } from '../components/layouts'
import { toolsForMode, type PrimaryTool, type ViewMode } from '../cornerstone/tools'
import { downloadPng, flip, rotate90, scrollImages, toggleInvert } from '../cornerstone/viewer'
import { is2dKind, viewportKind, type ViewportKind } from '../cornerstone/viewportRegistry'
import { useSettings, type LinkSettings } from '../store/settingsStore'
import { changeMode, resetTargetViewport } from '../store/viewerActions'
import {
  selectMode,
  selectTargetViewportId,
  setActiveTool,
  setLayout,
  togglePanel,
  toggleMprWith3d,
  useViewer,
  type ViewerState,
} from '../store/viewerStore'

export interface CommandContext {
  state: ViewerState
  mode: ViewMode
  /** Viewport the command applies to, or null when the active cell is empty. */
  viewportId: string | null
  kind: ViewportKind | null
  links: LinkSettings
}

export type CommandGroup = 'tool' | 'view' | 'mode' | 'layout' | 'link' | 'panel'

export interface Command {
  id: string
  group: CommandGroup
  /** i18n key, with interpolation values. */
  label: string
  labelValues?: Record<string, string | number>
  /** Toolbar icon (text or emoji). Layout buttons draw their own icon. */
  icon?: string
  /** Shortcut keys as `KeyboardEvent.key` in lower case; the first is shown in tooltips. */
  keys?: string[]
  /** Whether the command is offered at all in this context (hidden otherwise). */
  isAvailable?: (ctx: CommandContext) => boolean
  /** Whether it can run now (shown disabled otherwise). */
  isEnabled?: (ctx: CommandContext) => boolean
  /** Toggle state shown as a pressed button. */
  isActive?: (ctx: CommandContext) => boolean
  run: (ctx: CommandContext) => void
}

export function commandContext(): CommandContext {
  const state = useViewer.getState()
  const viewportId = selectTargetViewportId(state)
  return { state, mode: selectMode(state), viewportId, kind: viewportKind(viewportId), links: useSettings.getState().links }
}

const hasViewport = (ctx: CommandContext) => ctx.viewportId !== null
// Before a viewport mounts its kind is unknown; only 3D mode is known to be 3D.
const is2d = (ctx: CommandContext) => (ctx.kind ? is2dKind(ctx.kind) : ctx.mode !== '3d')
const isGrid = (ctx: CommandContext) => ctx.mode === 'grid'

/** Runs an action on the target viewport, if there is one. */
const onViewport = (action: (viewportId: string) => void) => (ctx: CommandContext) => {
  if (ctx.viewportId) action(ctx.viewportId)
}

const TOOLS: { tool: PrimaryTool; icon: string; key: string }[] = [
  { tool: 'windowLevel', icon: '◐', key: 'w' },
  { tool: 'rotate', icon: '⟳', key: 'o' },
  { tool: 'shift', icon: '☀', key: 's' },
  { tool: 'pan', icon: '✥', key: 'p' },
  { tool: 'zoom', icon: '🔍', key: 'z' },
  { tool: 'magnify', icon: '⊕', key: 'm' },
  { tool: 'crosshairs', icon: '✛', key: 'c' },
  { tool: 'length', icon: '📏', key: 'l' },
  { tool: 'angle', icon: '∠', key: 'a' },
  { tool: 'ellipse', icon: '◯', key: 'e' },
  { tool: 'probe', icon: '⌖', key: 'b' },
]

const toolCommands: Command[] = TOOLS.map(({ tool, icon, key }) => ({
  id: `tool.${tool}`,
  group: 'tool',
  label: `tools.${tool}`,
  icon,
  keys: [key],
  isAvailable: (ctx) => toolsForMode(ctx.mode).includes(tool),
  isActive: (ctx) => ctx.state.activeTool === tool,
  run: () => setActiveTool(tool),
}))

const viewCommands: Command[] = [
  {
    id: 'view.invert',
    group: 'view',
    label: 'commands.invert',
    icon: '◑',
    keys: ['i'],
    isAvailable: is2d,
    isEnabled: hasViewport,
    run: onViewport(toggleInvert),
  },
  {
    id: 'view.rotate90',
    group: 'view',
    label: 'commands.rotate90',
    icon: '↻',
    isAvailable: is2d,
    isEnabled: hasViewport,
    run: onViewport(rotate90),
  },
  {
    id: 'view.flipHorizontal',
    group: 'view',
    label: 'commands.flipHorizontal',
    icon: '⇋',
    isAvailable: is2d,
    isEnabled: hasViewport,
    run: onViewport((id) => flip(id, 'horizontal')),
  },
  {
    id: 'view.flipVertical',
    group: 'view',
    label: 'commands.flipVertical',
    icon: '⇵',
    isAvailable: is2d,
    isEnabled: hasViewport,
    run: onViewport((id) => flip(id, 'vertical')),
  },
  {
    id: 'view.reset',
    group: 'view',
    label: 'commands.reset',
    icon: '⟲',
    keys: ['r'],
    isEnabled: hasViewport,
    run: () => resetTargetViewport(),
  },
  {
    id: 'view.previousImage',
    group: 'view',
    label: 'commands.previousImage',
    keys: ['arrowup', 'arrowleft'],
    isAvailable: is2d,
    isEnabled: hasViewport,
    run: onViewport((id) => scrollImages(id, -1)),
  },
  {
    id: 'view.nextImage',
    group: 'view',
    label: 'commands.nextImage',
    keys: ['arrowdown', 'arrowright'],
    isAvailable: is2d,
    isEnabled: hasViewport,
    run: onViewport((id) => scrollImages(id, 1)),
  },
  {
    id: 'view.downloadPng',
    group: 'view',
    label: 'commands.downloadPng',
    icon: '⤓',
    isEnabled: hasViewport,
    run: onViewport((id) => downloadPng(id, 'dicom-image.png')),
  },
]

const modeCommands: Command[] = [
  {
    id: 'mode.mpr',
    group: 'mode',
    label: 'commands.mpr',
    icon: 'MPR',
    isActive: (ctx) => ctx.mode === 'mpr',
    run: () => changeMode('mpr'),
  },
  {
    id: 'mode.3d',
    group: 'mode',
    label: 'commands.volume3d',
    icon: '3D',
    isActive: (ctx) => ctx.mode === '3d',
    run: () => changeMode('3d'),
  },
  {
    id: 'mode.mprWith3d',
    group: 'mode',
    label: 'commands.mprWith3d',
    icon: '+3D',
    isAvailable: (ctx) => ctx.mode === 'mpr',
    isActive: (ctx) => ctx.state.mprWith3d,
    run: () => toggleMprWith3d(),
  },
]

const layoutCommands: Command[] = LAYOUTS.map((layout) => ({
  id: `layout.${layout.rows}x${layout.cols}`,
  group: 'layout',
  label: 'commands.layout',
  labelValues: { rows: layout.rows, cols: layout.cols },
  isAvailable: isGrid,
  isActive: (ctx) => ctx.state.layout.rows === layout.rows && ctx.state.layout.cols === layout.cols,
  run: () => setLayout(layout),
}))

const LINKS: { key: keyof LinkSettings; icon: string }[] = [
  { key: 'referenceLines', icon: 'REF' },
  { key: 'sliceSync', icon: 'SYNC' },
  { key: 'voiSync', icon: 'W/L' },
]

const linkCommands: Command[] = LINKS.map(({ key, icon }) => ({
  id: `link.${key}`,
  group: 'link',
  label: `commands.${key}`,
  icon,
  isAvailable: isGrid,
  isActive: (ctx) => ctx.links[key],
  run: () => useSettings.getState().toggleLink(key),
}))

const panelCommands: Command[] = [
  {
    id: 'panel.tags',
    group: 'panel',
    label: 'commands.tags',
    icon: 'TAGS',
    keys: ['t'],
    isActive: (ctx) => ctx.state.panel === 'tags',
    run: () => togglePanel('tags'),
  },
]

export const COMMANDS: Command[] = [
  ...toolCommands,
  ...viewCommands,
  ...modeCommands,
  ...layoutCommands,
  ...linkCommands,
  ...panelCommands,
]

const byId = new Map(COMMANDS.map((command) => [command.id, command]))

export function getCommand(id: string): Command {
  const command = byId.get(id)
  if (!command) throw new Error(`Unknown command ${id}`)
  return command
}

export const isAvailable = (command: Command, ctx: CommandContext) => command.isAvailable?.(ctx) ?? true
export const isEnabled = (command: Command, ctx: CommandContext) =>
  isAvailable(command, ctx) && (command.isEnabled?.(ctx) ?? true)

/** Runs a command if it is available and enabled; returns whether it ran. */
export function runCommand(id: string, ctx = commandContext()) {
  const command = getCommand(id)
  if (!isEnabled(command, ctx)) return false
  command.run(ctx)
  return true
}

/** The command bound to a key in this context, if any. */
export function commandForKey(key: string, ctx: CommandContext): Command | undefined {
  return COMMANDS.find((command) => command.keys?.includes(key) && isAvailable(command, ctx))
}
