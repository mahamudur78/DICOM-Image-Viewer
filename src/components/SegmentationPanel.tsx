import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { mprUnsupportedReason } from '../cornerstone/mpr'
import { useViewportRegistry } from '../cornerstone/viewportRegistry'
import { useFusion } from '../functional/fusionStore'
import { originalId } from '../objects/keyImages'
import { MAX_SEGMENTS } from '../objects/labels'
import type { SegmentStats, TmtvResult } from '../segmentation/edit'
import {
  clearActive,
  downloadStl,
  hideSurfaces,
  interpolate,
  runTmtv,
  saveRtStruct,
  saveSeg,
  segmentationStats,
  showSurfaces,
  threeDViewport,
  thresholdVolume,
} from '../segmentation/actions'
import {
  addSegment,
  changeSegment,
  createSegmentation,
  historyOf,
  installEditor,
  labelOverlaysOf,
  prepareValues,
  redo,
  removeSegment,
  undo,
  useEditor,
} from '../segmentation/session'
import { useSegmentTool, type SegmentToolKind } from '../segmentation/tool'
import { notify } from '../notifications/toastStore'
import { selectCurrentDisplaySet, setActiveTool, useViewer } from '../store/viewerStore'

const BUTTON = 'rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40'
const TOOL = 'rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 aria-pressed:border-sky-500 aria-pressed:bg-sky-600 aria-pressed:text-white'
const INPUT = 'rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-xs text-slate-200'

const TOOLS: SegmentToolKind[] = ['brush', 'eraser', 'threshold', 'fill', 'rect', 'circle', 'free', 'contour']

/** Value ranges for the threshold brush, volume threshold and region growing. */
const PRESETS: Record<string, [number, number]> = {
  bone: [300, 3000],
  softTissue: [-100, 300],
  lung: [-1000, -400],
  fat: [-150, -50],
  suv: [2.5, 100],
}

installEditor()

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-slate-800 pt-2">
      <h3 className="text-xs font-semibold text-slate-400">{title}</h3>
      {children}
    </section>
  )
}

const round = (v: number, digits = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** digits) / 10 ** digits : '—')

