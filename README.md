# Online DICOM Viewer

A free, browser-only DICOM viewer. Files are parsed and rendered locally with
[Cornerstone3D](https://www.cornerstonejs.org/) and are never uploaded.

Roadmap: [BLUEPRINT/FULL_FEATURE_ROADMAP.md](BLUEPRINT/FULL_FEATURE_ROADMAP.md) (all plans are in `BLUEPRINT/`)

## Development

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # type-checks, outputs dist/ (static)
npm run lint
npm test               # unit tests (Vitest)
npm run test:e2e       # browser tests (Playwright) against the dev server
npm run test:e2e:prod  # the same against a production build (video tests use Google Chrome)
npm run size           # gzip bundle sizes and budgets (after a build)
npm run deploy         # build and upload dist/ to Cloudflare Pages
```

`predev`/`prebuild` copy the codec WASM files into `public/wasm/` (git-ignored).
Playwright needs Chromium once: `npx playwright install chromium`.

Test data without patient information (see [BLUEPRINT/TEST_DATA.md](BLUEPRINT/TEST_DATA.md)):
`scripts/generate-phantom.mjs` (CT study) and `scripts/generate-samples.mjs` (US cine, MR, PET, DX,
broken files) are generated automatically by the e2e tests; `npm run samples:fetch` downloads
public anonymized samples. All of it stays in the git-ignored `e2e/.data/`.

## Code structure

| Folder | Contents |
|---|---|
| `src/store/` | Zustand stores: viewer session, persisted settings, and actions with Cornerstone side effects |
| `src/commands/` | Every user action; the toolbar, keyboard shortcuts and context menu are built from it |
| `src/cornerstone/` | Cornerstone3D setup, viewports, tools, MPR, 3D, sync, viewport registry |
| `src/dicom/` | File reading, header parsing, sorting, hanging protocol, window presets |
| `src/components/`, `src/panels/` | React UI; side panels are registered in `src/panels/panels.ts` |
| `src/notifications/` | Toasts and error boundaries |
| `src/i18n/` | Translations (`locales/en.ts` defines every key) |

The welcome page loads without Cornerstone; the viewer runtime (`src/runtimeEntry.ts`) is a
separate chunk that starts downloading right after the first render.

## Features

- Open files or whole folders (button or drag & drop), `.dcm` or extension-less, ZIP archives
  (nested, ZipCrypto and AES passwords), CD folders with DICOMDIR, and ordinary images
  (JPEG, PNG, BMP, GIF, WebP, TIFF, converted to Secondary Capture in the browser)
- Patients → studies → series list with search; series that hold several sequences are split
- Sorting by instance number, slice position, acquisition time or file name
- Cine playback (header frame rate, speed, loop / back-and-forth, play all)
- Enhanced multi-frame CT/MR (per-frame geometry, MPR), colour images (RGB, YBR, palette)
- DICOM video (H.264 played in the browser, MPEG-2/HEVC offered for download), encapsulated
  PDF reports (pdf.js) and structured reports as readable text
- Names in any DICOM character set (UTF-8, Latin, Cyrillic, Arabic, CJK, …); a list of files that
  could not be opened, with the reason
- Window/level, pan, zoom, scroll (wheel, arrows, slider)
- Length, angle, ellipse ROI and probe measurements
- CT window presets, invert, rotate, flip, reset, PNG export
- DICOM tag inspector with search
- Compressed transfer syntaxes via WASM codecs (JPEG, JPEG 2000, JPEG-LS, HTJ2K, JPEG XL)

- Thumbnails, 1×1 / 1×2 / 2×1 / 2×2 layouts, drag series onto viewports, double-click to maximize
- Orientation markers, reference lines, position-based scroll sync, window/level sync, magnifier
- MPR (axial / sagittal / coronal) with crosshairs and thick-slab MIP / MinIP / average
- 3D volume rendering with 26 presets (CT-Bone, CT-AAA, MR-Angio, …), rotate, preset shift,
  orientation cube, and an "MPR + 3D" 2×2 layout; large volumes ask before loading
- Right-click menu on viewports, notifications, link settings remembered between visits

Keyboard: `↑/↓` slice · `Space` play/pause · `[` `]` slower/faster · `W P Z M L A E B` tools (`C` crosshairs in MPR, `O` rotate / `S` shift in 3D) · `I` invert · `R` reset · `T` tags

Not for diagnostic use.
