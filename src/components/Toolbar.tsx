import { useTranslation } from 'react-i18next'
import {
  COMMANDS,
  getCommand,
  isAvailable,
  isEnabled,
  type Command,
  type CommandContext,
  type CommandGroup,
} from '../commands/commands'
import { useCommandContext } from '../commands/useCommands'
import type { SlabMode } from '../cornerstone/mpr'
import { setWindow } from '../cornerstone/viewer'
import { groupedPresets } from '../cornerstone/volume3d'
import { CT_PRESETS, findPresetIndex } from '../dicom/windowPresets'
import { openFiles } from '../store/viewerActions'
import { selectCurrentDisplaySet, setPreset, setSlab, useViewer } from '../store/viewerStore'
import { FilePickers } from './FilePickers'
import { LayoutIcon } from './LayoutIcon'
import { useViewportVoi } from './useViewportVoi'

const SLAB_THICKNESSES = [0, 5, 10, 20, 40]
const SLAB_MODES: { mode: SlabMode; label: string }[] = [
  { mode: 'mip', label: 'toolbar.slabMip' },
  { mode: 'minip', label: 'toolbar.slabMinip' },
  { mode: 'avg', label: 'toolbar.slabAvg' },
]

const SELECT_CLASS = 'h-8 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 disabled:opacity-40'

/** Groups whose icon is a short text label rather than a symbol. */
const TEXT_ICON_GROUPS: CommandGroup[] = ['mode', 'link', 'panel']

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

/** Buttons for a command group. Keyboard-only commands (no icon) are skipped. */
function Group({ group, ctx, exclude = [] }: { group: CommandGroup; ctx: CommandContext; exclude?: string[] }) {
  return COMMANDS.filter(
    (command) =>
      command.group === group &&
      (command.icon !== undefined || group === 'layout') &&
      !exclude.includes(command.id) &&
      isAvailable(command, ctx),
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
 * Shows the preset matching the viewport's current window, or the window
 * itself once it has been changed some other way (e.g. by dragging).
 */
function WindowPresetSelect({ viewportId }: { viewportId: string }) {
  const { t } = useTranslation()
  const voi = useViewportVoi(viewportId)
  const matching = voi ? findPresetIndex(CT_PRESETS, voi) : -1

  return (
    <select
      aria-label={t('toolbar.windowPreset')}
      value={matching >= 0 ? String(matching) : ''}
      onChange={(event) => {
        const windowPreset = CT_PRESETS[Number(event.target.value)]
        if (windowPreset) setWindow(viewportId, windowPreset.width, windowPreset.center)
      }}
      className={`ml-1 ${SELECT_CLASS}`}
    >
      <option value="" disabled>
        {voi && matching < 0
          ? t('toolbar.currentWindow', { width: voi.width, center: voi.center })
          : t('toolbar.windowPresetPlaceholder')}
      </option>
      {CT_PRESETS.map((p, index) => (
        <option key={p.label} value={index}>
          {t(p.label)} ({p.width}/{p.center})
        </option>
      ))}
    </select>
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
  const ctx = useCommandContext()
  const { mode, viewportId, kind } = ctx
  const modality = useViewer((s) => selectCurrentDisplaySet(s)?.series.modality ?? '')
  const show3dControls = mode === '3d' || (mode === 'mpr' && ctx.state.mprWith3d)

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 bg-slate-900 px-2 py-1.5">
      <Group group="tool" ctx={ctx} />
      <Divider />
      <Group group="view" ctx={ctx} exclude={['view.downloadPng']} />

      {modality === 'CT' && viewportId && kind !== 'volume3d' && <WindowPresetSelect viewportId={viewportId} />}

      <Divider />
      <Group group="mode" ctx={ctx} />
      {mode === 'mpr' && <SlabControls />}
      {show3dControls && <PresetSelect modality={modality} />}

      {mode === 'grid' && (
        <>
          <Group group="layout" ctx={ctx} />
          <Divider />
          <Group group="link" ctx={ctx} />
        </>
      )}

      <Divider />
      <CommandButton command={getCommand('view.downloadPng')} ctx={ctx} />
      <Group group="panel" ctx={ctx} />

      <div className="ml-auto">
        <FilePickers onFiles={openFiles} compact />
      </div>
    </div>
  )
}
