export interface WindowPreset {
  /** i18n key */
  label: string
  width: number
  center: number
}

/** Common CT window presets (Hounsfield units). */
export const CT_PRESETS: WindowPreset[] = [
  { label: 'presets.softTissue', width: 400, center: 40 },
  { label: 'presets.lung', width: 1500, center: -600 },
  { label: 'presets.bone', width: 1800, center: 400 },
  { label: 'presets.brain', width: 80, center: 40 },
  { label: 'presets.abdomen', width: 350, center: 50 },
  { label: 'presets.liver', width: 150, center: 30 },
]

/**
 * Index of the preset matching a window, or -1. Allows ±1 because a DICOM
 * window of 400/40 is stored as the range -160..239 (width 399).
 */
export function findPresetIndex(presets: WindowPreset[], window: { width: number; center: number }) {
  return presets.findIndex((p) => Math.abs(p.width - window.width) <= 1 && Math.abs(p.center - window.center) <= 1)
}
