// Every user action, defined once. Toolbar buttons, keyboard shortcuts and
// the viewport context menu are all built from this list.
import { LAYOUTS } from '../components/layouts'
import type { SortMode } from '../dicom/types'
import { viewportIdAt } from '../cornerstone/constants'
import { toolsForMode, type PrimaryTool, type ViewMode } from '../cornerstone/tools'
import {
  COLORMAPS,
  applyVoiLut,
  applyWindow,
  autoWindow,
  fullRange,
  getColormapName,
  getRotation,
  getSigmoid,
  getSmoothPixels,
  headerWindows,
  isColorImage,
  pixelSpacingMm,
  rotateBy,
  setColormap,
  setRotation,
  setSigmoid,
  setSmoothPixels,
  voiLutOf,
  zoomToFit,
  zoomToScale,
  zoomToTrueSize,
} from '../cornerstone/display'
import { downloadPng, flip, getViewport, rotate90, scrollImages, setImageIndex, toggleInvert } from '../cornerstone/viewer'
import { windowOptions, type WindowOption } from '../dicom/windowPresets'
import { askForm, managePresets } from '../dialogs/dialogStore'
import { toggleFullscreen, fullscreenSupported, isFullscreen } from '../app/fullscreen'
import { FILTERS, filterElementId, getFilter, setFilter, type FilterStrength } from '../store/viewportDisplayStore'
import { notify } from '../notifications/toastStore'
import { t } from '../i18n'
import { is2dKind, isCornerstoneKind, viewportKind, type ViewportKind } from '../cornerstone/viewportRegistry'
import { changeCineFps, cineStateFor, setCinePlaying, toggleCine } from '../store/cineStore'
import { useSettings, type DisplaySettings, type LinkSettings } from '../store/settingsStore'
import { changeMode, resetTargetViewport } from '../store/viewerActions'
import { videoControllers } from '../video/videoControllers'
import { redactionPolygons } from '../measurements/manage'
import { openSeriesInNewWindow } from '../comparison/multiWindow'
import { clearCursor3D, useCursor3D } from '../comparison/cursor3d'
import { findPriorMatch } from '../comparison/priors'
import { filterCandidates } from '../dicom/collectFiles'
import { addFiles, compareWithPrior, reapplyHanging, saveHangingRule } from '../store/viewerActions'
import { manageHangingRules } from '../dialogs/dialogStore'
import { DEFAULT_KEYMAP } from './keymap'
import { measureCommands } from './measureCommands'
import {
  selectMode,
  selectTargetViewportId,
  selectCurrentDisplaySet,
  setActiveTool,
  setDistractionFree,
  setLayout,
  setSeriesSort,
  setSyncLocked,
  isCellLinked,
  toggleCellLink,
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

export type CommandGroup =
  | 'tool'
  | 'view'
  | 'rotate'
  | 'zoom'
  | 'window'
  | 'image'
  | 'colormap'
  | 'filter'
  | 'display'
  | 'cine'
  | 'sort'
  | 'mode'
  | 'layout'
  | 'link'
  | 'panel'
  | 'measure'
  | 'compare'

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

/** Tools without an icon are offered in the toolbar's Measure menu instead of as buttons. */
const TOOLS: { tool: PrimaryTool; icon?: string }[] = [
  { tool: 'windowLevel', icon: '◐' },
  { tool: 'windowRegion', icon: '▣' },
  { tool: 'rotate', icon: '⟳' },
  { tool: 'shift', icon: '☀' },
  { tool: 'pan', icon: '✥' },
  { tool: 'zoom', icon: '🔍' },
  { tool: 'magnify', icon: '⊕' },
  { tool: 'crosshairs', icon: '✛' },
  { tool: 'cursor3d', icon: '✣' },
  { tool: 'length', icon: '📏' },
  { tool: 'angle', icon: '∠' },
  { tool: 'ellipse', icon: '◯' },
  { tool: 'probe', icon: '⌖' },
  ...(
    [
      'rectangle',
      'circle',
      'polygon',
      'polyline',
      'curve',
      'freehand',
      'pencil',
      'bidirectional',
      'cobb',
      'arrow',
      'label',
      'spine',
      'deviation',
      'ratio',
      'ellipsoid',
      'redaction',
      'calibrate',
    ] as const
  ).map((tool) => ({ tool })),
]

const toolCommands: Command[] = TOOLS.map(({ tool, icon }) => ({
  id: `tool.${tool}`,
  group: 'tool',
  label: `tools.${tool}`,
  icon,
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
    isAvailable: is2d,
    isEnabled: hasViewport,
    run: onViewport(toggleInvert),
  },
  {
    id: 'view.rotate90',
    group: 'view',
    label: 'commands.rotateRight',
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
    isAvailable: isCornerstone,
    isEnabled: hasViewport,
    run: () => resetTargetViewport(),
  },
  {
    id: 'view.previousImage',
    group: 'view',
    label: 'commands.previousImage',
    isAvailable: is2d,
    isEnabled: hasViewport,
    run: onViewport((id) => scrollImages(id, -1)),
  },
  {
    id: 'view.nextImage',
    group: 'view',
    label: 'commands.nextImage',
    isAvailable: is2d,
    isEnabled: hasViewport,
    run: onViewport((id) => scrollImages(id, 1)),
  },
  {
    id: 'view.firstImage',
    group: 'view',
    label: 'commands.firstImage',
    isAvailable: is2d,
    isEnabled: hasViewport,
    run: onViewport((id) => void setImageIndex(id, 0)),
  },
  {
    id: 'view.lastImage',
    group: 'view',
    label: 'commands.lastImage',
    isAvailable: is2d,
    isEnabled: hasViewport,
    run: onViewport((id) => void setImageIndex(id, Number.MAX_SAFE_INTEGER)),
  },
  {
    id: 'view.downloadPng',
    group: 'view',
    label: 'commands.downloadPng',
    icon: '⤓',
    isAvailable: isCornerstone,
    isEnabled: hasViewport,
    run: onViewport((id) => {
      const filter = getFilter(id)
      downloadPng(id, 'dicom-image.png', filter ? `url(#${filterElementId(filter)})` : '', redactionPolygons(id))
    }),
  },
]

// --- rotation, zoom, window, image, colormap, filter, display --------------------

/** A 2D image viewport (stack or MPR) that is mounted. */
const is2dViewport = (ctx: CommandContext) => is2dKind(ctx.kind) && ctx.viewportId !== null
/** Grayscale images only: colormaps and window presets do not apply to colour images. */
const isGrayscale = (ctx: CommandContext) => is2dViewport(ctx) && !isColorImage(ctx.viewportId!)

const rotateCommands: Command[] = [
  { id: 'rotate.left', group: 'rotate', label: 'commands.rotateLeft', icon: '↺', isAvailable: is2d, isEnabled: hasViewport, run: onViewport((id) => rotateBy(id, -90)) },
  { id: 'rotate.180', group: 'rotate', label: 'commands.rotate180', icon: '⟳', isAvailable: is2d, isEnabled: hasViewport, run: onViewport((id) => rotateBy(id, 180)) },
  {
    id: 'rotate.angle',
    group: 'rotate',
    label: 'commands.rotateAngle',
    icon: '∡',
    isAvailable: is2d,
    isEnabled: hasViewport,
    run: onViewport(async (id) => {
      const values = await askForm(
        'commands.rotateAngle',
        [{ name: 'angle', label: 'dialogs.angle', type: 'number', value: String(Math.round(getRotation(id))), min: -360, max: 360 }],
        'dialogs.apply',
      )
      if (values) setRotation(id, Number(values.angle))
    }),
  },
]

const ZOOM_PERCENTS = [50, 100, 200, 400]

const zoomCommands: Command[] = [
  { id: 'zoom.fit', group: 'zoom', label: 'commands.zoomFit', icon: '⤢', isAvailable: is2d, isEnabled: hasViewport, run: onViewport(zoomToFit) },
  ...ZOOM_PERCENTS.map(
    (percent): Command => ({
      id: `zoom.${percent}`,
      group: 'zoom',
      label: percent === 100 ? 'commands.zoom1to1' : 'commands.zoomPercent',
      labelValues: { percent },
      isAvailable: is2d,
      isEnabled: hasViewport,
      run: onViewport((id) => zoomToScale(id, percent / 100)),
    }),
  ),
  {
    id: 'zoom.trueSize',
    group: 'zoom',
    label: 'commands.zoomTrueSize',
    isAvailable: is2d,
    isEnabled: (ctx) => is2dViewport(ctx) && pixelSpacingMm(ctx.viewportId!) !== null,
    run: onViewport((id) => zoomToTrueSize(id, useSettings.getState().screenDpi)),
  },
  {
    id: 'zoom.screenDpi',
    group: 'zoom',
    label: 'commands.screenDpi',
    isAvailable: is2d,
    run: async () => {
      const values = await askForm(
        'commands.screenDpi',
        [{ name: 'dpi', label: 'dialogs.dpi', type: 'number', value: String(useSettings.getState().screenDpi), min: 50, max: 600, step: 1 }],
        'dialogs.apply',
      )
      if (values) useSettings.getState().setScreenDpi(Number(values.dpi))
    },
  },
]

/** Windows offered for the target viewport's image, in dropdown order. */
export function windowOptionsFor(ctx: CommandContext): WindowOption[] {
  if (!ctx.viewportId || !isGrayscale(ctx)) return []
  const modality = selectCurrentDisplaySet(ctx.state)?.series.modality ?? ''
  return windowOptions(modality, headerWindows(ctx.viewportId), useSettings.getState().presets)
}

/** The target viewport's current window, rounded as shown in the overlay. */
function currentWindow(viewportId: string) {
  const range = getViewport(viewportId)?.getProperties()?.voiRange
  if (!range) return null
  const width = Math.max(1, Math.round(range.upper - range.lower))
  return { width, center: Math.round((range.upper + range.lower) / 2) }
}

const windowCommands: Command[] = [
  // Keys 1–9 pick the nth window of the dropdown (header windows first); 0 the first header window.
  ...Array.from({ length: 10 }, (_, n): Command => ({
    id: `window.option${n}`,
    group: 'window',
    label: 'commands.windowOption',
    labelValues: { number: n },
    isAvailable: (ctx) => isGrayscale(ctx) && windowOptionsFor(ctx).length > (n === 0 ? 0 : n - 1),
    run: (ctx) => {
      const options = windowOptionsFor(ctx)
      const option = n === 0 ? options.find((o) => o.source === 'header') : options[n - 1]
      if (option) applyWindow(ctx.viewportId!, option.width, option.center)
    },
  })),
  { id: 'window.auto', group: 'window', label: 'commands.windowAuto', icon: 'A', isAvailable: isGrayscale, run: onViewport(autoWindow) },
  { id: 'window.fullRange', group: 'window', label: 'commands.windowFullRange', isAvailable: isGrayscale, run: onViewport(fullRange) },
  {
    id: 'window.custom',
    group: 'window',
    label: 'commands.windowCustom',
    isAvailable: isGrayscale,
    run: onViewport(async (id) => {
      const current = currentWindow(id)
      const values = await askForm(
        'commands.windowCustom',
        [
          { name: 'width', label: 'dialogs.windowWidth', type: 'number', value: String(current?.width ?? 400), min: 0.001 },
          { name: 'center', label: 'dialogs.windowCenter', type: 'number', value: String(current?.center ?? 40) },
        ],
        'dialogs.apply',
      )
      if (values) applyWindow(id, Number(values.width), Number(values.center))
    }),
  },
  {
    id: 'window.voiLut',
    group: 'window',
    label: 'commands.windowVoiLut',
    isAvailable: (ctx) => isGrayscale(ctx) && voiLutOf(ctx.viewportId!) !== null,
    run: onViewport(applyVoiLut),
  },
  {
    id: 'window.manage',
    group: 'window',
    label: 'commands.windowManage',
    isAvailable: isGrayscale,
    run: (ctx) => managePresets(selectCurrentDisplaySet(ctx.state)?.series.modality ?? '', currentWindow(ctx.viewportId!)),
  },
]

const imageCommands: Command[] = [
  {
    id: 'image.smooth',
    group: 'image',
    label: 'commands.smoothPixels',
    isAvailable: is2dViewport,
    isActive: (ctx) => getSmoothPixels(ctx.viewportId!),
    run: onViewport((id) => setSmoothPixels(id, !getSmoothPixels(id))),
  },
  {
    id: 'image.sigmoid',
    group: 'image',
    label: 'commands.sigmoid',
    isAvailable: isGrayscale,
    isActive: (ctx) => getSigmoid(ctx.viewportId!),
    run: onViewport((id) => setSigmoid(id, !getSigmoid(id))),
  },
]

const colormapCommands: Command[] = COLORMAPS.map((name) => ({
  id: `colormap.${name}`,
  group: 'colormap',
  label: `colormaps.${name.replace(/[^a-zA-Z0-9]/g, '')}`,
  isAvailable: isGrayscale,
  isActive: (ctx) => getColormapName(ctx.viewportId!) === name,
  run: onViewport((id) => setColormap(id, name)),
}))

const filterCommands: Command[] = [
  {
    id: 'filter.none',
    group: 'filter',
    label: 'filters.none',
    isAvailable: is2dViewport,
    isActive: (ctx) => getFilter(ctx.viewportId!) === null,
    run: onViewport((id) => setFilter(id, null)),
  },
  ...FILTERS.map(
    (type): Command => ({
      id: `filter.${type}`,
      group: 'filter',
      label: `filters.${type}`,
      isAvailable: is2dViewport,
      isActive: (ctx) => getFilter(ctx.viewportId!)?.type === type,
      run: onViewport((id) => setFilter(id, { type, strength: getFilter(id)?.strength ?? 2 })),
    }),
  ),
  ...([1, 2, 3] as FilterStrength[]).map(
    (strength): Command => ({
      id: `filter.strength${strength}`,
      group: 'filter',
      label: 'filters.strength',
      labelValues: { strength },
      isAvailable: (ctx) => is2dViewport(ctx) && getFilter(ctx.viewportId!) !== null,
      isActive: (ctx) => getFilter(ctx.viewportId!)?.strength === strength,
      run: onViewport((id) => {
        const filter = getFilter(id)
        if (filter) setFilter(id, { ...filter, strength })
      }),
    }),
  ),
]

const DISPLAY_TOGGLES: (keyof DisplaySettings)[] = [
  'overlayText',
  'privacy',
  'dicomOverlays',
  'scaleBar',
  'pixelValue',
  'cornerPatient',
  'cornerStudy',
  'cornerImageSize',
  'cornerZoom',
  'cornerWindow',
  'cornerSlice',
  'orientationMarkers',
]

const displayCommands: Command[] = [
  ...DISPLAY_TOGGLES.map(
    (key): Command => ({
      id: `display.${key}`,
      group: 'display',
      label: `display.${key}`,
      isActive: () => useSettings.getState().display[key],
      run: () => useSettings.getState().toggleDisplay(key),
    }),
  ),
  {
    id: 'display.fullscreen',
    group: 'display',
    label: 'display.fullscreen',
    icon: '⛶',
    isAvailable: () => fullscreenSupported(),
    isActive: () => isFullscreen(),
    run: () => toggleFullscreen(),
  },
  {
    id: 'display.distractionFree',
    group: 'display',
    label: 'display.distractionFree',
    isActive: (ctx) => ctx.state.distractionFree,
    run: (ctx) => {
      setDistractionFree(!ctx.state.distractionFree)
      if (!ctx.state.distractionFree) notify(t('display.distractionFreeHint'), 'info')
    },
  },
  {
    id: 'display.exitDistractionFree',
    group: 'display',
    label: 'display.exitDistractionFree',
    isAvailable: (ctx) => ctx.state.distractionFree,
    run: () => setDistractionFree(false),
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
    isAvailable: canPlay,
    run: (ctx) => (video(ctx) ? video(ctx)!.toggle() : toggleCine(ctx.viewportId!, cineSeries(ctx)!)),
  },
  {
    id: 'cine.slower',
    group: 'cine',
    label: 'cine.slower',
    isAvailable: canPlay,
    run: (ctx) => (video(ctx) ? video(ctx)!.changeSpeed(-1) : changeCineFps(ctx.viewportId!, cineSeries(ctx)!, -1)),
  },
  {
    id: 'cine.faster',
    group: 'cine',
    label: 'cine.faster',
    isAvailable: canPlay,
    run: (ctx) => (video(ctx) ? video(ctx)!.changeSpeed(1) : changeCineFps(ctx.viewportId!, cineSeries(ctx)!, 1)),
  },
  {
    id: 'video.previousFrame',
    group: 'cine',
    label: 'video.previousFrame',
    isAvailable: (ctx) => video(ctx) !== undefined,
    run: (ctx) => video(ctx)!.step(-1),
  },
  {
    id: 'video.nextFrame',
    group: 'cine',
    label: 'video.nextFrame',
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

/** Link toggles; the reference line options without an icon are in the View menu. */
const LINKS: { key: keyof LinkSettings; icon?: string }[] = [
  { key: 'referenceLines', icon: 'REF' },
  { key: 'sliceSync', icon: 'SYNC' },
  { key: 'voiSync', icon: 'W/L' },
  { key: 'zoomPanSync', icon: 'Z/P' },
  { key: 'cineSync', icon: 'CINE' },
  { key: 'referenceLinesAll' },
  { key: 'referenceLinesEnds' },
]

const linkCommands: Command[] = [
  ...LINKS.map(
    ({ key, icon }): Command => ({
      id: `link.${key}`,
      group: 'link',
      label: `commands.${key}`,
      icon,
      isAvailable: isGrid,
      isActive: (ctx) => ctx.links[key],
      run: () => useSettings.getState().toggleLink(key),
    }),
  ),
  {
    id: 'link.lock',
    group: 'link',
    label: 'commands.syncLock',
    icon: '🔒',
    isAvailable: isGrid,
    isActive: (ctx) => ctx.state.syncLocked,
    run: (ctx) => setSyncLocked(!ctx.state.syncLocked),
  },
  {
    id: 'link.cell',
    group: 'link',
    label: 'commands.cellLinked',
    isAvailable: (ctx) => isGrid(ctx) && ctx.state.cells[ctx.state.activeCell] !== null,
    isActive: (ctx) => isCellLinked(ctx.state, ctx.state.activeCell),
    run: (ctx) => toggleCellLink(ctx.state.activeCell),
  },
]

const panelCommands: Command[] = [
  {
    id: 'panel.tags',
    group: 'panel',
    label: 'commands.tags',
    icon: 'TAGS',
    isActive: (ctx) => ctx.state.panel === 'tags',
    run: () => togglePanel('tags'),
  },
]

/** Lets the user pick files or a folder; resolves with them (empty when cancelled). */
function pickFiles(folder: boolean) {
  return new Promise<File[]>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    if (folder) input.webkitdirectory = true
    input.addEventListener('change', () => resolve([...(input.files ?? [])]))
    input.addEventListener('cancel', () => resolve([]))
    input.click()
  })
}

const hasImageSeries = (ctx: CommandContext) => ctx.state.cells[ctx.state.activeCell]?.series.kind === 'image'

const compareCommands: Command[] = [
  {
    id: 'compare.prior',
    group: 'compare',
    label: 'commands.comparePrior',
    icon: 'PRIOR',
    isAvailable: (ctx) => ctx.mode !== '3d',
    isEnabled: (ctx) => {
      const current = ctx.state.cells[ctx.state.activeCell]
      return current?.series.kind === 'image' && findPriorMatch(ctx.state.studies, current) !== null
    },
    run: () => compareWithPrior(),
  },
  {
    id: 'compare.addFiles',
    group: 'compare',
    label: 'commands.addFiles',
    run: async () => {
      const files = await pickFiles(false)
      if (files.length) await addFiles(filterCandidates(files))
    },
  },
  {
    id: 'compare.addFolder',
    group: 'compare',
    label: 'commands.addFolder',
    run: async () => {
      const files = await pickFiles(true)
      if (files.length) await addFiles(filterCandidates(files))
    },
  },
  {
    id: 'compare.newWindow',
    group: 'compare',
    label: 'commands.newWindow',
    isAvailable: isGrid,
    isEnabled: hasImageSeries,
    run: (ctx) => openSeriesInNewWindow(ctx.state.cells[ctx.state.activeCell]!),
  },
  {
    id: 'compare.clearCursor',
    group: 'compare',
    label: 'commands.clearCursor3d',
    isEnabled: () => useCursor3D.getState().cursor !== null,
    run: () => clearCursor3D(),
  },
  { id: 'hanging.apply', group: 'compare', label: 'hanging.apply', isAvailable: isGrid, run: () => reapplyHanging() },
  { id: 'hanging.save', group: 'compare', label: 'hanging.save', isAvailable: isGrid, run: () => void saveHangingRule() },
  { id: 'hanging.manage', group: 'compare', label: 'hanging.manage', run: () => manageHangingRules() },
]

const ALL_COMMANDS: Command[] = [
  ...toolCommands,
  ...viewCommands,
  ...rotateCommands,
  ...zoomCommands,
  ...windowCommands,
  ...imageCommands,
  ...colormapCommands,
  ...filterCommands,
  ...displayCommands,
  ...cineCommands,
  ...sortCommands,
  ...modeCommands,
  ...layoutCommands,
  ...linkCommands,
  ...panelCommands,
  ...measureCommands,
  ...compareCommands,
]

/** Every command with its keyboard shortcuts from the keymap. */
export const COMMANDS: Command[] = ALL_COMMANDS.map((command) => ({ ...command, keys: DEFAULT_KEYMAP[command.id] }))

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
