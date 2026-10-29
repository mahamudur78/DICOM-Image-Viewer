import { metaData } from '@cornerstonejs/core'
import { useTranslation } from 'react-i18next'
import { useCursor3D } from '../comparison/cursor3d'
import { crossingSegment, dot, imageToWorld, normalOf, type ImagePlane } from '../comparison/planes'
import { viewportIdAt } from '../cornerstone/constants'
import { getViewport } from '../cornerstone/viewer'
import { useViewportChanges } from '../cornerstone/viewportChanges'
import { useSettings } from '../store/settingsStore'
import { cellOfViewport, useViewer } from '../store/viewerStore'

/** Line colour of each grid cell's plane, so lines can be told apart. */
const CELL_COLORS = ['#38bdf8', '#fbbf24', '#a3e635', '#f472b6', '#c084fc', '#2dd4bf', '#fb923c', '#f87171']
const cellColor = (cell: number) => CELL_COLORS[cell % CELL_COLORS.length]

/** The plane of the image a viewport shows now, as the viewport draws it. */
function viewportPlane(viewportId: string): ImagePlane | null {
  const data = getViewport(viewportId)?.getImageData()
  if (!data) return null
  const { origin, direction, spacing, dimensions } = data
  return {
    origin: [...origin],
    row: [direction[0], direction[1], direction[2]],
    column: [direction[3], direction[4], direction[5]],
    spacingX: spacing[0],
    spacingY: spacing[1],
    columns: dimensions[0],
    rows: dimensions[1],
  }
}

function imagePlane(imageId: string): ImagePlane | null {
  const m = metaData.get('imagePlaneModule', imageId) as
    | { imagePositionPatient?: number[]; rowCosines?: number[]; columnCosines?: number[]; columnPixelSpacing?: number; rowPixelSpacing?: number; columns: number; rows: number }
    | undefined
  if (!m?.imagePositionPatient || !m.rowCosines || !m.columnCosines) return null
  return {
    origin: m.imagePositionPatient,
    row: m.rowCosines,
    column: m.columnCosines,
    spacingX: m.columnPixelSpacing || 1,
    spacingY: m.rowPixelSpacing || 1,
    columns: m.columns,
    rows: m.rows,
  }
}

/** Distance between the first two slices of a stack (1 mm for a single image). */
function sliceSpacing(imageIds: string[]) {
  const [a, b] = imageIds.slice(0, 2).map(imagePlane)
  if (!a || !b) return 1
  return Math.abs(dot(b.origin, normalOf(a)) - dot(a.origin, normalOf(a))) || 1
}

const frameOfReference = (viewportId: string) => getViewport(viewportId)?.getFrameOfReferenceUID?.()

interface Line {
  key: string
  from: number[]
  to: number[]
  color: string
  dashed: boolean
}

/**
 * Lines where other viewports' slices cross this one (reference lines), the
 * first and last slice of the active series, and the 3D cursor.
 */
export function ComparisonLayer({ viewportId }: { viewportId: string }) {
  const { t } = useTranslation()
  useViewportChanges((s) => s.tick)
  const links = useSettings((s) => s.links)
  const cursor = useCursor3D((s) => s.cursor)
  const { cells, activeCell, layout, maximizedCell } = useViewer()
  const viewport = getViewport(viewportId)
  const cell = cellOfViewport(viewportId)
  const target = viewport && cells[cell]?.series.hasOrientation ? viewportPlane(viewportId) : null
  if (!viewport || !target) return null
  const forUid = frameOfReference(viewportId)
  const toCanvas = ([x, y]: number[]) => viewport.worldToCanvas(imageToWorld(target, x, y) as [number, number, number])

  const lines: Line[] = []
  const addLine = (key: string, source: ImagePlane, color: string, dashed: boolean) => {
    const segment = crossingSegment(source, target)
    if (segment) lines.push({ key, from: toCanvas(segment[0]), to: toCanvas(segment[1]), color, dashed })
  }

  if (links.referenceLines && maximizedCell === null) {
    const sources = links.referenceLinesAll ? Array.from({ length: layout.rows * layout.cols }, (_, i) => i) : [activeCell]
    for (const source of sources) {
      const sourceId = viewportIdAt(source)
      if (source === cell || !cells[source]?.series.hasOrientation || !forUid || frameOfReference(sourceId) !== forUid) continue
      const plane = viewportPlane(sourceId)
      if (plane) addLine(`cell-${source}`, plane, cellColor(source), false)
    }
    // The extent of the active series: its first and last slice.
    const active = cells[activeCell]?.series
    if (links.referenceLinesEnds && active && activeCell !== cell && active.images.length > 1 && frameOfReference(viewportIdAt(activeCell)) === forUid) {
      for (const [key, image] of [['first', active.images[0]], ['last', active.images[active.images.length - 1]]] as const) {
        const plane = imagePlane(image.imageId)
        if (plane) addLine(key, plane, cellColor(activeCell), true)
      }
    }
  }

  // The cursor is marked on slices that pass (within a slice) through it.
  let mark: number[] | null = null
  if (cursor && cursor.frameOfReferenceUID && cursor.frameOfReferenceUID === forUid) {
    const offset = cursor.point.map((v, i) => v - target.origin[i])
    const half = sliceSpacing(cells[cell]!.series.images.map((image) => image.imageId)) / 2
    if (Math.abs(dot(offset, normalOf(target))) <= Math.max(half, 0.5) + 0.01) mark = viewport.worldToCanvas(cursor.point as [number, number, number])
  }

  if (lines.length === 0 && !mark) return null
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      {lines.map((line) => (
        <line
          key={line.key}
          data-testid="reference-line"
          data-source={line.key}
          x1={line.from[0]}
          y1={line.from[1]}
          x2={line.to[0]}
          y2={line.to[1]}
          stroke={line.color}
          strokeWidth={1}
          strokeDasharray={line.dashed ? '6 4' : undefined}
          opacity={0.85}
        />
      ))}
      {mark && (
        <g data-testid="cursor-3d" stroke="#f43f5e" strokeWidth={1.5} fill="none">
          <title>{t('cursor3d.title')}</title>
          <circle cx={mark[0]} cy={mark[1]} r={6} />
          <line x1={mark[0] - 12} y1={mark[1]} x2={mark[0] + 12} y2={mark[1]} />
          <line x1={mark[0]} y1={mark[1] - 12} x2={mark[0]} y2={mark[1] + 12} />
        </g>
      )}
    </svg>
  )
}
