import { describe, expect, it } from 'vitest'
import { digitsOf, formatNumber, formatStudyDate, localizeDigits } from './format'

describe('locale formatting', () => {
  it('uses Bengali digits, and Latin ones for English and Hindi', () => {
    expect(digitsOf('en')).toBeNull()
    expect(localizeDigits('W: 400 L: 40', 'bn')).toBe('W: ৪০০ L: ৪০')
    expect(localizeDigits('12', 'hi')).toBe('12')
  })
  it('formats study dates and numbers', () => {
    expect(formatStudyDate('2026-03-01', 'en')).toBe('Mar 1, 2026')
    expect(formatStudyDate('2026-03-01', 'bn')).toContain('২০২৬')
    expect(formatStudyDate('unknown', 'en')).toBe('unknown')
    expect(formatNumber(1234.567, 1, 'en')).toBe('1,234.6')
  })
})
