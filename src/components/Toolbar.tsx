import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  COMMANDS,
  getCommand,
  isAvailable,
  runCommand,
  windowOptionsFor,
  isEnabled,
  type Command,
  type CommandContext,
  type CommandGroup,
} from '../commands/commands'
import { useCommandContext } from '../commands/useCommands'
import type { SlabMode } from '../cornerstone/mpr'
import { is2dKind } from '../cornerstone/viewportRegistry'
import { groupedPresets } from '../cornerstone/volume3d'
import { COLORMAPS, applyWindow, getColormapName, isColorImage, isVoiLutColormap, voiLutOf } from '../cornerstone/display'
import { FILTERS } from '../store/viewportDisplayStore'
import { openFiles } from '../store/viewerActions'
import { selectCurrentDisplaySet, setLayout, setPreset, setSlab, useViewer } from '../store/viewerStore'
import { CommandMenu, type MenuSection } from './CommandMenu'
import { FilePickers } from './FilePickers'
import { LayoutIcon } from './LayoutIcon'
import { PhaseControls } from './PhaseControls'
import { MAX_LAYOUT_SIZE, MORE_LAYOUTS, clampLayout, type Layout } from './layouts'
import { useViewportVoi } from './useViewportVoi'

const SLAB_THICKNESSES = [0, 5, 10, 20, 40]
const SLAB_MODES: { mode: SlabMode; label: string }[] = [
  { mode: 'mip', label: 'toolbar.slabMip' },
  { mode: 'minip', label: 'toolbar.slabMinip' },
  { mode: 'avg', label: 'toolbar.slabAvg' },
]

const SELECT_CLASS = 'h-8 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 disabled:opacity-40'

/** Groups whose icon is a short text label rather than a symbol. */
const TEXT_ICON_GROUPS: CommandGroup[] = ['mode', 'link', 'panel', 'compare']

