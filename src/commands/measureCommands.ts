// Commands that manage measurements (the tools themselves are tool commands).
import { state as toolsState } from '@cornerstonejs/tools'
import { getViewport } from '../cornerstone/viewer'
import { askForm } from '../dialogs/dialogStore'
import { t } from '../i18n'
import {
  allMeasurements,
  canRedo,
  canUndo,
  clearCalibration,
  copyMeasurements,
  deleteMeasurements,
  downloadText,
  hasCopiedMeasurements,
  isHidden,
  loadMeasurementsFile,
  measurementRows,
  measurementsCsv,
  measurementsFile,
  measurementsInSeries,
  measurementsOnImage,
  pasteMeasurements,
  redo,
  selectedMeasurements,
  setHidden,
  undo,
} from '../measurements/manage'
import { hasUserCalibration } from '../measurements/measure'
import { peekSpineLabel, setNextSpineLabel } from '../measurements/spine'
import { notify } from '../notifications/toastStore'
import { useSettings } from '../store/settingsStore'
import { selectCurrentDisplaySet, togglePanel } from '../store/viewerStore'
import type { Command, CommandContext } from './commands'

const currentImageId = (ctx: CommandContext) => (ctx.viewportId ? getViewport(ctx.viewportId)?.getCurrentImageId?.() : undefined)
const onImage = (ctx: CommandContext) => measurementsOnImage(currentImageId(ctx))
const inSeries = (ctx: CommandContext) => measurementsInSeries(selectCurrentDisplaySet(ctx.state)?.series)
/** Selected measurements, or all on the current image when none is selected. */
const targets = (ctx: CommandContext) => {
  const selected = selectedMeasurements()
  return selected.length ? selected : onImage(ctx)
}
const hasMeasurements = () => allMeasurements().length > 0
const isImageMode = (ctx: CommandContext) => ctx.mode !== '3d'

/** Lets the user pick a file; resolves to null when cancelled. */
function pickFile(accept: string) {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null))
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')

const segmenting = (ctx: CommandContext) => ctx.state.activeTool === 'segment'

