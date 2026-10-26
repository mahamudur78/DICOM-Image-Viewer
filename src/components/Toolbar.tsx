import type { PrimaryTool } from '../cornerstone/tools'
import {
  CT_PRESETS,
  downloadPng,
  flip,
  resetView,
  rotate90,
  setWindow,
  toggleInvert,
} from '../cornerstone/viewer'
import { FilePickers } from './FilePickers'
import { LAYOUTS, type Layout } from './layouts'
import { LINK_BUTTONS, TOOL_BUTTONS, type LinkSettings } from './toolButtons'

interface ToolbarProps {
  activeTool: PrimaryTool
  onToolChange: (tool: PrimaryTool) => void
  /** Viewport the view actions apply to, or null when the active cell is empty. */
  viewportId: string | null
  modality: string
  layout: Layout
  onLayoutChange: (layout: Layout) => void
  links: LinkSettings
  onToggleLink: (key: keyof LinkSettings) => void
  showTags: boolean
  onToggleTags: () => void
  onFiles: (files: File[]) => void
}

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

export function Toolbar({
  activeTool,
  onToolChange,
  viewportId,
  modality,
  layout,
  onLayoutChange,
  links,
  onToggleLink,
  showTags,
  onToggleTags,
  onFiles,
}: ToolbarProps) {
  const withViewport = (action: (id: string) => void) => () => {
    if (viewportId) action(viewportId)
  }
  const noViewport = viewportId === null

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 bg-slate-900 px-2 py-1.5">
      {TOOL_BUTTONS.map(({ tool, label, icon, key }) => (
        <IconButton key={tool} label={`${label} (${key})`} active={activeTool === tool} onClick={() => onToolChange(tool)}>
          {icon}
        </IconButton>
      ))}

      <div className="mx-1 h-6 w-px bg-slate-700" />

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
      <IconButton label="Reset (R)" disabled={noViewport} onClick={withViewport(resetView)}>
        ⟲
      </IconButton>

      {modality === 'CT' && viewportId && (
        <select
          aria-label="Window preset"
          defaultValue=""
          onChange={(event) => {
            const preset = CT_PRESETS[Number(event.target.value)]
            if (preset) setWindow(viewportId, preset.width, preset.center)
            event.target.value = ''
          }}
          className="ml-1 h-8 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200"
        >
          <option value="" disabled>
            W/L preset
          </option>
          {CT_PRESETS.map((preset, index) => (
            <option key={preset.label} value={index}>
              {preset.label} ({preset.width}/{preset.center})
            </option>
          ))}
        </select>
      )}

      <div className="mx-1 h-6 w-px bg-slate-700" />

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

      <div className="mx-1 h-6 w-px bg-slate-700" />

      {LINK_BUTTONS.map(({ key, label, short }) => (
        <IconButton key={key} label={label} active={links[key]} onClick={() => onToggleLink(key)}>
          <span className="text-[10px] font-semibold tracking-wide">{short}</span>
        </IconButton>
      ))}

      <div className="mx-1 h-6 w-px bg-slate-700" />

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
