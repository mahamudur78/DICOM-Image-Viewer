import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MPR_AXIAL_ID, MPR_VR_VIEWPORT_ID, VR_VIEWPORT_ID, viewportIdAt } from '../cornerstone/constants'
import { getViewport } from '../cornerstone/viewer'
import { addOverlayVolume, hasOverlayVolume, registrationMatrix, removeOverlayVolumes } from '../cornerstone/volume3dTools'
import { groupByPatient } from '../dicom/studyTree'
import type { DisplaySet } from '../dicom/types'
import { FUSION_COLORMAPS, colormapRgb, type FusionColormap } from '../functional/fusion'
import { MPR_KEY, removeFusion, startFusion, updateFusion, useFusion } from '../functional/fusionStore'
import { useViewportRegistry } from '../cornerstone/viewportRegistry'
import { openPetCt, petCtPair } from '../functional/petct'
import { selectCurrentDisplaySet, useViewer } from '../store/viewerStore'

const BUTTON = 'rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40'
const INPUT = 'rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-xs text-slate-200'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
      <span className="shrink-0">{label}</span>
      {children}
    </label>
  )
}

/** The fusion target: the active grid cell, or the MPR views. */
function useTarget() {
  const mode = useViewer((s) => (s.volumeView ? s.volumeView.mode : 'grid'))
  const activeCell = useViewer((s) => s.activeCell)
  const base = useViewer(selectCurrentDisplaySet)
  const key = mode === 'grid' ? viewportIdAt(activeCell) : MPR_KEY
  return { key, base, mode }
}

export function FusionPanel() {
  const { t } = useTranslation()
  const studies = useViewer((s) => s.studies)
  const { key, base, mode } = useTarget()
  const setting = useFusion((s) => s.settings[key])
  const [choice, setChoice] = useState('')
  const pair = useMemo(() => petCtPair(studies, base ?? null), [studies, base])
  // Series of the same patient that could be laid over this one.
  const candidates = useMemo(() => {
    if (!base) return []
    const patient = groupByPatient(studies).find((g) => g.studies.includes(base.study))
    return (patient?.studies ?? [base.study]).flatMap((study) =>
      study.series.filter((s) => s.kind === 'image' && s !== base.series && s.hasOrientation && s.images.length > 1).map((series): DisplaySet => ({ study, series })),
    )
  }, [studies, base])

  if (!base) return <p className="p-3 text-sm text-slate-500">{t('fusion.noSeries')}</p>

  const centre = () => {
    const viewportId = mode === 'grid' ? key : MPR_AXIAL_ID
    const camera = getViewport(viewportId)?.getCamera()
    return (camera?.focalPoint as number[] | undefined) ?? null
  }

  return (
    <div className="h-full space-y-3 overflow-y-auto p-3 text-sm">
      <p className="text-xs text-slate-400">{mode === 'grid' ? t('fusion.targetCell', { series: base.series.description || base.series.modality }) : t('fusion.targetMpr')}</p>
      {pair && (
        <button className={BUTTON} onClick={() => openPetCt(pair.ct, pair.pet)}>
          {t('fusion.petCtLayout')}
        </button>
      )}
      {!setting ? (
        <div className="space-y-2">
          <Row label={t('fusion.overlay')}>
            <select aria-label={t('fusion.overlay')} value={choice} onChange={(e) => setChoice(e.target.value)} className={`${INPUT} max-w-52`}>
              <option value="">—</option>
              {candidates.map((c) => (
                <option key={c.series.id} value={c.series.id}>
                  {c.study.studyDate} {c.series.modality} #{c.series.seriesNumber} {c.series.description}
                </option>
              ))}
            </select>
          </Row>
          <button
            className={BUTTON}
            disabled={!choice}
            onClick={() => {
              const overlay = candidates.find((c) => c.series.id === choice)
              if (overlay) void startFusion(key, base, overlay, centre())
            }}
          >
            {t('fusion.start')}
          </button>
          {candidates.length === 0 && <p className="text-xs text-slate-500">{t('fusion.noCandidates')}</p>}
        </div>
      ) : (
        <>
          <FusionControls fusionKey={key} />
          {mode !== 'grid' && <ThreeDFusion />}
        </>
      )}
    </div>
  )
}

