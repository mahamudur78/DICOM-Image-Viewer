import {
  AngleTool,
  EllipticalROITool,
  Enums as ToolEnums,
  LengthTool,
  PanTool,
  ProbeTool,
  StackScrollTool,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
} from '@cornerstonejs/tools'

const { MouseBindings } = ToolEnums

export const TOOL_GROUP_ID = 'main-tool-group'

/** Tools that can be bound to the left mouse button from the toolbar. */
export const PRIMARY_TOOLS = {
  windowLevel: WindowLevelTool.toolName,
  pan: PanTool.toolName,
  zoom: ZoomTool.toolName,
  length: LengthTool.toolName,
  angle: AngleTool.toolName,
  ellipse: EllipticalROITool.toolName,
  probe: ProbeTool.toolName,
} as const

export type PrimaryTool = keyof typeof PRIMARY_TOOLS

export function createToolGroup(renderingEngineId: string, viewportId: string) {
  ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID)
  const toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID)!

  for (const toolName of Object.values(PRIMARY_TOOLS)) toolGroup.addTool(toolName)
  toolGroup.addTool(StackScrollTool.toolName)

  // Fixed bindings that work regardless of the selected toolbar tool.
  toolGroup.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }] })
  toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }] })
  toolGroup.setToolActive(StackScrollTool.toolName, { bindings: [{ mouseButton: MouseBindings.Wheel }] })

  // Measurements stay visible and editable when another tool is selected.
  for (const toolName of [LengthTool, AngleTool, EllipticalROITool, ProbeTool].map((t) => t.toolName)) {
    toolGroup.setToolPassive(toolName)
  }

  toolGroup.addViewport(viewportId, renderingEngineId)
  return toolGroup
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
