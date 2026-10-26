import type { PrimaryTool } from '../cornerstone/tools'

export const TOOL_BUTTONS: { tool: PrimaryTool; label: string; icon: string; key: string; mprOnly?: boolean }[] = [
  { tool: 'windowLevel', label: 'Window / Level', icon: '◐', key: 'W' },
  { tool: 'pan', label: 'Pan', icon: '✥', key: 'P' },
  { tool: 'zoom', label: 'Zoom', icon: '🔍', key: 'Z' },
  { tool: 'magnify', label: 'Magnifier', icon: '⊕', key: 'M' },
  { tool: 'crosshairs', label: 'Crosshairs', icon: '✛', key: 'C', mprOnly: true },
  { tool: 'length', label: 'Length', icon: '📏', key: 'L' },
  { tool: 'angle', label: 'Angle', icon: '∠', key: 'A' },
  { tool: 'ellipse', label: 'Ellipse ROI', icon: '◯', key: 'E' },
  { tool: 'probe', label: 'Probe (pixel value)', icon: '⌖', key: 'B' },
]

/** Viewport linking options toggled from the toolbar. */
export interface LinkSettings {
  referenceLines: boolean
  sliceSync: boolean
  voiSync: boolean
}

export const LINK_BUTTONS: { key: keyof LinkSettings; label: string; short: string }[] = [
  { key: 'referenceLines', label: 'Reference lines', short: 'REF' },
  { key: 'sliceSync', label: 'Sync scroll (same plane, by position)', short: 'SYNC' },
  { key: 'voiSync', label: 'Sync window/level', short: 'W/L' },
]

export const TOOL_SHORTCUTS = Object.fromEntries(TOOL_BUTTONS.map((b) => [b.key.toLowerCase(), b.tool])) as Record<
  string,
  PrimaryTool
>
