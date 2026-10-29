import { Enums, getRenderingEngine, setVolumesForViewports, type Types } from '@cornerstonejs/core'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { mountMprViewport, unmountMprViewport } from '../cornerstone/mpr'
import { PETCT_TOOL_GROUP_ID, VR_TOOL_GROUP_ID } from '../cornerstone/tools'
import { resizeViewports } from '../cornerstone/viewer'
import { setTransferFunction, vrViewport } from '../cornerstone/volume3dTools'
import { RENDERING_ENGINE_ID } from '../cornerstone/constants'
import { ToolGroupManager } from '@cornerstonejs/tools'
import { FusionLayer } from './FusionLayer'
import { MPR_KEY, overlayGrid } from '../functional/fusionStore'

const MIP_ID = 'petct-mip'

const engine = () => getRenderingEngine(RENDERING_ENGINE_ID)

/** A PET (inverted gray, SUV window) or fused (CT with PET overlay) view of one plane. */
export function PetCtViewport({ viewportId, label, orientation, volumeId, kind }: { viewportId: string; label: string; orientation: Enums.OrientationAxis; volumeId: string | null; kind: 'pet' | 'fused' }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    mountMprViewport(viewportId, orientation, ref.current!, PETCT_TOOL_GROUP_ID)
    const observer = new ResizeObserver(() => resizeViewports())
    observer.observe(ref.current!)
    return () => {
      observer.disconnect()
      unmountMprViewport(viewportId)
    }
  }, [viewportId, orientation])

  useEffect(() => {
    const rendering = engine()
    if (!volumeId || !rendering) return
    void setVolumesForViewports(rendering, [{ volumeId }], [viewportId]).then(() => {
      const viewport = rendering.getViewport(viewportId) as Types.IVolumeViewport
      if (kind === 'pet') {
        // PET reads best as inverted gray, 0 to 5 SUV (or the top of its values).
        const grid = overlayGrid(volumeId)
        let max = 5
        if (grid) for (let i = 0; i < grid.scalars.length; i += 5) max = Math.max(max, grid.scalars[i])
        viewport.setProperties({ voiRange: { lower: 0, upper: Math.min(max, 5) }, invert: true })
      }
      viewport.render()
    })
  }, [volumeId, viewportId, kind])

  return (
    <div className="relative min-h-0 min-w-0 overflow-hidden bg-black outline-1 -outline-offset-1 outline-slate-800" data-viewport-id={viewportId}>
      <div ref={ref} className="absolute inset-0" />
      {kind === 'fused' && <FusionLayer viewportId={viewportId} fusionKey={MPR_KEY} />}
      <div className="pointer-events-none absolute left-2 top-2 font-mono text-[11px] text-sky-300">
        {kind === 'pet' ? 'PET' : t('fusion.fused')} · {t(label)}
      </div>
    </div>
  )
}

/** The PET as a maximum intensity projection that turns around. */
export function RotatingMip({ volumeId }: { volumeId: string | null }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(true)

  useEffect(() => {
    const rendering = engine()!
    rendering.enableElement({ viewportId: MIP_ID, type: Enums.ViewportType.VOLUME_3D, element: ref.current!, defaultOptions: { orientation: Enums.OrientationAxis.CORONAL, background: [1, 1, 1] } })
    ToolGroupManager.getToolGroup(VR_TOOL_GROUP_ID)?.addViewport(MIP_ID, RENDERING_ENGINE_ID)
    const observer = new ResizeObserver(() => resizeViewports())
    observer.observe(ref.current!)
    return () => {
      observer.disconnect()
      rendering.disableElement(MIP_ID)
    }
  }, [])

  useEffect(() => {
    const rendering = engine()
    if (!volumeId || !rendering) return
    void setVolumesForViewports(rendering, [{ volumeId }], [MIP_ID]).then(() => {
      const viewport = vrViewport(MIP_ID)
      const actor = viewport?.getActors()[0]?.actor as unknown as { getMapper(): { setBlendMode(n: number): void } } | undefined
      actor?.getMapper().setBlendMode(1)
      // Black is hot, on white (like film).
      setTransferFunction(MIP_ID, {
        opacity: [
          { value: 0, opacity: 1 },
          { value: 10, opacity: 1 },
        ],
        colors: [
          { value: 0, r: 1, g: 1, b: 1 },
          { value: 5, r: 0, g: 0, b: 0 },
        ],
      })
      viewport?.resetCamera()
      viewport?.render()
    })
  }, [volumeId])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      const viewport = vrViewport(MIP_ID)
      if (!viewport?.getActors().length) return
      ;(viewport as unknown as { getVtkActiveCamera(): { azimuth(d: number): void } }).getVtkActiveCamera().azimuth(6)
      viewport.render()
    }, 120)
    return () => window.clearInterval(timer)
  }, [playing])

  return (
    <div className="relative row-span-3 min-h-0 min-w-0 overflow-hidden bg-white" data-viewport-id={MIP_ID}>
      <div ref={ref} className="absolute inset-0" />
      <div className="absolute left-2 top-2 flex items-center gap-2 font-mono text-[11px] text-slate-700">
        MIP
        <button className="rounded bg-slate-200 px-1.5 text-slate-800" aria-pressed={playing} onClick={() => setPlaying(!playing)}>
          {playing ? t('fusion.pause') : t('fusion.rotate')}
        </button>
      </div>
    </div>
  )
}
