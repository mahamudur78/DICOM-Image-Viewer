import { cache, init as coreInit } from '@cornerstonejs/core'
import { init as dicomImageLoaderInit } from '@cornerstonejs/dicom-image-loader'
import {
  AngleTool,
  CrosshairsTool,
  EllipticalROITool,
  LengthTool,
  MagnifyTool,
  OrientationMarkerTool,
  PanTool,
  ProbeTool,
  ReferenceLinesTool,
  ScaleOverlayTool,
  StackScrollTool,
  TrackballRotateTool,
  WindowLevelTool,
  ZoomTool,
  addTool,
  init as toolsInit,
} from '@cornerstonejs/tools'
import { registerImagePlaneProvider } from '../dicom/imagePlaneMetadata'
import { imageCacheBudget, registerVolumeLoaders } from './mpr'
import { createSynchronizers } from './sync'
import { RegionWindowTool } from './regionWindowTool'
import { createToolGroups } from './tools'
import { createRenderingEngine } from './viewer'
import { VolumeShiftTool } from './volume3d'

let initPromise: Promise<void> | null = null

export function initCornerstone(): Promise<void> {
  initPromise ??= (async () => {
    coreInit()
    cache.setMaxCacheSize(imageCacheBudget())
    dicomImageLoaderInit({
      maxWebWorkers: Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)),
      // Codec WASM files are copied here by scripts/copy-wasm.mjs.
      wasmBasePath: `${import.meta.env.BASE_URL}wasm`,
      // The newer naturalized-metadata loader fails to find pixel data for
      // local `dicomfile:` ids; the dataSet-based loader handles them reliably.
      useLegacyMetadataProvider: true,
    })
    registerImagePlaneProvider()
    toolsInit()
    // Created before any thumbnail is rendered: ReferenceLinesTool looks up
    // viewports on the first registered rendering engine.
    createRenderingEngine()

    for (const tool of [
      WindowLevelTool,
      RegionWindowTool,
      ScaleOverlayTool,
      PanTool,
      ZoomTool,
      MagnifyTool,
      StackScrollTool,
      LengthTool,
      AngleTool,
      EllipticalROITool,
      ProbeTool,
      ReferenceLinesTool,
      CrosshairsTool,
      TrackballRotateTool,
      OrientationMarkerTool,
      VolumeShiftTool,
    ]) {
      addTool(tool)
    }
    createToolGroups()
    registerVolumeLoaders()
    createSynchronizers()

    // Lets the e2e tests inspect viewport state (dev server and `--mode e2e` builds only).
    if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') Object.assign(window, { __dicomlensEngine: createRenderingEngine })
  })()
  return initPromise
}
