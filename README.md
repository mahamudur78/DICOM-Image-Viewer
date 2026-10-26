# Online DICOM Viewer

A free, browser-only DICOM viewer. Files are parsed and rendered locally with
[Cornerstone3D](https://www.cornerstonejs.org/) and are never uploaded.

Plan and roadmap: [BLUEPRINT/DICOM_VIEWER_PLAN.md](BLUEPRINT/DICOM_VIEWER_PLAN.md)

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/ (static, deploy to Cloudflare Pages / Vercel)
npm run lint
```

`predev`/`prebuild` copy the codec WASM files into `public/wasm/` (git-ignored).

Test data without patient information: `node scripts/generate-phantom.mjs <dir>` writes
a synthetic CT study (coronal scout + 2.5 mm and 5 mm axial series in one frame of reference).

## Features (MVP)

- Open files or whole folders (button or drag & drop), `.dcm` or extension-less
- Study / series list, sorted by instance number and slice position
- Window/level, pan, zoom, scroll (wheel, arrows, slider)
- Length, angle, ellipse ROI and probe measurements
- CT window presets, invert, rotate, flip, reset, PNG export
- DICOM tag inspector with search
- Compressed transfer syntaxes via WASM codecs (JPEG, JPEG 2000, JPEG-LS, HTJ2K, JPEG XL)

- Thumbnails, 1×1 / 1×2 / 2×1 / 2×2 layouts, drag series onto viewports, double-click to maximize
- Orientation markers, reference lines, position-based scroll sync, window/level sync, magnifier

Keyboard: `↑/↓` slice · `W P Z M L A E B` tools · `I` invert · `R` reset · `T` tags

Not for diagnostic use.
