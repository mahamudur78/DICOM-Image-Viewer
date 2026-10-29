// Animated GIF (GIF89a) from RGBA frames. Grayscale movies use 256 grays;
// colour ones a 6×6×6 colour cube plus 40 grays (no dithering).
import type { Rgba } from './raster'

function isGrayscale(frames: Rgba[]) {
  return frames.every(({ data }) => {
    for (let i = 0; i < data.length; i += 16) if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) return false
    return true
  })
}

function palette(gray: boolean): Uint8Array<ArrayBuffer> {
  const colors = new Uint8Array(256 * 3)
  if (gray) {
    for (let i = 0; i < 256; i++) colors.set([i, i, i], i * 3)
    return colors
  }
  let n = 0
  for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) colors.set([r * 51, g * 51, b * 51], n++ * 3)
  for (let i = 0; i < 40; i++) {
    const v = Math.round((i * 255) / 39)
    colors.set([v, v, v], n++ * 3)
  }
  return colors
}

function indexOf(r: number, g: number, b: number, gray: boolean) {
  if (gray) return r
  // Near-gray pixels use the finer gray ramp.
  if (Math.max(r, g, b) - Math.min(r, g, b) < 12) return 216 + Math.round((((r + g + b) / 3) * 39) / 255)
  return Math.round(r / 51) * 36 + Math.round(g / 51) * 6 + Math.round(b / 51)
}

/** LZW-compresses palette indices into GIF data sub-blocks (minimum code size 8). */
export function lzw(indices: Uint8Array): Uint8Array<ArrayBuffer> {
  const clear = 256
  const end = 257
  const bytes: number[] = []
  let bitBuffer = 0
  let bitCount = 0
  let codeSize = 9
  const write = (code: number) => {
    bitBuffer |= code << bitCount
    bitCount += codeSize
    while (bitCount >= 8) {
      bytes.push(bitBuffer & 0xff)
      bitBuffer >>>= 8
      bitCount -= 8
    }
  }
  let table = new Map<number, number>()
  let next = 258
  write(clear)
  let prefix = indices[0] ?? 0
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]
    const key = prefix * 256 + k
    const found = table.get(key)
    if (found !== undefined) {
      prefix = found
      continue
    }
    write(prefix)
    // As in the classic encoders: once a code needs more bits, the next code is wider.
    if (next >= 1 << codeSize && codeSize < 12) codeSize++
    if (next < 4096) {
      table.set(key, next++)
    } else {
      write(clear)
      table = new Map()
      next = 258
      codeSize = 9
    }
    prefix = k
  }
  write(prefix)
  if (next >= 1 << codeSize && codeSize < 12) codeSize++
  write(end)
  if (bitCount > 0) bytes.push(bitBuffer & 0xff)
  // Sub-blocks of at most 255 bytes, then a terminator.
  const out: number[] = []
  for (let i = 0; i < bytes.length; i += 255) {
    const block = bytes.slice(i, i + 255)
    out.push(block.length, ...block)
  }
  out.push(0)
  return Uint8Array.from(out)
}

/** An animated GIF that loops forever; delay is per frame in milliseconds. */
export function encodeGif(frames: Rgba[], delayMs: number): Uint8Array<ArrayBuffer> {
  const { width, height } = frames[0]
  const gray = isGrayscale(frames)
  const parts: Uint8Array[] = []
  const header = new Uint8Array(13)
  header.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]) // GIF89a
  new DataView(header.buffer).setUint16(6, width, true)
  new DataView(header.buffer).setUint16(8, height, true)
  header[10] = 0xf7 // global colour table, 8 bits, 256 entries
  parts.push(header, palette(gray))
  // NETSCAPE2.0: loop forever.
  parts.push(Uint8Array.from([0x21, 0xff, 0x0b, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 0x03, 0x01, 0, 0, 0]))
  const delay = Math.max(2, Math.round(delayMs / 10))
  for (const frame of frames) {
    parts.push(Uint8Array.from([0x21, 0xf9, 0x04, 0x04, delay & 0xff, delay >> 8, 0, 0])) // graphic control
    const descriptor = new Uint8Array(10)
    descriptor[0] = 0x2c
    new DataView(descriptor.buffer).setUint16(5, width, true)
    new DataView(descriptor.buffer).setUint16(7, height, true)
    parts.push(descriptor)
    const indices = new Uint8Array(width * height)
    for (let p = 0; p < indices.length; p++) indices[p] = indexOf(frame.data[p * 4], frame.data[p * 4 + 1], frame.data[p * 4 + 2], gray)
    parts.push(Uint8Array.of(8), lzw(indices))
  }
  parts.push(Uint8Array.of(0x3b))
  return concat(parts)
}

export function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
