import {
  AngleTool,
  ArrowAnnotateTool,
  BidirectionalTool,
  CircleROITool,
  CobbAngleTool,
  CrosshairsTool,
  EllipticalROITool,
  Enums as ToolEnums,
  LabelTool,
  LengthTool,
  MagnifyTool,
  OrientationMarkerTool,
  PanTool,
  PlanarFreehandROITool,
  ProbeTool,
  RectangleROITool,
  ScaleOverlayTool,
  StackScrollTool,
  ToolGroupManager,
  TrackballRotateTool,
  WindowLevelTool,
  ZoomTool,
} from '@cornerstonejs/tools'
import {
  CalibrationTool,
  CurveTool,
  DeviationTool,
  EllipsoidTool,
  LengthRatioTool,
  PencilTool,
  PolygonTool,
  PolylineTool,
  RedactionTool,
  SpineLabelTool,
  toolConfiguration,
} from '../measurements/tools'
import { RegionWindowTool } from './regionWindowTool'

const { MouseBindings } = ToolEnums

/** One tool group shared by every stack viewport; viewports join it as they mount. */
export const TOOL_GROUP_ID = 'main-tool-group'
/** Tool group of the three MPR (volume) viewports. */
export const MPR_TOOL_GROUP_ID = 'mpr-tool-group'
/** Tool group of the 3D volume rendering viewport. */
export const VR_TOOL_GROUP_ID = 'vr-tool-group'

/** Name of the custom preset-shift tool (defined in volume3d.ts to keep vtk details there). */
export const VOLUME_SHIFT_TOOL = 'VolumeShift'

/** Name of the 3D cursor tool (defined in comparison/cursor3d.ts, which needs this module). */
export const CURSOR_3D_TOOL = 'Cursor3D'

/** Tools that can be bound to the left mouse button from the toolbar. */
export const PRIMARY_TOOLS = {
  windowLevel: WindowLevelTool.toolName,
  windowRegion: RegionWindowTool.toolName,
  pan: PanTool.toolName,
  zoom: ZoomTool.toolName,
  magnify: MagnifyTool.toolName,
  crosshairs: CrosshairsTool.toolName,
  rotate: TrackballRotateTool.toolName,
  shift: VOLUME_SHIFT_TOOL,
  cursor3d: CURSOR_3D_TOOL,
  length: LengthTool.toolName,
  angle: AngleTool.toolName,
  ellipse: EllipticalROITool.toolName,
  probe: ProbeTool.toolName,
  rectangle: RectangleROITool.toolName,
  circle: CircleROITool.toolName,
  polygon: PolygonTool.toolName,
  polyline: PolylineTool.toolName,
  curve: CurveTool.toolName,
  freehand: PlanarFreehandROITool.toolName,
  pencil: PencilTool.toolName,
  bidirectional: BidirectionalTool.toolName,
  cobb: CobbAngleTool.toolName,
  arrow: ArrowAnnotateTool.toolName,
  label: LabelTool.toolName,
  spine: SpineLabelTool.toolName,
  deviation: DeviationTool.toolName,
  ratio: LengthRatioTool.toolName,
  ellipsoid: EllipsoidTool.toolName,
  redaction: RedactionTool.toolName,
  calibrate: CalibrationTool.toolName,
} as const

export type PrimaryTool = keyof typeof PRIMARY_TOOLS

/** Annotation tools on images and MPR planes. */
export const MEASUREMENTS: PrimaryTool[] = [
  'length',
  'angle',
  'ellipse',
  'probe',
  'rectangle',
  'circle',
  'polygon',
  'polyline',
  'curve',
  'freehand',
  'pencil',
  'bidirectional',
  'cobb',
  'arrow',
  'label',
  'spine',
  'deviation',
  'ratio',
  'ellipsoid',
]

/** Only on images: redaction hides burned-in text, calibration sets an image's spacing. */
const IMAGE_ONLY: PrimaryTool[] = ['redaction', 'calibrate']

/** Tools that finish a drawing with a double-click, which must not also maximize the viewport. */
export const DOUBLE_CLICK_TOOLS: PrimaryTool[] = ['polygon', 'polyline', 'curve', 'arrow', 'label', 'spine']

