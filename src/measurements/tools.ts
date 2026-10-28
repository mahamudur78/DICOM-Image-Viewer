// Measurement tools: Cornerstone's own, plus variants and a few of our own
// built on them. Every tool's text comes from textLinesFor, so values follow
// calibration and the user's unit.
import type { Types } from '@cornerstonejs/core'
import {
  AngleTool,
  ArrowAnnotateTool,
  BidirectionalTool,
  CircleROITool,
  CobbAngleTool,
  EllipticalROITool,
  LabelTool,
  LengthTool,
  PlanarFreehandROITool,
  ProbeTool,
  RectangleROITool,
  SplineROITool,
  annotation as csAnnotation,
  drawing,
} from '@cornerstonejs/tools'
import type { Annotation, SVGDrawingHelper } from '@cornerstonejs/tools/types'
import { askForm } from '../dialogs/dialogStore'
import { perpendicular } from './geometry'
import { ELLIPSOID_TOOL, RATIO_TOOL } from './groups'
import { pointsOf, registerShape, type MeasurementShape } from './measure'
import { nextSpineLabel } from './spine'
import { textLinesFor } from './text'

type ToolArgs = ConstructorParameters<typeof LengthTool>

/** Closed polygon, drawn point by point (click the first point or double-click to close). */
export class PolygonTool extends SplineROITool {
  static toolName = 'Polygon'
}

/** Open polyline: its length (double-click to finish). */
export class PolylineTool extends SplineROITool {
  static toolName = 'Polyline'
}

/** Closed smooth curve through the clicked points. */
export class CurveTool extends SplineROITool {
  static toolName = 'Curve'
}

/** Free drawing without values. */
export class PencilTool extends PlanarFreehandROITool {
  static toolName = 'Pencil'
}

/** Two lines whose length ratio is shown (e.g. cardiothoracic ratio). */
export class LengthRatioTool extends LengthTool {
  static toolName = RATIO_TOOL
}

/** Three diameters of an ellipsoid, on any images, giving its volume. */
export class EllipsoidTool extends LengthTool {
  static toolName = ELLIPSOID_TOOL
}

/** A line whose real length the user types to calibrate the series. */
export class CalibrationTool extends LengthTool {
  static toolName = 'CalibrationLine'
}

/** Vertebra labels placed one after another: C1, C2, … */
export class SpineLabelTool extends LabelTool {
  static toolName = 'SpineLabel'
}

/** A black box hiding burned-in text; also hidden in PNG exports. */
export class RedactionTool extends RectangleROITool {
  static toolName = 'Redaction'

  constructor(...args: ToolArgs) {
    super(...args)
    const drawOutline = this.renderAnnotation
    this.renderAnnotation = (enabledElement: Types.IEnabledElement, svgDrawingHelper: SVGDrawingHelper) => {
      const rendered = drawOutline(enabledElement, svgDrawingHelper)
      const { viewport } = enabledElement
      for (const annotation of visibleAnnotations(this, viewport.element)) {
        const [topLeft, topRight, bottomLeft, bottomRight] = pointsOf(annotation).map((p) => viewport.worldToCanvas(p))
        drawing.drawPath(svgDrawingHelper, annotation.annotationUID!, 'fill', [topLeft, topRight, bottomRight, bottomLeft], {
          color: '#000',
          fillColor: '#000',
          fillOpacity: 1,
          closePath: true,
          width: 1,
        })
      }
      return rendered
    }
  }
}

/**
 * Deviation distance: a reference line and a point, measured along the
 * perpendicular from the point to the line (drawn dashed).
 */
export class DeviationTool extends AngleTool {
  static toolName = 'Deviation'

  constructor(...args: ToolArgs) {
    super(...args)
    this.renderAnnotation = (enabledElement: Types.IEnabledElement, svgDrawingHelper: SVGDrawingHelper) => {
      const { viewport } = enabledElement
      const annotations = visibleAnnotations(this, viewport.element)
      if (!annotations.length) return false
      // Throws while an MPR volume is still loading (no view reference yet).
      let targetId: string | undefined
      try {
        targetId = this.getTargetId(viewport as Types.IViewport)
      } catch {
        targetId = undefined
      }
      let rendered = false
      for (const annotation of annotations) {
        const uid = annotation.annotationUID!
        const styleSpecifier = { toolGroupId: this.toolGroupId, toolName: this.getToolName(), viewportId: viewport.id, annotationUID: uid }
        const { color, lineWidth, lineDash } = this.getAnnotationStyle({ annotation, styleSpecifier }) as { color: string; lineWidth: number; lineDash: string }
        const canvas = pointsOf(annotation).map((p) => viewport.worldToCanvas(p))
        if (annotation.highlighted || annotation.data.handles?.activeHandleIndex != null) {
          drawing.drawHandles(svgDrawingHelper, uid, '0', canvas, { color, lineDash, lineWidth })
        }
        drawing.drawLine(svgDrawingHelper, uid, '1', canvas[0], canvas[1], { color, width: lineWidth, lineDash })
        rendered = true
        if (canvas.length < 3) continue
        const { foot } = perpendicular(canvas[0], canvas[1], canvas[2])
        drawing.drawLine(svgDrawingHelper, uid, '2', canvas[2], foot as Types.Point2, { color, width: lineWidth, lineDash: '4,4' })
        // Extends the reference line to the foot when it falls beyond the drawn segment.
        const nearest = Math.hypot(foot[0] - canvas[0][0], foot[1] - canvas[0][1]) < Math.hypot(foot[0] - canvas[1][0], foot[1] - canvas[1][1]) ? canvas[0] : canvas[1]
        drawing.drawLine(svgDrawingHelper, uid, '3', nearest, foot as Types.Point2, { color, width: lineWidth, lineDash: '2,4' })
        if (!targetId) continue
        this.renderLinkedTextBoxAnnotation({
          enabledElement,
          svgDrawingHelper,
          annotation,
          styleSpecifier,
          textLines: this.configuration.getTextLines(annotation.data, targetId),
          canvasCoordinates: canvas,
          placementPoints: [canvas[2], canvas[2]],
        })
      }
      return rendered
    }
  }
}

