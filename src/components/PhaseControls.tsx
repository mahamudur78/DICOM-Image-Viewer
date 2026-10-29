import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { setVolumePhase, useViewer } from '../store/viewerStore'

/** Milliseconds per phase while 4D cine plays. */
const PHASE_INTERVAL = 700

/** 4D: the phase of a dynamic series shown in MPR / 3D, with cine through the phases. */
export function PhaseControls() {
  const { t } = useTranslation()
  const phases = useViewer((s) => s.volumeView?.phases)
  const [playing, setPlaying] = useState(false)
  const count = phases?.series.length ?? 0

  useEffect(() => {
    if (!playing || !count) return
    const timer = window.setInterval(() => {
      const index = useViewer.getState().volumeView?.phases?.index ?? 0
      setVolumePhase((index + 1) % count)
    }, PHASE_INTERVAL)
    return () => window.clearInterval(timer)
  }, [playing, count])

  if (!phases) return null
  return (
    <div className="flex items-center gap-1 text-xs text-slate-300" data-testid="phase-controls">
      <button
        className="h-9 rounded-md px-2 hover:bg-slate-800 hover:text-white"
        aria-label={playing ? t('phases.pause') : t('phases.play')}
        title={playing ? t('phases.pause') : t('phases.play')}
        aria-pressed={playing}
        onClick={() => setPlaying(!playing)}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <input aria-label={t('phases.phase')} type="range" min={0} max={count - 1} step={1} value={phases.index} onChange={(e) => setVolumePhase(Number(e.target.value))} className="w-24" />
      <span data-testid="phase-label">{t('phases.label', { index: phases.index + 1, count })}</span>
    </div>
  )
}
