import { init as coreInit } from '@cornerstonejs/core'
import { init as dicomImageLoaderInit } from '@cornerstonejs/dicom-image-loader'
import {
  AngleTool,
  EllipticalROITool,
  LengthTool,
  MagnifyTool,
  PanTool,
  ProbeTool,
  ReferenceLinesTool,
  StackScrollTool,
  WindowLevelTool,
  ZoomTool,
  addTool,
  init as toolsInit,
} from '@cornerstonejs/tools'
import { registerImagePlaneProvider } from '../dicom/imagePlaneMetadata'
import { createSynchronizers } from './sync'
import { createToolGroup } from './tools'
import { createRenderingEngine } from './viewer'

let initPromise: Promise<void> | null = null

export function initCornerstone(): Promise<void> {
  initPromise ??= (async () => {
    coreInit()
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
      PanTool,
      ZoomTool,
      MagnifyTool,
      StackScrollTool,
      LengthTool,
      AngleTool,
      EllipticalROITool,
      ProbeTool,
      ReferenceLinesTool,
    ]) {
      addTool(tool)
    }
    createToolGroup()
    createSynchronizers()
  })()
  return initPromise
}