function CommandButton({ command, ctx }: { command: Command; ctx: CommandContext }) {
  const { t } = useTranslation()
  const label = t(command.label, command.labelValues)
  const shortcut = command.keys?.[0]
  const title = shortcut?.length === 1 ? `${label} (${shortcut.toUpperCase()})` : label
  const active = command.isActive?.(ctx) ?? false
  const layout = command.group === 'layout' ? (command.labelValues as { rows: number; cols: number }) : null

  return (
    <button
      onClick={() => command.run(ctx)}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={!isEnabled(command, ctx)}
      className={`grid h-9 min-w-9 place-items-center rounded-md px-2 text-base transition disabled:opacity-30 ${
        active ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
    >
      {layout ? (
        <LayoutIcon {...layout} />
      ) : TEXT_ICON_GROUPS.includes(command.group) ? (
        <span className="text-[10px] font-semibold tracking-wide">{command.icon}</span>
      ) : (
        command.icon
      )}
    </button>
  )
}

const Divider = () => <div className="mx-1 h-6 w-px bg-slate-700" />

/** Buttons for command groups. Keyboard-only commands (no icon) and unavailable ones are skipped. */
function groupButtons(groups: CommandGroup[], ctx: CommandContext) {
  return COMMANDS.filter(
    (command) =>
      groups.includes(command.group) && (command.icon !== undefined || command.group === 'layout') && isAvailable(command, ctx),
  ).map((command) => <CommandButton key={command.id} command={command} ctx={ctx} />)
}

const PRESET_GROUP_LABELS: Record<string, string> = { Other: 'toolbar.presetGroupOther', All: 'toolbar.presetGroupAll' }

function PresetSelect({ modality }: { modality: string }) {
  const { t } = useTranslation()
  const preset = useViewer((s) => s.preset)
  return (
    <select
      aria-label={t('toolbar.preset3d')}
      value={preset}
      onChange={(event) => setPreset(event.target.value)}
      className={SELECT_CLASS}
    >
      {groupedPresets(modality).map((group) => (
        <optgroup key={group.label} label={PRESET_GROUP_LABELS[group.label] ? t(PRESET_GROUP_LABELS[group.label]) : group.label}>
          {group.presets.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

/**
 * The window dropdown: windows from the image header, built-in and user
 * presets (keys 1–9 in this order), then actions. Shows the option matching
 * the viewport's window, or the window itself once changed some other way.
 */
function WindowSelect({ viewportId, ctx }: { viewportId: string; ctx: CommandContext }) {
  const { t } = useTranslation()
  const voi = useViewportVoi(viewportId)
  const options = windowOptionsFor(ctx)
  const voiLut = voiLutOf(viewportId)
  const close = (o: { width: number; center: number }) => voi && Math.abs(o.width - voi.width) <= 1 && Math.abs(o.center - voi.center) <= 1
  // A named preset reads better than an unnamed header window with the same values.
  const matching = [...options.entries()].sort(([, a], [, b]) => Number(a.labelKey && a.source === 'header') - Number(b.labelKey && b.source === 'header')).find(([, o]) => close(o))?.[0] ?? -1
  const label = (o: (typeof options)[number]) => (o.labelKey ? t(o.label) : o.label)
  const groups = (['header', 'builtin', 'user'] as const).map((source) => ({
    source,
    items: options.map((o, index) => ({ o, index })).filter(({ o }) => o.source === source),
  }))

  return (
    <select
      aria-label={t('toolbar.windowPreset')}
      value={isVoiLutColormap(getColormapName(viewportId)) ? 'voiLut' : matching >= 0 ? `option:${matching}` : ''}
      onChange={(event) => {
        const value = event.target.value
        if (value.startsWith('option:')) {
          const option = options[Number(value.slice(7))]
          applyWindow(viewportId, option.width, option.center)
        } else runCommand(`window.${value}`, ctx)
      }}
      className={`ml-1 max-w-48 ${SELECT_CLASS}`}
    >
      <option value="" disabled>
        {voi && matching < 0 ? t('toolbar.currentWindow', { width: voi.width, center: voi.center }) : t('toolbar.windowPresetPlaceholder')}
      </option>
      {groups.map(
        ({ source, items }) =>
          items.length > 0 && (
            <optgroup key={source} label={t(`window.group.${source}`)}>
              {items.map(({ o, index }) => (
                <option key={o.id} value={`option:${index}`}>
                  {index < 9 ? `${index + 1}. ` : ''}
                  {label(o)} ({Math.round(o.width)}/{Math.round(o.center)})
                </option>
              ))}
            </optgroup>
          ),
      )}
      <optgroup label={t('window.group.actions')}>
        {voiLut && <option value="voiLut">{t('commands.windowVoiLut')}{voiLut.explanation ? `: ${voiLut.explanation}` : ''}</option>}
        <option value="auto">{t('commands.windowAuto')}</option>
        <option value="fullRange">{t('commands.windowFullRange')}</option>
        <option value="custom">{t('commands.windowCustom')}</option>
        <option value="manage">{t('commands.windowManage')}</option>
      </optgroup>
    </select>
  )
}

/** A toolbar button opening a menu of commands below it; shown pressed when one of its choices is active. */
function MenuButton({ label, icon, sections, active = false }: { label: string; icon: ReactNode; sections: MenuSection[]; active?: boolean }) {
  const { t } = useTranslation()
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const close = useCallback(() => setAnchor(null), [])
  return (
    <>
      <button
        title={t(label)}
        aria-label={t(label)}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        aria-pressed={active || undefined}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setAnchor(anchor ? null : { x: rect.left, y: rect.bottom + 4 })
        }}
        className={`flex h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold ${
          active ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`}
      >
        {icon}
        <span aria-hidden>▾</span>
      </button>
      {anchor && <CommandMenu x={anchor.x} y={anchor.y} sections={sections} label={t(label)} onClose={close} />}
    </>
  )
}

const VIEW_MENU: MenuSection[] = [
  { title: 'menus.rotate', commands: ['rotate.left', 'view.rotate90', 'rotate.180', 'rotate.angle', 'view.flipHorizontal', 'view.flipVertical'] },
  { title: 'menus.zoom', commands: ['zoom.fit', 'zoom.50', 'zoom.100', 'zoom.200', 'zoom.400', 'zoom.trueSize', 'zoom.screenDpi'] },
  { title: 'menus.pixels', commands: ['image.smooth', 'image.sigmoid'] },
  {
    title: 'menus.overlays',
    commands: ['display.overlayText', 'display.privacy', 'display.dicomOverlays', 'display.scaleBar', 'display.pixelValue'],
  },
  {
    title: 'menus.cornerText',
    commands: [
      'display.cornerPatient',
      'display.cornerStudy',
      'display.cornerImageSize',
      'display.cornerZoom',
      'display.cornerWindow',
      'display.cornerSlice',
      'display.orientationMarkers',
    ],
  },
  { title: 'menus.referenceLines', commands: ['link.referenceLines', 'link.referenceLinesAll', 'link.referenceLinesEnds'] },
  { title: 'menus.screen', commands: ['display.fullscreen', 'display.distractionFree'] },
]

const IMAGE_MENU: MenuSection[] = [
  { title: 'menus.colormap', commands: COLORMAPS.map((name) => `colormap.${name}`) },
  { title: 'menus.filter', commands: ['filter.none', ...FILTERS.map((type) => `filter.${type}`)] },
  { title: 'menus.strength', commands: ['filter.strength1', 'filter.strength2', 'filter.strength3'] },
]

const MEASURE_MENU: MenuSection[] = [
  {
    title: 'menus.lines',
    commands: ['tool.length', 'tool.polyline', 'tool.angle', 'tool.cobb', 'tool.bidirectional', 'tool.deviation', 'tool.ratio', 'tool.ellipsoid'],
  },
  { title: 'menus.areas', commands: ['tool.rectangle', 'tool.ellipse', 'tool.circle', 'tool.sphere', 'tool.polygon', 'tool.curve', 'tool.freehand', 'tool.probe'] },
  { title: 'menus.annotate', commands: ['tool.arrow', 'tool.label', 'tool.spine', 'measure.spineStart', 'tool.pencil', 'tool.redaction'] },
  { title: 'menus.calibration', commands: ['tool.calibrate', 'measure.clearCalibration', 'measure.unitMm', 'measure.unitCm'] },
  {
    title: 'menus.manage',
    commands: [
      'panel.measurements',
      'measure.undo',
      'measure.redo',
      'measure.copy',
      'measure.paste',
      'measure.toggleHidden',
      'measure.deleteSelected',
      'measure.deleteImage',
      'measure.deleteSeries',
      'measure.deleteAll',
    ],
  },
  { title: 'menus.export', commands: ['measure.copyValues', 'measure.exportCsv', 'measure.saveJson', 'measure.loadJson'] },
]

const COMPARE_MENU: MenuSection[] = [
  { title: 'menus.compare', commands: ['compare.prior', 'compare.addFiles', 'compare.addFolder', 'compare.newWindow'] },
  {
    title: 'menus.links',
    commands: ['link.sliceSync', 'link.voiSync', 'link.zoomPanSync', 'link.cineSync', 'link.lock', 'link.cell'],
  },
  { title: 'menus.referenceLines', commands: ['link.referenceLines', 'link.referenceLinesAll', 'link.referenceLinesEnds'] },
  { title: 'menus.cursor3d', commands: ['tool.cursor3d', 'compare.clearCursor'] },
  { title: 'menus.hanging', commands: ['hanging.apply', 'hanging.save', 'hanging.manage'] },
]

const REFORMAT_MENU: MenuSection[] = [
  { title: 'menus.planes', commands: ['mpr.resetPlanes', 'mpr.newSeries'] },
  { title: 'menus.cpr', commands: ['mpr.cprStart', 'mpr.cprUndo', 'mpr.cprMake', 'mpr.cprClear'] },
]

const FUNCTIONAL_MENU: MenuSection[] = [
  { title: 'menus.fusion', commands: ['panel.fusion', 'functional.petct', 'tool.sphere'] },
  { title: 'menus.dynamic', commands: ['panel.tic', 'functional.mpr4d', 'panel.dsa'] },
]

const EXPORT_MENU: MenuSection[] = [
  { title: 'menus.exportImages', commands: ['export.images', 'export.movie', 'export.copyImage', 'export.captureRegion', 'export.print'] },
  { title: 'menus.exportDicom', commands: ['export.originals.series', 'export.originals.study', 'export.originals.all', 'export.decompress', 'export.tagEdit'] },
  { title: 'menus.privacy', commands: ['export.anonymize', 'export.convert'] },
]

/** Tools chosen from the Measure menu (the toolbar has buttons for the others). */
const MENU_TOOLS = new Set(MEASURE_MENU.flatMap((section) => section.commands).filter((id) => id.startsWith('tool.') && !getCommand(id).icon))

/** More layouts: common presets and a rows × columns grid to pick from. */
function LayoutPicker() {
  const { t } = useTranslation()
  const layout = useViewer((s) => s.layout)
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState<Layout | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => !ref.current?.contains(event.target as Node) && setOpen(false)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  const choose = (next: Layout) => {
    setLayout(clampLayout(next))
    setOpen(false)
  }
  const shown = hover ?? layout

  return (
    <div ref={ref} className="relative">
      <button
        title={t('layoutPicker.more')}
        aria-label={t('layoutPicker.more')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-9 items-center gap-1 rounded-md px-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
      >
        ▦<span aria-hidden>▾</span>
      </button>
      {open && (
        <div role="dialog" aria-label={t('layoutPicker.more')} className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-xl">
          <div className="mb-2 grid grid-cols-3 gap-1">
            {MORE_LAYOUTS.map((option) => (
              <button
                key={`${option.rows}x${option.cols}`}
                aria-label={t('commands.layout', { ...option })}
                aria-pressed={option.rows === layout.rows && option.cols === layout.cols}
                onClick={() => choose(option)}
                className="flex items-center justify-center gap-1 rounded px-1 py-1 text-xs text-slate-300 hover:bg-slate-800 aria-pressed:bg-sky-600 aria-pressed:text-white"
              >
                <LayoutIcon {...option} />
                {option.rows}×{option.cols}
              </button>
            ))}
          </div>
          <div
            className="grid gap-0.5"
            style={{ gridTemplateColumns: `repeat(${MAX_LAYOUT_SIZE}, 1fr)` }}
            onPointerLeave={() => setHover(null)}
            aria-label={t('layoutPicker.grid')}
            role="group"
          >
            {Array.from({ length: MAX_LAYOUT_SIZE * MAX_LAYOUT_SIZE }, (_, i) => {
              const cell = { rows: Math.floor(i / MAX_LAYOUT_SIZE) + 1, cols: (i % MAX_LAYOUT_SIZE) + 1 }
              const inside = cell.rows <= shown.rows && cell.cols <= shown.cols
              return (
                <button
                  key={i}
                  aria-label={t('layoutPicker.cell', { ...cell })}
                  onPointerEnter={() => setHover(cell)}
                  onFocus={() => setHover(cell)}
                  onClick={() => choose(cell)}
                  className={`aspect-square rounded-sm border ${inside ? 'border-sky-400 bg-sky-500/40' : 'border-slate-700 bg-slate-800'}`}
                />
              )
            })}
          </div>
          <p className="mt-2 text-center text-xs text-slate-400">
            {shown.rows} × {shown.cols}
          </p>
        </div>
      )}
    </div>
  )
}

function SlabControls() {
  const { t } = useTranslation()
  const slab = useViewer((s) => s.slab)
  return (
    <>
      <select
        aria-label={t('toolbar.slabThickness')}
        value={slab.thickness}
        onChange={(event) => setSlab({ ...slab, thickness: Number(event.target.value) })}
        className={SELECT_CLASS}
      >
        {SLAB_THICKNESSES.map((mm) => (
          <option key={mm} value={mm}>
            {mm === 0 ? t('toolbar.slabOff') : t('toolbar.slabMm', { mm })}
          </option>
        ))}
      </select>
      <select
        aria-label={t('toolbar.slabProjection')}
        value={slab.mode}
        disabled={slab.thickness === 0}
        onChange={(event) => setSlab({ ...slab, mode: event.target.value as SlabMode })}
        className={SELECT_CLASS}
      >
        {SLAB_MODES.map(({ mode, label }) => (
          <option key={mode} value={mode}>
            {t(label)}
          </option>
        ))}
      </select>
    </>
  )
}

export function Toolbar() {
  const { t } = useTranslation()
  const ctx = useCommandContext()
  const { mode, viewportId, kind } = ctx
  const modality = useViewer((s) => selectCurrentDisplaySet(s)?.series.modality ?? '')
  const show3dControls = mode === '3d' || (mode === 'mpr' && ctx.state.mprWith3d)

  const is2d = viewportId !== null && is2dKind(kind)
  const grayscale = is2d && !isColorImage(viewportId)
  const viewButtons = ['view.invert', 'rotate.left', 'view.rotate90', 'view.flipHorizontal', 'view.flipVertical', 'view.reset']

  // Sections are separated by a divider; empty ones (e.g. image tools for a PDF) disappear.
  const sections: ReactNode[][] = [
    groupButtons(['tool'], ctx),
    [
      ...viewButtons.map(getCommand).filter((c) => isAvailable(c, ctx)).map((c) => <CommandButton key={c.id} command={c} ctx={ctx} />),
      grayscale && <WindowSelect key="window" viewportId={viewportId!} ctx={ctx} />,
      is2d && <MenuButton key="view-menu" label="menus.view" icon={t('menus.viewShort')} sections={VIEW_MENU} />,
      is2d && <MenuButton key="image-menu" label="menus.image" icon={t('menus.imageShort')} sections={IMAGE_MENU} />,
    ],
    [
      mode !== '3d' && (
        <MenuButton
          key="measure-menu"
          label="menus.measure"
          icon={t('menus.measureShort')}
          sections={MEASURE_MENU}
          active={MENU_TOOLS.has(`tool.${ctx.state.activeTool}`)}
        />
      ),
    ],
    [
      ...groupButtons(['mode'], ctx),
      mode === 'mpr' && <SlabControls key="slab" />,
      mode === 'mpr' && <MenuButton key="reformat-menu" label="menus.reformat" icon={t('menus.reformatShort')} sections={REFORMAT_MENU} />,
      show3dControls && <PresetSelect key="preset" modality={modality} />,
      mode !== 'grid' && <PhaseControls key="phases" />,
      <MenuButton key="functional-menu" label="menus.functional" icon={t('menus.functionalShort')} sections={FUNCTIONAL_MENU} />,
    ],
    mode === 'grid' ? [...groupButtons(['layout'], ctx), <LayoutPicker key="layout-picker" />] : [],
    mode === 'grid'
      ? [...groupButtons(['link'], ctx), <MenuButton key="compare-menu" label="menus.compareMenu" icon={t('menus.compareShort')} sections={COMPARE_MENU} />]
      : [],
    [
      ...groupButtons(['view'], ctx).filter((button) => button.key === 'view.downloadPng'),
      <MenuButton key="export-menu" label="menus.exportMenu" icon={t('menus.exportShort')} sections={EXPORT_MENU} />,
      ...groupButtons(['panel'], ctx),
      ...['display.fullscreen'].map(getCommand).filter((c) => isAvailable(c, ctx)).map((c) => <CommandButton key={c.id} command={c} ctx={ctx} />),
    ],
  ].map((section) => section.filter(Boolean))

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 bg-slate-900 px-2 py-1.5">
      {sections
        .filter((section) => section.length > 0)
        .map((section, i) => (
          <Fragment key={i}>
            {i > 0 && <Divider />}
            {section}
          </Fragment>
        ))}

      <div className="ml-auto">
        <FilePickers onFiles={openFiles} compact />
      </div>
    </div>
  )
}
