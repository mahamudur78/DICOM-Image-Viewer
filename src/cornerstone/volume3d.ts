import {
  CONSTANTS,
  Enums,
  getEnabledElement,
  getRenderingEngine,
  setVolumesForViewports,
  type Types,
} from '@cornerstonejs/core'
import { BaseTool, ToolGroupManager, type Types as ToolTypes } from '@cornerstonejs/tools'
import { VR_TOOL_GROUP_ID } from './tools'
import { registerViewport, unregisterViewport } from './viewportRegistry'
import { RENDERING_ENGINE_ID } from './constants'
import { createRenderingEngine } from './viewer'

export const PRESET_NAMES: string[] = CONSTANTS.VIEWPORT_PRESETS.map((preset) => preset.name)

/** Presets grouped for the dropdown, the series' own modality first. */
export function groupedPresets(modality: string): { label: string; presets: string[] }[] {
  const prefix = (name: string) => name.split('-')[0]
  const own = PRESET_NAMES.filter((name) => prefix(name) === modality)
  const other = PRESET_NAMES.filter((name) => prefix(name) !== modality)
  return own.length ? [{ label: modality, presets: own }, { label: 'Other', presets: other }] : [{ label: 'All', presets: other }]
}

function getVrViewport(viewportId: string): Types.IVolumeViewport | undefined {
  return getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(viewportId) as Types.IVolumeViewport | undefined
}

export function mountVrViewport(viewportId: string, element: HTMLDivElement) {
  createRenderingEngine().enableElement({
    viewportId,
    type: Enums.ViewportType.VOLUME_3D,
    element,
    // Looking at the patient from the front, like a coronal view.
    defaultOptions: { orientation: Enums.OrientationAxis.CORONAL, background: [0, 0, 0] },
  })
  ToolGroupManager.getToolGroup(VR_TOOL_GROUP_ID)?.addViewport(viewportId, RENDERING_ENGINE_ID)
  registerViewport(viewportId, 'volume3d')
}

export function unmountVrViewport(viewportId: string) {
  unregisterViewport(viewportId)
  shiftBaselines.delete(viewportId)
  getRenderingEngine(RENDERING_ENGINE_ID)?.disableElement(viewportId)
}

export async function showVolume3D(viewportId: string, volumeId: string, preset: string) {
  const engine = getRenderingEngine(RENDERING_ENGINE_ID)
  if (!engine?.getViewport(viewportId)) return
  await setVolumesForViewports(engine, [{ volumeId }], [viewportId])
  applyPreset(viewportId, preset)
  getVrViewport(viewportId)?.resetCamera()
  engine.renderViewports([viewportId])
}

export function applyPreset(viewportId: string, preset: string) {
  const viewport = getVrViewport(viewportId)
  if (!viewport) return
  shiftBaselines.delete(viewportId)
  viewport.setProperties({ preset })
  viewport.render()
  for (const listener of shiftListeners) listener(viewportId, 0)
}

/** Front (coronal) view direction; resetCamera alone keeps the current rotation. */
const FRONT_VIEW = CONSTANTS.MPR_CAMERA_VALUES.coronal

/** Restores the front view, zoom and the unshifted preset. */
export function resetVr(viewportId: string, preset: string) {
  const viewport = getVrViewport(viewportId)
  if (!viewport) return
  applyPreset(viewportId, preset)
  viewport.setCamera({
    viewPlaneNormal: [...FRONT_VIEW.viewPlaneNormal] as Types.Point3,
    viewUp: [...FRONT_VIEW.viewUp] as Types.Point3,
  })
  viewport.resetCamera()
  viewport.render()
}

// --- preset shift ------------------------------------------------------------
// A preset maps intensity → colour and opacity through vtk transfer functions.
// Shifting every node along the intensity axis shows denser or lighter tissue,
// much like changing the window level in 2D. Cornerstone has no API for it.

interface ShiftBaseline {
  colorNodes: number[][]
  opacityNodes: number[][]
  shift: number
}

const shiftBaselines = new Map<string, ShiftBaseline>()
const shiftListeners = new Set<(viewportId: string, shift: number) => void>()

export function onShiftChange(listener: (viewportId: string, shift: number) => void) {
  shiftListeners.add(listener)
  return () => shiftListeners.delete(listener)
}

interface TransferFunction {
  getSize(): number
  getNodeValue(index: number, out: number[]): number
  setNodeValue(index: number, value: number[]): number
}

function readNodes(fn: TransferFunction, width: number) {
  return Array.from({ length: fn.getSize() }, (_, i) => {
    const node = new Array<number>(width).fill(0)
    fn.getNodeValue(i, node)
    return node
  })
}

function transferFunctions(viewport: Types.IVolumeViewport) {
  const actor = viewport.getDefaultActor()?.actor as Types.VolumeActor | undefined
  const property = actor?.getProperty()
  if (!property) return null
  return {
    color: property.getRGBTransferFunction(0) as unknown as TransferFunction,
    opacity: property.getScalarOpacity(0) as unknown as TransferFunction,
  }
}

export function shiftPreset(viewportId: string, delta: number) {
  const viewport = getVrViewport(viewportId)
  const fns = viewport && transferFunctions(viewport)
  if (!viewport || !fns) return

  let baseline = shiftBaselines.get(viewportId)
  if (!baseline) {
    // Color nodes are [x, r, g, b, midpoint, sharpness]; opacity nodes [x, y, midpoint, sharpness].
    baseline = { colorNodes: readNodes(fns.color, 6), opacityNodes: readNodes(fns.opacity, 4), shift: 0 }
    shiftBaselines.set(viewportId, baseline)
  }
  baseline.shift += delta
  const { shift } = baseline
  baseline.colorNodes.forEach(([x, ...rest], i) => fns.color.setNodeValue(i, [x + shift, ...rest]))
  baseline.opacityNodes.forEach(([x, ...rest], i) => fns.opacity.setNodeValue(i, [x + shift, ...rest]))
  viewport.render()
  for (const listener of shiftListeners) listener(viewportId, shift)
}

/** Left-drag tool that shifts the active preset; dragging right shows denser tissue. */
export class VolumeShiftTool extends BaseTool {
  static toolName = 'VolumeShift'

  constructor(toolProps: ToolTypes.PublicToolProps = {}, defaultToolProps: ToolTypes.ToolProps = {
    supportedInteractionTypes: ['Mouse', 'Touch'],
    configuration: { unitsPerPixel: 2 },
  }) {
    super(toolProps, defaultToolProps)
  }

  mouseDragCallback = (evt: ToolTypes.EventTypes.InteractionEventType) => this.drag(evt)
  touchDragCallback = (evt: ToolTypes.EventTypes.InteractionEventType) => this.drag(evt)

  private drag(evt: ToolTypes.EventTypes.InteractionEventType) {
    const { element, deltaPoints } = evt.detail
    const viewportId = getEnabledElement(element)?.viewport.id
    if (!viewportId) return
    shiftPreset(viewportId, deltaPoints.canvas[0] * (this.configuration.unitsPerPixel as number))
  }
}
