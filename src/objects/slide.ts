// Whole-slide microscopy: each instance of the series is a pyramid level of
// tiles (TILED_FULL in row order, or TILED_SPARSE with per-frame positions).
import { firstItem, items, number, numbers, text, type DataSet } from './dicom'
import { frameGroup } from './frames'

export interface SlideLevel {
  /** Size of the whole image at this level, in pixels. */
  width: number
  height: number
  tileWidth: number
  tileHeight: number
  /** mm per pixel (column, row). */
  spacing: [number, number]
  samples: number
  photometric: string
  transferSyntax: string
  /** Frame index of each tile, by "column,row" of tiles. */
  tiles: Map<string, number>
  imageType: string[]
}

export function parseSlideLevel(dataSet: DataSet): SlideLevel | null {
  const width = dataSet.uint32('x00480006') ?? 0
  const height = dataSet.uint32('x00480007') ?? 0
  const tileHeight = dataSet.uint16('x00280010') ?? 0
  const tileWidth = dataSet.uint16('x00280011') ?? 0
  if (!width || !height || !tileWidth || !tileHeight) return null
  const frames = Math.max(1, number(dataSet, 'x00280008') ?? 1)
  const spacing = numbers(frameGroup(dataSet, 0, 'x00289110') ?? dataSet, 'x00280030') ?? [0, 0]
  const across = Math.ceil(width / tileWidth)
  const tiles = new Map<string, number>()
  const sparse = text(dataSet, 'x00209311') === 'TILED_SPARSE' || (text(dataSet, 'x00209311') !== 'TILED_FULL' && !!items(dataSet, 'x52009230').length)
  for (let frame = 0; frame < frames; frame++) {
    if (sparse) {
      const position = firstItem(items(dataSet, 'x52009230')[frame], 'x0048021a')
      const column = position?.int32('x0048021e')
      const row = position?.int32('x0048021f')
      if (column === undefined || row === undefined) continue
      tiles.set(`${Math.floor((column - 1) / tileWidth)},${Math.floor((row - 1) / tileHeight)}`, frame)
    } else tiles.set(`${frame % across},${Math.floor(frame / across)}`, frame)
  }
  return {
    width,
    height,
    tileWidth,
    tileHeight,
    // Pixel Spacing is row spacing \ column spacing.
    spacing: [spacing[1] ?? 0, spacing[0] ?? 0],
    samples: dataSet.uint16('x00280002') ?? 1,
    photometric: text(dataSet, 'x00280004') ?? 'RGB',
    transferSyntax: text(dataSet, 'x00020010') ?? '1.2.840.10008.1.2.1',
    tiles,
    imageType: (text(dataSet, 'x00080008') ?? '').split('\\'),
  }
}

/** The level to draw at a zoom (screen pixels per level-0 pixel): the coarsest one still sharp. */
export function levelForZoom(levels: SlideLevel[], zoom: number) {
  const base = levels[0].width
  const sorted = [...levels].sort((a, b) => b.width - a.width)
  let chosen = sorted[0]
  for (const level of sorted) if ((level.width / base) >= zoom * 0.99) chosen = level
  return chosen
}

/** Levels of a slide, largest first; label and overview images are left out. */
export function pyramid(levels: SlideLevel[]) {
  return levels.filter((l) => !l.imageType.includes('LABEL') && !l.imageType.includes('OVERVIEW')).sort((a, b) => b.width - a.width)
}