export function SegmentationPanel() {
  const { t } = useTranslation()
  const base = useViewer(selectCurrentDisplaySet)
  const activeTool = useViewer((s) => s.activeTool)
  const editor = useEditor()
  const tool = useSegmentTool()
  const seriesId = base ? originalId(base.series) : ''
  // Re-read the overlays when they change, and the 3D button when a 3D view opens.
  useFusion((s) => s.settings)
  useViewportRegistry((s) => s.kinds)
  const overlays = seriesId ? labelOverlaysOf(seriesId) : []
  const key = overlays.some(([k]) => k === editor.key) ? editor.key : (overlays[0]?.[0] ?? null)
  const setting = useFusion((s) => (key ? s.settings[key] : undefined))
  const segments = setting?.segments ?? []
  const [busy, setBusy] = useState(false)
  const [stats, setStats] = useState<Map<number, SegmentStats> | null>(null)
  const [tmtvResult, setTmtvResult] = useState<TmtvResult | null>(null)
  const [tmtvMode, setTmtvMode] = useState<'suv' | 'percent'>('suv')
  const [tmtvValue, setTmtvValue] = useState(2.5)
  const [surfaces, setSurfaces] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    if (key && key !== editor.key) useEditor.setState({ key, bit: segmentsOfSetting(setting)[0]?.bit ?? 0 })
  }, [key, editor.key, setting])

  // Image values for the threshold brush; statistics after every edit (debounced).
  useEffect(() => {
    if (key) void prepareValues(key)
  }, [key])
  useEffect(() => {
    if (!key) return
    const timer = window.setTimeout(() => void segmentationStats(key).then(setStats), 400)
    return () => window.clearTimeout(timer)
  }, [key, editor.revision, segments.length])

  if (!base || base.series.kind !== 'image') return <p className="p-3 text-sm text-slate-500">{t('fusion.noSeries')}</p>
  const unsupported = mprUnsupportedReason(base.series)
  const pet = base.series.modality === 'PT'

  const run = async (action: () => Promise<unknown> | unknown, done?: string) => {
    setBusy(true)
    try {
      const result = await action()
      if (done && result !== false) notify(done, 'success')
    } finally {
      setBusy(false)
    }
  }
  const chooseTool = (kind: SegmentToolKind) => {
    useSegmentTool.setState({ kind })
    setActiveTool('segment')
  }
  const applyPreset = (preset: string) => {
    const range = PRESETS[preset]
    if (range) useEditor.setState({ lower: range[0], upper: range[1] })
  }

  return (
    <div className="h-full space-y-3 overflow-y-auto p-3 text-sm" data-testid="segmentation-panel">
      <p className="text-xs text-slate-400">{t('segment.target', { series: base.series.description || base.series.modality })}</p>
      {unsupported ? (
        <p className="text-xs text-amber-300">{t('segment.needsVolume', { reason: t(unsupported) })}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {overlays.length > 1 && (
            <select aria-label={t('segment.choose')} className={INPUT} value={key ?? ''} onChange={(e) => useEditor.setState({ key: e.target.value })}>
              {overlays.map(([k, s]) => (
                <option key={k} value={k}>
                  {s.overlay.series.description}
                </option>
              ))}
            </select>
          )}
          <button className={BUTTON} disabled={busy} onClick={() => run(() => createSegmentation(base))}>
            {t('segment.new')}
          </button>
        </div>
      )}

      {key && setting && (
        <>
          <Section title={t('segment.segments')}>
            <ul className="space-y-1" data-testid="segment-editor-list">
              {segments.map((segment) => (
                <li key={segment.bit} className={`flex items-center gap-2 rounded px-1 text-xs ${segment.bit === editor.bit ? 'bg-sky-600/20' : ''}`}>
                  <input type="radio" name="active-segment" aria-label={t('segment.activate', { name: segment.label })} checked={segment.bit === editor.bit} onChange={() => useEditor.setState({ bit: segment.bit })} />
                  <input type="checkbox" aria-label={t('objects.showSegment', { name: segment.label })} checked={segment.visible} onChange={(e) => changeSegment(key, segment.bit, { visible: e.target.checked })} />
                  <input
                    type="color"
                    aria-label={t('objects.segmentColor', { name: segment.label })}
                    className="h-4 w-5 cursor-pointer border-0 bg-transparent p-0"
                    value={`#${segment.color.map((c) => c.toString(16).padStart(2, '0')).join('')}`}
                    onChange={(e) => changeSegment(key, segment.bit, { color: [1, 3, 5].map((n) => parseInt(e.target.value.slice(n, n + 2), 16)) as [number, number, number] })}
                  />
                  <input aria-label={t('segment.name')} className={`${INPUT} min-w-0 flex-1`} value={segment.label} onChange={(e) => changeSegment(key, segment.bit, { label: e.target.value })} />
                  <button className={BUTTON} aria-label={t('segment.remove', { name: segment.label })} onClick={() => removeSegment(key, segment.bit)}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-1">
              <input aria-label={t('segment.newName')} placeholder={t('segment.newName')} className={`${INPUT} min-w-0 flex-1`} value={name} onChange={(e) => setName(e.target.value)} />
              <button
                className={BUTTON}
                disabled={segments.length >= MAX_SEGMENTS}
                onClick={() => {
                  addSegment(key, name.trim() || undefined)
                  setName('')
                }}
              >
                {t('segment.add')}
              </button>
            </div>
          </Section>

          <Section title={t('segment.tools')}>
            <div className="flex flex-wrap gap-1" role="group" aria-label={t('segment.tools')}>
              {TOOLS.map((kind) => (
                <button key={kind} className={TOOL} aria-pressed={activeTool === 'segment' && tool.kind === kind} onClick={() => chooseTool(kind)}>
                  {t(`segment.toolNames.${kind}`)}
                </button>
              ))}
            </div>
            {['brush', 'eraser', 'threshold'].includes(tool.kind) && (
              <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
                {t('segment.radius', { mm: tool.radius })}
                <input aria-label={t('segment.radiusLabel')} type="range" min={1} max={50} step={0.5} value={tool.radius} onChange={(e) => useSegmentTool.setState({ radius: Number(e.target.value) })} />
              </label>
            )}
            {['rect', 'circle', 'free', 'contour'].includes(tool.kind) && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={editor.erase} onChange={(e) => useEditor.setState({ erase: e.target.checked })} />
                  {t('segment.erase')}
                </label>
                {tool.kind !== 'contour' ? (
                  <select aria-label={t('segment.depth')} className={INPUT} value={editor.depth} onChange={(e) => useEditor.setState({ depth: e.target.value as 'slice' | 'volume' })}>
                    <option value="slice">{t('segment.depthSlice')}</option>
                    <option value="volume">{t('segment.depthVolume')}</option>
                  </select>
                ) : (
                  <span className="text-slate-500">{t('segment.contourHint')}</span>
                )}
              </div>
            )}
            {tool.kind === 'fill' && (
              <select aria-label={t('segment.fillScope')} className={INPUT} value={editor.fillScope} onChange={(e) => useEditor.setState({ fillScope: e.target.value as 'slice' | 'volume' })}>
                <option value="slice">{t('segment.depthSlice')}</option>
                <option value="volume">{t('segment.wholeVolume')}</option>
              </select>
            )}
            <div className="flex flex-wrap items-center gap-1 text-xs text-slate-300">
              <span>{t('segment.range')}</span>
              <input aria-label={t('segment.lower')} type="number" step="any" className={`${INPUT} w-20`} value={editor.lower} onChange={(e) => useEditor.setState({ lower: Number(e.target.value) })} />
              <span>–</span>
              <input aria-label={t('segment.upper')} type="number" step="any" className={`${INPUT} w-20`} value={editor.upper} onChange={(e) => useEditor.setState({ upper: Number(e.target.value) })} />
              <select aria-label={t('segment.preset')} className={INPUT} value="" onChange={(e) => applyPreset(e.target.value)}>
                <option value="">{t('segment.preset')}</option>
                {Object.keys(PRESETS).map((preset) => (
                  <option key={preset} value={preset}>
                    {t(`segment.presets.${preset}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-1">
              <button className={BUTTON} disabled={busy} onClick={() => run(thresholdVolume)}>
                {t('segment.thresholdVolume')}
              </button>
              <button className={BUTTON} onClick={() => notify(t('segment.interpolated', { count: interpolate() }), 'info')}>
                {t('segment.interpolate')}
              </button>
              <button className={BUTTON} onClick={() => clearActive()}>
                {t('segment.clear')}
              </button>
              <button className={BUTTON} disabled={!historyOf(key).canUndo} onClick={undo}>
                {t('measure.undo')}
              </button>
              <button className={BUTTON} disabled={!historyOf(key).canRedo} onClick={redo}>
                {t('measure.redo')}
              </button>
            </div>
          </Section>

          <Section title={t('segment.results')}>
            <table className="w-full text-left text-xs text-slate-300" data-testid="segment-stats">
              <thead className="text-slate-500">
                <tr>
                  <th>{t('objects.structure')}</th>
                  <th>{t('objects.volumeHeader')}</th>
                  <th>{t('segment.mean')}</th>
                  <th>{t('segment.minMax')}</th>
                  <th>{t('segment.diameter')}</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((segment) => {
                  const s = stats?.get(segment.bit)
                  return (
                    <tr key={segment.bit}>
                      <td style={{ color: `rgb(${segment.color.join(',')})` }}>{segment.label}</td>
                      <td>{s ? `${round(s.volume, 3)} cm³` : '…'}</td>
                      <td>{s ? `${round(s.mean)} ± ${round(s.sd)}` : ''}</td>
                      <td>{s ? `${round(s.min)} / ${round(s.max)}` : ''}</td>
                      <td>{s ? `${round(s.maxDiameter, 1)} mm` : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="flex flex-wrap gap-1">
              <button
                className={BUTTON}
                disabled={!threeDViewport()}
                title={threeDViewport() ? undefined : t('segment.open3d')}
                onClick={() => {
                  if (surfaces) hideSurfaces()
                  else showSurfaces(key)
                  setSurfaces(!surfaces)
                }}
              >
                {surfaces ? t('segment.hideSurfaces') : t('segment.showSurfaces')}
              </button>
              <button className={BUTTON} onClick={() => downloadStl(key, editor.bit) || notify(t('segment.empty'), 'info')}>
                {t('segment.stl')}
              </button>
            </div>
          </Section>

          {pet && (
            <Section title={t('segment.tmtv')}>
              <div className="flex flex-wrap items-center gap-1 text-xs text-slate-300">
                <select aria-label={t('segment.tmtvMode')} className={INPUT} value={tmtvMode} onChange={(e) => setTmtvMode(e.target.value as 'suv' | 'percent')}>
                  <option value="suv">{t('segment.tmtvSuv')}</option>
                  <option value="percent">{t('segment.tmtvPercent')}</option>
                </select>
                <input aria-label={t('segment.tmtvValue')} type="number" step="any" className={`${INPUT} w-16`} value={tmtvValue} onChange={(e) => setTmtvValue(Number(e.target.value))} />
                <button
                  className={BUTTON}
                  disabled={busy}
                  onClick={() => run(async () => setTmtvResult(await runTmtv(key, tmtvMode === 'suv' ? { suv: tmtvValue } : { percent: tmtvValue })))}
                >
                  {t('segment.tmtvRun')}
                </button>
              </div>
              {tmtvResult && (
                <div className="text-xs text-slate-300" data-testid="tmtv-result">
                  <p>{t('segment.tmtvTotal', { volume: round(tmtvResult.volume, 2), tlg: round(tmtvResult.tlg, 1), count: tmtvResult.lesions.length, threshold: round(tmtvResult.threshold, 2) })}</p>
                  <ul>
                    {tmtvResult.lesions.slice(0, 20).map((lesion, i) => (
                      <li key={i}>{t('segment.lesion', { n: i + 1, volume: round(lesion.volume, 2), max: round(lesion.suvMax), mean: round(lesion.suvMean), tlg: round(lesion.tlg, 1) })}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          )}

          <Section title={t('segment.save')}>
            <div className="flex flex-wrap gap-1">
              <button className={BUTTON} disabled={busy} onClick={() => run(() => saveSeg(key, setting.overlay.series.description), t('segment.saved'))}>
                {t('segment.saveSeg')}
              </button>
              <button className={BUTTON} disabled={busy} onClick={() => run(() => saveRtStruct(key, setting.overlay.series.description), t('segment.saved'))}>
                {t('segment.saveRtStruct')}
              </button>
            </div>
          </Section>
        </>
      )}
      {!key && !unsupported && <p className="text-xs text-slate-500">{t('segment.none')}</p>}
    </div>
  )
}

const segmentsOfSetting = (setting: { segments?: { bit: number }[] } | undefined) => setting?.segments ?? []
