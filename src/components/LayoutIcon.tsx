import type { Layout } from './layouts'

/** Small grid drawing of a layout, used on the layout buttons. */
export function LayoutIcon({ rows, cols }: Layout) {
  return (
    <span
      className="grid h-4 w-5 gap-px"
      style={{ gridTemplateRows: `repeat(${rows}, 1fr)`, gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {Array.from({ length: rows * cols }, (_, i) => (
        <span key={i} className="rounded-[1px] bg-current" />
      ))}
    </span>
  )
}
