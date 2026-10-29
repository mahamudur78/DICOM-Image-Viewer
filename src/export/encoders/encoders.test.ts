import { describe, expect, it } from 'vitest'
import UTIF from 'utif2'
import { encodeAvi } from './avi'
import { encodeGif, lzw } from './gif'
import { encodePdf, PAGE_SIZES } from './pdf'
import { encodeBmp, encodeTiff, type Rgba } from './raster'

/** A 3 × 2 image: red, green, blue / white, gray, black. */
const image: Rgba = {
  width: 3,
  height: 2,
  data: Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255, 128, 128, 128, 255, 0, 0, 0, 255]),
}

describe('raster encoders', () => {
  it('writes a bottom-up 24-bit BMP with padded rows', () => {
    const bmp = encodeBmp(image)
    const view = new DataView(bmp.buffer)
    expect(String.fromCharCode(bmp[0], bmp[1])).toBe('BM')
    expect(view.getInt32(18, true)).toBe(3)
    expect(view.getUint16(28, true)).toBe(24)
    // Rows are 12 bytes (9 padded to 4); the first stored row is the bottom one (white, gray, black), as BGR.
    expect(bmp.length).toBe(54 + 12 * 2)
    expect([...bmp.slice(54, 63)]).toEqual([255, 255, 255, 128, 128, 128, 0, 0, 0])
    expect([...bmp.slice(66, 69)]).toEqual([0, 0, 255]) // red as BGR
  })

  it('writes a TIFF that a TIFF decoder reads back', () => {
    const tiff = encodeTiff(image)
    const [ifd] = UTIF.decode(tiff.buffer)
    UTIF.decodeImage(tiff.buffer, ifd)
    expect([ifd.width, ifd.height]).toEqual([3, 2])
    expect([...UTIF.toRGBA8(ifd)]).toEqual([...image.data])
  })
})

/** A plain GIF LZW decoder, as browsers implement it, to check the encoder. */
function unlzw(blocks: Uint8Array, minCodeSize = 8): number[] {
  const bytes: number[] = []
  for (let i = 0; blocks[i]; i += blocks[i] + 1) bytes.push(...blocks.slice(i + 1, i + 1 + blocks[i]))
  const clear = 1 << minCodeSize
  const end = clear + 1
  let codeSize = minCodeSize + 1
  let dict: number[][] = []
  const reset = () => {
    dict = Array.from({ length: clear }, (_, i) => [i])
    dict.push([], [])
    codeSize = minCodeSize + 1
  }
  reset()
  const out: number[] = []
  let bit = 0
  let previous: number[] | null = null
  for (;;) {
    let code = 0
    for (let i = 0; i < codeSize; i++, bit++) code |= ((bytes[bit >> 3] >> (bit & 7)) & 1) << i
    if (code === clear) {
      reset()
      previous = null
      continue
    }
    if (code === end) break
    const entry: number[] = code < dict.length ? dict[code] : [...previous!, previous![0]]
    out.push(...entry)
    if (previous) dict.push([...previous, entry[0]])
    previous = entry
    if (dict.length === 1 << codeSize && codeSize < 12) codeSize++
  }
  return out
}

describe('GIF', () => {
  it('compresses so that a standard decoder gets the pixels back', () => {
    // Long enough to grow the code size to 12 bits and reset the table.
    const random = Uint8Array.from({ length: 40_000 }, (_, i) => (i * 7919 + (i >> 5) * 31) % 256)
    expect(unlzw(lzw(random))).toEqual([...random])
    const flat = new Uint8Array(5000).fill(3)
    expect(unlzw(lzw(flat))).toEqual([...flat])
  })

  it('writes an animated GIF89a', () => {
    const gif = encodeGif([image, image], 100)
    expect(String.fromCharCode(...gif.slice(0, 6))).toBe('GIF89a')
    expect(new DataView(gif.buffer).getUint16(6, true)).toBe(3)
    expect(gif[gif.length - 1]).toBe(0x3b)
    // Two graphic control extensions with a 100 ms (10 × 1/100 s) delay.
    const text = [...gif].join(',')
    expect(text.split('33,249,4,4,10,0').length - 1).toBe(2)
  })
})

describe('AVI', () => {
  it('writes a RIFF AVI with one JPEG chunk per frame and an index', () => {
    const frames = [Uint8Array.of(0xff, 0xd8, 1, 0xff, 0xd9), Uint8Array.of(0xff, 0xd8, 2, 3, 0xff, 0xd9)]
    const avi = encodeAvi(frames, 64, 48, 10)
    const ascii = String.fromCharCode(...avi)
    const view = new DataView(avi.buffer)
    expect(ascii.slice(0, 4)).toBe('RIFF')
    expect(view.getUint32(4, true)).toBe(avi.length - 8)
    expect(ascii.slice(8, 12)).toBe('AVI ')
    expect(ascii).toContain('MJPG')
    expect(ascii.split('00dc').length - 1).toBe(4) // two frames and two index entries
    expect(ascii).toContain('idx1')
    // Microseconds per frame at 10 fps.
    expect(view.getUint32(ascii.indexOf('avih') + 8, true)).toBe(100_000)
  })
})

describe('PDF', () => {
  it('writes a PDF with correct cross-references', () => {
    const [width, height] = PAGE_SIZES.A4
    const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9)
    const pdf = encodePdf(
      [
        { width, height, images: [{ jpeg, width: 2, height: 2, x: 10, y: 10, w: 100, h: 100 }], texts: [{ text: 'Patient (test) é', x: 10, y: 120, size: 10 }] },
        { width, height, images: [], texts: [] },
      ],
      'Report',
    )
    const text = new TextDecoder('latin1').decode(pdf)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('/Count 2')
    expect(text).toContain('(Patient \\(test\\) \xe9)')
    const startxref = Number(text.match(/startxref\n(\d+)/)![1])
    expect(text.slice(startxref, startxref + 4)).toBe('xref')
    const offsets = [...text.slice(startxref).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]))
    offsets.forEach((offset, i) => expect(text.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true))
  })
})
