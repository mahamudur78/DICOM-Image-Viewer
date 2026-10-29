// H.264 Annex-B (start-code) streams, as DICOM stores them, prepared for MP4:
// NAL units are split, grouped into frames (access units), converted to
// length-prefixed form, and given presentation times from the picture order
// count so streams with B-frames play in the right order.

export interface NalUnit {
  type: number
  data: Uint8Array
}

export interface AccessUnit {
  /** Length-prefixed (AVCC) NAL units of one frame, without SPS/PPS/AUD. */
  data: Uint8Array
  keyframe: boolean
  /** Presentation order within its group of pictures (from the picture order count). */
  poc: number
}

export interface H264Stream {
  sps: Uint8Array
  pps: Uint8Array
  frames: AccessUnit[]
}

const NAL = { slice: 1, idr: 5, sei: 6, sps: 7, pps: 8, aud: 9 }

/** Splits an Annex-B byte stream at 00 00 01 / 00 00 00 01 start codes. */
export function splitNalUnits(stream: Uint8Array): NalUnit[] {
  const starts: number[] = []
  for (let i = 0; i + 2 < stream.length; i++) {
    if (stream[i] === 0 && stream[i + 1] === 0 && stream[i + 2] === 1) {
      starts.push(i + 3)
      i += 2
    }
  }
  return starts.map((start, n) => {
    let end = n + 1 < starts.length ? starts[n + 1] - 3 : stream.length
    while (end > start && stream[end - 1] === 0) end-- // trailing zeros / 4-byte start code
    const data = stream.subarray(start, end)
    return { type: data[0] & 0x1f, data }
  })
}

/** Reads bits from a NAL payload, skipping emulation prevention bytes (00 00 03). */
class BitReader {
  private bytes: Uint8Array
  private position = 0

  constructor(nal: Uint8Array) {
    const out: number[] = []
    for (let i = 1; i < nal.length; i++) {
      if (i >= 3 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0) continue
      out.push(nal[i])
    }
    this.bytes = Uint8Array.from(out)
  }

  bit() {
    const byte = this.bytes[this.position >> 3] ?? 0
    const value = (byte >> (7 - (this.position & 7))) & 1
    this.position++
    return value
  }

  bits(count: number) {
    let value = 0
    for (let i = 0; i < count; i++) value = value * 2 + this.bit()
    return value
  }

  /** Unsigned Exp-Golomb. */
  ue() {
    let zeros = 0
    while (this.bit() === 0 && zeros < 32) zeros++
    return 2 ** zeros - 1 + this.bits(zeros)
  }

  se() {
    const value = this.ue()
    return value % 2 ? (value + 1) / 2 : -value / 2
  }
}

export interface SpsInfo {
  profile: number
  compatibility: number
  level: number
  separateColourPlane: boolean
  log2MaxFrameNum: number
  pocType: number
  log2MaxPocLsb: number
  frameMbsOnly: boolean
}

function skipScalingList(reader: BitReader, size: number) {
  let last = 8
  let next = 8
  for (let i = 0; i < size; i++) {
    if (next !== 0) next = (last + reader.se() + 256) % 256
    last = next === 0 ? last : next
  }
}

/** The SPS fields needed to read slice headers (ITU-T H.264 7.3.2.1). */
export function parseSps(sps: Uint8Array): SpsInfo {
  const reader = new BitReader(sps)
  const profile = reader.bits(8)
  const compatibility = reader.bits(8)
  const level = reader.bits(8)
  reader.ue() // seq_parameter_set_id
  let separateColourPlane = false
  if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(profile)) {
    const chromaFormat = reader.ue()
    if (chromaFormat === 3) separateColourPlane = reader.bit() === 1
    reader.ue() // bit_depth_luma_minus8
    reader.ue() // bit_depth_chroma_minus8
    reader.bit() // qpprime_y_zero_transform_bypass_flag
    if (reader.bit()) {
      for (let i = 0; i < (chromaFormat === 3 ? 12 : 8); i++) if (reader.bit()) skipScalingList(reader, i < 6 ? 16 : 64)
    }
  }
  const log2MaxFrameNum = reader.ue() + 4
  const pocType = reader.ue()
  let log2MaxPocLsb = 0
  if (pocType === 0) log2MaxPocLsb = reader.ue() + 4
  else if (pocType === 1) {
    reader.bit() // delta_pic_order_always_zero_flag
    reader.se()
    reader.se()
    const cycle = reader.ue()
    for (let i = 0; i < cycle; i++) reader.se()
  }
  reader.ue() // max_num_ref_frames
  reader.bit() // gaps_in_frame_num_value_allowed_flag
  reader.ue() // pic_width_in_mbs_minus1
  reader.ue() // pic_height_in_map_units_minus1
  const frameMbsOnly = reader.bit() === 1
  return { profile, compatibility, level, separateColourPlane, log2MaxFrameNum, pocType, log2MaxPocLsb, frameMbsOnly }
}

