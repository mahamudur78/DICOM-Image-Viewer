import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import dicomParser from 'dicom-parser'
import { describe, expect, it } from 'vitest'
import { h264ToMp4, isMp4, videoStream } from './dicomVideo'
import { avcCodecString, avcDecoderConfig, parseAnnexB, presentationSlots, splitNalUnits } from './h264'

describe('splitNalUnits', () => {
  it('splits on 3- and 4-byte start codes', () => {
    const stream = Uint8Array.of(0, 0, 0, 1, 0x67, 1, 2, 0, 0, 1, 0x68, 3, 0, 0, 0, 1, 0x65, 4, 5)
    expect(splitNalUnits(stream).map((n) => [n.type, ...n.data])).toEqual([
      [7, 0x67, 1, 2],
      [8, 0x68, 3],
      [5, 0x65, 4, 5],
    ])
  })
})

describe('presentationSlots', () => {
  it('orders B-frames by picture order count and delays playback enough', () => {
    // Decode order I P B B (POC 0 6 2 4) → presentation I B B P.
    const frames = [
      { keyframe: true, poc: 0 },
      { keyframe: false, poc: 6 },
      { keyframe: false, poc: 2 },
      { keyframe: false, poc: 4 },
    ]
    const { slots, delay } = presentationSlots(frames)
    expect(slots.map((s) => s - delay)).toEqual([0, 3, 1, 2])
    slots.forEach((slot, decodeIndex) => expect(slot).toBeGreaterThanOrEqual(decodeIndex))
  })
  it('keeps groups of pictures separate', () => {
    const frames = [
      { keyframe: true, poc: 0 },
      { keyframe: false, poc: 2 },
      { keyframe: true, poc: 0 },
    ]
    expect(presentationSlots(frames).slots).toEqual([0, 1, 2])
  })
})

describe('avcDecoderConfig', () => {
  it('builds avcC from the SPS profile and level', () => {
    const sps = Uint8Array.of(0x67, 0x64, 0x00, 0x1f, 0xac)
    const pps = Uint8Array.of(0x68, 0xee)
    expect([...avcDecoderConfig(sps, pps)]).toEqual([1, 0x64, 0, 0x1f, 0xff, 0xe1, 0, 5, ...sps, 1, 0, 2, ...pps])
    expect(avcCodecString(sps)).toBe('avc1.64001f')
  })
})

// The e2e sample (made with ffmpeg: High profile, B-frames, 50 frames at 25 fps).
const SAMPLE = 'e2e/.data/samples/video/h264_annexb.dcm'
const hasFfmpeg = (() => {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

describe.skipIf(!existsSync(SAMPLE))('a real H.264 DICOM video', () => {
  const dataSet = dicomParser.parseDicom(new Uint8Array(readFileSync(SAMPLE)))
  const stream = videoStream(dataSet)

  it('is an Annex-B stream of 50 frames starting with a keyframe', () => {
    expect(isMp4(stream)).toBe(false)
    const { frames } = parseAnnexB(stream)
    expect(frames).toHaveLength(50)
    expect(frames[0].keyframe).toBe(true)
    // ffmpeg's default x264 settings use B-frames, so decode and presentation order differ.
    expect(frames.map((f) => f.poc)).not.toEqual([...frames.map((f) => f.poc)].sort((a, b) => a - b))
  })

  it.skipIf(!hasFfmpeg)('becomes an MP4 that ffmpeg decodes completely', async () => {
    const blob = await h264ToMp4(stream, 160, 120, 25)
    const path = join(mkdtempSync(join(tmpdir(), 'dicomlens-')), 'out.mp4')
    writeFileSync(path, new Uint8Array(await blob.arrayBuffer()))
    const probe = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries', 'stream=codec_name,nb_read_frames,width', '-of', 'csv=p=0', path])
      .toString()
      .trim()
    expect(probe).toBe('h264,160,50')
    // Decoding must not report errors (e.g. frames out of order).
    const log = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString()
    expect(log).toBe('')
  })
})
