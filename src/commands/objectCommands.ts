// Key images, and saving measurements, key images and the view as DICOM objects.
import { getViewport } from '../cornerstone/viewer'
import { KEY_SUFFIX, toggleKeyFilter, toggleKeyImage } from '../objects/keyImages'
import { t } from '../i18n'
import { notify } from '../notifications/toastStore'
import { openArchive } from '../dialogs/dialogStore'
import type { Command, CommandContext } from './commands'

const stackCell = (ctx: CommandContext) => ctx.mode === 'grid' && ctx.kind === 'stack'
const shownSeries = (ctx: CommandContext) => ctx.state.cells[ctx.state.activeCell]?.series

/** The image shown in the active cell. */
function currentImage(ctx: CommandContext) {
  const series = shownSeries(ctx)
  const imageId = ctx.viewportId ? getViewport(ctx.viewportId)?.getCurrentImageId() : undefined
  return series?.images.find((image) => image.imageId === imageId)
}

export const objectCommands: Command[] = [
  {
    id: 'archive.save',
    group: 'objects',
    label: 'archive.saveCurrent',
    run: () => void import('../archive/save').then((m) => m.saveCurrentStudy()),
  },
  { id: 'archive.open', group: 'objects', label: 'archive.openArchive', run: () => openArchive() },
  {
    id: 'objects.keyImage',
    group: 'objects',
    label: 'objects.markKey',
    isAvailable: stackCell,
    run: (ctx) => {
      const image = currentImage(ctx)
      if (image) toggleKeyImage(image)
    },
  },
  {
    id: 'objects.keyOnly',
    group: 'objects',
    label: 'objects.keyOnly',
    isAvailable: (ctx) => ctx.mode === 'grid',
    isActive: (ctx) => !!shownSeries(ctx)?.id.endsWith(KEY_SUFFIX),
    run: (ctx) => {
      if (!toggleKeyFilter(ctx.state.activeCell)) notify(t('objects.noKeyImages'), 'info')
    },
  },
  {
    id: 'objects.saveKeyObjects',
    group: 'objects',
    label: 'objects.saveKo',
    run: () => void import('../objects/reports').then((m) => m.saveKeyObjects()),
  },
  {
    id: 'objects.saveSr',
    group: 'objects',
    label: 'objects.saveSr',
    run: () => void import('../objects/reports').then((m) => m.saveMeasurementSr()),
  },
  {
    id: 'objects.savePresentation',
    group: 'objects',
    label: 'objects.savePr',
    isAvailable: stackCell,
    run: () => void import('../objects/reports').then((m) => m.savePresentationState()),
  },
]