/** first_mb_in_slice and pic_order_cnt_lsb of a slice header (7.3.3). */
function readSliceHeader(nal: NalUnit, sps: SpsInfo) {
  const reader = new BitReader(nal.data)
  const firstMb = reader.ue()
  reader.ue() // slice_type
  reader.ue() // pic_parameter_set_id
  if (sps.separateColourPlane) reader.bits(2)
  reader.bits(sps.log2MaxFrameNum) // frame_num
  if (!sps.frameMbsOnly && reader.bit()) reader.bit() // field_pic_flag, bottom_field_flag
  if (nal.type === NAL.idr) reader.ue() // idr_pic_id
  const pocLsb = sps.pocType === 0 ? reader.bits(sps.log2MaxPocLsb) : 0
  return { firstMb, pocLsb }
}

const lengthPrefixed = (units: NalUnit[]) => {
  const out = new Uint8Array(units.reduce((sum, unit) => sum + 4 + unit.data.length, 0))
  const view = new DataView(out.buffer)
  let offset = 0
  for (const unit of units) {
    view.setUint32(offset, unit.data.length)
    out.set(unit.data, offset + 4)
    offset += 4 + unit.data.length
  }
  return out
}

/** Groups an Annex-B stream into frames with picture order counts. */
export function parseAnnexB(stream: Uint8Array): H264Stream {
  const units = splitNalUnits(stream)
  const spsUnit = units.find((unit) => unit.type === NAL.sps)
  const ppsUnit = units.find((unit) => unit.type === NAL.pps)
  if (!spsUnit || !ppsUnit) throw new Error('H.264 stream without SPS/PPS')
  const sps = parseSps(spsUnit.data)

  const frames: AccessUnit[] = []
  let pending: NalUnit[] = [] // SEI etc. waiting for their frame
  let current: { units: NalUnit[]; keyframe: boolean; pocLsb: number } | null = null
  let pocMsb = 0
  let previousLsb = 0
  const maxLsb = 2 ** sps.log2MaxPocLsb

  const finish = () => {
    if (!current) return
    let poc = frames.length // POC types 1 and 2: output order is decode order
    if (sps.pocType === 0) {
      // 8.2.1.1: extend the wrapping LSB to a full count; IDR frames restart it.
      if (current.keyframe) pocMsb = 0
      else if (current.pocLsb < previousLsb && previousLsb - current.pocLsb >= maxLsb / 2) pocMsb += maxLsb
      else if (current.pocLsb > previousLsb && current.pocLsb - previousLsb > maxLsb / 2) pocMsb -= maxLsb
      previousLsb = current.pocLsb
      poc = pocMsb + current.pocLsb
    }
    frames.push({ data: lengthPrefixed(current.units), keyframe: current.keyframe, poc })
    current = null
  }

  for (const unit of units) {
    if (unit.type === NAL.slice || unit.type === NAL.idr) {
      const { firstMb, pocLsb } = readSliceHeader(unit, sps)
      if (firstMb === 0 || !current) {
        finish()
        current = { units: [...pending], keyframe: unit.type === NAL.idr, pocLsb }
        pending = []
      }
      current.units.push(unit)
    } else if (unit.type === NAL.aud) {
      finish()
    } else if (unit.type !== NAL.sps && unit.type !== NAL.pps) {
      pending.push(unit)
    }
  }
  finish()
  return { sps: spsUnit.data, pps: ppsUnit.data, frames }
}

/** avcC box contents (ISO/IEC 14496-15) for one SPS and PPS. */
export function avcDecoderConfig(sps: Uint8Array, pps: Uint8Array) {
  const out = new Uint8Array(11 + sps.length + pps.length)
  out.set([1, sps[1], sps[2], sps[3], 0xff, 0xe1, sps.length >> 8, sps.length & 0xff])
  out.set(sps, 8)
  out.set([1, pps.length >> 8, pps.length & 0xff], 8 + sps.length)
  out.set(pps, 11 + sps.length)
  return out
}

export const avcCodecString = (sps: Uint8Array) =>
  `avc1.${[sps[1], sps[2], sps[3]].map((b) => b.toString(16).padStart(2, '0')).join('')}`

/**
 * Presentation slot of each frame (in decode order). Frames are ranked by
 * picture order count within each group of pictures (IDR to IDR), and all
 * slots are shifted by the largest reordering delay so that presentation
 * never comes before decoding.
 */
export function presentationSlots(frames: Pick<AccessUnit, 'keyframe' | 'poc'>[]): { slots: number[]; delay: number } {
  const slots = new Array<number>(frames.length)
  let start = 0
  for (let i = 1; i <= frames.length; i++) {
    if (i === frames.length || frames[i].keyframe) {
      const group = frames.slice(start, i).map((frame, j) => ({ poc: frame.poc, index: start + j }))
      group.sort((a, b) => a.poc - b.poc).forEach(({ index }, rank) => (slots[index] = start + rank))
      start = i
    }
  }
  const delay = Math.max(0, ...slots.map((slot, i) => i - slot))
  return { slots: slots.map((slot) => slot + delay), delay }
}
