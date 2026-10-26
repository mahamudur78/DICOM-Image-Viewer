import { init as coreInit } from '@cornerstonejs/core'
import { init as dicomImageLoaderInit } from '@cornerstonejs/dicom-image-loader'
import {
  AngleTool,
  EllipticalROITool,
  LengthTool,
  PanTool,
  ProbeTool,
  StackScrollTool,
  WindowLevelTool,
  ZoomTool,
  addTool,
  init as toolsInit,
} from '@cornerstonejs/tools'

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
    toolsInit()

    for (const tool of [
      WindowLevelTool,
      PanTool,
      ZoomTool,
      StackScrollTool,
      LengthTool,
      AngleTool,
      EllipticalROITool,
      ProbeTool,
    ]) {
      addTool(tool)
    }
  })()
  return initPromise
}
