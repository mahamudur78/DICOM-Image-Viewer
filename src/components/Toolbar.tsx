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
import { TOOL_BUTTONS } from './toolButtons'

interface ToolbarProps {
  activeTool: PrimaryTool
  onToolChange: (tool: PrimaryTool) => void
  modality: string
  showTags: boolean
  onToggleTags: () => void
  onFiles: (files: File[]) => void
}

function IconButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`grid h-9 min-w-9 place-items-center rounded-md px-2 text-base transition ${
        active ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

export function Toolbar({ activeTool, onToolChange, modality, showTags, onToggleTags, onFiles }: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 bg-slate-900 px-2 py-1.5">
      {TOOL_BUTTONS.map(({ tool, label, icon, key }) => (
        <IconButton key={tool} label={`${label} (${key})`} active={activeTool === tool} onClick={() => onToolChange(tool)}>
          {icon}
        </IconButton>
      ))}

      <div className="mx-1 h-6 w-px bg-slate-700" />

      <IconButton label="Invert (I)" onClick={toggleInvert}>
        ◑
      </IconButton>
      <IconButton label="Rotate 90°" onClick={rotate90}>
        ↻
      </IconButton>
      <IconButton label="Flip horizontal" onClick={() => flip('horizontal')}>
        ⇋
      </IconButton>
      <IconButton label="Flip vertical" onClick={() => flip('vertical')}>
        ⇵
      </IconButton>
      <IconButton label="Reset (R)" onClick={resetView}>
        ⟲
      </IconButton>

      {modality === 'CT' && (
        <select
          aria-label="Window preset"
          defaultValue=""
          onChange={(event) => {
            const preset = CT_PRESETS[Number(event.target.value)]
            if (preset) setWindow(preset.width, preset.center)
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

      <IconButton label="Download PNG" onClick={() => downloadPng('dicom-image.png')}>
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
