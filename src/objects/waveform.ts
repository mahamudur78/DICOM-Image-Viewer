// Waveforms (ECG, pressures, audio): channels of samples in physical units.
import { bytesOf, codeOf, decodedText, firstItem, items, number, text, type DataSet } from './dicom'

export interface Channel {
  label: string
  /** UCUM unit code, e.g. "uV", "mm[Hg]". */
  unit: string
  /** Values in the unit. */
  values: Float32Array
}

export interface WaveformGroup {
  label?: string
  /** Samples per second. */
  rate: number
  channels: Channel[]
}

/** G.711 µ-law byte to a 16-bit sample. */
export function muLaw(byte: number) {
  const u = ~byte & 0xff
  const t = (((u & 0x0f) << 3) + 0x84) << ((u & 0x70) >> 4)
  return u & 0x80 ? 0x84 - t : t - 0x84
}

/** G.711 A-law byte to a 16-bit sample. */
export function aLaw(byte: number) {
  const a = byte ^ 0x55
  let t = (a & 0x0f) << 4
  const segment = (a & 0x70) >> 4
  if (segment === 0) t += 8
  else if (segment === 1) t += 0x108
  else t = (t + 0x108) << (segment - 1)
  return a & 0x80 ? t : -t
}

function readSamples(bytes: Uint8Array, bits: number, interpretation: string, count: number): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    if (bits === 8) {
      const b = bytes[i] ?? 0
      out[i] = interpretation === 'MB' ? muLaw(b) : interpretation === 'AB' ? aLaw(b) : interpretation === 'SB' ? (b << 24) >> 24 : b
    } else if (bits === 32) out[i] = interpretation === 'SL' ? view.getInt32(i * 4, true) : view.getUint32(i * 4, true)
    else out[i] = i * 2 + 1 < bytes.length ? (interpretation === 'SS' ? view.getInt16(i * 2, true) : view.getUint16(i * 2, true)) : 0
  }
  return out
}

export function parseWaveform(dataSet: DataSet): WaveformGroup[] {
  return items(dataSet, 'x54000100').flatMap((group): WaveformGroup[] => {
    const channelCount = group.uint16('x003a0005') ?? 0
    const samples = group.uint32('x003a0010') ?? 0
    const rate = number(group, 'x003a001a') ?? 0
    const data = bytesOf(group, 'x54001010')
    if (!channelCount || !samples || !rate || !data) return []
    const raw = readSamples(data, group.uint16('x54001004') ?? 16, text(group, 'x54001006') ?? 'SS', channelCount * samples)
    const definitions = items(group, 'x003a0200')
    const channels = Array.from({ length: channelCount }, (_, c): Channel => {
      const definition = definitions[c]
      const source = codeOf(firstItem(definition, 'x003a0208'))
      const sensitivity = (definition && number(definition, 'x003a0210')) ?? 1
      const correction = (definition && number(definition, 'x003a0212')) ?? 1
      const baseline = (definition && number(definition, 'x003a0213')) ?? 0
      const values = new Float32Array(samples)
      for (let n = 0; n < samples; n++) values[n] = (raw[n * channelCount + c] + baseline) * sensitivity * correction
      return {
        label: (definition && decodedText(definition, 'x003a0203')) ?? source?.meaning?.replace(/^Lead /, '') ?? `Channel ${c + 1}`,
        unit: codeOf(firstItem(definition, 'x003a0211'))?.value ?? '',
        values,
      }
    })
    return [{ label: text(group, 'x003a0020'), rate, channels }]
  })
}

/** Values of a channel in millivolts (ECG units may be µV or mV). */
export function toMillivolts(channel: Channel): Float32Array {
  const factor = channel.unit === 'uV' ? 0.001 : channel.unit === 'V' ? 1000 : 1
  return factor === 1 ? channel.values : channel.values.map((v) => v * factor)
}

/** Heart rate (bpm) from the time between two caliper points. */
export const heartRate = (seconds: number) => (seconds > 0 ? 60 / seconds : NaN)

/** The standard 12-lead order (with the usual labels). */
export const TWELVE_LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']

/** The channels in 12-lead order when all are there, else as stored. */
export function orderLeads(channels: Channel[]) {
  const byLabel = new Map(channels.map((c) => [c.label.replace(/^Lead\s*/i, '').toUpperCase(), c]))
  const ordered = TWELVE_LEADS.map((lead) => byLabel.get(lead.toUpperCase()))
  return ordered.every(Boolean) ? (ordered as Channel[]) : null
}
