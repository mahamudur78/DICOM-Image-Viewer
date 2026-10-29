// Images for export: the viewport as seen (with annotations, DICOM overlays,
// redactions and, if wanted, the corner text), or an image at its own pixel size.
// Series are rendered in a hidden viewport, so the one on screen does not move.
import { Enums, getRenderingEngine, type Types } from '@cornerstonejs/core'
import { ToolGroupManager } from '@cornerstonejs/tools'
import { RENDERING_ENGINE_ID } from '../cornerstone/constants'
import { drawOverlayPlanes } from '../cornerstone/overlayPlanes'
import { TOOL_GROUP_ID } from '../cornerstone/tools'
import { createRenderingEngine } from '../cornerstone/viewer'
import type { DisplaySet } from '../dicom/types'
import { t } from '../i18n'
import { redactionPolygons } from '../measurements/manage'

export interface RenderOptions {
  /** Measurements and other annotations. */
  annotations: boolean
  /** DICOM overlay planes (60xx). */
  overlays: boolean
  /** Patient, study and image text in the corners. */
  info: boolean
  /** Leaves the patient's name and ID out of the corner text. */
  privacy: boolean
  /** CSS filter of the viewport (image filters), or ''. */
  filter: string
}

type AnyViewport = Types.IStackViewport | Types.IVolumeViewport

const viewportOf = (viewportId: string) => getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(viewportId) as AnyViewport | undefined

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)))

/** Renders a viewport now and waits until its image and annotations are drawn. */
async function renderNow(viewport: AnyViewport) {
  const rendered = new Promise((resolve) => {
    viewport.element.addEventListener(Enums.Events.IMAGE_RENDERED, resolve, { once: true })
    setTimeout(resolve, 1000) // a viewport with nothing new to draw may not fire the event
  })
  viewport.render()
  await rendered
  // Annotations are drawn on the following animation frames.
  await nextFrame()
  await nextFrame()
}

