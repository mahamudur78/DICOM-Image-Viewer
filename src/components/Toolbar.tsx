import type { SlabMode } from '../cornerstone/mpr'
import { toolsForMode, type PrimaryTool, type ViewMode } from '../cornerstone/tools'
import { CT_PRESETS, downloadPng, flip, rotate90, setWindow, toggleInvert } from '../cornerstone/viewer'
import { groupedPresets } from '../cornerstone/volume3d'
import { FilePickers } from './FilePickers'
import { LAYOUTS, type Layout } from './layouts'
import { LINK_BUTTONS, TOOL_BUTTONS, type LinkSettings } from './toolButtons'

interface ToolbarProps {
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
  activeTool: PrimaryTool
  onToolChange: (tool: PrimaryTool) => void
  /** Viewport the view actions apply to, or null when the active cell is empty. */
  viewportId: string | null
  /** True when that viewport is a 3D rendering (2D-only actions are hidden). */
  viewportIs3d: boolean
  onReset: () => void
  modality: string
  layout: Layout
  onLayoutChange: (layout: Layout) => void
  links: LinkSettings
  onToggleLink: (key: keyof LinkSettings) => void
  slab: Slab
  onSlabChange: (slab: Slab) => void
  mprWith3d: boolean
  onToggleMprWith3d: () => void
  preset: string
  onPresetChange: (preset: string) => void
  showTags: boolean
  onToggleTags: () => void
  onFiles: (files: File[]) => void
}

export interface Slab {
  mode: SlabMode
  thickness: number
}

const SLAB_THICKNESSES = [0, 5, 10, 20, 40]
const SLAB_MODES: { mode: SlabMode; label: string }[] = [
  { mode: 'mip', label: 'MIP' },
  { mode: 'minip', label: 'MinIP' },
  { mode: 'avg', label: 'Average' },
]

const SELECT_CLASS = 'h-8 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 disabled:opacity-40'

