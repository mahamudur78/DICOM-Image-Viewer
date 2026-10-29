import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useCursor3D } from '../comparison/cursor3d'
import { MPR_VR_VIEWPORT_ID, VR_VIEWPORT_ID } from '../cornerstone/constants'
import { useCpr } from '../cornerstone/mprTools'
import {
  FULL_BOX,
  getLighting,
  getTransferFunction,
  hideSurface,
  leaveEndoscopy,
  restoreSnapshot,
  setBlend,
  setEndoscopyCamera,
  setLighting,
  setTransferFunction,
  setVrMode,
  showSurface,
  surfaceMesh,
  takeSnapshot,
  undoCut,
  updateViewSettings,
  useVr3d,
  viewSettings,
  volumeGrid,
  vrViewport,
  type Blend,
} from '../cornerstone/volume3dTools'
import { useViewportRegistry } from '../cornerstone/viewportRegistry'
import { downloadBlob, stamp } from '../export/files'
import type { MovieFormat } from '../export/exportImages'
import { notify } from '../notifications/toastStore'
import { useSettings } from '../store/settingsStore'
import { indexToWorld, resampleCurve } from '../volume/grid'
import { encodeObj, encodePly, encodeStl } from '../volume/mesh'
import { ENDOSCOPY_FUNCTION, parsePreset, sortByValue, toPresetStrings, visibleFrom, type ColorPoint, type Lighting, type OpacityPoint, type TransferFunction } from '../volume/transferFunction'

const BUTTON = 'rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40'
const INPUT = 'rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-xs text-slate-200'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2 border-b border-slate-800 p-3">
      <h3 className="text-xs font-semibold text-slate-400">{title}</h3>
      {children}
    </section>
  )
}

function Slider({ label, value, min, max, step = 0.01, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-300">
      <span className="w-24 shrink-0">{label}</span>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1" />
      <span className="w-10 text-right tabular-nums text-slate-500">{Math.round(value * 100) / 100}</span>
    </label>
  )
}

/** The 3D viewport the panel controls: the 3D view, or the 3D cell of MPR + 3D. */
function useVrTarget() {
  const kinds = useViewportRegistry((s) => s.kinds)
  if (kinds[VR_VIEWPORT_ID] === 'volume3d') return VR_VIEWPORT_ID
  if (kinds[MPR_VR_VIEWPORT_ID] === 'volume3d') return MPR_VR_VIEWPORT_ID
  return null
}

export function Volume3DPanel() {
  const { t } = useTranslation()
  const viewportId = useVrTarget()
  // The volume is attached a moment after the 3D view opens.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const check = () => setReady(Boolean(viewportId && vrViewport(viewportId)?.getActors().length))
    check()
    const timer = window.setInterval(check, 300)
    return () => window.clearInterval(timer)
  }, [viewportId])
  if (!viewportId || !ready) return <p className="p-3 text-sm text-slate-500">{t('vr.open3d')}</p>
  return <Panel key={viewportId} viewportId={viewportId} />
}

function Panel({ viewportId }: { viewportId: string }) {
  const { t } = useTranslation()
  return (
    <div className="h-full overflow-y-auto">
      <TransferFunctionEditor viewportId={viewportId} />
      <RenderSection viewportId={viewportId} />
      <CropSection viewportId={viewportId} />
      <ToolsSection viewportId={viewportId} />
      <SurfaceSection viewportId={viewportId} />
      <SnapshotSection viewportId={viewportId} />
      <EndoscopySection viewportId={viewportId} />
      <p className="p-3 text-xs text-slate-500">{t('vr.hint')}</p>
    </div>
  )
}

// --- transfer function -----------------------------------------------------------------------------

const WIDTH = 280
const HEIGHT = 110

