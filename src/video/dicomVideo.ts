import dicomParser from 'dicom-parser'
import { VIDEO_TRANSFER_SYNTAXES, type VideoCodec } from '../dicom/parse'
import { avcCodecString, avcDecoderConfig, parseAnnexB, presentationSlots } from './h264'

export type DicomVideo =
  | { playable: true; blob: Blob; codec: VideoCodec }
  | { playable: false; codec: VideoCodec; stream: Blob; extension: string }

/** The encapsulated stream: all pixel data fragments joined. */
export function videoStream(dataSet: dicomParser.DataSet): Uint8Array {
  const element = dataSet.elements.x7fe00010
  if (!element?.fragments?.length) throw new Error('No encapsulated video stream')
  const parts = element.fragments.map((f) => dataSet.byteArray.subarray(f.position, f.position + f.length))
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  // Fragments are padded to even length; trailing zero bytes are harmless for every codec here.
  return out
}

/** An MP4/QuickTime file starts with an "ftyp" box. */
export const isMp4 = (bytes: Uint8Array) =>
  bytes.length > 8 && String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) === 'ftyp'

/** Wraps an Annex-B H.264 stream into an MP4 that browsers can play. */
export async function h264ToMp4(stream: Uint8Array, width: number, height: number, frameRate: number): Promise<Blob> {
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
  const { sps, pps, frames } = parseAnnexB(stream)
  const frameDuration = 1e6 / frameRate // microseconds
  const { slots } = presentationSlots(frames)
  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height, frameRate },
    fastStart: 'in-memory',
    // The reordering delay shifts the first presentation time; start the track at zero.
    firstTimestampBehavior: 'offset',
  })
  const decoderConfig = { codec: avcCodecString(sps), codedWidth: width, codedHeight: height, description: avcDecoderConfig(sps, pps) }
  frames.forEach((frame, i) => {
    const timestamp = slots[i] * frameDuration
    const decodeTime = i * frameDuration
    muxer.addVideoChunkRaw(
      frame.data,
      frame.keyframe ? 'key' : 'delta',
      timestamp,
      frameDuration,
      i === 0 ? { decoderConfig } : undefined,
      timestamp - decodeTime,
    )
  })
  muxer.finalize()
  return new Blob([target.buffer], { type: 'video/mp4' })
}

const EXTENSIONS: Record<VideoCodec, string> = { mpeg2: 'mpg', h264: 'h264', hevc: 'hevc' }

/**
 * Turns a DICOM video object into something a <video> element can play:
 * MP4 streams as they are, H.264 elementary streams wrapped into MP4.
 * MPEG-2 and raw HEVC cannot be played by browsers; the stream is returned for download.
 */
export async function readDicomVideo(file: Blob, frameRate: number | null): Promise<DicomVideo> {
  const dataSet = dicomParser.parseDicom(new Uint8Array(await file.arrayBuffer()))
  const codec = VIDEO_TRANSFER_SYNTAXES[dataSet.string('x00020010') ?? ''] ?? 'h264'
  const stream = videoStream(dataSet)
  if (isMp4(stream)) return { playable: true, blob: new Blob([stream as BlobPart], { type: 'video/mp4' }), codec }
  if (codec === 'h264') {
    const width = dataSet.uint16('x00280011') ?? 0
    const height = dataSet.uint16('x00280010') ?? 0
    return { playable: true, blob: await h264ToMp4(stream, width, height, frameRate ?? 25), codec }
  }
  return { playable: false, codec, stream: new Blob([stream as BlobPart]), extension: EXTENSIONS[codec] }
}