function IconButton({
  label,
  onClick,
  active = false,
  disabled = false,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={`grid h-9 min-w-9 place-items-center rounded-md px-2 text-base transition disabled:opacity-30 ${
        active ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

const Divider = () => <div className="mx-1 h-6 w-px bg-slate-700" />

function LayoutIcon({ rows, cols }: Layout) {
  return (
    <span
      className="grid h-4 w-5 gap-px"
      style={{ gridTemplateRows: `repeat(${rows}, 1fr)`, gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {Array.from({ length: rows * cols }, (_, i) => (
        <span key={i} className="rounded-[1px] bg-current" />
      ))}
    </span>
  )
}

function PresetSelect({ modality, preset, onChange }: { modality: string; preset: string; onChange: (p: string) => void }) {
  return (
    <select aria-label="3D preset" value={preset} onChange={(event) => onChange(event.target.value)} className={SELECT_CLASS}>
      {groupedPresets(modality).map((group) => (
        <optgroup key={group.label} label={group.label}>
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

export function Toolbar({
  mode,
  onModeChange,
  activeTool,
  onToolChange,
  viewportId,
  viewportIs3d,
  onReset,
  modality,
  layout,
  onLayoutChange,
  links,
  onToggleLink,
  slab,
  onSlabChange,
  mprWith3d,
  onToggleMprWith3d,
  preset,
  onPresetChange,
  showTags,
  onToggleTags,
  onFiles,
}: ToolbarProps) {
  const withViewport = (action: (id: string) => void) => () => {
    if (viewportId) action(viewportId)
  }
  const noViewport = viewportId === null
  const available = toolsForMode(mode)
  const show3dControls = mode === '3d' || (mode === 'mpr' && mprWith3d)

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 bg-slate-900 px-2 py-1.5">
      {TOOL_BUTTONS.filter(({ tool }) => available.includes(tool)).map(({ tool, label, icon, key }) => (
        <IconButton key={tool} label={`${label} (${key})`} active={activeTool === tool} onClick={() => onToolChange(tool)}>
          {icon}
        </IconButton>
      ))}

      <Divider />

      {!viewportIs3d && (
        <>
          <IconButton label="Invert (I)" disabled={noViewport} onClick={withViewport(toggleInvert)}>
            ◑
          </IconButton>
          <IconButton label="Rotate 90°" disabled={noViewport} onClick={withViewport(rotate90)}>
            ↻
          </IconButton>
          <IconButton label="Flip horizontal" disabled={noViewport} onClick={withViewport((id) => flip(id, 'horizontal'))}>
            ⇋
          </IconButton>
          <IconButton label="Flip vertical" disabled={noViewport} onClick={withViewport((id) => flip(id, 'vertical'))}>
            ⇵
          </IconButton>
        </>
      )}
      <IconButton label="Reset (R)" disabled={noViewport} onClick={onReset}>
        ⟲
      </IconButton>

      {modality === 'CT' && viewportId && !viewportIs3d && (
        <select
          aria-label="Window preset"
          defaultValue=""
          onChange={(event) => {
            const windowPreset = CT_PRESETS[Number(event.target.value)]
            if (windowPreset) setWindow(viewportId, windowPreset.width, windowPreset.center)
            event.target.value = ''
          }}
          className={`ml-1 ${SELECT_CLASS}`}
        >
          <option value="" disabled>
            W/L preset
          </option>
          {CT_PRESETS.map((p, index) => (
            <option key={p.label} value={index}>
              {p.label} ({p.width}/{p.center})
            </option>
          ))}
        </select>
      )}

      <Divider />

      <IconButton label="MPR: axial, sagittal and coronal views" active={mode === 'mpr'} onClick={() => onModeChange('mpr')}>
        <span className="text-[10px] font-semibold tracking-wide">MPR</span>
      </IconButton>
      <IconButton label="3D volume rendering" active={mode === '3d'} onClick={() => onModeChange('3d')}>
        <span className="text-[10px] font-semibold tracking-wide">3D</span>
      </IconButton>

      {mode === 'mpr' && (
        <>
          <IconButton label="MPR + 3D layout (2×2)" active={mprWith3d} onClick={onToggleMprWith3d}>
            <span className="text-[10px] font-semibold tracking-wide">+3D</span>
          </IconButton>
          <select
            aria-label="Slab thickness"
            value={slab.thickness}
            onChange={(event) => onSlabChange({ ...slab, thickness: Number(event.target.value) })}
            className={SELECT_CLASS}
          >
            {SLAB_THICKNESSES.map((mm) => (
              <option key={mm} value={mm}>
                {mm === 0 ? 'Slab: off' : `Slab ${mm} mm`}
              </option>
            ))}
          </select>
          <select
            aria-label="Slab projection"
            value={slab.mode}
            disabled={slab.thickness === 0}
            onChange={(event) => onSlabChange({ ...slab, mode: event.target.value as SlabMode })}
            className={SELECT_CLASS}
          >
            {SLAB_MODES.map(({ mode: slabMode, label }) => (
              <option key={slabMode} value={slabMode}>
                {label}
              </option>
            ))}
          </select>
        </>
      )}

      {show3dControls && <PresetSelect modality={modality} preset={preset} onChange={onPresetChange} />}

      {mode === 'grid' && (
        <>
          {LAYOUTS.map((option) => (
            <IconButton
              key={`${option.rows}x${option.cols}`}
              label={`Layout ${option.rows}×${option.cols}`}
              active={option.rows === layout.rows && option.cols === layout.cols}
              onClick={() => onLayoutChange(option)}
            >
              <LayoutIcon {...option} />
            </IconButton>
          ))}

          <Divider />

          {LINK_BUTTONS.map(({ key, label, short }) => (
            <IconButton key={key} label={label} active={links[key]} onClick={() => onToggleLink(key)}>
              <span className="text-[10px] font-semibold tracking-wide">{short}</span>
            </IconButton>
          ))}
        </>
      )}

      <Divider />

      <IconButton label="Download PNG" disabled={noViewport} onClick={withViewport((id) => downloadPng(id, 'dicom-image.png'))}>
        ⤓
      </IconButton>
      <IconButton label="DICOM tags (T)" active={showTags} onClick={onToggleTags}>
        <span className="text-xs font-semibold">TAGS</span>
      </IconButton>

      <div className="ml-auto">
        <FilePickers onFiles={onFiles} compact />
      </div>
    </div>
  )
}
