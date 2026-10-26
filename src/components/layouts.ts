export interface Layout {
  rows: number
  cols: number
}

export const LAYOUTS: Layout[] = [
  { rows: 1, cols: 1 },
  { rows: 1, cols: 2 },
  { rows: 2, cols: 1 },
  { rows: 2, cols: 2 },
]

/** Picks a starting layout that fits the number of series (up to 2×2). */
export function defaultLayoutFor(seriesCount: number): Layout {
  if (seriesCount <= 1) return LAYOUTS[0]
  if (seriesCount === 2) return LAYOUTS[1]
  return LAYOUTS[3]
}
