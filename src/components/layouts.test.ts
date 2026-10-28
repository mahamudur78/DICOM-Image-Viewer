import { describe, expect, it } from 'vitest'
import { clampLayout, defaultLayoutFor } from './layouts'

describe('defaultLayoutFor', () => {
  it('fits the series count up to 2×2', () => {
    expect(defaultLayoutFor(0)).toEqual({ rows: 1, cols: 1 })
    expect(defaultLayoutFor(1)).toEqual({ rows: 1, cols: 1 })
    expect(defaultLayoutFor(2)).toEqual({ rows: 1, cols: 2 })
    expect(defaultLayoutFor(3)).toEqual({ rows: 2, cols: 2 })
    expect(defaultLayoutFor(12)).toEqual({ rows: 2, cols: 2 })
  })
})

describe('clampLayout', () => {
  it('keeps layouts between 1×1 and 4×4', () => {
    expect(clampLayout({ rows: 0, cols: 9 })).toEqual({ rows: 1, cols: 4 })
    expect(clampLayout({ rows: 2.6, cols: 3 })).toEqual({ rows: 3, cols: 3 })
  })
})
