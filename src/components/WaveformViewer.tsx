import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { DisplaySet } from '../dicom/types'
import { readObject } from '../objects/dicom'
import { heartRate, orderLeads, parseWaveform, toMillivolts, type Channel, type WaveformGroup } from '../objects/waveform'
import { ViewportFrame } from './ViewportFrame'

interface Props {
  viewportId: string
  cell: number
  displaySet: DisplaySet
  active: boolean
  onActivate: () => void
  onToggleMaximize: () => void
}

const SELECT = 'rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-xs text-slate-200'

/** ECG, other waveforms (one row per channel) and audio. */
export default function WaveformViewer({ viewportId, displaySet, active, onActivate, onToggleMaximize }: Props) {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<WaveformGroup[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const file = displaySet.series.images[0].file

  useEffect(() => {
    let cancelled = false
    readObject(file)
      .then((dataSet) => !cancelled && setGroups(parseWaveform(dataSet)))
      .catch((reason: unknown) => !cancelled && setError(String(reason)))
    return () => {
      cancelled = true
    }
  }, [file])

  const group = groups?.[0]
  const audio = displaySet.series.modality === 'AU' || (group?.rate ?? 0) >= 4000
  return (
    <ViewportFrame viewportId={viewportId} kind="document" active={active} onActivate={onActivate} onToggleMaximize={onToggleMaximize}>
      <div className="flex min-h-0 flex-1 flex-col bg-slate-900 text-sm text-slate-200" data-testid="waveform-viewer">
        {error && <p className="p-4 text-red-300">{t('objects.failed', { error })}</p>}
        {groups && !group && <p className="p-4 text-slate-400">{t('waveform.empty')}</p>}
        {group && (audio ? <AudioPlayer group={group} /> : <Traces group={group} ecg={displaySet.series.modality === 'ECG'} />)}
      </div>
    </ViewportFrame>
  )
}

// --- traces ---------------------------------------------------------------------------------

interface Row {
  channel: Channel
  /** Seconds shown, from `start`. */
  start: number
  duration: number
  x: number
  y: number
}

const ROW_HEIGHT = 30

/** 12-lead layout: four columns of 2.5 s (I–III, aVR–aVF, V1–V3, V4–V6) and a rhythm strip of lead II. */
function twelveLeadRows(leads: Channel[], seconds: number, speed: number): Row[] {
  const column = Math.min(2.5, seconds / 4)
  const rows: Row[] = []
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 3; r++) rows.push({ channel: leads[c * 3 + r], start: c * column, duration: column, x: c * column * speed, y: r * ROW_HEIGHT })
  rows.push({ channel: leads[1], start: 0, duration: Math.min(seconds, column * 4), x: 0, y: 3 * ROW_HEIGHT })
  return rows
}

