import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { copyImageToClipboard } from '../commands/exportCommands'
import { notify } from '../notifications/toastStore'
import { selectTargetViewportId, useViewer } from '../store/viewerStore'
import { downloadBlob, stamp } from './files'
import { stopRegionCapture, useRegionCapture } from './regionCaptureStore'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Over the active viewport while capturing: drag a rectangle; that part of
 * the image (as shown) is copied to the clipboard, and can be saved as PNG.
 */
export function RegionCapture() {
  const { t } = useTranslation()
  const active = useRegionCapture((s) => s.active)
  const viewportId = useViewer(selectTargetViewportId)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)

  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      stopRegionCapture()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [active])

  if (!active || !viewportId) return null
  const target = document.querySelector<HTMLElement>(`[data-viewport-id="${viewportId}"]`)
  if (!target) return null
  const box = target.getBoundingClientRect()

  const finish = async (area: Rect) => {
    stopRegionCapture()
    setStart(null)
    setRect(null)
    if (area.w < 4 || area.h < 4) return
    const { currentImageCanvas } = await import('./exportImages')
    const full = await currentImageCanvas(true)
    if (!full) return
    const ratio = full.width / box.width
    const crop = document.createElement('canvas')
    crop.width = Math.round(area.w * ratio)
    crop.height = Math.round(area.h * ratio)
    crop.getContext('2d')!.drawImage(full, area.x * ratio, area.y * ratio, crop.width, crop.height, 0, 0, crop.width, crop.height)
    await copyImageToClipboard(crop)
    notify(t('export.regionCaptured'), 'info', {
      label: t('export.savePng'),
      run: () => crop.toBlob((blob) => blob && downloadBlob(blob, `capture-${stamp()}.png`), 'image/png'),
    })
  }

  return (
    <div
      role="application"
      aria-label={t('export.regionHint')}
      className="fixed z-40 cursor-crosshair bg-sky-500/5 outline-2 outline-dashed outline-sky-400"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        setStart({ x: event.clientX - box.left, y: event.clientY - box.top })
        setRect(null)
      }}
      onPointerMove={(event) => {
        if (!start) return
        const x = event.clientX - box.left
        const y = event.clientY - box.top
        setRect({ x: Math.min(x, start.x), y: Math.min(y, start.y), w: Math.abs(x - start.x), h: Math.abs(y - start.y) })
      }}
      onPointerUp={() => rect && void finish(rect)}
    >
      <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded bg-slate-900/80 px-2 py-1 text-xs text-slate-100">{t('export.regionHint')}</div>
      {rect && <div className="pointer-events-none absolute border border-sky-300 bg-sky-300/10" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />}
    </div>
  )
}
