import { cache, init as coreInit } from '@cornerstonejs/core'
import { init as dicomImageLoaderInit } from '@cornerstonejs/dicom-image-loader'
import {
  CrosshairsTool,
  MagnifyTool,
  OrientationMarkerTool,
  PanTool,
  ScaleOverlayTool,
  StackScrollTool,
  TrackballRotateTool,
  WindowLevelTool,
  ZoomTool,
  addTool,
  init as toolsInit,
} from '@cornerstonejs/tools'
import { registerImagePlaneProvider } from '../dicom/imagePlaneMetadata'
import { Cursor3DTool } from '../comparison/cursor3d'
import { installWindowSync } from '../comparison/multiWindow'
import { installMeasurementEvents } from '../measurements/manage'
import { installSphereVolumes } from '../functional/sphereVolume'
import { MEASUREMENT_TOOLS } from '../measurements/tools'
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
    // Created before any thumbnail is rendered, so the main engine is the first registered one.
    createRenderingEngine()

    for (const tool of [
      WindowLevelTool,
      RegionWindowTool,
      ScaleOverlayTool,
      PanTool,
      ZoomTool,
      MagnifyTool,
      StackScrollTool,
      ...MEASUREMENT_TOOLS.map((tool) => tool.Class as Parameters<typeof addTool>[0]),
      CrosshairsTool,
      TrackballRotateTool,
      OrientationMarkerTool,
      VolumeShiftTool,
      Cursor3DTool,
    ]) {
      addTool(tool)
    }
    createToolGroups()
    installMeasurementEvents()
    installSphereVolumes()
    installWindowSync()
    registerVolumeLoaders()
    createSynchronizers()

    // Lets the e2e tests inspect viewport state (dev server and `--mode e2e` builds only).
    if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') Object.assign(window, { __dicomlensEngine: createRenderingEngine })
  })()
  return initPromise
}
