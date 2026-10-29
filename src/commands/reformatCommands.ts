// MPR reformat commands (planes, new series, curved reformat) and the 3D panel.
import { clearCprPath, resetPlanes, startCprPath, stopCprPath, undoCprPoint, useCpr } from '../cornerstone/mprTools'
import { askForm, openCprDialog } from '../dialogs/dialogStore'
import { t } from '../i18n'
import { notify } from '../notifications/toastStore'
import { togglePanel } from '../store/viewerStore'
import type { Command, CommandContext } from './commands'

const isMpr = (ctx: CommandContext) => ctx.mode === 'mpr'
const has3d = (ctx: CommandContext) => ctx.mode === '3d' || (ctx.mode === 'mpr' && ctx.state.mprWith3d)
const pathLength = () => useCpr.getState().points.length

export const reformatCommands: Command[] = [
  { id: 'mpr.resetPlanes', group: 'reformat', label: 'reformat.resetPlanes', isAvailable: isMpr, run: () => resetPlanes() },
  {
    id: 'mpr.newSeries',
    group: 'reformat',
    label: 'reformat.newSeries',
    isAvailable: isMpr,
    run: async () => {
      const values = await askForm('reformat.newSeriesTitle', [{ name: 'spacing', label: 'reformat.spacing', type: 'number', value: '2', min: 0.1, max: 50 }], 'dialogs.apply')
      if (!values) return
      const { createMprSeries } = await import('../volume/actions')
      const count = await createMprSeries(Number(values.spacing), () => {})
      if (count) notify(t('reformat.created', { count }), 'success')
    },
  },
  {
    id: 'mpr.cprStart',
    group: 'reformat',
    label: 'reformat.cprStart',
    isAvailable: isMpr,
    isActive: () => useCpr.getState().drawing,
    run: () => {
      if (useCpr.getState().drawing) return stopCprPath()
      startCprPath()
      notify(t('reformat.cprHint'), 'info')
    },
  },
  { id: 'mpr.cprUndo', group: 'reformat', label: 'reformat.cprUndo', isAvailable: isMpr, isEnabled: () => pathLength() > 0, run: () => undoCprPoint() },
  {
    id: 'mpr.cprMake',
    group: 'reformat',
    label: 'reformat.cprMake',
    isAvailable: isMpr,
    isEnabled: () => pathLength() >= 2,
    run: () => {
      stopCprPath()
      openCprDialog()
    },
  },
  { id: 'mpr.cprClear', group: 'reformat', label: 'reformat.cprClear', isAvailable: isMpr, isEnabled: () => pathLength() > 0, run: () => clearCprPath() },
  {
    id: 'panel.volume3d',
    group: 'panel',
    label: 'commands.volume3dPanel',
    icon: '3D ⚙',
    isAvailable: has3d,
    isActive: (ctx) => ctx.state.panel === 'volume3d',
    run: () => togglePanel('volume3d'),
  },
]

