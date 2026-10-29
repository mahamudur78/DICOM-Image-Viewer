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
| `src/comparison/` | Plane geometry, prior matching, 3D cursor, windows linked over BroadcastChannel |
| `src/export/` | Image, movie, print/PDF export (own BMP/TIFF/GIF/AVI/PDF encoders), anonymization, tag editing, conversion |
| `src/measurements/` | Measurement tools, their values (calibration, statistics), groups, panel actions, JSON/CSV |
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
- CT window presets, invert, rotate, flip, reset, PNG export
- DICOM tag inspector with search
- Compressed transfer syntaxes via WASM codecs (JPEG, JPEG 2000, JPEG-LS, HTJ2K, JPEG XL)

- Thumbnails, 1×1 / 1×2 / 2×1 / 2×2 layouts, drag series onto viewports, double-click to maximize
- Orientation markers, reference lines, position-based scroll sync, window/level sync, magnifier
- MPR (axial / sagittal / coronal) with crosshairs and thick-slab MIP / MinIP / average
- 3D volume rendering with 26 presets (CT-Bone, CT-AAA, MR-Angio, …), rotate, preset shift,
  orientation cube, and an "MPR + 3D" 2×2 layout; large volumes ask before loading
- Right-click menu on viewports, notifications, link settings remembered between visits
- Window dropdown for every grayscale image: header windows (with their names), CT presets, your own
  presets (keys 1–9), auto, full range, custom; window from a dragged region; VOI LUT, sigmoid and
  inverse Presentation LUT honoured
- PET in SUV (bw, lbm, bsa) with an inverted 0–5 SUV default; value under the mouse (HU, SUV, RGB)
- Colormaps, image filters (sharpen, smooth, edges, emboss, erode, dilate), DICOM overlay planes,
  rotation (90°/180°/any angle), zoom 1:1 / % / actual size, pixel smoothing, scale bar
- Layouts up to 4×4, full screen, images-only mode, privacy mode and configurable corner text
- Measurements: length, polyline, angle, Cobb angle, bidirectional, deviation distance, length
  ratio, ellipsoid volume; rectangle, ellipse, circle, polygon, spline and freehand ROIs with mean,
  median, min, max, SD, area, pixel count and a histogram; probe; arrows, labels, spine labels,
  pencil and redaction boxes (also black in PNG exports). Also on MPR planes
- Calibration: Pixel Spacing, detector spacing corrected by the magnification factor (ERMF),
  ultrasound regions, or a line of known length; values in mm or cm, with the source shown
- Comparison: add files to an open study, "Compare with prior" (matching series side by side, slices
  locked together across frames of reference), hanging protocols (built-in and your own), sync of
  slices, window/level, zoom/pan and cine for the linked viewports, a 3D cursor (Shift+click) that
  takes every viewport — and MPR — to a point, reference lines of the active or every viewport with
  the first and last slice, series that keep their view, and a series in its own browser window
- Export: PNG, JPEG, WebP, BMP, TIFF of a viewport, a series range or every visible viewport, as
  seen or at the original pixel size, with or without annotations and patient text (ZIP for several);
  movies as MP4, WebM, GIF or AVI; copy to the clipboard (`Ctrl+C`) or capture a region; print or
  save PDF (1–12 images per page, A4/Letter, header and footer, true size); original DICOM files
- DICOM tools: tag export (TXT, CSV, JSON, nested sequences), pinned tags, comparing two files, editing
  tags into a new file, uncompressed copies, anonymization by the PS3.15 Basic Profile (options,
  templates, consistent new UIDs, redaction burned into the pixels, a report), and converting images
  and PDFs to DICOM
- Measurements panel: jump to the image, label, colour, hide, delete (image / series / all), undo
  and redo, copy onto another slice, copy values, CSV export, save and load as JSON

Keyboard: `↑/↓` slice · `Home`/`End` first/last · `Space` play/pause · `[` `]` slower/faster · `W G P Z M L A E B` tools, `Q` rectangle, `Y` polygon, `N` freehand, `J` bidirectional, `U` arrow (`C` crosshairs in MPR, `O` rotate / `S` shift in 3D) · `K` 3D cursor (or Shift+click) · `X` measurements panel · `Ctrl+C` copy image · `Ctrl+S` export images · `Ctrl+P` print · `Delete` selected measurement · `Ctrl+Z` / `Ctrl+Shift+Z` (`Ctrl+Y`) undo / redo · `1`–`9` windows (`0` the image's own) · `I` invert · `R` reset · `H` hide patient · `V` DICOM overlays · `F` full screen · `D` images only (`Esc` back) · `T` tags

Not for diagnostic use.
