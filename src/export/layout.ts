// Page layout for printing and PDF: images in a grid with an optional header
// and footer, in millimetres from the top-left of the page.

export type Paper = 'A4' | 'Letter'
export type Orientation = 'portrait' | 'landscape'

export const PAPER_MM: Record<Paper, [number, number]> = { A4: [210, 297], Letter: [215.9, 279.4] }

export const PER_PAGE = [1, 2, 4, 6, 9, 12] as const
export type PerPage = (typeof PER_PAGE)[number]

const MARGIN = 10
const HEADER = 14
const FOOTER = 8
const GAP = 3

/** Columns × rows for a number of images per page (portrait; landscape swaps them). */
export function gridFor(perPage: PerPage, orientation: Orientation): [number, number] {
  const portrait: Record<PerPage, [number, number]> = { 1: [1, 1], 2: [1, 2], 4: [2, 2], 6: [2, 3], 9: [3, 3], 12: [3, 4] }
  const [cols, rows] = portrait[perPage]
  return orientation === 'portrait' ? [cols, rows] : [rows, cols]
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface PageLayout {
  width: number
  height: number
  header: Box | null
  footer: Box | null
  cells: Box[]
}

export function pageLayout(paper: Paper, orientation: Orientation, perPage: PerPage, header: boolean, footer: boolean): PageLayout {
  const [short, long] = PAPER_MM[paper]
  const [width, height] = orientation === 'portrait' ? [short, long] : [long, short]
  const top = MARGIN + (header ? HEADER : 0)
  const bottom = height - MARGIN - (footer ? FOOTER : 0)
  const [cols, rows] = gridFor(perPage, orientation)
  const cellW = (width - 2 * MARGIN - (cols - 1) * GAP) / cols
  const cellH = (bottom - top - (rows - 1) * GAP) / rows
  const cells = Array.from({ length: cols * rows }, (_, i) => ({
    x: MARGIN + (i % cols) * (cellW + GAP),
    y: top + Math.floor(i / cols) * (cellH + GAP),
    w: cellW,
    h: cellH,
  }))
  return {
    width,
    height,
    header: header ? { x: MARGIN, y: MARGIN, w: width - 2 * MARGIN, h: HEADER - 2 } : null,
    footer: footer ? { x: MARGIN, y: height - MARGIN - FOOTER + 2, w: width - 2 * MARGIN, h: FOOTER - 2 } : null,
    cells,
  }
}

/**
 * Where an image of a pixel size goes in a cell: fitted and centred, or, with
 * a physical size (mm) that fits, at that true size. Returns whether true size was used.
 */
export function placeImage(cell: Box, pixelWidth: number, pixelHeight: number, physical: [number, number] | null): Box & { trueSize: boolean } {
  if (physical && physical[0] <= cell.w + 0.01 && physical[1] <= cell.h + 0.01) {
    const [w, h] = physical
    return { x: cell.x + (cell.w - w) / 2, y: cell.y + (cell.h - h) / 2, w, h, trueSize: true }
  }
  const scale = Math.min(cell.w / pixelWidth, cell.h / pixelHeight)
  const w = pixelWidth * scale
  const h = pixelHeight * scale
  return { x: cell.x + (cell.w - w) / 2, y: cell.y + (cell.h - h) / 2, w, h, trueSize: false }
}

/** Splits items into pages of a fixed size. */
export const paginate = <T>(items: T[], perPage: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / perPage) }, (_, i) => items.slice(i * perPage, (i + 1) * perPage))