/** Which toolbar tools exist in each view mode's tool group. */
const GROUP_TOOLS: Record<string, PrimaryTool[]> = {
  [TOOL_GROUP_ID]: ['windowLevel', 'windowRegion', 'pan', 'zoom', 'magnify', 'cursor3d', ...MEASUREMENTS, ...IMAGE_ONLY],
  [MPR_TOOL_GROUP_ID]: ['windowLevel', 'windowRegion', 'pan', 'zoom', 'magnify', 'crosshairs', 'cursor3d', ...MEASUREMENTS],
  [VR_TOOL_GROUP_ID]: ['rotate', 'shift', 'pan', 'zoom'],
}

function setupToolGroup(id: string) {
  ToolGroupManager.destroyToolGroup(id)
  const toolGroup = ToolGroupManager.createToolGroup(id)!
  const tools = GROUP_TOOLS[id]
  for (const tool of tools) toolGroup.addTool(PRIMARY_TOOLS[tool], toolConfiguration(PRIMARY_TOOLS[tool]))

  // Fixed bindings that work regardless of the selected toolbar tool.
  toolGroup.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }] })
  toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }] })
  // Shift+click places the 3D cursor whatever tool is selected.
  if (tools.includes('cursor3d')) {
    toolGroup.setToolActive(CURSOR_3D_TOOL, { bindings: [{ mouseButton: MouseBindings.Primary, modifierKey: ToolEnums.KeyboardBindings.Shift }] })
  }

  // Measurements stay visible and editable when another tool is selected.
  for (const tool of tools) {
    if (MEASUREMENTS.includes(tool) || IMAGE_ONLY.includes(tool)) toolGroup.setToolPassive(PRIMARY_TOOLS[tool])
  }
  return toolGroup
}

export function createToolGroups() {
  for (const id of [TOOL_GROUP_ID, MPR_TOOL_GROUP_ID]) {
    const toolGroup = setupToolGroup(id)
    toolGroup.addTool(StackScrollTool.toolName)
    toolGroup.setToolActive(StackScrollTool.toolName, { bindings: [{ mouseButton: MouseBindings.Wheel }] })
  }
  const main = ToolGroupManager.getToolGroup(TOOL_GROUP_ID)!
  main.addTool(ScaleOverlayTool.toolName, { scaleLocation: 'bottom' })
  // PET windows in SUV are only a few units wide.
  for (const id of [TOOL_GROUP_ID, MPR_TOOL_GROUP_ID]) {
    ToolGroupManager.getToolGroup(id)!.setToolConfiguration(RegionWindowTool.toolName, { minWindowWidth: 0.1 })
  }

  // 3D: the wheel zooms (there are no slices to scroll), and the cube shows orientation.
  const vr = setupToolGroup(VR_TOOL_GROUP_ID)
  vr.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Wheel }] })
  vr.setToolActive(TrackballRotateTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] })
  vr.addTool(OrientationMarkerTool.toolName)
  vr.setToolEnabled(OrientationMarkerTool.toolName)
}

export type ViewMode = 'grid' | 'mpr' | '3d'

const groupForMode = (mode: ViewMode) =>
  mode === 'grid' ? TOOL_GROUP_ID : mode === 'mpr' ? MPR_TOOL_GROUP_ID : VR_TOOL_GROUP_ID

/** Tools the toolbar offers in a view mode. */
export function toolsForMode(mode: ViewMode): PrimaryTool[] {
  return GROUP_TOOLS[groupForMode(mode)]
}

/** The tool selected when a mode opens. */
export const DEFAULT_TOOL: Record<ViewMode, PrimaryTool> = { grid: 'windowLevel', mpr: 'crosshairs', '3d': 'rotate' }

/**
 * Binds the tool to the left mouse button in the current mode's tool group.
 * Other groups keep their own tool, so the 3D cell of "MPR + 3D" keeps rotating.
 */
export function setPrimaryTool(tool: PrimaryTool, mode: ViewMode) {
  const toolName = PRIMARY_TOOLS[tool]
  const toolGroup = ToolGroupManager.getToolGroup(groupForMode(mode))
  if (!toolGroup?.hasTool(toolName)) return

  const current = toolGroup.getActivePrimaryMouseButtonTool()
  if (current === toolName) return
  if (current) toolGroup.setToolPassive(current)
  toolGroup.setToolActive(toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] })
}

/** Scale bar (mm) on the stack viewports. */
export function setScaleBar(visible: boolean) {
  const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID)
  if (!toolGroup) return
  if (visible) toolGroup.setToolEnabled(ScaleOverlayTool.toolName)
  else toolGroup.setToolDisabled(ScaleOverlayTool.toolName)
}
