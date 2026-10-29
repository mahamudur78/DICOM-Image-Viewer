// Fusion, PET/CT, time-intensity curves and DSA.
import { closePetCt, openPetCt, petCtPair } from '../functional/petct'
import { phasesOf } from '../functional/series'
import { selectCurrentDisplaySet, togglePanel } from '../store/viewerStore'
import type { Command, CommandContext } from './commands'

const current = (ctx: CommandContext) => selectCurrentDisplaySet(ctx.state) ?? null
const pairOf = (ctx: CommandContext) => petCtPair(ctx.state.studies, current(ctx))
const isGrid = (ctx: CommandContext) => ctx.mode === 'grid'

const panel = (id: 'fusion' | 'tic' | 'dsa', label: string, isAvailable?: (ctx: CommandContext) => boolean): Command => ({
  id: `panel.${id}`,
  group: 'functional',
  label,
  isAvailable,
  isActive: (ctx) => ctx.state.panel === id,
  run: () => togglePanel(id),
})

export const functionalCommands: Command[] = [
  panel('fusion', 'commands.fusionPanel', (ctx) => ctx.mode !== '3d' || ctx.state.panel === 'fusion'),
  {
    id: 'functional.petct',
    group: 'functional',
    label: 'commands.petCtLayout',
    isEnabled: (ctx) => pairOf(ctx) !== null,
    isActive: (ctx) => ctx.state.volumeView?.petct !== undefined,
    run: (ctx) => {
      if (ctx.state.volumeView?.petct) return closePetCt()
      const pair = pairOf(ctx)
      if (pair) openPetCt(pair.ct, pair.pet)
    },
  },
  panel('tic', 'commands.ticPanel', isGrid),
  panel('dsa', 'commands.dsaPanel', isGrid),
  {
    id: 'functional.mpr4d',
    group: 'functional',
    label: 'commands.open4d',
    isEnabled: (ctx) => phasesOf(current(ctx)?.series) !== null,
    run: (ctx) => void import('../store/viewerActions').then((m) => m.openVolumeView('mpr', current(ctx))),
  },
]
