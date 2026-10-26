import {
  AngleTool,
  CrosshairsTool,
  EllipticalROITool,
  Enums as ToolEnums,
  LengthTool,
  MagnifyTool,
  PanTool,
  ProbeTool,
  ReferenceLinesTool,
  StackScrollTool,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
} from '@cornerstonejs/tools'

const { MouseBindings } = ToolEnums

/** One tool group shared by every stack viewport; viewports join it as they mount. */
export const TOOL_GROUP_ID = 'main-tool-group'
/** Tool group of the three MPR (volume) viewports. */
export const MPR_TOOL_GROUP_ID = 'mpr-tool-group'

/** Tools that can be bound to the left mouse button from the toolbar. */
export const PRIMARY_TOOLS = {
  windowLevel: WindowLevelTool.toolName,
  pan: PanTool.toolName,
  zoom: ZoomTool.toolName,
  magnify: MagnifyTool.toolName,
  crosshairs: CrosshairsTool.toolName,
  length: LengthTool.toolName,
  angle: AngleTool.toolName,
  ellipse: EllipticalROITool.toolName,
  probe: ProbeTool.toolName,
} as const

export type PrimaryTool = keyof typeof PRIMARY_TOOLS

/** Crosshairs only work across volume viewports, so they exist in MPR only. */
const MPR_ONLY_TOOLS: string[] = [CrosshairsTool.toolName]

function setupToolGroup(id: string) {
  ToolGroupManager.destroyToolGroup(id)
  const toolGroup = ToolGroupManager.createToolGroup(id)!
  const isMpr = id === MPR_TOOL_GROUP_ID

  for (const toolName of Object.values(PRIMARY_TOOLS)) {
    if (isMpr || !MPR_ONLY_TOOLS.includes(toolName)) toolGroup.addTool(toolName)
  }
  toolGroup.addTool(StackScrollTool.toolName)

  // Fixed bindings that work regardless of the selected toolbar tool.
  toolGroup.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }] })
  toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }] })
  toolGroup.setToolActive(StackScrollTool.toolName, { bindings: [{ mouseButton: MouseBindings.Wheel }] })

  // Measurements (and crosshairs) stay visible and editable when another tool is selected.
  for (const toolName of [LengthTool, AngleTool, EllipticalROITool, ProbeTool].map((t) => t.toolName)) {
    toolGroup.setToolPassive(toolName)
  }
  return toolGroup
}

export function createToolGroups() {
  setupToolGroup(TOOL_GROUP_ID).addTool(ReferenceLinesTool.toolName)
  setupToolGroup(MPR_TOOL_GROUP_ID)
}

/**
 * Draws the plane of the source viewport (the active one) as a line on every
 * other viewport that intersects it, e.g. the axial slice position on a scout.
 */
export function setReferenceLines(sourceViewportId: string | null) {
  const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID)
  if (!toolGroup) return
  if (!sourceViewportId) {
    toolGroup.setToolDisabled(ReferenceLinesTool.toolName)
    return
  }
  toolGroup.setToolConfiguration(ReferenceLinesTool.toolName, { sourceViewportId })
  toolGroup.setToolEnabled(ReferenceLinesTool.toolName)
}

/** Binds the tool to the left mouse button in every tool group that has it. */
export function setPrimaryTool(tool: PrimaryTool) {
  const toolName = PRIMARY_TOOLS[tool]
  for (const id of [TOOL_GROUP_ID, MPR_TOOL_GROUP_ID]) {
    const toolGroup = ToolGroupManager.getToolGroup(id)
    if (!toolGroup?.hasTool(toolName)) continue

    const current = toolGroup.getActivePrimaryMouseButtonTool()
    if (current === toolName) continue
    if (current) toolGroup.setToolPassive(current)
    toolGroup.setToolActive(toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] })
  }
}
