import {
  AngleTool,
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

/** One tool group shared by every viewport; viewports join it as they mount. */
export const TOOL_GROUP_ID = 'main-tool-group'

/** Tools that can be bound to the left mouse button from the toolbar. */
export const PRIMARY_TOOLS = {
  windowLevel: WindowLevelTool.toolName,
  pan: PanTool.toolName,
  zoom: ZoomTool.toolName,
  magnify: MagnifyTool.toolName,
  length: LengthTool.toolName,
  angle: AngleTool.toolName,
  ellipse: EllipticalROITool.toolName,
  probe: ProbeTool.toolName,
} as const

export type PrimaryTool = keyof typeof PRIMARY_TOOLS

export function createToolGroup() {
  ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID)
  const toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID)!

  for (const toolName of Object.values(PRIMARY_TOOLS)) toolGroup.addTool(toolName)
  toolGroup.addTool(StackScrollTool.toolName)
  toolGroup.addTool(ReferenceLinesTool.toolName)

  // Fixed bindings that work regardless of the selected toolbar tool.
  toolGroup.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }] })
  toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }] })
  toolGroup.setToolActive(StackScrollTool.toolName, { bindings: [{ mouseButton: MouseBindings.Wheel }] })

  // Measurements stay visible and editable when another tool is selected.
  for (const toolName of [LengthTool, AngleTool, EllipticalROITool, ProbeTool].map((t) => t.toolName)) {
    toolGroup.setToolPassive(toolName)
  }
  return toolGroup
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

export function setPrimaryTool(tool: PrimaryTool) {
  const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID)
  if (!toolGroup) return

  const current = toolGroup.getActivePrimaryMouseButtonTool()
  if (current) toolGroup.setToolPassive(current)

  toolGroup.setToolActive(PRIMARY_TOOLS[tool], {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  })
}
