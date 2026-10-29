import dcmjs from 'dcmjs'
import { describe, expect, it } from 'vitest'
import { dicomFile, element, sequence } from '../dicom/writer'
import { DEFAULT_ANONYMIZE, anonymizeDataset, markDeidentified, mayHaveBurnedInText } from './anonymize'
import { blackenPixels, displayValue, normalizeTag, setValue } from './dicomValues'

/** A small CT-like file with identifying details, a private tag and a reference sequence. */
function sample(sopInstanceUID = '1.2.3.100.1') {
  const bytes = dicomFile('1.2.840.10008.5.1.4.1.1.2', sopInstanceUID, [
    element(0x0008, 0x0020, 'DA', '20260101'),
    element(0x0008, 0x0060, 'CS', 'CT'),
    element(0x0008, 0x0080, 'LO', 'City Hospital'),
    element(0x0008, 0x1030, 'LO', 'Chest CT'),
    element(0x0009, 0x0010, 'LO', 'VENDOR'),
    element(0x0010, 0x0010, 'PN', 'Doe^Jane'),
    element(0x0010, 0x0020, 'LO', 'MRN123'),
    element(0x0010, 0x0030, 'DA', '19800101'),
    element(0x0020, 0x000d, 'UI', '1.2.3.100'),
    element(0x0020, 0x000e, 'UI', '1.2.3.100.9'),
    sequence(0x0008, 0x1140, [[element(0x0008, 0x1150, 'UI', '1.2.840.10008.5.1.4.1.1.2'), element(0x0008, 0x1155, 'UI', '1.2.3.100.2')]]),
    element(0x0028, 0x0002, 'US', 1),
    element(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
    element(0x0028, 0x0010, 'US', 4),
    element(0x0028, 0x0011, 'US', 4),
    element(0x0028, 0x0100, 'US', 16),
    element(0x0028, 0x0101, 'US', 16),
    element(0x0028, 0x0102, 'US', 15),
    element(0x0028, 0x0103, 'US', 0),
    element(0x7fe0, 0x0010, 'OW', new Uint8Array(new Uint16Array(16).fill(500).buffer)),
  ])
  return dcmjs.data.DicomMessage.readFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
}

let counter = 0
const newUid = () => `2.25.${++counter}`

describe('anonymize', () => {
  it('applies the Basic Profile', () => {
    const { dict } = sample()
    const changes = anonymizeDataset(dict, { ...DEFAULT_ANONYMIZE, patientId: 'ANON-1' }, new Map(), newUid)
    expect(displayValue(dict['00100010'])).toBe('ANONYMOUS')
    expect(displayValue(dict['00100020'])).toBe('ANON-1')
    expect(displayValue(dict['00100030'])).toBe('') // birth date emptied
    expect(dict['00080080']).toBeUndefined() // institution removed
    expect(dict['00081030']).toBeUndefined() // study description removed
    expect(dict['00090010']).toBeUndefined() // private tag removed
    expect(displayValue(dict['00080020'])).toBe('') // study date emptied
    expect(displayValue(dict['00080060'])).toBe('CT') // modality kept
    expect(displayValue(dict['0020000D'])).toMatch(/^2\.25\./)
    // Inside the sequence: the referenced instance UID is replaced, the SOP class kept.
    const item = (dict['00081140'].Value as Record<string, { Value?: unknown[] }>[])[0]
    expect(String(item['00081155'].Value![0])).toMatch(/^2\.25\./)
    expect(String(item['00081150'].Value![0])).toBe('1.2.840.10008.5.1.4.1.1.2')
    expect(changes.find((c) => c.tag === '00080080')).toMatchObject({ action: 'removed', before: 'City Hospital' })
    expect(changes.find((c) => c.tag === '00081140[1].00081155')).toMatchObject({ action: 'newUid' })
  })

  it('keeps UIDs consistent across files and honours the options', () => {
    const map = new Map<string, string>()
    const a = sample('1.2.3.100.1').dict
    const b = sample('1.2.3.100.2').dict
    const options = { ...DEFAULT_ANONYMIZE, retainDates: true, retainDescriptions: true, keepPrivate: true }
    anonymizeDataset(a, options, map, newUid)
    anonymizeDataset(b, options, map, newUid)
    // Same study and series in both files; file b's own UID is what a's reference points to.
    expect(displayValue(a['0020000D'])).toBe(displayValue(b['0020000D']))
    expect(displayValue(a['0020000E'])).toBe(displayValue(b['0020000E']))
    const reference = (a['00081140'].Value as Record<string, { Value?: unknown[] }>[])[0]['00081155'].Value![0]
    expect(reference).toBe(displayValue(b['00080018']))
    expect(displayValue(a['00080020'])).toBe('20260101')
    expect(displayValue(a['00081030'])).toBe('Chest CT')
    expect(displayValue(a['00090010'])).toBe('VENDOR')
  })

  it('marks the result and flags images that may show text in their pixels', () => {
    const { dict } = sample()
    markDeidentified(dict, DEFAULT_ANONYMIZE)
    expect(displayValue(dict['00120062'])).toBe('YES')
    expect(displayValue(dict['00120063'])).toContain('113100')
    expect(mayHaveBurnedInText(dict)).toBe(false)
    dict['00080060'] = { vr: 'CS', Value: ['US'] }
    expect(mayHaveBurnedInText(dict)).toBe(true)
    dict['00280301'] = { vr: 'CS', Value: ['NO'] }
    expect(mayHaveBurnedInText(dict)).toBe(false)
  })

  it('round-trips through dcmjs', () => {
    const dicom = sample()
    anonymizeDataset(dicom.dict, DEFAULT_ANONYMIZE, new Map(), newUid)
    const again = dcmjs.data.DicomMessage.readFile(dicom.write())
    expect(displayValue(again.dict['00100010'])).toBe('ANONYMOUS')
    expect(again.dict['00080080']).toBeUndefined()
  })
})

describe('DICOM values', () => {
  it('normalizes tags and sets values by VR', () => {
    expect(normalizeTag('(0010,0010)')).toBe('00100010')
    expect(normalizeTag('0010 0020')).toBe('00100020')
    expect(normalizeTag('xyz')).toBeNull()
    const dict = {}
    setValue(dict, '00100010', 'PN', 'Roe^Ann')
    setValue(dict, '00280030', 'DS', '0.5\\0.6')
    expect(dict).toEqual({ '00100010': { vr: 'PN', Value: [{ Alphabetic: 'Roe^Ann' }] }, '00280030': { vr: 'DS', Value: [0.5, 0.6] } })
  })

  it('blackens boxes of uncompressed pixels', () => {
    const dicom = sample()
    expect(blackenPixels(dicom, [{ frame: 0, x0: 1, y0: 1, x1: 2, y1: 2 }])).toBe(4)
    const pixels = new Uint16Array(dicom.dict['7FE00010'].Value![0] as ArrayBuffer)
    expect([...pixels.slice(4, 8)]).toEqual([500, 0, 0, 500])
    expect(pixels[0]).toBe(500)
  })
})