function visibleAnnotations(tool: { getToolName(): string; filterInteractableAnnotationsForElement(element: HTMLDivElement, annotations: Annotation[]): Annotation[] }, element: HTMLDivElement) {
  const annotations = csAnnotation.state.getAnnotations(tool.getToolName(), element) ?? []
  return (tool.filterInteractableAnnotationsForElement(element, annotations) ?? []).filter(
    (annotation) => annotation.data.handles?.points?.length && csAnnotation.visibility.isAnnotationVisible(annotation.annotationUID!),
  )
}

/** Asks for the text of an arrow or label; an empty answer cancels it. */
function askText(current = '') {
  return askForm('measure.textTitle', [{ name: 'text', label: 'measure.text', type: 'text', value: current, required: true }], 'dialogs.apply').then(
    (values) => values?.text.trim() || null,
  )
}

const textCallbacks = {
  getTextCallback: (done: (text: string | null) => void) => void askText().then(done),
  changeTextCallback: (data: { data?: { label?: string } }, _event: unknown, done: (text: string) => void) =>
    void askText(data.data?.label).then((text) => text && done(text)),
}

interface MeasurementToolDefinition {
  Class: { toolName: string }
  shape: MeasurementShape
  configuration?: Record<string, unknown>
}

const SPLINE = SplineROITool.SplineTypes

/** Every annotation tool, by its Cornerstone name. */
export const MEASUREMENT_TOOLS: MeasurementToolDefinition[] = [
  { Class: LengthTool, shape: 'length' },
  { Class: AngleTool, shape: 'angle' },
  { Class: EllipticalROITool, shape: 'ellipse' },
  { Class: ProbeTool, shape: 'probe' },
  { Class: RectangleROITool, shape: 'rectangle' },
  { Class: CircleROITool, shape: 'circle' },
  { Class: PolygonTool, shape: 'contour', configuration: { spline: { type: SPLINE.Linear } } },
  { Class: PolylineTool, shape: 'contour', configuration: { allowOpenSplines: true, spline: { type: SPLINE.Linear } } },
  { Class: CurveTool, shape: 'contour', configuration: { spline: { type: SPLINE.CatmullRom } } },
  { Class: PlanarFreehandROITool, shape: 'contour' },
  { Class: PencilTool, shape: 'none', configuration: { calculateStats: false, getTextLines: () => [] } },
  { Class: BidirectionalTool, shape: 'bidirectional' },
  { Class: CobbAngleTool, shape: 'cobb' },
  { Class: ArrowAnnotateTool, shape: 'text', configuration: textCallbacks },
  { Class: LabelTool, shape: 'text', configuration: textCallbacks },
  {
    Class: SpineLabelTool,
    shape: 'text',
    configuration: { getTextCallback: (done: (text: string) => void) => done(nextSpineLabel()), changeTextCallback: textCallbacks.changeTextCallback },
  },
  { Class: RedactionTool, shape: 'none', configuration: { getTextLines: () => [] } },
  { Class: DeviationTool, shape: 'deviation' },
  { Class: LengthRatioTool, shape: 'length' },
  { Class: EllipsoidTool, shape: 'length' },
  { Class: CalibrationTool, shape: 'length' },
]

for (const { Class, shape } of MEASUREMENT_TOOLS) registerShape(Class.toolName, shape)

/** Configuration of a tool when it is added to a tool group. */
export function toolConfiguration(toolName: string): Record<string, unknown> {
  const definition = MEASUREMENT_TOOLS.find((d) => d.Class.toolName === toolName)
  if (!definition) return {}
  const textLines = definition.shape === 'text' || definition.shape === 'none' ? {} : { getTextLines: textLinesFor(toolName) }
  return { ...textLines, ...definition.configuration }
}
