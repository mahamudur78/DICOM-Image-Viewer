import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Cornerstone keeps global state (rendering engine, web workers, caches,
 * tool groups). Hot-swapping the modules that set it up leaves that state
 * inconsistent (e.g. "worker already registered" or a broken 3D view), so a
 * change in them reloads the page instead. Components still hot-update.
 */
function reloadOnStatefulModules(): Plugin {
  const STATEFUL = /\/src\/(cornerstone|dicom|store)\/|\/src\/runtime(Entry)?\.ts$/
  return {
    name: 'dicomlens:reload-on-stateful-modules',
    handleHotUpdate({ file, server }) {
      if (!STATEFUL.test(file) || /\.test\.ts$/.test(file)) return
      server.ws.send({ type: 'full-reload' })
      return []
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), reloadOnStatefulModules()],
  optimizeDeps: {
    // The image loader spawns its decode worker via `new URL(..., import.meta.url)`,
    // which breaks when Vite pre-bundles it.
    exclude: ['@cornerstonejs/dicom-image-loader'],
    // The WASM codecs ship as CommonJS, so they need pre-bundling to get ESM
    // default exports in dev.
    include: [
      'dicom-parser',
      // Imported on demand; pre-bundled so the dev server never re-optimizes (and reloads) mid-session.
      '@zip.js/zip.js',
      'utif2',
      'mp4-muxer',
      'pdfjs-dist',
      '@cornerstonejs/codec-charls/decodewasmjs',
      '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs',
      '@cornerstonejs/codec-libjxl/decodewasmjs',
      '@cornerstonejs/codec-openjpeg/decodewasmjs',
      '@cornerstonejs/codec-openjph/wasmjs',
    ],
  },
  server: {
    // The viewer runtime is large; transform it when the dev server starts
    // rather than on the first file open.
    warmup: { clientFiles: ['./src/main.tsx', './src/runtimeEntry.ts'] },
  },
  worker: {
    format: 'es',
  },
})
