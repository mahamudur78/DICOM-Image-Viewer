import { describe, expect, it } from 'vitest'
import { defaultLayoutFor } from './layouts'

describe('defaultLayoutFor', () => {
  it('fits the series count up to 2×2', () => {
    expect(defaultLayoutFor(0)).toEqual({ rows: 1, cols: 1 })
    expect(defaultLayoutFor(1)).toEqual({ rows: 1, cols: 1 })
    expect(defaultLayoutFor(2)).toEqual({ rows: 1, cols: 2 })
    expect(defaultLayoutFor(3)).toEqual({ rows: 2, cols: 2 })
    expect(defaultLayoutFor(12)).toEqual({ rows: 2, cols: 2 })
  })
})
