import { useTranslation } from 'react-i18next'

/** Small pill shown while a volume is being built or its slices stream in. */
export function VolumeProgress({ volumeId, progress }: { volumeId: string | null; progress: number }) {
  const { t } = useTranslation()
  if (volumeId && progress >= 1) return null
  const percent = Math.round(progress * 100)
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-slate-900/90 px-4 py-1.5 text-xs text-slate-200 shadow">
      {volumeId ? t('viewport.loadingSlices', { percent }) : t('viewport.buildingVolume', { percent })}
    </div>
  )
}
