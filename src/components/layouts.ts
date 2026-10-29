export interface Layout {
  rows: number
  cols: number
}

/** Largest grid (rows and columns). */
export const MAX_LAYOUT_SIZE = 4

/** Layouts with their own toolbar button. */
export const LAYOUTS: Layout[] = [
  { rows: 1, cols: 1 },
  { rows: 1, cols: 2 },
  { rows: 2, cols: 1 },
  { rows: 2, cols: 2 },
]

/** More common layouts, offered in the layout picker next to a free rows × columns grid. */
export const MORE_LAYOUTS: Layout[] = [
  { rows: 1, cols: 3 },
  { rows: 3, cols: 1 },
  { rows: 2, cols: 3 },
  { rows: 3, cols: 2 },
  { rows: 3, cols: 3 },
  { rows: 4, cols: 4 },
]

/** Picks a starting layout that fits the number of series (up to 2×2). */
export function defaultLayoutFor(seriesCount: number): Layout {
  if (seriesCount <= 1) return LAYOUTS[0]
  if (seriesCount === 2) return LAYOUTS[1]
  return LAYOUTS[3]
}

export const clampLayout = ({ rows, cols }: Layout): Layout => ({
  rows: Math.min(MAX_LAYOUT_SIZE, Math.max(1, Math.round(rows))),
  cols: Math.min(MAX_LAYOUT_SIZE, Math.max(1, Math.round(cols))),
})
