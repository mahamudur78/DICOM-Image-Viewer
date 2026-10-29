import { useTranslation } from 'react-i18next'
import type { Series } from '../dicom/types'
import { changeCineFps, setCineMode, toggleCine } from '../store/cineStore'
import { useCineState } from './useCinePlayback'

const BUTTON = 'grid h-7 min-w-7 place-items-center rounded px-1.5 text-slate-100 hover:bg-white/15'

/** Play/pause, speed and loop mode, shown at the bottom of a viewport with more than one image. */
export function CineControls({ viewportId, series }: { viewportId: string; series: Series }) {
  const { t } = useTranslation()
  const { playing, fps, mode } = useCineState(viewportId, series)

  return (
    <div
      className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-lg bg-black/60 px-1 py-0.5 text-xs ring-1 ring-white/25 @max-xs:bottom-8"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <button
        className={BUTTON}
        aria-label={playing ? t('cine.pause') : t('cine.play')}
        aria-pressed={playing}
        title={`${playing ? t('cine.pause') : t('cine.play')} (Space)`}
        onClick={() => toggleCine(viewportId, series)}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <button className={`${BUTTON} @max-xs:hidden`} aria-label={t('cine.slower')} title={`${t('cine.slower')} ([)`} onClick={() => changeCineFps(viewportId, series, -1)}>
        −
      </button>
      <span className="w-14 text-center tabular-nums text-slate-200 @max-xs:hidden" aria-live="polite">
        {t('cine.fps', { fps })}
      </span>
      <button className={`${BUTTON} @max-xs:hidden`} aria-label={t('cine.faster')} title={`${t('cine.faster')} (])`} onClick={() => changeCineFps(viewportId, series, 1)}>
        +
      </button>
      <button
        className={`${BUTTON} @max-xs:hidden`}
        aria-label={mode === 'loop' ? t('cine.loop') : t('cine.bounce')}
        title={mode === 'loop' ? t('cine.loop') : t('cine.bounce')}
        onClick={() => setCineMode(viewportId, series, mode === 'loop' ? 'bounce' : 'loop')}
      >
        {mode === 'loop' ? '⟳' : '⇄'}
      </button>
    </div>
  )
}
