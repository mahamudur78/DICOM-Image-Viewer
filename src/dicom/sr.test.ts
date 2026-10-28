import dicomParser from 'dicom-parser'
import { describe, expect, it } from 'vitest'
import { parseStructuredReport } from './sr'
import { dicomFile, element, sequence, type DicomElement } from './writer'

const SR = '1.2.840.10008.5.1.4.1.1.88.33'
const sq = sequence
const code = (value: string, scheme: string, meaning: string) => [
  element(0x0008, 0x0100, 'SH', value),
  element(0x0008, 0x0102, 'SH', scheme),
  element(0x0008, 0x0104, 'LO', meaning),
]
const item = (valueType: string, concept: string, ...value: DicomElement[]) => [
  element(0x0040, 0xa010, 'CS', 'CONTAINS'),
  element(0x0040, 0xa040, 'CS', valueType),
  sq(0x0040, 0xa043, [code('1', 'DCM', concept)]),
  ...value,
]

describe('parseStructuredReport', () => {
  const bytes = dicomFile(SR, '1.2.3', [
    element(0x0008, 0x0005, 'CS', 'ISO_IR 192'),
    element(0x0040, 0xa040, 'CS', 'CONTAINER'),
    sq(0x0040, 0xa043, [code('18748-4', 'LN', 'Diagnostic Imaging Report')]),
    element(0x0040, 0xa491, 'CS', 'COMPLETE'),
    element(0x0040, 0xa493, 'CS', 'VERIFIED'),
    sq(0x0040, 0xa730, [
      item('TEXT', 'Finding', element(0x0040, 0xa160, 'UT', 'যকৃতে ক্ষত')),
      item(
        'NUM',
        'Length',
        sq(0x0040, 0xa300, [[element(0x0040, 0xa30a, 'DS', '20'), sq(0x0040, 0x08ea, [code('mm', 'UCUM', 'millimeter')])]]),
      ),
      item('CODE', 'Finding', sq(0x0040, 0xa168, [code('4147007', 'SCT', 'Mass')])),
      item('PNAME', 'Observer', element(0x0040, 0xa123, 'PN', 'Doe^Jane')),
      item('DATE', 'Study Date', element(0x0040, 0xa121, 'DA', '20260102')),
      item('IMAGE', 'Image', sq(0x0008, 0x1199, [[element(0x0008, 0x1150, 'UI', '1.2'), element(0x0008, 0x1155, 'UI', '9.9.9')]])),
      item('CONTAINER', 'Conclusion', sq(0x0040, 0xa730, [item('TEXT', 'Conclusion', element(0x0040, 0xa160, 'UT', 'Follow up.'))])),
    ]),
  ])
  const report = parseStructuredReport(dicomParser.parseDicom(bytes))

  it('reads the title and flags', () => {
    expect(report).toMatchObject({ title: 'Diagnostic Imaging Report', completion: 'COMPLETE', verification: 'VERIFIED' })
  })

  it('formats each value type (UTF-8 text included)', () => {
    expect(report.root.children.map((n) => [n.valueType, n.concept, n.value])).toEqual([
      ['TEXT', 'Finding', 'যকৃতে ক্ষত'],
      ['NUM', 'Length', '20 mm'],
      ['CODE', 'Finding', 'Mass'],
      ['PNAME', 'Observer', 'Doe Jane'],
      ['DATE', 'Study Date', '2026-01-02'],
      ['IMAGE', 'Image', undefined],
      ['CONTAINER', 'Conclusion', undefined],
    ])
  })

  it('keeps image references and nested content', () => {
    expect(report.root.children[5].reference).toEqual({ sopClassUID: '1.2', sopInstanceUID: '9.9.9', frames: undefined })
    expect(report.root.children[6].children[0].value).toBe('Follow up.')
  })
})
