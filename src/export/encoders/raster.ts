// Uncompressed BMP and TIFF from RGBA pixels (what a canvas gives).

export interface Rgba {
  width: number
  height: number
  /** RGBA, 4 bytes per pixel, rows top to bottom. */
  data: Uint8ClampedArray | Uint8Array
}

/** 24-bit BMP (BI_RGB): rows bottom-up, each padded to 4 bytes. */
export function encodeBmp({ width, height, data }: Rgba): Uint8Array<ArrayBuffer> {
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const size = 54 + rowSize * height
  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  out.set([0x42, 0x4d]) // "BM"
  view.setUint32(2, size, true)
  view.setUint32(10, 54, true) // pixel data offset
  view.setUint32(14, 40, true) // BITMAPINFOHEADER
  view.setInt32(18, width, true)
  view.setInt32(22, height, true)
  view.setUint16(26, 1, true) // planes
  view.setUint16(28, 24, true) // bits per pixel
  view.setUint32(34, rowSize * height, true)
  view.setInt32(38, 2835, true) // 72 dpi in pixels per metre
  view.setInt32(42, 2835, true)
  for (let y = 0; y < height; y++) {
    const row = 54 + (height - 1 - y) * rowSize
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      out[row + x * 3] = data[i + 2]
      out[row + x * 3 + 1] = data[i + 1]
      out[row + x * 3 + 2] = data[i]
    }
  }
  return out
}

/** Baseline TIFF: little-endian, one strip of 8-bit RGB, uncompressed, 72 dpi. */
export function encodeTiff({ width, height, data }: Rgba): Uint8Array<ArrayBuffer> {
  const pixelBytes = width * height * 3
  const entries = 12
  const ifdOffset = 8
  const ifdSize = 2 + entries * 12 + 4
  const bitsOffset = ifdOffset + ifdSize
  const resolutionOffset = bitsOffset + 6
  const pixelsOffset = resolutionOffset + 16
  const out = new Uint8Array(pixelsOffset + pixelBytes)
  const view = new DataView(out.buffer)
  out.set([0x49, 0x49, 42, 0]) // "II", 42
  view.setUint32(4, ifdOffset, true)
  view.setUint16(ifdOffset, entries, true)
  const SHORT = 3
  const LONG = 4
  const RATIONAL = 5
  // Tags in ascending order, as TIFF requires.
  const tags: [number, number, number, number][] = [
    [256, LONG, 1, width],
    [257, LONG, 1, height],
    [258, SHORT, 3, bitsOffset],
    [259, SHORT, 1, 1], // no compression
    [262, SHORT, 1, 2], // RGB
    [273, LONG, 1, pixelsOffset],
    [277, SHORT, 1, 3],
    [278, LONG, 1, height],
    [279, LONG, 1, pixelBytes],
    [282, RATIONAL, 1, resolutionOffset],
    [283, RATIONAL, 1, resolutionOffset + 8],
    [296, SHORT, 1, 2], // inches
  ]
  tags.forEach(([tag, type, count, value], i) => {
    const at = ifdOffset + 2 + i * 12
    view.setUint16(at, tag, true)
    view.setUint16(at + 2, type, true)
    view.setUint32(at + 4, count, true)
    if (type === SHORT && count === 1) view.setUint16(at + 8, value, true)
    else view.setUint32(at + 8, value, true)
  })
  view.setUint32(ifdOffset + 2 + entries * 12, 0, true) // no next IFD
  for (let i = 0; i < 3; i++) view.setUint16(bitsOffset + i * 2, 8, true)
  for (const at of [resolutionOffset, resolutionOffset + 8]) {
    view.setUint32(at, 72, true)
    view.setUint32(at + 4, 1, true)
  }
  for (let p = 0, o = pixelsOffset; p < width * height; p++, o += 3) {
    out[o] = data[p * 4]
    out[o + 1] = data[p * 4 + 1]
    out[o + 2] = data[p * 4 + 2]
  }
  return out
}
