import type { PrimaryTool } from '../cornerstone/tools'

export const TOOL_BUTTONS: { tool: PrimaryTool; label: string; icon: string; key: string }[] = [
  { tool: 'windowLevel', label: 'Window / Level', icon: '◐', key: 'W' },
  { tool: 'pan', label: 'Pan', icon: '✥', key: 'P' },
  { tool: 'zoom', label: 'Zoom', icon: '🔍', key: 'Z' },
  { tool: 'length', label: 'Length', icon: '📏', key: 'L' },
  { tool: 'angle', label: 'Angle', icon: '∠', key: 'A' },
  { tool: 'ellipse', label: 'Ellipse ROI', icon: '◯', key: 'E' },
  { tool: 'probe', label: 'Probe (pixel value)', icon: '⌖', key: 'B' },
]

export const TOOL_SHORTCUTS = Object.fromEntries(TOOL_BUTTONS.map((b) => [b.key.toLowerCase(), b.tool])) as Record<
  string,
  PrimaryTool
>
