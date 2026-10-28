import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface ImageScrollbarProps {
  count: number
  index: number
  onChange: (index: number) => void
}

/** Thin vertical scrollbar on the viewport edge; drag or click to jump. */
export function ImageScrollbar({ count, index, onChange }: ImageScrollbarProps) {
  const { t } = useTranslation()
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbPercent = Math.max(100 / count, 4)
  const topPercent = count > 1 ? (index / (count - 1)) * (100 - thumbPercent) : 0

  const indexAt = (clientY: number) => {
    const rect = trackRef.current!.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    return Math.round(ratio * (count - 1))
  }

  return (
    <div
      ref={trackRef}
      role="scrollbar"
      aria-orientation="vertical"
      aria-valuemin={1}
      aria-valuemax={count}
      aria-valuenow={index + 1}
      aria-label={t('viewport.slice')}
      className="absolute bottom-3 right-1 top-3 z-10 w-2.5 cursor-pointer rounded-full bg-white/10 hover:bg-white/20"
      onPointerDown={(event) => {
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        onChange(indexAt(event.clientY))
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) onChange(indexAt(event.clientY))
      }}
    >
      <div
        className="absolute inset-x-0 rounded-full bg-slate-300/80"
        style={{ top: `${topPercent}%`, height: `${thumbPercent}%` }}
      />
    </div>
  )
}
