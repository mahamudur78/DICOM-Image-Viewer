import {
  Enums,
  cache,
  cornerstoneStreamingImageVolumeLoader,
  eventTarget,
  getRenderingEngine,
  imageLoader,
  metaData,
  setVolumesForViewports,
  volumeLoader,
  type Types,
} from '@cornerstonejs/core'
import { ToolGroupManager } from '@cornerstonejs/tools'
import { getImagePlane } from '../dicom/imagePlaneMetadata'
import type { Series } from '../dicom/types'
import { MPR_TOOL_GROUP_ID } from './tools'
import { RENDERING_ENGINE_ID, createRenderingEngine } from './viewer'

const VOLUME_SCHEME = 'cornerstoneStreamingImageVolume'

export const MPR_VIEWPORTS = [
  { id: 'mpr-axial', label: 'Axial', orientation: Enums.OrientationAxis.AXIAL },
  { id: 'mpr-sagittal', label: 'Sagittal', orientation: Enums.OrientationAxis.SAGITTAL },
  { id: 'mpr-coronal', label: 'Coronal', orientation: Enums.OrientationAxis.CORONAL },
] as const

export type SlabMode = 'mip' | 'minip' | 'avg'

const BLEND_MODES: Record<SlabMode, Enums.BlendModes> = {
  mip: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,
  minip: Enums.BlendModes.MINIMUM_INTENSITY_BLEND,
  avg: Enums.BlendModes.AVERAGE_INTENSITY_BLEND,
}

export function registerVolumeLoaders() {
  // The loader's declared options type is narrower than VolumeLoaderFn's, though it is the standard pairing.
  const loader = cornerstoneStreamingImageVolumeLoader as unknown as Types.VolumeLoaderFn
  volumeLoader.registerVolumeLoader(VOLUME_SCHEME, loader)
  volumeLoader.registerUnknownVolumeLoader(loader)
}

export function getMprViewport(viewportId: string): Types.IVolumeViewport | undefined {
  return getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(viewportId) as Types.IVolumeViewport | undefined
}

/** Why a series cannot be reconstructed, or null when MPR is possible. */
export function mprUnsupportedReason(series: Series): string | null {
  if (!series.hasOrientation) return 'This series has no orientation information.'
  if (series.images.length < 3) return 'MPR needs a series with at least 3 slices.'
  if (series.images.some((image) => image.imageId.includes('?frame='))) {
    return 'Multi-frame series are not supported in MPR yet.'
  }
  const locations = new Set(series.images.map((image) => image.sliceLocation))
  if (locations.has(null) || locations.size < series.images.length) {
    return 'Slices must have distinct positions to build a volume.'
  }
  return null
}

const volumeIdFor = (series: Series) => `${VOLUME_SCHEME}:${series.seriesInstanceUID}`

export function isVolumeCached(series: Series) {
  return !!cache.getVolume(volumeIdFor(series))
}

/** Rough size of the series as a 16-bit volume, in bytes (float data would be twice this). */
export function estimateVolumeBytes(series: Series) {
  const plane = getImagePlane(series.images[0].imageId)
  return plane ? plane.rows * plane.columns * series.images.length * 2 : 0
}

/** Budget above which building a volume asks for confirmation; smaller on phones. */
export function volumeMemoryBudget() {
  const deviceMemoryGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const smallDevice = window.matchMedia('(max-width: 1023px)').matches || (deviceMemoryGb !== undefined && deviceMemoryGb <= 4)
  return (smallDevice ? 192 : 512) * 1024 * 1024
}

let webgl2: boolean | null = null

/** Volume rendering needs WebGL2 (3D textures). */
export function supportsWebGL2() {
  webgl2 ??= !!document.createElement('canvas').getContext('webgl2')
  return webgl2
}

/**
 * Builds (or reuses) a streaming volume for the series and starts loading its
 * slices. Resolves once the volume's geometry is known; pixels keep streaming
 * in and `onProgress` reports the fraction loaded.
 */
export async function loadVolume(series: Series, onProgress: (fraction: number) => void): Promise<string> {
  const volumeId = volumeIdFor(series)
  const imageIds = series.images.map((image) => image.imageId)

  const cached = cache.getVolume(volumeId) as Types.IStreamingImageVolume | undefined
  if (cached) {
    onProgress(cached.loadStatus?.loaded ? 1 : 0)
    return volumeId
  }

  // The streaming loader only prefetches `wadouri:` ids; pixel/VOI metadata of
  // local `dicomfile:` ids exists once an image is loaded, so load a few first.
  const sample = [0, Math.floor(imageIds.length / 2), imageIds.length - 1]
  await Promise.all(sample.map((i) => imageLoader.loadAndCacheImage(imageIds[i])))

  const onModified = (event: Event) => {
    const { volumeId: id, framesProcessed, numberOfFrames } = (event as Types.EventTypes.ImageVolumeModifiedEvent).detail
    if (id !== volumeId) return
    onProgress(framesProcessed / numberOfFrames)
    if (framesProcessed >= numberOfFrames) eventTarget.removeEventListener(Enums.Events.IMAGE_VOLUME_MODIFIED, onModified)
  }
  eventTarget.addEventListener(Enums.Events.IMAGE_VOLUME_MODIFIED, onModified)

  const volume = (await volumeLoader.createAndCacheVolume(volumeId, { imageIds })) as Types.IStreamingImageVolume
  volume.load()
  return volumeId
}

export function mountMprViewport(viewportId: string, orientation: Enums.OrientationAxis, element: HTMLDivElement) {
  createRenderingEngine().enableElement({
    viewportId,
    type: Enums.ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: { orientation, background: [0, 0, 0] },
  })
  ToolGroupManager.getToolGroup(MPR_TOOL_GROUP_ID)?.addViewport(viewportId, RENDERING_ENGINE_ID)
}

export function unmountMprViewport(viewportId: string) {
  getRenderingEngine(RENDERING_ENGINE_ID)?.disableElement(viewportId)
}

/**
 * Shows the volume in all MPR viewports, starting from the window stored in
 * the series (the volume would otherwise default to its full pixel range).
 */
export async function showVolume(volumeId: string, referenceImageId: string) {
  const engine = getRenderingEngine(RENDERING_ENGINE_ID)
  if (!engine) return
  const viewportIds = MPR_VIEWPORTS.map((v) => v.id).filter((id) => engine.getViewport(id))
  await setVolumesForViewports(engine, [{ volumeId }], viewportIds)

  const voi = metaData.get('voiLutModule', referenceImageId) as
    | { windowCenter?: number[]; windowWidth?: number[] }
    | undefined
  const width = voi?.windowWidth?.[0]
  const center = voi?.windowCenter?.[0]
  if (width && center !== undefined) {
    for (const id of viewportIds) {
      const viewport = engine.getViewport(id) as Types.IVolumeViewport
      viewport.setProperties({ voiRange: { lower: center - width / 2, upper: center + width / 2 } })
    }
  }
  engine.renderViewports(viewportIds)
}

/** Thick-slab rendering (MIP / MinIP / average) on all MPR viewports; 0 mm turns it off. */
export function setSlab(mode: SlabMode, thicknessMm: number) {
  for (const { id } of MPR_VIEWPORTS) {
    const viewport = getMprViewport(id)
    if (!viewport) continue
    if (thicknessMm > 0) {
      viewport.setBlendMode(BLEND_MODES[mode])
      viewport.setSlabThickness(thicknessMm)
    } else {
      viewport.setBlendMode(Enums.BlendModes.COMPOSITE)
      viewport.resetSlabThickness()
    }
    viewport.render()
  }
}
