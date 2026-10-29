// Movies and large images of the 3D view.
import { Enums, type Types } from '@cornerstonejs/core'
import { createRenderingEngine } from '../cornerstone/viewer'
import {
  applyClipping,
  blendCameras,
  getLighting,
  getTransferFunction,
  restoreSnapshot,
  setLighting,
  setTransferFunction,
  viewSettings,
  vrViewport,
  type Snapshot,
} from '../cornerstone/volume3dTools'
import { encodeCanvas, encodeMovie, type MovieFormat, type Progress } from './exportImages'
import { downloadBlob, stamp } from './files'
import { captureCurrent, type RenderOptions } from './render'

const PLAIN: RenderOptions = { annotations: false, overlays: false, info: false, privacy: true, filter: '' }

const frame = (viewportId: string) => captureCurrent(viewportId, PLAIN, null)

interface VtkCamera {
  azimuth(degrees: number): void
  elevation(degrees: number): void
  orthogonalizeViewUp(): void
}

/** A full turn around the vertical (screen up) or horizontal axis, as a movie. */
export async function rotationMovie(viewportId: string, axis: 'vertical' | 'horizontal', frames: number, fps: number, format: MovieFormat, onProgress: (p: Progress) => void) {
  const viewport = vrViewport(viewportId)
  if (!viewport) return 0
  const start = viewport.getCamera()
  const camera = (viewport as unknown as { getVtkActiveCamera(): VtkCamera }).getVtkActiveCamera()
  async function* turn() {
    try {
      for (let i = 0; i < frames; i++) {
        if (i > 0) {
          if (axis === 'vertical') camera.azimuth(360 / frames)
          else {
            camera.elevation(360 / frames)
            camera.orthogonalizeViewUp()
          }
        }
        yield await frame(viewportId)
      }
    } finally {
      viewport!.setCamera(start)
      viewport!.render()
    }
  }
  return encodeMovie(turn(), format, fps, frames, `rotation-${stamp()}.${format}`, onProgress)
}

/** Smooth camera moves from snapshot to snapshot (each move `steps` frames), as a movie. */
export async function snapshotMovie(viewportId: string, snapshots: Snapshot[], steps: number, fps: number, format: MovieFormat, onProgress: (p: Progress) => void) {
  const viewport = vrViewport(viewportId)
  if (!viewport || snapshots.length < 2) return 0
  const total = (snapshots.length - 1) * steps + 1
  async function* moves() {
    for (let s = 0; s < snapshots.length - 1; s++) {
      restoreSnapshot(viewportId, snapshots[s])
      for (let i = 0; i < steps; i++) {
        viewport!.setCamera(blendCameras(snapshots[s].camera, snapshots[s + 1].camera, i / steps))
        yield await frame(viewportId)
      }
    }
    restoreSnapshot(viewportId, snapshots[snapshots.length - 1])
    yield await frame(viewportId)
  }
  return encodeMovie(moves(), format, fps, total, `snapshots-${stamp()}.${format}`, onProgress)
}

const HIRES_ID = 'vr-hires'

/** The 3D view rendered `scale` times larger in a hidden viewport, saved as PNG. */
export async function highResolutionPng(viewportId: string, scale: number) {
  const source = vrViewport(viewportId)
  const volumeId = source?.getActors()[0]?.referencedId
  if (!source || !volumeId) return null
  const element = document.createElement('div')
  const ratio = window.devicePixelRatio || 1
  Object.assign(element.style, {
    position: 'fixed',
    left: '-40000px',
    top: '0',
    width: `${(source.element.clientWidth * scale) / ratio}px`,
    height: `${(source.element.clientHeight * scale) / ratio}px`,
  })
  document.body.appendChild(element)
  const engine = createRenderingEngine()
  try {
    engine.enableElement({ viewportId: HIRES_ID, type: Enums.ViewportType.VOLUME_3D, element, defaultOptions: { background: [0, 0, 0] } })
    const hidden = engine.getViewport(HIRES_ID) as Types.IVolumeViewport
    await hidden.setVolumes([{ volumeId }])
    const tf = getTransferFunction(viewportId)
    const lighting = getLighting(viewportId)
    if (tf) setTransferFunction(HIRES_ID, tf)
    if (lighting) setLighting(HIRES_ID, lighting)
    const settings = viewSettings(viewportId)
    applyClipping(HIRES_ID, settings.box, settings.plane)
    hidden.setCamera(source.getCamera())
    const canvas = await captureCurrent(HIRES_ID, PLAIN, null)
    const blob = await encodeCanvas(canvas, 'png')
    downloadBlob(blob, `3d-${canvas.width}x${canvas.height}-${stamp()}.png`)
    return { width: canvas.width, height: canvas.height }
  } finally {
    engine.disableElement(HIRES_ID)
    element.remove()
  }
}
