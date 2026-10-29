import { describe, expect, it } from 'vitest'
import { gridFor, pageLayout, paginate, placeImage } from './layout'

describe('print layout', () => {
  it('arranges images per page', () => {
    expect(gridFor(6, 'portrait')).toEqual([2, 3])
    expect(gridFor(6, 'landscape')).toEqual([3, 2])
    expect(gridFor(12, 'portrait')).toEqual([3, 4])
    const page = pageLayout('A4', 'portrait', 4, true, true)
    expect([page.width, page.height]).toEqual([210, 297])
    expect(page.cells).toHaveLength(4)
    // Cells stay inside the margins, below the header and above the footer.
    for (const cell of page.cells) {
      expect(cell.x).toBeGreaterThanOrEqual(10)
      expect(cell.x + cell.w).toBeLessThanOrEqual(200.01)
      expect(cell.y).toBeGreaterThanOrEqual(24)
      expect(cell.y + cell.h).toBeLessThanOrEqual(279.01)
    }
    expect(pageLayout('Letter', 'landscape', 1, false, false).cells[0]).toMatchObject({ x: 10, y: 10 })
  })

  it('fits images, or uses their true size when it fits', () => {
    const cell = { x: 0, y: 0, w: 100, h: 50 }
    expect(placeImage(cell, 200, 200, null)).toMatchObject({ x: 25, y: 0, w: 50, h: 50, trueSize: false })
    expect(placeImage(cell, 200, 200, [40, 40])).toMatchObject({ x: 30, y: 5, w: 40, h: 40, trueSize: true })
    // Too large for the cell: fitted instead.
    expect(placeImage(cell, 200, 200, [120, 120]).trueSize).toBe(false)
  })

  it('paginates', () => {
    expect(paginate([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(paginate([], 4)).toEqual([])
  })
})
