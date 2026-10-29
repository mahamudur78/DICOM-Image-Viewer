# ফেজ ২: 2D দেখার টুল — বিস্তারিত পরিকল্পনা

> স্ট্যাটাস: সম্পন্ন (commit বাকি) · তারিখ: 2026-10-28 · ব্রাঞ্চ: `feature/phase-2-2d-tools`
> মূল রোডম্যাপ: [FULL_FEATURE_ROADMAP.md](FULL_FEATURE_ROADMAP.md#ফেজ-২-2d-দেখার-টুল) · আগের ফেজ: [PHASE_1_FILES_PLAN.md](PHASE_1_FILES_PLAN.md)

## লক্ষ্য

RadiAnt আর MicroDicom-এর মতো ছবি দেখার সব খুঁটিনাটি নিয়ন্ত্রণ, যেগুলো রেডিওলজিস্ট রোজ ব্যবহার করেন:
- W/L নিজের মতো বসানো, নিজের preset, ROI আর auto দিয়ে W/L
- রং (colormap), filter, overlay, ঘোরানো, zoom-এর বিকল্প
- বড় লেআউট, ফুল-স্ক্রিন, scale bar, মাউসের নিচের পিক্সেলের মান

## যাচাই করা API (Cornerstone 5.13)

| দরকার | সমাধান |
|---|---|
| ROI দিয়ে W/L | `WindowLevelRegionTool` (tools-এ আছে) |
| Scale bar | `ScaleOverlayTool` (tools-এ আছে) |
| Colormap | `viewport.setProperties({ colormap: { name } })`; নামের তালিকা `utilities.colormap.getColormapNames()` |
| Sigmoid VOI | `VOILUTFunction: SAMPLED_SIGMOID`; header-এর (0028,1056) |
| Interpolation | `setProperties({ interpolationType: NEAREST / LINEAR })` |
| ঘোরানো (যে কোনো কোণ) | `setViewPresentation({ rotation })` |
| Zoom 1:1 / % | `setViewPresentation({ zoom })` (zoom ১ = পুরো ছবি viewport-এ বসে) — 1:1-এর জন্য হিসাব |
| SUV | `@cornerstonejs/calculate-suv` দিয়ে factor বের করে `scalingModule` metadata provider → loader নিজেই SUV-তে prescale করে |
| DICOM overlay (60xx) | loader-এর `overlayPlaneModule` metadata; নিজের canvas layer-এ আঁকা |
| পিক্সেলের মান | `canvasToWorld` → `utilities.worldToImageCoords` → image pixel data × slope + intercept |
| Image filter | **Cornerstone-এ নেই।** Viewport canvas-এ SVG filter (`feConvolveMatrix`, `feGaussianBlur`, `feMorphology`) — GPU-তে চলে, ছবির ডেটা বদলায় না; PNG export-এও একই filter (`ctx.filter = url(#…)`) |

## টাস্ক

### ২.১ W/L হাতে লেখা ও preset
- [x] W/L ড্রপডাউন **সব modality-তে**:
  - header-এর window(গুলো), explanation সহ (0028,1055)
  - CT-তে built-in preset
  - ব্যবহারকারীর নিজের preset
  - Auto, Full range, "Custom…", "Manage presets…"
- [x] "Custom…": W আর L লেখার ছোট ডায়ালগ, এখনকার মান আগে থেকে বসানো
- [x] নিজের preset (settings store-এ, modality অনুযায়ী): এখনকার W/L থেকে যোগ, নাম বদল, মুছে ফেলা, ক্রম বদল
- [x] শর্টকাট `1`–`9` → ড্রপডাউনের preset (ক্রম অনুযায়ী); `0` = header-এর প্রথম window
- [x] **MR আর অন্য modality:** header-এর window explanation থেকে preset

### ২.২ ROI আর auto W/L
- [x] ROI W/L টুল (`WindowLevelRegionTool`): আয়তক্ষেত্র টানলে তার min/max থেকে W/L
- [x] Auto W/L: এখনকার ছবির histogram-এর ১–৯৯ percentile
- [x] Full range: ছবির min–max

### ২.৩ VOI LUT, Presentation LUT, sigmoid
- [x] VOI LUT Sequence (0028,3010) থাকলে মেনে চলা (নমুনা দিয়ে যাচাই)
- [x] Presentation LUT Shape INVERSE (2050,0020) — যাচাই
- [x] Header-এর VOI LUT Function (SIGMOID) মেনে চলা; মেনু থেকে Linear/Sigmoid বদলানো

### ২.৪ PET
- [x] SUV factor (bw, lbm, bsa) হিসাব `calculate-suv` দিয়ে; `scalingModule` provider → ছবি SUVbw-তে
- [x] Overlay-তে একক (SUVbw); পিক্সেলের মানে SUVbw, SUVlbm, SUVbsa
- [x] PET-এর ডিফল্ট: উল্টো grayscale (সাদা পটে কালো), W/L 0–5 SUV
- [x] SUV হিসাব না গেলে (tag অসম্পূর্ণ) কারণ জানানো, Bq/ml-এ দেখানো

### ২.৫ Colormap
- [x] Colormap মেনু: Grayscale, Hot Iron, PET, Rainbow, Jet, Cool-Warm, ইত্যাদি (যেগুলো Cornerstone-এ আছে)
- [x] রঙিন ছবিতে বন্ধ
- [x] Reset-এ grayscale-এ ফেরা

### ২.৬ Image filter
- [x] Sharpen, Smooth, Edge, Emboss, Erode, Dilate; শক্তি ১–৩
- [x] Viewport-ভিত্তিক; Reset-এ বন্ধ
- [x] PNG export-এ একই filter

### ২.৭ DICOM overlay (60xx)
- [x] Overlay plane আঁকা (একাধিক group, origin, rows/columns); multi-frame overlay frame অনুযায়ী
- [x] চালু/বন্ধ (ডিফল্ট চালু); কিবোর্ড `V`

### ২.৮ ঘোরানো ও zoom
- [x] বাঁয়ে ৯০°, ডানে ৯০°, ১৮০°, যে কোনো কোণ (ডায়ালগ)
- [x] Zoom: fit, 1:1 (এক image pixel = এক স্ক্রিন pixel), নির্দিষ্ট % (৫০, ১০০, ২০০, ৪০০), প্রকৃত মাপ (mm; স্ক্রিনের DPI settings-এ ঠিক করা যায়)
- [x] Interpolation চালু/বন্ধ (pixel আলাদা করে দেখতে)

### ২.৯ Overlay লেখা ও privacy
- [x] কোণার লেখা চালু/বন্ধ (সব), রোগীর তথ্য লুকানো (privacy mode) — settings-এ মনে থাকে; কিবোর্ড
- [x] কোন কোণায় কী দেখাবে — settings-এ তালিকা থেকে বাছাই
- [x] PNG export-এ privacy মেনে চলা (রোগীর তথ্য না পাঠানো — export-এ overlay লেখা তো আগেও যায় না; যাচাই)

### ২.১০ লেআউট
- [x] 1×1, 1×2, 2×1, 2×2, 1×3, 3×1, 2×3, 3×2, 3×3, 4×4
- [x] কাস্টম লেআউট বাছাই (গ্রিডে টেনে rows × cols, সর্বোচ্চ 4×4)
- [x] `MAX_VIEWPORTS` ১৬; hanging protocol বেশি সিরিজে বড় লেআউট বাছে না (আগের মতো ২×২ পর্যন্ত), ব্যবহারকারী বাড়ায়

### ২.১১ ফুল-স্ক্রিন ও distraction-free
- [x] পুরো অ্যাপ ফুল-স্ক্রিন (Fullscreen API; `F11` ব্রাউজারেরটা, আমাদের `F`)
- [x] Distraction-free: header, toolbar, sidebar লুকানো; Esc বা বোতামে ফেরা
- [x] এক viewport বড় করা আগে থেকেই আছে (ডাবল-ক্লিক)

### ২.১২ Scale bar ও পিক্সেলের মান
- [x] Scale bar (`ScaleOverlayTool`) চালু/বন্ধ
- [x] মাউসের নিচের পিক্সেল: স্থানাঙ্ক (x, y), মান (HU / SUV / কাঁচা / RGB) — সব viewport-এ, overlay-র নিচে

### ২.১৩ পরীক্ষা ও সমাপ্তি
- [x] নমুনা: MR-এ একাধিক window ও explanation, VOI LUT Sequence, Presentation LUT INVERSE, sigmoid, overlay plane, PET (আছে)
- [x] Unit test: preset তালিকা বানানো, histogram percentile, SUV factor wrapper, 1:1 zoom হিসাব, layout, settings migrate (v2)
- [x] E2E: প্রতিটা feature (ডেস্কটপ + মোবাইল দরকার মতো), dev + prod
- [x] স্ক্রিনশটে হাতে দেখা; README, এই ফাইল, রোডম্যাপ
- [ ] Commit শুধু ব্যবহারকারী বললে

## ঝুঁকি

| ঝুঁকি | প্রতিকার |
|---|---|
| SVG filter canvas-এ সব ব্রাউজারে একই না | Chrome/Edge/Firefox/Safari সমর্থন করে; export-এ `ctx.filter` Safari-তে নেই → Safari-তে export filter ছাড়া (নোট) |
| ১৬টা viewport-এ ধীরগতি | একটাই WebGL context (rendering engine), thumbnail-এর মতো ছোট; পরীক্ষা ৪×৪ দিয়ে |
| SUV prescale বদলালে পুরনো cache | PT সিরিজ লোডের আগেই provider নিবন্ধন |
| শর্টকাট সংঘাত (`1`–`9`, `V`, `F`, `H`) | command registry-তে একটাই key ম্যাপ; unit test-এ সংঘাত খোঁজা |

---

## বাস্তবায়নের নোট

**নতুন ফাইল**

| ফাইল | কাজ |
|---|---|
| `src/cornerstone/display.ts` | ঘোরানো, zoom (fit/1:1/%/প্রকৃত মাপ), smooth, sigmoid, colormap, auto/full-range W/L, header window, VOI LUT, INVERSE, PET ডিফল্ট |
| `src/cornerstone/imageCoords.ts` | image ↔ world ↔ canvas, viewport-এর নিজের image data থেকে (geometry-ছাড়া ছবিতেও চলে) |
| `src/cornerstone/regionWindowTool.ts` | ROI W/L টুল (Cornerstone-এরটা ঠিক করে) |
| `src/cornerstone/overlayPlanes.ts`, `components/DicomOverlayLayer.tsx` | 60xx overlay, frame অনুযায়ী |
| `src/components/usePixelValue.ts` | মাউসের নিচের পিক্সেল (HU, SUVbw/lbm/bsa, RGB) |
| `src/components/ImageFilterDefs.tsx`, `store/viewportDisplayStore.ts` | SVG image filter |
| `src/components/CommandMenu.tsx` | ডান-ক্লিক মেনু আর টুলবারের ড্রপডাউন — একই কোড |
| `src/commands/keymap.ts` | সব শর্টকাট এক জায়গায়, সংঘাত-পরীক্ষা (ফেজ ১০-এ বদলানো যাবে) |
| `src/dicom/suv.ts` | SUV-র header ফিল্ড ও factor (`@cornerstonejs/calculate-suv`) |
| `src/app/fullscreen.ts` | ফুল-স্ক্রিন |

**কাজের সময় পাওয়া Cornerstone 5.13-এর সমস্যা (আমাদের দিকে ঠিক করা হয়েছে)**
- **`WindowLevelRegionTool` ভুল অংশ মাপে:** canvas পিক্সেলকে image পিক্সেল ধরে নেয়, তাই প্রায় সবসময় ভুল W/L দেয়। `RegionWindowTool` subclass image স্থানাঙ্কে রূপান্তর করে নির্বাচিত অংশের min–max নেয়।
- **VOI LUT Function (sigmoid):** string মানের প্রথম অক্ষর ("S") নিত, ফলে "Invalid VOI LUT function" দিয়ে stack ভেঙে পড়ত। Metadata provider মানটাকে array বানিয়ে দেয়।
- **Position/orientation ছাড়া ছবি:** `worldToImageCoords` ভেঙে পড়ত। X-ray, US আর SC ছবিতে এটা ROI টুল আর মাপের টুল ভাঙত। এখন একটা ডিফল্ট plane দেওয়া হয় (`usingDefaultValues`), যা viewport-এর নিজের plane-এর সাথে মেলে।
- **VOI LUT Sequence আর Presentation LUT INVERSE:** stack viewport এগুলো মানত না। LUT এখন grayscale colormap হিসেবে ঠিক ইনপুট-পরিসরে বসে; INVERSE-এ ছবি invert হয়।
- **MPR-এর VolumeViewport-এ `getCornerstoneImage` নেই**, আর volume বসার আগে `getProperties()` undefined দেয়। সব helper এটা সামলায়।

**সিদ্ধান্ত**
- **ডিফল্ট window:** header-এ window থাকলে সেটা, না থাকলে VOI LUT। ড্রপডাউনে দুটোই থাকে; অন্য window বাছলে LUT সরে যায়। W/L টেনে বদলালে LUT প্রসারিত হয় (OHIF-এর মতোই)।
- **ড্রপডাউনের ক্রম আর নম্বর:**
  - ক্রম: header-এর window → built-in preset → নিজের preset।
  - নম্বর ১–৯ এই ক্রমে, `0` = header-এর প্রথম window।
  - নাম ছাড়া header window আর কোনো preset-এর মান এক হলে preset-এর নাম দেখায়।
- **PET-এর ডিফল্ট:** উল্টো grayscale, 0–5 SUV। Reset করলেও এখানে ফেরে (filter আর colormap মুছে)।
- **Filter:** CSS-এ SVG filter, ছবির ডেটা বদলায় না; মাপের টুলের রেখা ঝাপসা হয় না। PNG export-এ `ctx.filter` দিয়ে একই filter যায়; Safari-তে `ctx.filter` নেই, তাই সেখানে export filter ছাড়া হবে।
- **নতুন শর্টকাট:** `G` ROI W/L, `0`–`9` window, `H` রোগীর নাম লুকানো, `V` DICOM overlay, `F` ফুল-স্ক্রিন, `D` শুধু ছবি, `Esc` ফেরা, `Home`/`End` প্রথম/শেষ ছবি।
- **একক chunk-এর বাজেট ৯০০ থেকে ৯৬০ KB:** Cornerstone runtime chunk-এ নতুন display কোড যোগ হয়েছে। প্রথম পাতা ৯৭ KB (বাজেট ১২০)।

**পরীক্ষা**
- Unit: ৭৫টা। নতুন: window option, percentile, region window, settings v2, preset ক্রম, keymap সংঘাত, layout।
- E2E: ৫৪টা, dev আর production দুটোতেই সবুজ। নতুন:
  - `window.spec.ts`: header window, কিবোর্ড, auto, full range, custom, নিজের preset, ROI, VOI LUT, INVERSE, sigmoid
  - `display.spec.ts`: ঘোরানো, zoom (১:১, ২০০%, প্রকৃত মাপ), smooth, colormap, filter, reset, রঙিন ছবি, overlay (frame অনুযায়ী), privacy, কোণার লেখা, HU, SUV, scale bar, লেআউট picker, শুধু-ছবি মোড, ফুল-স্ক্রিন, PNG-এ filter
- নমুনা (samples v11):
  - `window/`: দুই window, VOI LUT, sigmoid, INVERSE, outliers
  - `overlay/`: single ও multi-frame overlay
  - PET-এ লিঙ্গ, উচ্চতা আর Corrected Image যোগ (SUVlbm/bsa-এর জন্য)
- স্ক্রিনশটে দেখা গেছে, PET-এর লম্বা পিক্সেল-মান cine control-এর নিচে পড়ছিল; নিচে-বাঁয়ের লেখার প্রস্থ সীমিত করে ঠিক করা হয়েছে।

**যা যাচাই হয়নি / পরে**
- **ফোনে টুলবার:** এখন ৫ সারি জুড়ে থাকে। ফোনের জন্য আলাদা টুলবার ফেজ ১০-এ ("ফোনে টুলবার নিচে, বড় বোতাম")।
- **Safari-তে export-এ filter** — `ctx.filter` সমর্থন নেই।
- **আসল CR/DX-এর VOI LUT আর আসল PET স্টাডি** — synthetic নমুনা দিয়েই যাচাই।
