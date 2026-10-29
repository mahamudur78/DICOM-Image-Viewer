// Export, print, anonymize and conversion commands. The work is in
// src/export, loaded when a command first runs.
import { openExportDialog } from '../dialogs/dialogStore'
import { t } from '../i18n'
import { notify } from '../notifications/toastStore'
import { startRegionCapture } from '../export/regionCaptureStore'
import type { Command, CommandContext } from './commands'

const hasImage = (ctx: CommandContext) => ctx.viewportId !== null && ctx.kind !== 'pdf' && ctx.kind !== 'video' && ctx.kind !== 'sr'
const hasDicom = (ctx: CommandContext) => ctx.state.studies.length > 0

/** Copies the current image (as shown, with annotations) to the clipboard as PNG. */
export async function copyImageToClipboard(canvas?: HTMLCanvasElement | null) {
  try {
    const source = canvas ?? (await (await import('../export/exportImages')).currentImageCanvas(true))
    if (!source) return
    const blob = await new Promise<Blob>((resolve, reject) => source.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG'))), 'image/png'))
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    notify(t('export.copied'), 'success')
  } catch {
    notify(t('export.copyFailed'), 'error')
  }
}

async function runJob(job: () => Promise<number | undefined>, message: string) {
  try {
    const count = await job()
    if (count) notify(t(message, { count }), 'success')
  } catch (error) {
    notify(t('export.failed', { error: error instanceof Error ? error.message : String(error) }), 'error')
  }
}

const noProgress = () => {}

export const exportCommands: Command[] = [
  { id: 'export.images', group: 'export', label: 'export.imagesCommand', isEnabled: hasImage, run: () => openExportDialog('images') },
  { id: 'export.movie', group: 'export', label: 'export.movieCommand', isEnabled: (ctx) => hasImage(ctx) && ctx.kind === 'stack', run: () => openExportDialog('movie') },
  { id: 'export.print', group: 'export', label: 'print.command', isEnabled: hasImage, run: () => openExportDialog('print') },
  {
    id: 'export.copyImage',
    group: 'export',
    label: 'export.copyCommand',
    // Ctrl+C with text selected copies the text, as usual.
    isEnabled: (ctx) => hasImage(ctx) && !window.getSelection()?.toString(),
    run: () => void copyImageToClipboard(),
  },
  { id: 'export.captureRegion', group: 'export', label: 'export.regionCommand', isEnabled: hasImage, run: () => startRegionCapture() },
  ...(['series', 'study', 'all'] as const).map(
    (scope): Command => ({
      id: `export.originals.${scope}`,
      group: 'export',
      label: `export.originals.${scope}`,
      isEnabled: hasDicom,
      run: () => void runJob(async () => (await import('../export/jobs')).exportOriginals(scope, noProgress), 'export.savedFiles'),
    }),
  ),
  {
    id: 'export.decompress',
    group: 'export',
    label: 'export.decompressCommand',
    isEnabled: (ctx) => ctx.kind === 'stack',
    run: (ctx) => {
      const series = ctx.state.volumeView?.displaySet.series ?? ctx.state.cells[ctx.state.activeCell]?.series
      if (series) void runJob(async () => (await import('../export/convert')).decompressSeries(series, noProgress), 'export.savedFiles')
    },
  },
  { id: 'export.anonymize', group: 'export', label: 'anonymize.command', isEnabled: hasDicom, run: () => openExportDialog('anonymize') },
  { id: 'export.convert', group: 'export', label: 'convert.command', run: () => openExportDialog('convert') },
  { id: 'export.tagEdit', group: 'export', label: 'tagEdit.command', isEnabled: (ctx) => ctx.kind === 'stack', run: () => openExportDialog('tagEdit') },
]