function TransferFunctionEditor({ viewportId }: { viewportId: string }) {
  const { t } = useTranslation()
  const userPresets = useSettings((s) => s.vrPresets)
  const [tf, setTf] = useState<TransferFunction | null>(() => getTransferFunction(viewportId))
  const [selected, setSelected] = useState<{ kind: 'opacity' | 'color'; index: number } | null>(null)
  const [name, setName] = useState('')
  const dragging = useRef<number | null>(null)
  const range = useMemo(() => {
    const volumeId = vrViewport(viewportId)?.getActors()[0]?.referencedId
    const grid = volumeId ? volumeGrid(volumeId) : null
    if (!grid) return { min: -1024, max: 3071 }
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < grid.scalars.length; i += 7) {
      const v = grid.scalars[i]
      if (v < min) min = v
      if (v > max) max = v
    }
    return { min, max: max > min ? max : min + 1 }
  }, [viewportId])
  if (!tf) return null

  const x = (value: number) => ((value - range.min) / (range.max - range.min)) * WIDTH
  const valueAt = (px: number) => range.min + (Math.max(0, Math.min(WIDTH, px)) / WIDTH) * (range.max - range.min)
  const apply = (next: TransferFunction) => {
    setTf(next)
    setTransferFunction(viewportId, next)
  }
  const opacity = sortByValue(tf.opacity)
  const colors = sortByValue(tf.colors)
  const gradient = colors.map((c) => `rgb(${c.r * 255},${c.g * 255},${c.b * 255}) ${Math.max(0, Math.min(100, (x(c.value) / WIDTH) * 100))}%`).join(',')
  const local = (event: React.PointerEvent | React.MouseEvent) => {
    const rect = (event.currentTarget as Element).getBoundingClientRect()
    return [((event.clientX - rect.left) / rect.width) * WIDTH, ((event.clientY - rect.top) / rect.height) * HEIGHT]
  }
  const setOpacityPoint = (index: number, point: OpacityPoint) => apply({ ...tf, opacity: opacity.map((p, i) => (i === index ? point : p)) })
  const setColorPoint = (index: number, point: ColorPoint) => apply({ ...tf, colors: colors.map((p, i) => (i === index ? point : p)) })
  const selectedColor = selected?.kind === 'color' ? colors[selected.index] : null
  const hex = (c: ColorPoint) => `#${[c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`

  return (
    <Section title={t('vr.transferFunction')}>
      <svg
        role="img"
        aria-label={t('vr.opacityCurve')}
        data-testid="tf-editor"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none rounded bg-slate-950"
        onDoubleClick={(event) => {
          const [px, py] = local(event)
          apply({ ...tf, opacity: [...opacity, { value: valueAt(px), opacity: Math.max(0, Math.min(1, 1 - py / HEIGHT)) }] })
        }}
        onPointerMove={(event) => {
          if (dragging.current === null) return
          const [px, py] = local(event)
          setOpacityPoint(dragging.current, { value: valueAt(px), opacity: Math.max(0, Math.min(1, 1 - py / HEIGHT)) })
        }}
        onPointerUp={() => (dragging.current = null)}
      >
        <polyline points={opacity.map((p) => `${x(p.value)},${(1 - p.opacity) * HEIGHT}`).join(' ')} fill="none" stroke="#e2e8f0" strokeWidth={1.5} />
        {opacity.map((p, i) => (
          <circle
            key={i}
            data-testid="tf-point"
            cx={x(p.value)}
            cy={(1 - p.opacity) * HEIGHT}
            r={selected?.kind === 'opacity' && selected.index === i ? 6 : 4.5}
            fill={selected?.kind === 'opacity' && selected.index === i ? '#38bdf8' : '#f8fafc'}
            onPointerDown={(event) => {
              event.stopPropagation()
              ;(event.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(event.pointerId)
              dragging.current = i
              setSelected({ kind: 'opacity', index: i })
            }}
          />
        ))}
      </svg>
      <div
        role="img"
        aria-label={t('vr.colorBar')}
        className="relative h-4 rounded"
        style={{ background: `linear-gradient(to right, ${gradient})` }}
        onDoubleClick={(event) => {
          const [px] = local(event)
          apply({ ...tf, colors: [...colors, { value: valueAt(px), r: 1, g: 1, b: 1 }] })
        }}
      >
        {colors.map((c, i) => (
          <button
            key={i}
            aria-label={t('vr.colorPoint', { value: Math.round(c.value) })}
            className={`absolute top-0 h-4 w-2 -translate-x-1/2 border ${selected?.kind === 'color' && selected.index === i ? 'border-sky-400' : 'border-slate-900'}`}
            style={{ left: `${(x(c.value) / WIDTH) * 100}%`, background: hex(c) }}
            onClick={() => setSelected({ kind: 'color', index: i })}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1 text-xs text-slate-400">
        <span>{t('vr.range', { min: Math.round(range.min), max: Math.round(range.max) })}</span>
        {selectedColor && (
          <input aria-label={t('vr.pointColor')} type="color" value={hex(selectedColor)} onChange={(e) => {
            const v = e.target.value
            setColorPoint(selected!.index, { ...selectedColor, r: parseInt(v.slice(1, 3), 16) / 255, g: parseInt(v.slice(3, 5), 16) / 255, b: parseInt(v.slice(5, 7), 16) / 255 })
          }} />
        )}
        <button
          className={BUTTON}
          disabled={!selected || (selected.kind === 'opacity' ? opacity.length < 3 : colors.length < 3)}
          onClick={() => {
            if (!selected) return
            if (selected.kind === 'opacity') apply({ ...tf, opacity: opacity.filter((_, i) => i !== selected.index) })
            else apply({ ...tf, colors: colors.filter((_, i) => i !== selected.index) })
            setSelected(null)
          }}
        >
          {t('vr.removePoint')}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <input aria-label={t('vr.presetName')} placeholder={t('vr.presetName')} value={name} onChange={(e) => setName(e.target.value)} className={`${INPUT} flex-1`} />
        <button
          className={BUTTON}
          disabled={!name.trim()}
          onClick={() => {
            useSettings.getState().saveVrPreset({ name: name.trim(), ...toPresetStrings(tf) })
            setName('')
            notify(t('vr.presetSaved'), 'success')
          }}
        >
          {t('vr.savePreset')}
        </button>
        {userPresets.length > 0 && (
          <select aria-label={t('vr.myPresets')} value="" onChange={(e) => {
            const preset = userPresets.find((p) => p.name === e.target.value)
            if (preset) apply(parsePreset(preset))
          }} className={INPUT}>
            <option value="">{t('vr.myPresets')}</option>
            {userPresets.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </Section>
  )
}

// --- rendering ---------------------------------------------------------------------------------------

function RenderSection({ viewportId }: { viewportId: string }) {
  const { t } = useTranslation()
  const [lighting, setLight] = useState<Lighting | null>(() => getLighting(viewportId))
  const [blend, setBlendState] = useState<Blend>(() => viewSettings(viewportId).blend)
  const [saved, setSaved] = useState<TransferFunction | null>(null)
  const change = (next: Partial<Lighting>) => {
    const value = { ...lighting!, ...next }
    setLight(value)
    setLighting(viewportId, value)
  }
  return (
    <Section title={t('vr.rendering')}>
      <label className="flex items-center justify-between text-xs text-slate-300">
        {t('vr.blend')}
        <select
          aria-label={t('vr.blend')}
          value={blend}
          className={INPUT}
          onChange={(e) => {
            const next = e.target.value as Blend
            // Projections replace the transfer function; going back restores it.
            if (blend === 'composite' && next !== 'composite') setSaved(getTransferFunction(viewportId))
            const voi = { lower: -160, upper: 240 }
            setBlend(viewportId, next, voi)
            if (next === 'composite' && saved) setTransferFunction(viewportId, saved)
            setBlendState(next)
            updateViewSettings(viewportId, { blend: next })
          }}
        >
          <option value="composite">{t('vr.blendVr')}</option>
          <option value="mip">MIP</option>
          <option value="minip">MinIP</option>
        </select>
      </label>
      {lighting && (
        <>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={lighting.shade} onChange={(e) => change({ shade: e.target.checked })} />
            {t('vr.shade')}
          </label>
          <Slider label={t('vr.ambient')} value={lighting.ambient} min={0} max={1} onChange={(ambient) => change({ ambient })} />
          <Slider label={t('vr.diffuse')} value={lighting.diffuse} min={0} max={1} onChange={(diffuse) => change({ diffuse })} />
          <Slider label={t('vr.specular')} value={lighting.specular} min={0} max={1} onChange={(specular) => change({ specular })} />
          <Slider label={t('vr.specularPower')} value={lighting.specularPower} min={1} max={100} step={1} onChange={(specularPower) => change({ specularPower })} />
        </>
      )}
    </Section>
  )
}

// --- crop and clipping --------------------------------------------------------------------------------

const AXES = ['i', 'j', 'k'] as const
const PLANES = { axial: [0, 0, 1], sagittal: [1, 0, 0], coronal: [0, 1, 0] } as const

function CropSection({ viewportId }: { viewportId: string }) {
  const { t } = useTranslation()
  const settings = useVr3d((s) => s.views[viewportId]) ?? viewSettings(viewportId)
  const { box, plane } = settings
  const setBox = (n: number, side: 'min' | 'max', value: number) => {
    const next = { min: [...box.min] as [number, number, number], max: [...box.max] as [number, number, number] }
    next[side][n] = side === 'min' ? Math.min(value, next.max[n] - 0.02) : Math.max(value, next.min[n] + 0.02)
    updateViewSettings(viewportId, { box: next })
  }
  return (
    <Section title={t('vr.crop')}>
      {AXES.map((axis, n) => (
        <div key={axis} className="space-y-1">
          <Slider label={t(`vr.cropFrom.${axis}`)} value={box.min[n]} min={0} max={1} onChange={(v) => setBox(n, 'min', v)} />
          <Slider label={t(`vr.cropTo.${axis}`)} value={box.max[n]} min={0} max={1} onChange={(v) => setBox(n, 'max', v)} />
        </div>
      ))}
      <label className="flex items-center justify-between text-xs text-slate-300">
        {t('vr.clipPlane')}
        <select
          aria-label={t('vr.clipPlane')}
          className={INPUT}
          value={plane ? (Object.entries(PLANES).find(([, n]) => Math.abs(n[0]) === Math.abs(plane.normal[0]) && Math.abs(n[1]) === Math.abs(plane.normal[1]) && Math.abs(n[2]) === Math.abs(plane.normal[2]))?.[0] ?? 'view') : 'none'}
          onChange={(e) => {
            const value = e.target.value
            if (value === 'none') return updateViewSettings(viewportId, { plane: null })
            const normal =
              value === 'view'
                ? ((vrViewport(viewportId)!.getCamera().viewPlaneNormal as number[]).map((v) => -v) as [number, number, number])
                : ([...PLANES[value as keyof typeof PLANES]] as [number, number, number])
            updateViewSettings(viewportId, { plane: { normal, offset: 0 } })
          }}
        >
          <option value="none">{t('vr.clipNone')}</option>
          <option value="axial">{t('viewport.axial')}</option>
          <option value="sagittal">{t('viewport.sagittal')}</option>
          <option value="coronal">{t('viewport.coronal')}</option>
          <option value="view">{t('vr.clipView')}</option>
        </select>
      </label>
      {plane && (
        <div className="flex items-center gap-1">
          <Slider label={t('vr.clipOffset')} value={plane.offset} min={-200} max={200} step={1} onChange={(offset) => updateViewSettings(viewportId, { plane: { ...plane, offset } })} />
          <button className={BUTTON} onClick={() => updateViewSettings(viewportId, { plane: { normal: plane.normal.map((v) => -v) as [number, number, number], offset: -plane.offset } })}>
            {t('vr.clipFlip')}
          </button>
        </div>
      )}
      <button className={BUTTON} onClick={() => updateViewSettings(viewportId, { box: FULL_BOX, plane: null })}>
        {t('vr.cropReset')}
      </button>
    </Section>
  )
}

// --- scalpel, measuring, movies, large images ------------------------------------------------------------

function ToolsSection({ viewportId }: { viewportId: string }) {
  const { t } = useTranslation()
  const mode = useVr3d((s) => s.mode)
  const cuts = useVr3d((s) => s.cuts[viewportId] ?? 0)
  const snapshots = useVr3d((s) => s.snapshots)
  const [movie, setMovie] = useState({ axis: 'vertical' as 'vertical' | 'horizontal', frames: 36, fps: 12, format: 'webm' as MovieFormat })
  const [busy, setBusy] = useState(false)
  const run = async (job: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await job()
    } catch (error) {
      notify(t('export.failed', { error: error instanceof Error ? error.message : String(error) }), 'error')
    } finally {
      setBusy(false)
    }
  }
  const toggle = (next: typeof mode) => setVrMode(mode === next ? 'none' : next)
  return (
    <Section title={t('vr.tools')}>
      <div className="flex flex-wrap gap-1">
        <button className={BUTTON} aria-pressed={mode === 'cutInside'} onClick={() => toggle('cutInside')}>
          {t('vr.cutInside')}
        </button>
        <button className={BUTTON} aria-pressed={mode === 'cutOutside'} onClick={() => toggle('cutOutside')}>
          {t('vr.cutOutside')}
        </button>
        <button className={BUTTON} disabled={cuts === 0} onClick={() => undoCut(viewportId)}>
          {t('vr.undoCut', { count: cuts })}
        </button>
        <button className={BUTTON} aria-pressed={mode === 'measure'} onClick={() => toggle('measure')}>
          {t('vr.measure')}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1 text-xs text-slate-300">
        <select aria-label={t('vr.movieAxis')} className={INPUT} value={movie.axis} onChange={(e) => setMovie({ ...movie, axis: e.target.value as 'vertical' | 'horizontal' })}>
          <option value="vertical">{t('vr.axisVertical')}</option>
          <option value="horizontal">{t('vr.axisHorizontal')}</option>
        </select>
        <select aria-label={t('export.format')} className={INPUT} value={movie.format} onChange={(e) => setMovie({ ...movie, format: e.target.value as MovieFormat })}>
          {(['mp4', 'webm', 'gif', 'avi'] as const).map((f) => (
            <option key={f} value={f}>
              {f.toUpperCase()}
            </option>
          ))}
        </select>
        <input aria-label={t('vr.frames')} type="number" min={8} max={360} value={movie.frames} onChange={(e) => setMovie({ ...movie, frames: Math.max(8, Math.min(360, Number(e.target.value) || 36)) })} className={`${INPUT} w-14`} />
        <button className={BUTTON} disabled={busy} onClick={() => run(async () => (await import('../export/export3d')).rotationMovie(viewportId, movie.axis, movie.frames, movie.fps, movie.format, () => {}))}>
          {t('vr.rotationMovie')}
        </button>
        <button
          className={BUTTON}
          disabled={busy || snapshots.length < 2}
          onClick={() => run(async () => (await import('../export/export3d')).snapshotMovie(viewportId, snapshots, Math.max(4, Math.round(movie.frames / Math.max(1, snapshots.length - 1))), movie.fps, movie.format, () => {}))}
        >
          {t('vr.snapshotMovie')}
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {[2, 4].map((scale) => (
          <button
            key={scale}
            className={BUTTON}
            disabled={busy}
            onClick={() =>
              run(async () => {
                const size = await (await import('../export/export3d')).highResolutionPng(viewportId, scale)
                if (size) notify(t('vr.savedImage', size), 'success')
              })
            }
          >
            {t('vr.highRes', { scale })}
          </button>
        ))}
      </div>
    </Section>
  )
}

// --- surface ---------------------------------------------------------------------------------------------

function SurfaceSection({ viewportId }: { viewportId: string }) {
  const { t } = useTranslation()
  const [threshold, setThreshold] = useState(() => {
    const tf = getTransferFunction(viewportId)
    const from = tf ? visibleFrom(tf) : 300
    return Number.isFinite(from) ? Math.round(from) : 300
  })
  const [reduce, setReduce] = useState(1)
  const [color, setColor] = useState('#f1e6d2')
  const [stats, setStats] = useState<{ triangles: number; area: number; volume: number } | null>(null)
  const save = (kind: 'stl' | 'obj' | 'ply') => {
    const mesh = surfaceMesh(viewportId)
    if (!mesh) return
    const data = kind === 'stl' ? new Blob([encodeStl(mesh)], { type: 'model/stl' }) : new Blob([kind === 'obj' ? encodeObj(mesh) : encodePly(mesh)], { type: 'text/plain' })
    downloadBlob(data, `surface-${stamp()}.${kind}`)
  }
  return (
    <Section title={t('vr.surface')}>
      <div className="flex flex-wrap items-center gap-1 text-xs text-slate-300">
        <label className="flex items-center gap-1">
          {t('vr.threshold')}
          <input aria-label={t('vr.threshold')} type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className={`${INPUT} w-20`} />
        </label>
        <select aria-label={t('vr.reduce')} className={INPUT} value={reduce} onChange={(e) => setReduce(Number(e.target.value))}>
          <option value={1}>{t('vr.reduceFull')}</option>
          <option value={2}>{t('vr.reduceHalf')}</option>
          <option value={4}>{t('vr.reduceQuarter')}</option>
        </select>
        <input aria-label={t('vr.surfaceColor')} type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-1">
        <button
          className={BUTTON}
          onClick={() => {
            const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255) as [number, number, number]
            setStats(showSurface(viewportId, threshold, reduce, rgb))
          }}
        >
          {t('vr.showSurface')}
        </button>
        <button
          className={BUTTON}
          disabled={!stats}
          onClick={() => {
            hideSurface(viewportId)
            setStats(null)
          }}
        >
          {t('vr.hideSurface')}
        </button>
        {(['stl', 'obj', 'ply'] as const).map((kind) => (
          <button key={kind} className={BUTTON} disabled={!stats} onClick={() => save(kind)}>
            {kind.toUpperCase()}
          </button>
        ))}
      </div>
      {stats && (
        <p data-testid="surface-stats" className="text-xs text-slate-400">
          {t('vr.surfaceStats', { triangles: stats.triangles, area: (stats.area / 100).toFixed(1), volume: (stats.volume / 1000).toFixed(1) })}
        </p>
      )}
    </Section>
  )
}

// --- snapshots -----------------------------------------------------------------------------------------

function SnapshotSection({ viewportId }: { viewportId: string }) {
  const { t } = useTranslation()
  const snapshots = useVr3d((s) => s.snapshots)
  return (
    <Section title={t('vr.snapshots')}>
      <button className={BUTTON} onClick={() => takeSnapshot(viewportId, t('vr.snapshotName', { number: snapshots.length + 1 }))}>
        {t('vr.takeSnapshot')}
      </button>
      <ul className="space-y-1">
        {snapshots.map((snapshot) => (
          <li key={snapshot.id} className="flex items-center gap-1 text-xs text-slate-300">
            <span className="flex-1">{snapshot.name}</span>
            <button className={BUTTON} onClick={() => restoreSnapshot(viewportId, snapshot)}>
              {t('vr.restore')}
            </button>
            <button className={BUTTON} aria-label={t('vr.deleteSnapshot', { name: snapshot.name })} onClick={() => useVr3d.setState((s) => ({ snapshots: s.snapshots.filter((x) => x !== snapshot) }))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </Section>
  )
}

// --- endoscopy ------------------------------------------------------------------------------------------

function EndoscopySection({ viewportId }: { viewportId: string }) {
  const { t } = useTranslation()
  const centre = useCursor3D((s) => s.mprCenter)
  const path = useCpr((s) => s.points)
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)
  const [saved, setSaved] = useState<TransferFunction | null>(null)
  const route = useMemo(() => (path.length >= 2 ? resampleCurve(path, 2).points : []), [path])

  const enter = (position: number[], lookAt: number[]) => {
    if (!active) setSaved(getTransferFunction(viewportId))
    setTransferFunction(viewportId, ENDOSCOPY_FUNCTION)
    setEndoscopyCamera(viewportId, position, lookAt)
    setActive(true)
  }
  const volumeCentre = () => {
    const volumeId = vrViewport(viewportId)?.getActors()[0]?.referencedId
    const grid = volumeId ? volumeGrid(volumeId) : null
    return grid ? indexToWorld(grid, grid.dimensions.map((d) => (d - 1) / 2)) : [0, 0, 0]
  }
  const goTo = (index: number) => {
    const i = Math.max(0, Math.min(route.length - 2, index))
    setStep(i)
    enter(route[i], route[i + 1])
  }

  return (
    <Section title={t('vr.endoscopy')}>
      <div className="flex flex-wrap gap-1">
        <button
          className={BUTTON}
          onClick={() => {
            const at = centre ?? volumeCentre()
            enter(at, [at[0], at[1] - 10, at[2]])
          }}
        >
          {centre ? t('vr.enterAtCrosshair') : t('vr.enterAtCentre')}
        </button>
        <button className={BUTTON} disabled={route.length < 2} onClick={() => goTo(0)}>
          {t('vr.flyPath', { count: route.length })}
        </button>
        {active && route.length >= 2 && (
          <>
            <button className={BUTTON} aria-label={t('vr.back')} onClick={() => goTo(step - 1)}>
              ◀
            </button>
            <button className={BUTTON} aria-label={t('vr.forward')} onClick={() => goTo(step + 1)}>
              ▶
            </button>
            <button
              className={BUTTON}
              onClick={async () => {
                for (let i = step; i < route.length - 1; i++) {
                  goTo(i)
                  await new Promise((resolve) => setTimeout(resolve, 80))
                }
              }}
            >
              {t('vr.fly')}
            </button>
          </>
        )}
        <button
          className={BUTTON}
          disabled={!active}
          onClick={() => {
            leaveEndoscopy(viewportId)
            if (saved) setTransferFunction(viewportId, saved)
            setActive(false)
          }}
        >
          {t('vr.leaveEndoscopy')}
        </button>
      </div>
      {active && <p className="text-xs text-slate-400" data-testid="endoscopy-state">{route.length >= 2 ? t('vr.pathStep', { step: step + 1, steps: route.length - 1 }) : t('vr.inside')}</p>}
      {!route.length && <p className="text-xs text-slate-500">{t('vr.pathHint')}</p>}
    </Section>
  )
}
