import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DisplaySet } from '../dicom/types'
import { openObjectInCell } from '../objects/apply'
import { ViewportFrame } from './ViewportFrame'

interface ObjectViewerProps {
  viewportId: string
  cell: number
  displaySet: DisplaySet
  active: boolean
  onActivate: () => void
  onToggleMaximize: () => void
}

/**
 * Objects that act on images (segmentation, structures, dose, maps, key
 * images, presentation states) open on those images: this cell is replaced
 * by them. It stays only when they are not open, saying so.
 */
export default function ObjectViewer({ viewportId, cell, displaySet, active, onActivate, onToggleMaximize }: ObjectViewerProps) {
  const { t } = useTranslation()
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void openObjectInCell(cell, displaySet).then((message) => !cancelled && setProblem(message))
    return () => {
      cancelled = true
    }
  }, [cell, displaySet])

  return (
    <ViewportFrame viewportId={viewportId} kind="document" active={active} onActivate={onActivate} onToggleMaximize={onToggleMaximize}>
      <div className="grid flex-1 place-items-center p-4 text-center text-sm text-slate-400" data-testid="object-viewer">
        <div>
          <p className="font-semibold text-slate-200">{t(`objects.kinds.${displaySet.series.kind}`)}</p>
          <p>{displaySet.series.description}</p>
          <p className="mt-2">{problem ?? t('objects.opening')}</p>
        </div>
      </div>
    </ViewportFrame>
  )
}
