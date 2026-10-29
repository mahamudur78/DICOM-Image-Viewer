// Viewport ids of the PET/CT layout's PET and fusion rows, and the camera
// sync that keeps them on the CT row's planes.
import { Enums, getRenderingEngine, type Types } from '@cornerstonejs/core'
import { useEffect } from 'react'
import { RENDERING_ENGINE_ID } from '../cornerstone/constants'
import { MPR_VIEWPORTS } from '../cornerstone/mpr'

const engine = () => getRenderingEngine(RENDERING_ENGINE_ID)

export const PET_ROW = MPR_VIEWPORTS.map(({ id, label, orientation }) => ({ id: id.replace('mpr-', 'petct-pet-'), label, orientation, source: id }))
export const FUSED_ROW = MPR_VIEWPORTS.map(({ id, label, orientation }) => ({ id: id.replace('mpr-', 'petct-fused-'), label, orientation, source: id }))

/**
 * The PET and fusion rows follow the CT row's planes (and each other): a
 * change of camera in one view of an orientation is copied to the others.
 */
export function usePlaneSync() {
  useEffect(() => {
    let copying = false
    const groups = MPR_VIEWPORTS.map(({ id }, i) => [id, PET_ROW[i].id, FUSED_ROW[i].id])
    const listeners: [HTMLElement, () => void][] = []
    const attach = () => {
      for (const group of groups)
        for (const id of group) {
          const viewport = engine()?.getViewport(id) as Types.IVolumeViewport | undefined
          if (!viewport || listeners.some(([element]) => element === viewport.element)) continue
          const onCamera = () => {
            if (copying) return
            copying = true
            const camera = viewport.getCamera()
            for (const other of group) {
              if (other === id) continue
              const target = engine()?.getViewport(other) as Types.IVolumeViewport | undefined
              if (!target?.getActors().length) continue
              target.setCamera({ focalPoint: camera.focalPoint, position: camera.position, viewUp: camera.viewUp, parallelScale: camera.parallelScale, viewPlaneNormal: camera.viewPlaneNormal })
              target.render()
            }
            copying = false
          }
          viewport.element.addEventListener(Enums.Events.CAMERA_MODIFIED, onCamera)
          listeners.push([viewport.element, onCamera])
        }
    }
    // Viewports mount at different times.
    const timer = window.setInterval(attach, 500)
    attach()
    return () => {
      window.clearInterval(timer)
      for (const [element, listener] of listeners) element.removeEventListener(Enums.Events.CAMERA_MODIFIED, listener)
    }
  }, [])
}
