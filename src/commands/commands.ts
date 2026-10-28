// Every user action, defined once. Toolbar buttons, keyboard shortcuts and
// the viewport context menu are all built from this list.
import { LAYOUTS } from '../components/layouts'
import type { SortMode } from '../dicom/types'
import { viewportIdAt } from '../cornerstone/constants'
import { toolsForMode, type PrimaryTool, type ViewMode } from '../cornerstone/tools'
import { downloadPng, flip, rotate90, scrollImages, toggleInvert } from '../cornerstone/viewer'
import { is2dKind, isCornerstoneKind, viewportKind, type ViewportKind } from '../cornerstone/viewportRegistry'
import { changeCineFps, cineStateFor, setCinePlaying, toggleCine } from '../store/cineStore'
import { useSettings, type LinkSettings } from '../store/settingsStore'
import { changeMode, resetTargetViewport } from '../store/viewerActions'
import { videoControllers } from '../video/videoControllers'
import {
  selectMode,
  selectTargetViewportId,
  setActiveTool,
  setLayout,
  setSeriesSort,
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

export type CommandGroup = 'tool' | 'view' | 'cine' | 'sort' | 'mode' | 'layout' | 'link' | 'panel'

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
/** Cornerstone viewports (or an empty cell in the grid, so the buttons keep their place). */
const isCornerstone = (ctx: CommandContext) => (ctx.kind ? isCornerstoneKind(ctx.kind) : true)
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
  isAvailable: (ctx) => isCornerstone(ctx) && toolsForMode(ctx.mode).includes(tool),
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
    isAvailable: isCornerstone,
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
    isAvailable: isCornerstone,
    isEnabled: hasViewport,
    run: onViewport((id) => downloadPng(id, 'dicom-image.png')),
  },
]

/** The stack series of the target viewport, when it has more than one image to play. */
function cineSeries(ctx: CommandContext) {
  if (ctx.mode !== 'grid' || ctx.kind !== 'stack') return null
  const series = ctx.state.cells[ctx.state.activeCell]?.series
  return series && series.images.length > 1 ? series : null
}

/** Grid cells currently on screen that can play. */
function visibleCineCells(ctx: CommandContext) {
  const { layout, maximizedCell, cells } = ctx.state
  const visible = maximizedCell !== null ? [maximizedCell] : Array.from({ length: layout.rows * layout.cols }, (_, i) => i)
  return visible.flatMap((cell) => {
    const series = cells[cell]?.series
    return series?.kind === 'image' && series.images.length > 1 ? [{ viewportId: viewportIdAt(cell), series }] : []
  })
}

/** The controller of the target viewport when it is a video. */
const video = (ctx: CommandContext) => (ctx.kind === 'video' && ctx.viewportId ? videoControllers.get(ctx.viewportId) : undefined)
const canPlay = (ctx: CommandContext) => cineSeries(ctx) !== null || video(ctx) !== undefined

const cineCommands: Command[] = [
  {
    id: 'cine.toggle',
    group: 'cine',
    label: 'cine.playPause',
    icon: '⏯',
    keys: [' '],
    isAvailable: canPlay,
    run: (ctx) => (video(ctx) ? video(ctx)!.toggle() : toggleCine(ctx.viewportId!, cineSeries(ctx)!)),
  },
  {
    id: 'cine.slower',
    group: 'cine',
    label: 'cine.slower',
    keys: ['['],
    isAvailable: canPlay,
    run: (ctx) => (video(ctx) ? video(ctx)!.changeSpeed(-1) : changeCineFps(ctx.viewportId!, cineSeries(ctx)!, -1)),
  },
  {
    id: 'cine.faster',
    group: 'cine',
    label: 'cine.faster',
    keys: [']'],
    isAvailable: canPlay,
    run: (ctx) => (video(ctx) ? video(ctx)!.changeSpeed(1) : changeCineFps(ctx.viewportId!, cineSeries(ctx)!, 1)),
  },
  {
    id: 'video.previousFrame',
    group: 'cine',
    label: 'video.previousFrame',
    keys: ['arrowleft', 'arrowup'],
    isAvailable: (ctx) => video(ctx) !== undefined,
    run: (ctx) => video(ctx)!.step(-1),
  },
  {
    id: 'video.nextFrame',
    group: 'cine',
    label: 'video.nextFrame',
    keys: ['arrowright', 'arrowdown'],
    isAvailable: (ctx) => video(ctx) !== undefined,
    run: (ctx) => video(ctx)!.step(1),
  },
  {
    // Starts every visible cine together; stops them all when they are all playing.
    id: 'cine.playAll',
    group: 'cine',
    label: 'cine.playAll',
    icon: '▶▶',
    isAvailable: (ctx) => ctx.mode === 'grid' && visibleCineCells(ctx).length > 1,
    run: (ctx) => {
      const cells = visibleCineCells(ctx)
      const allPlaying = cells.every(({ viewportId, series }) => cineStateFor(viewportId, series).playing)
      for (const { viewportId, series } of cells) setCinePlaying(viewportId, series, !allPlaying)
    },
  },
]

/** The image series of the target grid cell (sorting applies to stacks). */
function stackSeries(ctx: CommandContext) {
  if (ctx.mode !== 'grid' || ctx.kind !== 'stack') return null
  const series = ctx.state.cells[ctx.state.activeCell]?.series
  return series && series.images.length > 1 ? series : null
}

const SORT_MODES: SortMode[] = ['instance', 'position', 'time', 'fileName']

const sortCommands: Command[] = SORT_MODES.map((mode) => ({
  id: `sort.${mode}`,
  group: 'sort',
  label: `sort.${mode}`,
  isAvailable: (ctx) => stackSeries(ctx) !== null,
  isActive: (ctx) => stackSeries(ctx)?.sortMode === mode,
  run: (ctx) => setSeriesSort(stackSeries(ctx)!.id, mode),
}))

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
  ...cineCommands,
  ...sortCommands,
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
