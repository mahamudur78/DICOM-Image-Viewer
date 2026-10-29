// Motion-JPEG AVI (RIFF): every frame a JPEG, which any player opens.
import { concat } from './gif'

const text = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)))

function chunk(id: string, body: Uint8Array) {
  const header = new Uint8Array(8)
  header.set(text(id))
  new DataView(header.buffer).setUint32(4, body.length, true)
  return concat(body.length % 2 ? [header, body, new Uint8Array(1)] : [header, body])
}

const list = (type: string, ...items: Uint8Array[]) => chunk('LIST', concat([text(type), ...items]))

function u32s(...values: number[]) {
  const out = new Uint8Array(values.length * 4)
  values.forEach((v, i) => new DataView(out.buffer).setUint32(i * 4, v, true))
  return out
}

/** An AVI of JPEG frames (all the same size) at a frame rate. */
export function encodeAvi(jpegs: Uint8Array[], width: number, height: number, fps: number): Uint8Array<ArrayBuffer> {
  const microPerFrame = Math.round(1_000_000 / fps)
  const largest = Math.max(...jpegs.map((j) => j.length))
  const avih = chunk('avih', u32s(microPerFrame, largest * fps, 0, 0x10 /* AVIF_HASINDEX */, jpegs.length, 0, 1, largest, width, height, 0, 0, 0, 0))
  const strhBody = concat([
    text('vids'),
    text('MJPG'),
    u32s(0, 0, 0), // flags, priority + language, initial frames
    u32s(1, fps, 0, jpegs.length, largest, 0xffffffff, 0), // scale, rate, start, length, buffer, quality, sample size
    new Uint8Array(8), // frame rectangle
  ])
  new DataView(strhBody.buffer).setUint16(strhBody.length - 4, width, true)
  new DataView(strhBody.buffer).setUint16(strhBody.length - 2, height, true)
  const strf = new Uint8Array(40)
  const v = new DataView(strf.buffer)
  v.setUint32(0, 40, true)
  v.setInt32(4, width, true)
  v.setInt32(8, height, true)
  v.setUint16(12, 1, true)
  v.setUint16(14, 24, true)
  strf.set(text('MJPG'), 16)
  v.setUint32(20, width * height * 3, true)
  const hdrl = list('hdrl', avih, list('strl', chunk('strh', strhBody), chunk('strf', strf)))

  const frames = jpegs.map((jpeg) => chunk('00dc', jpeg))
  const movi = list('movi', ...frames)
  // Index: offsets from the start of the 'movi' list data ("movi" fourcc).
  let offset = 4
  const index = concat(
    frames.map((frame, i) => {
      const entry = concat([text('00dc'), u32s(0x10 /* keyframe */, offset, jpegs[i].length)])
      offset += frame.length
      return entry
    }),
  )
  const body = concat([text('AVI '), hdrl, movi, chunk('idx1', index)])
  return chunk('RIFF', body)
}