function FusionControls({ fusionKey }: { fusionKey: string }) {
  const { t } = useTranslation()
  const setting = useFusion((s) => s.settings[fusionKey])!
  const { style, registration } = setting
  const setStyle = (change: Partial<typeof style>) => updateFusion(fusionKey, { style: { ...style, ...change } })
  const setRegistration = (change: Partial<typeof registration>) => updateFusion(fusionKey, { registration: { ...registration, ...change } })
  const gradient = Array.from({ length: 11 }, (_, i) => `rgb(${colormapRgb(style.colormap, i / 10).join(',')})`).join(',')
  const axes = ['x', 'y', 'z'] as const

  return (
    <div className="space-y-2" data-testid="fusion-controls">
      <p className="text-xs text-slate-300">
        {setting.overlay.series.modality} · {setting.overlay.series.description}
        {setting.progress < 1 && <span className="ml-2 text-slate-500">{t('fusion.loading', { percent: Math.round(setting.progress * 100) })}</span>}
      </p>
      <label className="flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={setting.visible} onChange={(e) => updateFusion(fusionKey, { visible: e.target.checked })} />
        {t('fusion.visible')}
      </label>
      <Row label={t('fusion.colormap')}>
        <select aria-label={t('fusion.colormap')} value={style.colormap} onChange={(e) => setStyle({ colormap: e.target.value as FusionColormap })} className={INPUT}>
          {FUSION_COLORMAPS.map((name) => (
            <option key={name} value={name}>
              {t(`fusion.colormaps.${name}`)}
            </option>
          ))}
        </select>
      </Row>
      <div className="h-2 rounded" style={{ background: `linear-gradient(to right, ${gradient})` }} />
      <Row label={t('fusion.opacity', { percent: Math.round(style.opacity * 100) })}>
        <input aria-label={t('fusion.opacityLabel')} type="range" min={0} max={1} step={0.05} value={style.opacity} onChange={(e) => setStyle({ opacity: Number(e.target.value) })} />
      </Row>
      {(['lower', 'upper', 'threshold'] as const).map((field) => (
        <Row key={field} label={t(`fusion.${field}`)}>
          <input aria-label={t(`fusion.${field}`)} type="number" step="any" value={Math.round(style[field] * 100) / 100} onChange={(e) => setStyle({ [field]: Number(e.target.value) })} className={`${INPUT} w-24`} />
        </Row>
      ))}
      <h3 className="pt-2 text-xs font-semibold text-slate-400">{t('fusion.registration')}</h3>
      {axes.map((axis, i) => (
        <Row key={`t${axis}`} label={t('fusion.move', { axis })}>
          <input
            aria-label={t('fusion.move', { axis })}
            type="range"
            min={-150}
            max={150}
            step={1}
            value={registration.translate[i]}
            onChange={(e) => setRegistration({ translate: registration.translate.map((v, n) => (n === i ? Number(e.target.value) : v)) })}
          />
        </Row>
      ))}
      {axes.map((axis, i) => (
        <Row key={`r${axis}`} label={t('fusion.turn', { axis })}>
          <input
            aria-label={t('fusion.turn', { axis })}
            type="range"
            min={-45}
            max={45}
            step={1}
            value={registration.rotate[i]}
            onChange={(e) => setRegistration({ rotate: registration.rotate.map((v, n) => (n === i ? Number(e.target.value) : v)) })}
          />
        </Row>
      ))}
      <p className="text-xs text-slate-500" data-testid="registration">
        {t('fusion.registrationValue', { t: registration.translate.map((v) => Math.round(v)).join(', '), r: registration.rotate.map((v) => Math.round(v)).join(', ') })}
      </p>
      <div className="flex flex-wrap gap-1">
        <button className={BUTTON} onClick={() => setRegistration({ translate: [0, 0, 0], rotate: [0, 0, 0] })}>
          {t('fusion.resetRegistration')}
        </button>
        <button className={BUTTON} onClick={() => removeFusion(fusionKey)}>
          {t('fusion.remove')}
        </button>
      </div>
    </div>
  )
}

/** In 3D: the MPR fusion's overlay as a coloured second volume. */
function ThreeDFusion() {
  const { t } = useTranslation()
  const kinds = useViewportRegistry((s) => s.kinds)
  const viewportId = kinds[VR_VIEWPORT_ID] === 'volume3d' ? VR_VIEWPORT_ID : kinds[MPR_VR_VIEWPORT_ID] === 'volume3d' ? MPR_VR_VIEWPORT_ID : null
  const setting = useFusion((s) => s.settings[MPR_KEY] ?? Object.values(s.settings)[0])
  const [shown, setShown] = useState(() => (viewportId ? hasOverlayVolume(viewportId) : false))
  if (!viewportId) return <p className="p-3 text-sm text-slate-500">{t('fusion.noSeries')}</p>
  if (!setting?.volumeId) return <p className="p-3 text-xs text-slate-400">{t('fusion.threeDHint')}</p>
  const { style, registration } = setting
  const colors = Array.from({ length: 6 }, (_, i) => {
    const [r, g, b] = colormapRgb(style.colormap, i / 5)
    return { value: style.lower + ((style.upper - style.lower) * i) / 5, r: r / 255, g: g / 255, b: b / 255 }
  })
  const tf = {
    opacity: [
      { value: style.threshold, opacity: 0 },
      { value: style.upper, opacity: style.opacity },
    ],
    colors,
  }
  return (
    <div className="space-y-2 p-3">
      <p className="text-xs text-slate-300">{setting.overlay.series.description}</p>
      <button
        className={BUTTON}
        onClick={async () => {
          if (shown) removeOverlayVolumes(viewportId)
          else await addOverlayVolume(viewportId, setting.volumeId!, tf, registrationMatrix(registration.translate, registration.rotate, registration.center))
          setShown(!shown)
        }}
      >
        {shown ? t('fusion.hide3d') : t('fusion.show3d')}
      </button>
    </div>
  )
}
