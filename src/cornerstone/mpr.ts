import {
  Enums,
  cache,
  cornerstoneStreamingImageVolumeLoader,
  eventTarget,
  getRenderingEngine,
  imageLoader,
  metaData,
  setVolumesForViewports,
  utilities,
  ProgressiveRetrieveImages,
  volumeLoader,
  type Types,
} from '@cornerstonejs/core'
import { CrosshairsTool, ToolGroupManager } from '@cornerstonejs/tools'
import { getImagePlane } from '../dicom/imagePlaneMetadata'
import type { Series } from '../dicom/types'
import { MPR_TOOL_GROUP_ID } from './tools'
import { MPR_AXIAL_ID, MPR_CORONAL_ID, MPR_SAGITTAL_ID, RENDERING_ENGINE_ID } from './constants'
import { createRenderingEngine } from './viewer'
import { registerViewport, unregisterViewport } from './viewportRegistry'

const VOLUME_SCHEME = 'cornerstoneStreamingImageVolume'

export const MPR_VIEWPORTS = [
  { id: MPR_AXIAL_ID, label: 'viewport.axial', orientation: Enums.OrientationAxis.AXIAL },
  { id: MPR_SAGITTAL_ID, label: 'viewport.sagittal', orientation: Enums.OrientationAxis.SAGITTAL },
  { id: MPR_CORONAL_ID, label: 'viewport.coronal', orientation: Enums.OrientationAxis.CORONAL },
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
  // Large volumes appear coarse first: every 4th slice loads early (neighbours
  // stand in for the rest), then the gaps fill in.
  utilities.imageRetrieveMetadataProvider.add('volume', ProgressiveRetrieveImages.interleavedRetrieveStages)
}

export function getMprViewport(viewportId: string): Types.IVolumeViewport | undefined {
  return getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(viewportId) as Types.IVolumeViewport | undefined
}

/** Why a series cannot be reconstructed (an i18n key), or null when MPR is possible. */
export function mprUnsupportedReason(series: Series): string | null {
  // Enhanced multi-frame objects work too: each frame has its own position.
  if (!series.hasOrientation) return 'volume.noOrientation'
  if (series.images.length < 3) return 'volume.tooFewSlices'
  if (series.kind !== 'image') return 'volume.notImages'
  const locations = new Set(series.images.map((image) => image.sliceLocation))
  if (locations.has(null) || locations.size < series.images.length) return 'volume.duplicatePositions'
  return null
}

export const volumeIdFor = (series: Series) => `${VOLUME_SCHEME}:${series.id}`

export function isVolumeCached(series: Series) {
  return !!cache.getVolume(volumeIdFor(series))
}

/** Rough size of the series as a 16-bit volume, in bytes (float data would be twice this). */
export function estimateVolumeBytes(series: Series) {
  const plane = getImagePlane(series.images[0].imageId)
  return plane ? plane.rows * plane.columns * series.images.length * 2 : 0
}

/** Phones, tablets and low-memory devices get smaller memory budgets. */
export function isSmallDevice() {
  const deviceMemoryGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return window.matchMedia('(max-width: 1023px)').matches || (deviceMemoryGb !== undefined && deviceMemoryGb <= 4)
}

/** Budget above which building a volume asks for confirmation. */
export function volumeMemoryBudget() {
  return (isSmallDevice() ? 192 : 512) * 1024 * 1024
}

/**
 * Decoded images and volumes kept in memory. When the cache is full,
 * Cornerstone drops the least recently used images and decodes them again
 * when they are shown; volumes must fit, so the limit stays above the volume budget.
 */
export function imageCacheBudget() {
  return (isSmallDevice() ? 384 : 1536) * 1024 * 1024
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

export function mountMprViewport(viewportId: string, orientation: Enums.OrientationAxis, element: HTMLDivElement, toolGroupId = MPR_TOOL_GROUP_ID) {
  createRenderingEngine().enableElement({
    viewportId,
    type: Enums.ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: { orientation, background: [0, 0, 0] },
  })
  ToolGroupManager.getToolGroup(toolGroupId)?.addViewport(viewportId, RENDERING_ENGINE_ID)
  registerViewport(viewportId, 'mpr')
}

export function unmountMprViewport(viewportId: string) {
  unregisterViewport(viewportId)
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

/** Where the crosshairs (the three MPR planes) cross, once they are drawn. */
export function crosshairCenter(): number[] | null {
  const crosshairs = ToolGroupManager.getToolGroup(MPR_TOOL_GROUP_ID)?.getToolInstance(CrosshairsTool.toolName) as { toolCenter?: number[] } | undefined
  const center = crosshairs?.toolCenter
  return center && center.some((v) => v !== 0) ? [...center] : null
}
