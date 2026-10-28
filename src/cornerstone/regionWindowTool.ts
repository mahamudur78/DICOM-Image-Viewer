import { getEnabledElement, type Types } from '@cornerstonejs/core'
import { WindowLevelRegionTool, type Types as ToolTypes } from '@cornerstonejs/tools'
import { regionWindow } from '../dicom/windowPresets'
import { worldToImage } from './imageCoords'
import { applyWindow } from './display'

/**
 * Window from a dragged rectangle. Cornerstone's WindowLevelRegionTool
 * (5.13) reads the image at canvas coordinates, which is only right when the
 * image happens to be shown at exactly 1:1; this converts the rectangle to
 * image pixels first, and sets the window to the region's min–max.
 */
export class RegionWindowTool extends WindowLevelRegionTool {
  static toolName = 'RegionWindow'

  constructor(...args: ConstructorParameters<typeof WindowLevelRegionTool>) {
    super(...args)
    this.applyWindowLevelRegion = (annotation: ToolTypes.Annotation, element: HTMLDivElement) => {
      const { viewport } = getEnabledElement(element)!
      const image = (viewport as Types.IStackViewport).getCornerstoneImage?.()
      const points = (annotation.data.handles?.points ?? []) as Types.Point3[]
      if (!image || points.length < 4) return
      const start = worldToImage(viewport.id, points[0])
      const end = worldToImage(viewport.id, points[3])
      if (!start || !end) return
      // Pre-scaled images (CT, PET) already hold display units.
      const scaled = (image as { preScale?: { scaled?: boolean } }).preScale?.scaled
      const window = regionWindow(
        image.getPixelData(),
        image.columns,
        image.rows,
        start,
        end,
        scaled ? 1 : (image.slope ?? 1),
        scaled ? 0 : (image.intercept ?? 0),
      )
      if (window) applyWindow(viewport.id, window.width, window.center)
    }
  }
}
