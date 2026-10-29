// The "Segment" tool: forwards mouse and touch input on stack and MPR
// viewports to the segmentation editor (loaded with its panel), and the
// state its preview layer draws (brush outline, scissors path).
import { getEnabledElement, type Types } from '@cornerstonejs/core'
import { BaseTool, Enums as ToolEnums, type Types as ToolTypes } from '@cornerstonejs/tools'
import { create } from 'zustand'

export const SEGMENT_TOOL = 'SegmentEdit'

export type SegmentToolKind = 'brush' | 'eraser' | 'threshold' | 'fill' | 'rect' | 'circle' | 'free' | 'contour'

export interface PointerInput {
  viewportId: string
  world: number[]
  canvas: [number, number]
  /** The view's direction (into the screen). */
  normal: number[]
  shift: boolean
}

export interface SegmentHandler {
  down(input: PointerInput): void
  drag(input: PointerInput): void
  up(input: PointerInput): void
}

let handler: SegmentHandler | null = null
export const setSegmentHandler = (next: SegmentHandler | null) => (handler = next)

/** What the preview layer draws: the brush size and the path being drawn. */
export const useSegmentTool = create<{ kind: SegmentToolKind; radius: number; path: { viewportId: string; points: [number, number][]; closed: boolean } | null }>()(() => ({
  kind: 'brush',
  radius: 5,
  path: null,
}))

function inputOf(evt: ToolTypes.EventTypes.InteractionEventType): PointerInput | null {
  const viewport = getEnabledElement(evt.detail.element)?.viewport as Types.IViewport | undefined
  if (!viewport) return null
  const camera = viewport.getCamera()
  const event = (evt.detail as { event?: { shiftKey?: boolean } }).event
  return {
    viewportId: viewport.id,
    world: [...evt.detail.currentPoints.world],
    canvas: [...evt.detail.currentPoints.canvas] as [number, number],
    normal: [...(camera.viewPlaneNormal ?? [0, 0, 1])],
    shift: !!event?.shiftKey,
  }
}

export class SegmentEditTool extends BaseTool {
  static toolName = SEGMENT_TOOL

  constructor(toolProps: ToolTypes.PublicToolProps = {}, defaultToolProps: ToolTypes.ToolProps = { supportedInteractionTypes: ['Mouse', 'Touch'] }) {
    super(toolProps, defaultToolProps)
  }

  preMouseDownCallback = (evt: ToolTypes.EventTypes.InteractionEventType) => {
    const input = inputOf(evt)
    if (!input || !handler) return true
    handler.down(input)
    const element = evt.detail.element
    let last = input
    const move = (e: Event) => {
      const next = inputOf(e as ToolTypes.EventTypes.InteractionEventType)
      if (next) last = next
    }
    const finish = () => {
      element.removeEventListener(ToolEnums.Events.MOUSE_DRAG, move)
      element.removeEventListener(ToolEnums.Events.MOUSE_UP, finish)
      element.removeEventListener(ToolEnums.Events.MOUSE_CLICK, finish)
      element.removeEventListener(ToolEnums.Events.TOUCH_END, finish)
      handler?.up(last)
    }
    element.addEventListener(ToolEnums.Events.MOUSE_DRAG, move)
    element.addEventListener(ToolEnums.Events.MOUSE_UP, finish)
    element.addEventListener(ToolEnums.Events.MOUSE_CLICK, finish)
    element.addEventListener(ToolEnums.Events.TOUCH_END, finish)
    return true
  }

  preTouchStartCallback = (evt: ToolTypes.EventTypes.InteractionEventType) => this.preMouseDownCallback(evt)

  mouseDragCallback = (evt: ToolTypes.EventTypes.InteractionEventType) => {
    const input = inputOf(evt)
    if (input) handler?.drag(input)
  }

  touchDragCallback = (evt: ToolTypes.EventTypes.InteractionEventType) => this.mouseDragCallback(evt)
}
