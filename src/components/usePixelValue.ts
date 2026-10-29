import type { Types } from '@cornerstonejs/core'
import { worldToImage } from '../cornerstone/imageCoords'
import { getScaling } from '../dicom/imagePlaneMetadata'
import { useEffect, useState } from 'react'
import { getViewport } from '../cornerstone/viewer'

export interface PixelReading {
  x: number
  y: number
  /** One value for grayscale images, three (RGB) for colour. */
  values: number[]
  /** PET in SUVbw: the same value in SUVlbm and SUVbsa, when the header allows them. */
  suv?: { lbm?: number; bsa?: number }
}

/**
 * Value of the image pixel under the mouse, in display units (rescaled HU,
 * SUV for scaled PET, raw otherwise). Null when the mouse is off the image.
 */
export function readPixel(viewportId: string, canvasPoint: [number, number]): PixelReading | null {
  const viewport = getViewport(viewportId)
  const image = viewport?.getCornerstoneImage?.()
  const imageId = viewport?.getCurrentImageId()
  if (!viewport || !image || !imageId) return null
  const coords = worldToImage(viewportId, viewport.canvasToWorld(canvasPoint as Types.Point2))
  if (!coords) return null
  const [column, row] = coords.map((v) => Math.round(v))
  if (column < 0 || row < 0 || column >= image.columns || row >= image.rows) return null
  const pixels = image.getPixelData()
  const components = Math.round(pixels.length / (image.columns * image.rows))
  const index = (row * image.columns + column) * components
  if (components >= 3) return { x: column, y: row, values: [pixels[index], pixels[index + 1], pixels[index + 2]] }
  const scaled = (image as { preScale?: { scaled?: boolean } }).preScale?.scaled
  const value = scaled ? pixels[index] : pixels[index] * (image.slope ?? 1) + (image.intercept ?? 0)
  const factors = scaled ? getScaling(imageId) : undefined
  const suv = factors && {
    lbm: factors.suvlbm ? (value * factors.suvlbm) / factors.suvbw : undefined,
    bsa: factors.suvbsa ? (value * factors.suvbsa) / factors.suvbw : undefined,
  }
  return { x: column, y: row, values: [value], suv }
}

/** Tracks the pixel under the mouse over a viewport element (updated once per frame). */
export function usePixelValue(viewportId: string, element: HTMLDivElement | null, enabled: boolean) {
  const [reading, setReading] = useState<PixelReading | null>(null)

  useEffect(() => {
    if (!element || !enabled) return
    let frame = 0
    let point: [number, number] | null = null
    const onMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      point = [event.clientX - rect.left, event.clientY - rect.top]
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          setReading(point ? readPixel(viewportId, point) : null)
        })
      }
    }
    const onLeave = () => {
      point = null
      setReading(null)
    }
    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(frame)
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerleave', onLeave)
      setReading(null)
    }
  }, [viewportId, element, enabled])

  return enabled ? reading : null
}

const format = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2))

/** "(12, 40) −35 HU" style text; PET adds SUVlbm and SUVbsa when known. */
export function formatPixelValue(reading: PixelReading, unit: string) {
  if (reading.values.length === 3) return `(${reading.x}, ${reading.y}) RGB ${reading.values.map((v) => Math.round(v)).join(', ')}`
  const extra = [
    reading.suv?.lbm !== undefined ? `${format(reading.suv.lbm)} SUVlbm` : '',
    reading.suv?.bsa !== undefined ? `${format(reading.suv.bsa)} SUVbsa` : '',
  ].filter(Boolean)
  const main = `${format(reading.values[0])}${unit ? ` ${unit}` : ''}`
  return `(${reading.x}, ${reading.y}) ${[main, ...extra].join(' · ')}`
}