function Traces({ group, ecg }: { group: WaveformGroup; ecg: boolean }) {
  const { t } = useTranslation()
  const [speed, setSpeed] = useState(25)
  const [gain, setGain] = useState(10)
  const [caliper, setCaliper] = useState<{ points: [number, number][]; row: Row | null }>({ points: [], row: null })
  const svgRef = useRef<SVGSVGElement>(null)
  const seconds = (group.channels[0]?.values.length ?? 0) / group.rate
  const leads = ecg ? orderLeads(group.channels) : null
  const rows = useMemo(
    () => (leads ? twelveLeadRows(leads, seconds, speed) : group.channels.map((channel, i) => ({ channel, start: 0, duration: seconds, x: 0, y: i * ROW_HEIGHT }))),
    [leads, seconds, speed, group.channels],
  )
  const width = Math.max(...rows.map((r) => r.x + r.duration * speed))
  const height = (Math.max(...rows.map((r) => r.y)) + ROW_HEIGHT) | 0
  // Non-ECG channels are scaled to fill their row; ECG uses mm per mV.
  const scales = useMemo(
    () =>
      rows.map((row) => {
        if (ecg) return { mid: 0, perUnit: gain }
        let [min, max] = [Infinity, -Infinity]
        for (const v of row.channel.values) [min, max] = [Math.min(min, v), Math.max(max, v)]
        return { mid: (min + max) / 2, perUnit: (ROW_HEIGHT * 0.8) / Math.max(1e-9, max - min) }
      }),
    [rows, ecg, gain],
  )

  const path = (row: Row, n: number) => {
    const values = ecg ? toMillivolts(row.channel) : row.channel.values
    const from = Math.floor(row.start * group.rate)
    const to = Math.min(values.length, Math.floor((row.start + row.duration) * group.rate))
    const step = Math.max(1, Math.floor((to - from) / 4000))
    const { mid, perUnit } = scales[n]
    let d = ''
    for (let i = from; i < to; i += step) {
      const x = row.x + ((i - from) / group.rate) * speed
      const y = row.y + ROW_HEIGHT / 2 - (values[i] - mid) * perUnit
      d += `${i === from ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    }
    return d
  }

  const toMm = (event: PointerEvent<SVGSVGElement>): [number, number] => {
    const matrix = svgRef.current!.getScreenCTM()!.inverse()
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix)
    return [point.x, point.y]
  }
  const onClick = (event: PointerEvent<SVGSVGElement>) => {
    const point = toMm(event)
    const row = rows.find((r) => point[1] >= r.y && point[1] < r.y + ROW_HEIGHT && point[0] >= r.x && point[0] <= r.x + r.duration * speed) ?? null
    setCaliper((c) => (c.points.length === 1 ? { points: [c.points[0], point], row: c.row } : { points: [point], row }))
  }
  const measured = (() => {
    if (caliper.points.length < 2 || !caliper.row) return null
    const [a, b] = caliper.points
    const ms = (Math.abs(b[0] - a[0]) / speed) * 1000
    const n = rows.indexOf(caliper.row)
    const amplitude = Math.abs(b[1] - a[1]) / (scales[n]?.perUnit ?? gain)
    return { ms, amplitude, unit: ecg ? 'mV' : caliper.row.channel.unit, rate: heartRate(ms / 1000) }
  })()

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-3 py-1.5 text-xs">
        <span className="text-slate-400">{t('waveform.info', { rate: group.rate, channels: group.channels.length, seconds: Math.round(seconds * 10) / 10 })}</span>
        <label className="flex items-center gap-1">
          {t('waveform.speed')}
          <select aria-label={t('waveform.speed')} className={SELECT} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {[12.5, 25, 50].map((s) => (
              <option key={s} value={s}>
                {s} mm/s
              </option>
            ))}
          </select>
        </label>
        {ecg && (
          <label className="flex items-center gap-1">
            {t('waveform.gain')}
            <select aria-label={t('waveform.gain')} className={SELECT} value={gain} onChange={(e) => setGain(Number(e.target.value))}>
              {[5, 10, 20].map((g) => (
                <option key={g} value={g}>
                  {g} mm/mV
                </option>
              ))}
            </select>
          </label>
        )}
        <span data-testid="caliper" className="text-amber-300">
          {measured
            ? t('waveform.caliper', { ms: Math.round(measured.ms), amplitude: Math.round(measured.amplitude * 100) / 100, unit: measured.unit, rate: Math.round(measured.rate) })
            : t('waveform.caliperHint')}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: `${width * 4}px`, maxWidth: 'none' }}
          className="block cursor-crosshair"
          onPointerDown={onClick}
          data-testid="waveform-traces"
        >
          <defs>
            <pattern id="ecg-small" width="1" height="1" patternUnits="userSpaceOnUse">
              <path d="M1,0V1H0" fill="none" stroke="#fbcfe8" strokeWidth="0.05" />
            </pattern>
            <pattern id="ecg-grid" width="5" height="5" patternUnits="userSpaceOnUse">
              <rect width="5" height="5" fill="url(#ecg-small)" />
              <path d="M5,0V5H0" fill="none" stroke="#f9a8d4" strokeWidth="0.12" />
            </pattern>
          </defs>
          <rect width={width} height={height} fill="url(#ecg-grid)" />
          {rows.map((row, n) => (
            <g key={n}>
              <path d={path(row, n)} fill="none" stroke="#111827" strokeWidth="0.25" strokeLinejoin="round" />
              <text x={row.x + 1} y={row.y + 4} fontSize="3" fill="#1e3a8a">
                {row.channel.label}
              </text>
            </g>
          ))}
          {caliper.points.map((p, i) => (
            <line key={i} x1={p[0]} x2={p[0]} y1={0} y2={height} stroke="#2563eb" strokeWidth="0.3" />
          ))}
        </svg>
      </div>
    </>
  )
}

// --- audio -------------------------------------------------------------------------------------

function AudioPlayer({ group }: { group: WaveformGroup }) {
  const { t } = useTranslation()
  const [playing, setPlaying] = useState(false)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const seconds = (group.channels[0]?.values.length ?? 0) / group.rate

  useEffect(() => () => {
    sourceRef.current?.stop()
    void contextRef.current?.close()
  }, [])

  const play = () => {
    if (playing) {
      sourceRef.current?.stop()
      return
    }
    const context = (contextRef.current ??= new AudioContext())
    const channels = group.channels.slice(0, 2)
    const buffer = context.createBuffer(channels.length, channels[0].values.length, group.rate)
    channels.forEach((channel, c) => {
      let peak = 1
      for (const v of channel.values) peak = Math.max(peak, Math.abs(v))
      // 16-bit audio is scaled by its full range; quieter files keep their level.
      const scale = Math.max(peak, 32768)
      buffer.copyToChannel(Float32Array.from(channel.values, (v) => v / scale), c)
    })
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    source.onended = () => setPlaying(false)
    source.start()
    sourceRef.current = source
    setPlaying(true)
  }

  const values = group.channels[0].values
  const bars = 200
  const step = Math.max(1, Math.floor(values.length / bars))
  let peak = 1
  for (const v of values) peak = Math.max(peak, Math.abs(v))
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4" data-testid="audio-player">
      <svg viewBox={`0 0 ${bars} 40`} className="h-24 w-full max-w-xl">
        {Array.from({ length: bars }, (_, i) => {
          let max = 0
          for (let n = i * step; n < Math.min(values.length, (i + 1) * step); n++) max = Math.max(max, Math.abs(values[n]))
          const h = Math.max(0.5, (max / peak) * 38)
          return <rect key={i} x={i} y={20 - h / 2} width={0.7} height={h} fill="#38bdf8" />
        })}
      </svg>
      <button className="rounded bg-sky-600 px-4 py-1.5 text-white hover:bg-sky-500" onClick={play}>
        {playing ? t('waveform.stop') : t('waveform.play')}
      </button>
      <p className="text-xs text-slate-400" data-testid="audio-state">
        {t('waveform.audioInfo', { seconds: Math.round(seconds * 10) / 10, rate: group.rate })} · {playing ? t('waveform.playing') : t('waveform.stopped')}
      </p>
    </div>
  )
}