export const measureCommands: Command[] = [
  {
    id: 'measure.deleteSelected',
    group: 'measure',
    label: 'measure.deleteSelected',
    isAvailable: isImageMode,
    // While a contour is being drawn, Delete removes its last point instead.
    isEnabled: () => !toolsState.isInteractingWithTool && selectedMeasurements().length > 0,
    run: () => deleteMeasurements(selectedMeasurements()),
  },
  {
    id: 'measure.deleteImage',
    group: 'measure',
    label: 'measure.deleteImage',
    isAvailable: isImageMode,
    isEnabled: (ctx) => onImage(ctx).length > 0,
    run: (ctx) => deleteMeasurements(onImage(ctx)),
  },
  {
    id: 'measure.deleteSeries',
    group: 'measure',
    label: 'measure.deleteSeries',
    isAvailable: isImageMode,
    isEnabled: (ctx) => inSeries(ctx).length > 0,
    run: (ctx) => deleteMeasurements(inSeries(ctx)),
  },
  {
    id: 'measure.deleteAll',
    group: 'measure',
    label: 'measure.deleteAll',
    isAvailable: isImageMode,
    isEnabled: hasMeasurements,
    run: () => deleteMeasurements(allMeasurements()),
  },
  // With the segment tool selected, Ctrl+Z and Ctrl+Shift+Z undo and redo segmentation edits.
  {
    id: 'measure.undo',
    group: 'measure',
    label: 'measure.undo',
    icon: '↶',
    isAvailable: isImageMode,
    isEnabled: (ctx) => segmenting(ctx) || canUndo(),
    run: (ctx) => (segmenting(ctx) ? void import('../segmentation/session').then((m) => m.undo()) : undo()),
  },
  {
    id: 'measure.redo',
    group: 'measure',
    label: 'measure.redo',
    icon: '↷',
    isAvailable: isImageMode,
    isEnabled: (ctx) => segmenting(ctx) || canRedo(),
    run: (ctx) => (segmenting(ctx) ? void import('../segmentation/session').then((m) => m.redo()) : redo()),
  },
  {
    id: 'measure.copy',
    group: 'measure',
    label: 'measure.copy',
    isAvailable: isImageMode,
    isEnabled: (ctx) => targets(ctx).length > 0,
    run: (ctx) => copyMeasurements(targets(ctx)),
  },
  {
    id: 'measure.paste',
    group: 'measure',
    label: 'measure.paste',
    isAvailable: isImageMode,
    isEnabled: (ctx) => ctx.viewportId !== null && hasCopiedMeasurements(),
    run: (ctx) => pasteMeasurements(ctx.viewportId!),
  },
  {
    id: 'measure.toggleHidden',
    group: 'measure',
    label: 'measure.hideAll',
    isAvailable: isImageMode,
    isEnabled: hasMeasurements,
    run: () => {
      const all = allMeasurements()
      setHidden(all, !all.every(isHidden))
    },
  },
  ...(['mm', 'cm'] as const).map(
    (unit): Command => ({
      id: `measure.unit${unit === 'mm' ? 'Mm' : 'Cm'}`,
      group: 'measure',
      label: `measure.unit${unit === 'mm' ? 'Mm' : 'Cm'}`,
      isActive: () => useSettings.getState().measureUnit === unit,
      run: () => useSettings.getState().setMeasureUnit(unit),
    }),
  ),
  {
    id: 'measure.spineStart',
    group: 'measure',
    label: 'measure.spineStart',
    isAvailable: isImageMode,
    run: async () => {
      const values = await askForm('measure.spineStart', [{ name: 'label', label: 'measure.spineStartField', type: 'text', value: peekSpineLabel(), required: true }], 'dialogs.apply')
      if (values && !setNextSpineLabel(values.label)) notify(t('measure.spineUnknown', { label: values.label }), 'error')
    },
  },
  {
    id: 'measure.clearCalibration',
    group: 'measure',
    label: 'measure.clearCalibration',
    isAvailable: (ctx) => ctx.mode === 'grid',
    isEnabled: (ctx) => {
      const imageId = currentImageId(ctx)
      return imageId !== undefined && hasUserCalibration(imageId)
    },
    run: (ctx) => clearCalibration(currentImageId(ctx)),
  },
  {
    id: 'measure.copyValues',
    group: 'measure',
    label: 'measure.copyValues',
    isEnabled: hasMeasurements,
    run: async () => {
      try {
        await navigator.clipboard.writeText(measurementsCsv(measurementRows()).replace(/,/g, '\t'))
        notify(t('measure.valuesCopied'), 'success')
      } catch {
        notify(t('measure.clipboardFailed'), 'error')
      }
    },
  },
  {
    id: 'measure.exportCsv',
    group: 'measure',
    label: 'measure.exportCsv',
    isEnabled: hasMeasurements,
    run: () => downloadText(measurementsCsv(), `measurements-${stamp()}.csv`, 'text/csv'),
  },
  {
    id: 'measure.saveJson',
    group: 'measure',
    label: 'measure.saveJson',
    isEnabled: hasMeasurements,
    run: () => {
      const { text, count } = measurementsFile()
      if (count === 0) return notify(t('measure.nothingToSave'), 'info')
      downloadText(text, `measurements-${stamp()}.json`, 'application/json')
    },
  },
  {
    id: 'measure.loadJson',
    group: 'measure',
    label: 'measure.loadJson',
    isAvailable: isImageMode,
    run: async () => {
      const file = await pickFile('.json,application/json')
      if (!file) return
      try {
        const { placed, skipped } = loadMeasurementsFile(await file.text())
        notify(t('measure.loaded', { count: placed }) + (skipped ? ` ${t('measure.loadSkipped', { count: skipped })}` : ''), placed ? 'success' : 'info')
      } catch {
        notify(t('measure.loadFailed', { name: file.name }), 'error')
      }
    },
  },
  {
    id: 'panel.measurements',
    group: 'panel',
    label: 'commands.measurements',
    icon: 'MEAS',
    isActive: (ctx) => ctx.state.panel === 'measurements',
    run: () => togglePanel('measurements'),
  },
]
