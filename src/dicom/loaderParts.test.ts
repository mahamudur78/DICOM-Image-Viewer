import dicomParser from 'dicom-parser'
import { describe, expect, it } from 'vitest'
import { applyDicomdir, normalizePath, referencedFiles } from './dicomdir'
import { isDicomdirPath, sniffBytes } from './fileType'
import { framesOf } from './frames'
import { charsetLabel, decodedText, parseHeaderBytes } from './header'
import { dicomFile, element, sequence } from './writer'

const file = (path: string) => ({ file: new File([], path.split('/').pop()!), path })
const parse = (bytes: Uint8Array) => dicomParser.parseDicom(bytes)

describe('DICOMDIR', () => {
  it('normalizes CD paths', () => {
    expect(normalizePath('DICOM\\IMG0002;1')).toBe('dicom/img0002')
    expect(normalizePath('CD/DICOM/IMG0001.')).toBe('cd/dicom/img0001')
  })

  it('reads referenced file IDs', () => {
    const bytes = dicomFile('1.2.840.10008.1.3.10', '1.2.3', [
      sequence(0x0004, 0x1220, [
        [element(0x0004, 0x1430, 'CS', 'PATIENT')],
        [element(0x0004, 0x1430, 'CS', 'IMAGE'), element(0x0004, 0x1500, 'CS', 'DICOM\\S1\\IM1')],
      ]),
    ])
    expect(referencedFiles(parse(bytes))).toEqual(['DICOM/S1/IM1'])
  })

  it('keeps referenced files and files outside the CD, and reports missing ones', () => {
    const files = [file('cd/DICOM/IM1'), file('cd/VIEWER/logo.png'), file('cd/DICOM/IM2'), file('other/x.dcm')]
    const { kept, issues } = applyDicomdir('cd/DICOMDIR', ['DICOM/IM1;1', 'DICOM/IM3'], files)
    expect(kept.map((f) => f.path)).toEqual(['cd/DICOM/IM1', 'other/x.dcm'])
    expect(issues).toEqual([{ path: 'cd/DICOM/IM3', reason: 'missingFromDicomdir' }])
  })

  it('recognises DICOMDIR names', () => {
    expect(isDicomdirPath('CD/DICOMDIR')).toBe(true)
    expect(isDicomdirPath('dicomdir;1')).toBe(true)
    expect(isDicomdirPath('CD/DICOMDIR.bak')).toBe(false)
  })
})

describe('sniffBytes', () => {
  const bytes = (...values: number[]) => Uint8Array.from([...values, ...new Array(140).fill(0)])
  it('identifies DICOM, ZIP and image formats', () => {
    const dicom = new Uint8Array(140)
    dicom.set([0x44, 0x49, 0x43, 0x4d], 128)
    expect(sniffBytes(dicom)).toEqual({ type: 'dicom' })
    expect(sniffBytes(bytes(0x50, 0x4b, 3, 4))).toEqual({ type: 'zip' })
    expect(sniffBytes(bytes(0xff, 0xd8, 0xff))).toEqual({ type: 'image', format: 'jpeg' })
    expect(sniffBytes(bytes(0x49, 0x49, 0x2a, 0))).toEqual({ type: 'image', format: 'tiff' })
    expect(sniffBytes(bytes(1, 2, 3))).toEqual({ type: 'unknown' })
  })
})

describe('character sets', () => {
  it('maps Specific Character Set terms to decoders', () => {
    expect(charsetLabel(undefined)).toBe('iso-8859-1')
    expect(charsetLabel('ISO_IR 192')).toBe('utf-8')
    expect(charsetLabel('ISO 2022 IR 6\\ISO 2022 IR 87')).toBe('iso-2022-jp')
    expect(charsetLabel('\\ISO 2022 IR 149')).toBe('euc-kr')
    expect(charsetLabel('ISO 2022 IR 100')).toBe('iso-8859-1')
    expect(charsetLabel('GB18030')).toBe('gb18030')
  })

  it('decodes UTF-8 and Latin-1 names', () => {
    const utf8 = parse(dicomFile('1.2', '1.2.3', [element(0x0008, 0x0005, 'CS', 'ISO_IR 192'), element(0x0010, 0x0010, 'PN', 'রহিম^করিম')]))
    expect(decodedText(utf8, 'x00100010')).toBe('রহিম^করিম')
    const latin = parse(dicomFile('1.2', '1.2.3', [element(0x0008, 0x0005, 'CS', 'ISO_IR 100'), element(0x0010, 0x0010, 'PN', Uint8Array.of(0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72))]))
    expect(decodedText(latin, 'x00100010')).toBe('Müller')
  })

  it('parses raw datasets without a preamble as implicit VR', () => {
    // Implicit VR little endian: tag, 4-byte length, value.
    const raw = Uint8Array.of(0x10, 0, 0x10, 0, 4, 0, 0, 0, 0x44, 0x6f, 0x65, 0x20)
    expect(parseHeaderBytes(raw).string('x00100010')).toBe('Doe')
  })
})

describe('framesOf', () => {
  it('takes positions from per-frame groups and shared values from shared groups', () => {
    const bytes = dicomFile('1.2.840.10008.5.1.4.1.1.2.1', '1.2.3', [
      sequence(0x5200, 0x9229, [
        [
          sequence(0x0020, 0x9116, [[element(0x0020, 0x0037, 'DS', '1\\0\\0\\0\\1\\0')]]),
          sequence(0x0028, 0x9110, [[element(0x0028, 0x0030, 'DS', '0.5\\0.5'), element(0x0018, 0x0050, 'DS', '2')]]),
          sequence(0x0028, 0x9132, [[element(0x0028, 0x1050, 'DS', '40'), element(0x0028, 0x1051, 'DS', '400')]]),
        ],
      ]),
      sequence(0x5200, 0x9230, [
        [sequence(0x0020, 0x9113, [[element(0x0020, 0x0032, 'DS', '0\\0\\0')]])],
        [sequence(0x0020, 0x9113, [[element(0x0020, 0x0032, 'DS', '0\\0\\-2')]])],
      ]),
    ])
    const frames = framesOf(parse(bytes), 2)
    expect(frames[1]).toEqual({
      position: [0, 0, -2],
      orientation: [1, 0, 0, 0, 1, 0],
      pixelSpacing: [0.5, 0.5],
      sliceThickness: 2,
      windowCenter: 40,
      windowWidth: 400,
    })
  })

  it('repeats a classic header for every frame', () => {
    const bytes = dicomFile('1.2.840.10008.5.1.4.1.1.3.1', '1.2.3', [element(0x0018, 0x0081, 'DS', '12')])
    expect(framesOf(parse(bytes), 3)).toEqual([{ echoTime: 12 }, { echoTime: 12 }, { echoTime: 12 }])
  })
})
