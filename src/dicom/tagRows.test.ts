import { describe, expect, it } from 'vitest'
import { element, sequence, dicomFile } from './writer'
import { parseHeaderBytes } from './header'
import { buildRows, diffRows, rowsToCsv, rowsToJson, rowsToText } from './tagRows'

const file = (name: string, uid: string) =>
  parseHeaderBytes(
    dicomFile('1.2.840.10008.5.1.4.1.1.7', '1.2.3.4', [
      element(0x0010, 0x0010, 'PN', name),
      element(0x0008, 0x0060, 'CS', 'OT'),
      sequence(0x0008, 0x1140, [[element(0x0008, 0x1150, 'UI', '1.2.840.10008.5.1.4.1.1.7'), element(0x0008, 0x1155, 'UI', uid)]]),
    ]),
  )

describe('tag rows', () => {
  const rows = buildRows(file('Doe^Jane', '1.2.9'))

  it('expands sequence items under their sequence', () => {
    const sequenceRow = rows.find((r) => r.tag === '(0008,1140)')!
    expect(sequenceRow).toMatchObject({ vr: 'SQ', value: '[1 item(s)]', depth: 0 })
    const inner = rows.find((r) => r.tag === '(0008,1155)')!
    expect(inner).toMatchObject({ depth: 1, value: '1.2.9', path: '(0008,1140)[1](0008,1155)' })
    expect(rows.find((r) => r.path === '(0008,1140)[1]')).toMatchObject({ name: 'Item 1', depth: 1 })
  })

  it('exports text, CSV and nested JSON', () => {
    expect(rowsToText(rows)).toContain('(0010,0010) PN PatientName = Doe^Jane')
    expect(rowsToText(rows)).toMatch(/\n {2}\(0008,1155\) UI .*= 1\.2\.9/)
    const csv = rowsToCsv(rows, 'a.dcm')
    expect(csv.split('\r\n')[0]).toBe('File,Path,Tag,Name,VR,Value')
    expect(csv).toContain('a.dcm,"(0010,0010)","(0010,0010)",PatientName,PN,Doe^Jane')
    const json = rowsToJson(rows)
    const seq = json.find((e) => e.tag === '(0008,1140)')!
    expect(seq.items).toHaveLength(1)
    expect(seq.items![0].find((e) => e.tag === '(0008,1155)')!.value).toBe('1.2.9')
    expect(json.find((e) => e.tag === '(0010,0010)')!.value).toBe('Doe^Jane')
  })

  it('lists the differences between two files', () => {
    const other = buildRows(file('Roe^Ann', '1.2.9'))
    expect(diffRows(rows, other)).toEqual([{ path: '(0010,0010)', tag: '(0010,0010)', name: 'PatientName', a: 'Doe^Jane', b: 'Roe^Ann' }])
    expect(diffRows(rows, rows)).toEqual([])
  })
})