/** An SVG element as an image, scaled to a canvas. */
async function drawSvg(context: CanvasRenderingContext2D, svg: SVGSVGElement, width: number, height: number) {
  if (!svg.childElementCount) return
  const copy = svg.cloneNode(true) as SVGSVGElement
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  copy.setAttribute('width', String(svg.clientWidth || width))
  copy.setAttribute('height', String(svg.clientHeight || height))
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    context.drawImage(image, 0, 0, width, height)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export interface CornerInfo {
  displaySet: DisplaySet
  index: number
  count: number
}

function drawCornerText(context: CanvasRenderingContext2D, viewport: AnyViewport, info: CornerInfo, privacy: boolean) {
  const { width, height } = context.canvas
  const size = Math.max(11, Math.round(Math.min(width, height) / 45))
  const { study, series } = info.displaySet
  const voi = viewport.getProperties()?.voiRange
  const left = [
    privacy ? t('viewport.hiddenPatient') : study.patientName || t('viewport.anonymous'),
    privacy ? '' : study.patientId,
  ]
  const right = [study.studyDate, `${series.modality} · #${series.seriesNumber}`, series.description]
  const bottomLeft = voi ? [t('viewport.window', { width: Math.round(voi.upper - voi.lower), center: Math.round((voi.upper + voi.lower) / 2) })] : []
  const bottomRight = info.count > 1 ? [`${info.index + 1} / ${info.count}`] : []
  context.save()
  context.font = `${size}px ui-monospace, Menlo, monospace`
  context.fillStyle = '#f1f5f9'
  context.shadowColor = '#000'
  context.shadowBlur = 2
  const lineHeight = size * 1.35
  const pad = size * 0.6
  const column = (lines: string[], x: number, top: boolean, align: CanvasTextAlign) => {
    context.textAlign = align
    context.textBaseline = top ? 'top' : 'bottom'
    lines
      .filter(Boolean)
      .forEach((line, i, all) => context.fillText(line, x, top ? pad + i * lineHeight : height - pad - (all.length - 1 - i) * lineHeight))
  }
  column(left, pad, true, 'left')
  column(right, width - pad, true, 'right')
  column(bottomLeft, pad, false, 'left')
  column(bottomRight, width - pad, false, 'right')
  context.restore()
}

/** The viewport as it looks, into a new canvas the size of its own (device pixels). */
export async function composeViewport(viewportId: string, options: RenderOptions, info: CornerInfo | null): Promise<HTMLCanvasElement> {
  const viewport = viewportOf(viewportId)
  if (!viewport) throw new Error(`No viewport ${viewportId}`)
  const source = viewport.getCanvas()
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const context = canvas.getContext('2d')!
  context.fillStyle = '#000'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.filter = options.filter || 'none'
  context.drawImage(source, 0, 0)
  context.filter = 'none'
  const ratio = source.width / (source.clientWidth || source.width)
  const imageId = (viewport as Types.IStackViewport).getCurrentImageId?.()
  const isStack = viewport.type === Enums.ViewportType.STACK

  if (options.overlays && isStack && imageId) drawOverlayPlanes(context, viewportId, imageId, ratio)
  if (options.annotations) {
    const svg = viewport.element.querySelector<SVGSVGElement>('svg.svg-layer')
    if (svg) await drawSvg(context, svg, canvas.width, canvas.height)
  }
  // Redacted areas are always black.
  if (isStack) {
    context.fillStyle = '#000'
    for (const polygon of redactionPolygons(viewportId)) {
      context.beginPath()
      polygon.forEach(([x, y], i) => (i ? context.lineTo(x * ratio, y * ratio) : context.moveTo(x * ratio, y * ratio)))
      context.fill()
    }
  }
  if (options.info && info) drawCornerText(context, viewport, info, options.privacy)
  return canvas
}

// --- the hidden viewport -------------------------------------------------------------

const EXPORT_VIEWPORT_ID = 'export-offscreen'

export interface ExportViewport {
  viewportId: string
  /** Shows image `index` of the stack and waits until it is drawn. */
  show(index: number): Promise<void>
  destroy(): void
}

/**
 * A hidden stack viewport showing a series like the source viewport does:
 * the same window, invert and colormap, and either the same view at the same
 * size ("screen") or each image fitted at its own pixel size ("native").
 */
export async function createExportViewport(sourceViewportId: string, imageIds: string[], native: boolean): Promise<ExportViewport> {
  const source = viewportOf(sourceViewportId) as Types.IStackViewport | undefined
  if (!source) throw new Error(`No viewport ${sourceViewportId}`)
  const ratio = window.devicePixelRatio || 1
  const element = document.createElement('div')
  Object.assign(element.style, { position: 'fixed', left: '-30000px', top: '0', overflow: 'hidden' })
  const sizeTo = (width: number, height: number) => Object.assign(element.style, { width: `${width}px`, height: `${height}px` })
  if (!native) sizeTo(source.element.clientWidth, source.element.clientHeight)
  else sizeTo(1, 1)
  document.body.appendChild(element)

  const engine = createRenderingEngine()
  engine.enableElement({ viewportId: EXPORT_VIEWPORT_ID, type: Enums.ViewportType.STACK, element, defaultOptions: { background: [0, 0, 0] } })
  // Annotations are drawn for the viewports of the tool group.
  ToolGroupManager.getToolGroup(TOOL_GROUP_ID)?.addViewport(EXPORT_VIEWPORT_ID, RENDERING_ENGINE_ID)
  const viewport = engine.getViewport(EXPORT_VIEWPORT_ID) as Types.IStackViewport
  const properties = source.getProperties()
  const presentation = source.getViewPresentation()
  let current = -1

  const show = async (index: number) => {
    if (native) {
      const image = await viewport.setStack([imageIds[index]], 0).then(() => viewport.getCornerstoneImage())
      // One CSS pixel per image pixel ÷ device ratio: the canvas gets the image's own size.
      sizeTo(image.columns / ratio, image.rows / ratio)
      engine.resize(true, false)
      viewport.resetCamera()
    } else if (current < 0) {
      await viewport.setStack(imageIds, index)
    } else {
      await viewport.setImageIdIndex(index)
    }
    current = index
    viewport.setProperties({
      ...(properties.voiRange && { voiRange: properties.voiRange }),
      invert: properties.invert,
      ...(properties.colormap && { colormap: properties.colormap }),
    })
    if (!native) viewport.setViewPresentation(presentation)
    await renderNow(viewport)
  }

  return {
    viewportId: EXPORT_VIEWPORT_ID,
    show,
    destroy() {
      engine.disableElement(EXPORT_VIEWPORT_ID)
      element.remove()
    },
  }
}

/** Renders the source viewport as it is now (MPR and 3D included). */
export async function captureCurrent(viewportId: string, options: RenderOptions, info: CornerInfo | null) {
  const viewport = viewportOf(viewportId)
  if (viewport) await renderNow(viewport)
  return composeViewport(viewportId, options, info)
}
