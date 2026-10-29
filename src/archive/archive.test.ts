import { describe, expect, it } from 'vitest'
import { filterStudies, fitsLimit, parseKeywords, studiesCsv, type ArchivedStudy } from './archive'

const study = (id: string, change: Partial<ArchivedStudy> = {}): ArchivedStudy => ({
  id,
  patientName: 'Doe John',
  patientId: 'P1',
  studyDate: '2026-01-01',
  description: 'CT chest',
  modalities: ['CT'],
  series: 2,
  files: 40,
  bytes: 10 * 1024 * 1024,
  keywords: [],
  status: 'unread',
  savedAt: 1,
  ...change,
})

describe('local archive records', () => {
  it('searches by every word and filters by status, newest first', () => {
    const list = [study('a'), study('b', { patientName: 'Roe Jane', studyDate: '2026-02-01', modalities: ['MR'], keywords: ['teaching'], status: 'urgent' })]
    expect(filterStudies(list, 'jane mr').map((s) => s.id)).toEqual(['b'])
    expect(filterStudies(list, 'teaching').map((s) => s.id)).toEqual(['b'])
    expect(filterStudies(list, '', 'unread').map((s) => s.id)).toEqual(['a'])
    expect(filterStudies(list, '').map((s) => s.id)).toEqual(['b', 'a'])
  })
  it('parses keywords and writes CSV', () => {
    expect(parseKeywords(' lung , follow-up,lung,, ')).toEqual(['lung', 'follow-up'])
    const csv = studiesCsv([study('a', { description: 'A, "B"', keywords: ['x', 'y'] })])
    expect(csv.split('\r\n')[1]).toContain('"A, ""B"""')
    expect(csv).toContain('x; y')
  })
  it('checks the size limit, counting a re-saved study once', () => {
    const stored = [study('a'), study('b')]
    expect(fitsLimit(stored, 'c', 5 * 1024 * 1024, 25)).toBe(true)
    expect(fitsLimit(stored, 'c', 6 * 1024 * 1024, 25)).toBe(false)
    expect(fitsLimit(stored, 'a', 15 * 1024 * 1024, 25)).toBe(true)
  })
})
