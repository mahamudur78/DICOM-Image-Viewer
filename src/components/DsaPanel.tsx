import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { bestMask } from '../functional/dsa'
import { addDsaSeries, frameSettings, loadFrames, subtractFrame, type DsaOptions, type Frames } from '../functional/dsaSeries'
import type { DisplaySet } from '../dicom/types'
import { notify } from '../notifications/toastStore'
import { selectActiveDisplaySet, useViewer } from '../store/viewerStore'

const BUTTON = 'rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40'
const INPUT = 'rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-xs text-slate-200 w-16'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
      <span className="shrink-0">{label}</span>
      {children}
    </label>
  )
}

const INITIAL: DsaOptions = { mask: 0, ranges: [], autoShift: false, shift: { dx: 0, dy: 0 }, landmark: 0 }

/** Digital subtraction of an angiography run: masks, pixel shift, landmark, and a new DSA series. */
export function DsaPanel() {
  const { t } = useTranslation()
  const displaySet = useViewer(selectActiveDisplaySet)
  if (!displaySet || displaySet.series.images.length < 2) return <p className="p-3 text-sm text-slate-500">{t('dsa.needFrames')}</p>
  // A fresh state for each series.
  return <DsaRun key={displaySet.series.id} displaySet={displaySet} />
}

function DsaRun({ displaySet }: { displaySet: DisplaySet }) {
  const { t } = useTranslation()
  const frameIndex = useViewer((s) => s.cellIndexes[s.activeCell] ?? 0)
  const [frames, setFrames] = useState<Frames | null>(null)
  const [failed, setFailed] = useState(false)
  const [options, setOptions] = useState(INITIAL)
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const set = (change: Partial<DsaOptions>) => setOptions((o) => ({ ...o, ...change }))
  const count = displaySet.series.images.length

  useEffect(() => {
    let cancelled = false
    void loadFrames(displaySet).then((loaded) => {
      if (cancelled) return
      setFrames(loaded)
      setFailed(!loaded)
    })
    return () => {
      cancelled = true
    }
  }, [displaySet])

  const frame = Math.min(frameIndex, Math.max(0, count - 1))
  const current = frames ? frameSettings(frames, frame, options) : null

  useEffect(() => {
    const canvas = canvasRef.current
    if (!frames || !canvas) return
    const values = subtractFrame(frames, frame, options)
    let extent = 1
    for (const v of values) extent = Math.max(extent, Math.abs(v))
    canvas.width = frames.width
    canvas.height = frames.height
    const context = canvas.getContext('2d')!
    const image = context.createImageData(frames.width, frames.height)
    for (let i = 0; i < values.length; i++) {
      const g = 128 + (values[i] / extent) * 127
      image.data.set([g, g, g, 255], i * 4)
    }
    context.putImageData(image, 0, 0)
  }, [frames, frame, options])

  if (failed) return <p className="p-3 text-sm text-slate-500">{t('dsa.unsupported')}</p>
  if (!frames) return <p className="p-3 text-sm text-slate-500">{t('dsa.loading')}</p>

  const frameInput = (value: number, change: (n: number) => void, label: string) => (
    <input aria-label={label} type="number" min={1} max={count} value={value + 1} onChange={(e) => change(Math.max(0, Math.min(count - 1, Number(e.target.value) - 1)))} className={INPUT} />
  )

  return (
    <div className="h-full space-y-2 overflow-y-auto p-3 text-sm" data-testid="dsa-panel">
      <canvas ref={canvasRef} className="w-full rounded bg-black [image-rendering:pixelated]" data-testid="dsa-preview" />
      <p className="text-xs text-slate-400" data-testid="dsa-status">
        {t('dsa.status', { frame: frame + 1, count, mask: (current?.mask ?? 0) + 1, dx: current?.shift.dx ?? 0, dy: current?.shift.dy ?? 0 })}
      </p>
      <Row label={t('dsa.mask')}>{frameInput(options.mask, (mask) => set({ mask }), t('dsa.mask'))}</Row>
      <div className="flex flex-wrap gap-1">
        <button className={BUTTON} onClick={() => set({ mask: frame })}>
          {t('dsa.maskHere')}
        </button>
        <button
          className={BUTTON}
          onClick={() => {
            // Magic mask: of the frames before this one, the one most like it.
            const candidates = frames.values.slice(0, Math.max(1, frame))
            set({ mask: bestMask(frames.values[frame], candidates, frames.width, frames.height) })
          }}
        >
          {t('dsa.magicMask')}
        </button>
        <button className={BUTTON} disabled={frame === 0} onClick={() => set({ ranges: [...options.ranges.filter((r) => r.from !== frame), { from: frame, mask: frame }] })}>
          {t('dsa.splitHere')}
        </button>
      </div>
      {options.ranges.length > 0 && (
        <ul className="text-xs text-slate-400">
          {[...options.ranges]
            .sort((a, b) => a.from - b.from)
            .map((r) => (
              <li key={r.from} className="flex items-center justify-between">
                {t('dsa.splitRange', { from: r.from + 1, mask: r.mask + 1 })}
                <button className={BUTTON} onClick={() => set({ ranges: options.ranges.filter((x) => x !== r) })} aria-label={t('dsa.removeSplit')}>
                  ✕
                </button>
              </li>
            ))}
        </ul>
      )}
      <label className="flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={options.autoShift} onChange={(e) => set({ autoShift: e.target.checked })} />
        {t('dsa.autoShift')}
      </label>
      {!options.autoShift &&
        (['dx', 'dy'] as const).map((axis) => (
          <Row key={axis} label={t(`dsa.${axis}`)}>
            <input
              aria-label={t(`dsa.${axis}`)}
              type="range"
              min={-20}
              max={20}
              step={1}
              value={options.shift[axis]}
              onChange={(e) => set({ shift: { ...options.shift, [axis]: Number(e.target.value) } })}
            />
          </Row>
        ))}
      <Row label={t('dsa.landmark', { percent: Math.round(options.landmark * 100) })}>
        <input aria-label={t('dsa.landmarkLabel')} type="range" min={0} max={1} step={0.05} value={options.landmark} onChange={(e) => set({ landmark: Number(e.target.value) })} />
      </Row>
      <button
        className={BUTTON}
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await addDsaSeries(displaySet, frames, options)
            notify(t('dsa.added'), 'success')
          } finally {
            setBusy(false)
          }
        }}
      >
        {t('dsa.create')}
      </button>
    </div>
  )
}
