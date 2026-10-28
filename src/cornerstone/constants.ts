// Ids and defaults shared by the Cornerstone modules and the stores. This file
// must not import Cornerstone, so the stores stay testable in Node.

export const RENDERING_ENGINE_ID = 'main-rendering-engine'
export const MAX_VIEWPORTS = 4

export const viewportIdAt = (cell: number) => `viewport-${cell}`

export const MPR_AXIAL_ID = 'mpr-axial'
export const MPR_SAGITTAL_ID = 'mpr-sagittal'
export const MPR_CORONAL_ID = 'mpr-coronal'

export const VR_VIEWPORT_ID = 'vr-main'
/** The 3D cell of the "MPR + 3D" layout. */
export const MPR_VR_VIEWPORT_ID = 'vr-mpr'

export function defaultPresetFor(modality: string) {
  if (modality === 'CT') return 'CT-Bone'
  if (modality === 'MR') return 'MR-Default'
  return 'CT-Soft-Tissue'
}
