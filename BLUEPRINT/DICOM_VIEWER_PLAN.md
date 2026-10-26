# Free Online DICOM Viewer — পরিকল্পনা

> স্ট্যাটাস: ধাপ ১ (MVP) কোড সম্পন্ন · তারিখ: 2026-10-26

## 1. লক্ষ্য

MedDream-এর মতো একটা ওয়েব-ভিত্তিক DICOM viewer, যেটা:

- **পুরোপুরি ফ্রি:** রেজিস্ট্রেশন বা লগইন লাগবে না।
- **আপলোড ছাড়া:** সব ফাইল ইউজারের ব্রাউজারেই পার্স আর রেন্ডার হবে। কোনো সার্ভারে পাঠানো হবে না।
- **দ্রুত আর হালকা:** একটা static site, যা CDN থেকে সার্ভ হবে।
- **মোবাইল আর ডেস্কটপ দুটোতেই চলবে।**

### যা এই প্রজেক্টের লক্ষ্য না (অন্তত শুরুতে)

- Diagnostic ব্যবহারের দাবি করা, কারণ FDA বা CE সার্টিফিকেশন নেই।
- PACS সার্ভার বা ইউজার অ্যাকাউন্ট রাখা।
- সার্ভারে ফাইল জমা রাখা।

## 2. কাদের জন্য

| ইউজার | প্রয়োজন |
|---|---|
| রোগী বা তার পরিবার | হাসপাতাল থেকে পাওয়া MRI/CT-র CD বা USB ফাইল কোনো সফটওয়্যার ইনস্টল না করে দেখা |
| ডাক্তার (দ্বিতীয় মতামতের জন্য) | রোগীর পাঠানো ফাইল দ্রুত খুলে দেখা |
| মেডিকেল শিক্ষার্থী | অনুশীলন আর পড়াশোনা |
| ছোট ক্লিনিক | সস্তা বা ফ্রি viewer, পরে white-label |

## 3. আর্কিটেকচার

```
┌─────────────────────── Browser ───────────────────────┐
│                                                        │
│  File input / Drag&Drop / Folder / ZIP                 │
│            │                                           │
│            ▼                                           │
│  DICOM Loader (dicom-parser) ──► Study/Series index    │
│            │                         │                 │
│            ▼                         ▼                 │
│  Cornerstone3D dicom-image-loader   React UI           │
│  (web workers + WASM codecs)        (Sidebar, Toolbar, │
│            │                         Tag panel)        │
│            ▼                                           │
│  Cornerstone3D RenderingEngine ──► <canvas> viewport   │
│  Cornerstone3D Tools (W/L, Zoom, Pan, Measure)         │
└────────────────────────────────────────────────────────┘
          ▲
          │ static files only (HTML/JS/WASM)
   Cloudflare Pages / Vercel (CDN)
```

- **ফাইল লোড:** `File` অবজেক্টগুলো `dicomImageLoader.wadouri.fileManager.add(file)` দিয়ে রেজিস্টার হয়, তারপর `dicomfile:N` imageId পাওয়া যায়।
- **মেটাডেটা:** প্রতিটা ফাইলের হেডার `dicom-parser` দিয়ে পড়া হয়। তারপর StudyInstanceUID → SeriesInstanceUID → InstanceNumber অনুযায়ী সাজানো হয়।
- **রেন্ডারিং:** Cornerstone3D-এর `StackViewport`। MPR আর 3D-র জন্য পরে `VolumeViewport` যোগ হবে।
- **টুলস:** `@cornerstonejs/tools` থেকে নেওয়া (WindowLevel, Pan, Zoom, StackScroll, Length, Angle, EllipticalROI, Probe)।

## 4. টেক স্ট্যাক

| স্তর | পছন্দ | কারণ |
|---|---|---|
| বিল্ড | Vite 8 | দ্রুত, WASM আর worker সাপোর্ট আছে |
| UI | React 19 + TypeScript | পরিচিত ecosystem |
| স্টাইল | Tailwind CSS | দ্রুত UI বানানো যায় |
| ইমেজিং | Cornerstone3D 5.x (`core`, `tools`, `dicom-image-loader`) | OHIF-ও এটাই ব্যবহার করে, MIT লাইসেন্স |
| পার্সিং | `dicom-parser` | হালকা, পরীক্ষিত |
| ZIP | `fflate` (ধাপ ২) | ছোট আর দ্রুত |
| হোস্টিং | Cloudflare Pages | ফ্রি, গ্লোবাল CDN |

## 5. ফিচার রোডম্যাপ

### ধাপ ১: MVP

- [x] ফাইল বা ফোল্ডার নির্বাচন আর drag & drop (`.dcm` এবং extension ছাড়া ফাইল)
- [x] স্টাডি/সিরিজ তালিকা (sidebar), সাথে modality, description আর ইমেজের সংখ্যা
- [x] Stack viewport: মাউস হুইল বা স্লাইডার দিয়ে স্লাইস বদলানো
- [x] টুলস: Window/Level, Pan, Zoom, Length, Angle, Ellipse ROI, Probe
- [x] CT window preset: Soft tissue, Lung, Bone, Brain
- [x] Invert, Rotate 90°, Flip H/V, Reset
- [x] ছবির ওপর overlay: রোগীর নাম, তারিখ, স্লাইস নম্বর, W/L
- [x] DICOM tag প্যানেল (সার্চ সহ)
- [x] ভিউপোর্টকে PNG হিসেবে ডাউনলোড
- [x] কিবোর্ড শর্টকাট (↑/↓ দিয়ে স্লাইস, R দিয়ে reset, I দিয়ে invert)
- [x] "Not for diagnostic use" ডিসক্লেইমার

### MedDream-এর মতো UI: ধাপ A (সম্পন্ন)

- [x] সাইডবারে সিরিজের thumbnail, সাথে ইমেজের সংখ্যার ব্যাজ (মোবাইলে উপরে আড়াআড়ি স্ট্রিপ)
- [x] লেআউট 1×1, 1×2, 2×1, 2×2; ফাইল খুললে সিরিজের সংখ্যা দেখে লেআউট নিজে থেকে ঠিক হয় (সাধারণ hanging protocol)
- [x] Active viewport (নীল বর্ডার); টুলবারের কাজ আর কিবোর্ড শর্টকাট শুধু active viewport-এ প্রযোজ্য
- [x] প্রতি viewport-এ আলাদা overlay: নাম, ID, মাপ, তারিখ, সিরিজ, Z, W/L, ইমেজ নম্বর; ছোট ঘরে container query দিয়ে কম তথ্য দেখায়
- [x] R/L/A/P চিহ্ন, camera থেকে হিসাব করা, তাই rotate বা flip করলেও ঠিক থাকে; ImageOrientationPatient না থাকলে দেখায় না
- [x] Thumbnail টেনে যেকোনো viewport-এ ফেলা যায়, আর ক্লিক করলে active viewport-এ খোলে
- [x] Double-click করলে viewport বড় হয়, আবার double-click করলে আগের মতো ফিরে আসে
- [x] প্রতি viewport-এ উল্লম্ব scrollbar
- [x] লেআউট বদলালে বা viewport বড়-ছোট করলে আগের slice নম্বর মনে থাকে

### MedDream-এর মতো UI: ধাপ B (সম্পন্ন)

- [x] রেফারেন্স লাইন (`ReferenceLinesTool`): active viewport-এর প্লেন অন্য viewport-এ লাইন হিসেবে দেখায় (যেমন axial slice-এর অবস্থান scout-এ)। ডিফল্টে চালু, টুলবারের REF বোতাম দিয়ে বন্ধ করা যায়।
- [x] Sync scroll (SYNC): একই প্লেনের সিরিজগুলো (যেমন axial-axial) রোগীর শরীরের অবস্থান অনুযায়ী একসাথে স্ক্রল হয়, slice-এর ঘনত্ব আলাদা হলেও।
- [x] Sync W/L: window/level আর invert সব viewport-এ একসাথে বদলায়।
- [x] Magnifier টুল (M)
- [x] Hanging protocol: scout বা localizer আগে বসে (ImageType LOCALIZER, অথবা বিবরণে scout/topogram ইত্যাদি থাকলে)
- [x] `scripts/generate-phantom.mjs`: রোগীর তথ্য ছাড়া একটা কৃত্রিম CT স্টাডি বানায় (scout আর 2.5mm ও 5mm-এর axial সিরিজ), পরীক্ষার জন্য।

ধাপ B করার সময় পাওয়া বিষয়:
- **Geometry metadata-র fallback:** legacy loader শুধু লোড হওয়া ইমেজের `imagePlaneModule` জানে। কিন্তু sync করতে লক্ষ্য সিরিজের সব ইমেজের অবস্থান লাগে। তাই ফাইল খোলার সময় header থেকে geometry রেখে দেওয়া হয়, আর সেটা কম priority-র (-100) provider দিয়ে দেওয়া হয় (`src/dicom/imagePlaneMetadata.ts`)।
- **শুধু active viewport-ই source:** সব viewport source হলে কম slice-এর (মোটা) সিরিজ নিজের সবচেয়ে কাছের slice-এ গিয়ে উল্টো দিকে sync পাঠায়, তাতে স্ক্রল একবারে ২ ধাপ লাফায়। এখন active viewport source, বাকিরা target, আর কোনো viewport-এ হুইল ঘোরালে সেটা active হয়ে যায়।
- **Rendering engine আগে বানাতে হয়:** `ReferenceLinesTool` প্রথম rendering engine-এ viewport খোঁজে। তাই thumbnail-এর আগে init-এর সময়েই মূল engine বানানো হয়।

### MedDream-এর মতো UI: ধাপ C (সম্পন্ন)

- [x] MPR: টুলবারের MPR বোতাম চাপলে active সিরিজ থেকে volume তৈরি হয়, আর axial/sagittal/coronal তিনটা ORTHOGRAPHIC viewport-এ দেখায় (মোবাইলে একটার নিচে আরেকটা)। সব slice লোড না হওয়া পর্যন্ত লোডের অগ্রগতি দেখায়।
- [x] Crosshair (C): টানলে বাকি দুই প্লেনের slice বদলায়। MPR খুললে এটাই ডিফল্ট টুল।
- [x] Slab / MIP: 5–40mm পুরুত্ব, MIP, MinIP বা Average।
- [x] MPR-এ সাইডবার থেকে অন্য সিরিজে যাওয়া যায়। আগে তৈরি করা volume cache-এ থাকে।
- [x] যে সিরিজে MPR সম্ভব না (৩টার কম slice, দিকের তথ্য নেই, multi-frame, বা দুই slice একই অবস্থানে), সেখানে কারণসহ বার্তা দেখায়।

ধাপ C করার সময় পাওয়া বিষয়:
- **Volume loader নিজে register করতে হয়:** `cornerstoneStreamingImageVolumeLoader` নিজে থেকে register হয় না। এর type ঘোষণা `VolumeLoaderFn`-এর সাথে মেলে না, তাই cast করতে হয়।
- **আগে কয়েকটা ইমেজ লোড করতে হয়:** streaming loader শুধু `wadouri:` imageId-এর জন্য আগে থেকে ইমেজ লোড করে। আমাদের `dicomfile:` imageId-এর pixel আর VOI metadata তখনই পাওয়া যায় যখন ইমেজ লোড হয়। তাই volume বানানোর আগে প্রথম, মাঝের আর শেষ ইমেজটা নিজে লোড করা হয়। slice সাজানোর geometry আসে ধাপ B-এর fallback provider থেকে।
- **শুরুর W/L:** volume নিজে থেকে পুরো pixel range-কে window হিসেবে নেয়। তাই সিরিজের `voiLutModule` থেকে আসল window বসানো হয়।
- **লোডের অগ্রগতি:** `IStreamingImageVolume.load()`-এর type-এ callback নেই। তাই `IMAGE_VOLUME_MODIFIED` ইভেন্ট (`framesProcessed / numberOfFrames`) দিয়ে অগ্রগতি দেখানো হয়।
- **একটা নিরীহ warning:** MPR বন্ধ করার সময় console-এ একবার "For crosshairs to operate, at least two viewports must be given" দেখা যায়, কারণ viewport-গুলো একটা একটা করে বন্ধ হয়। এতে কিছু ভাঙে না।

### পরের ধাপের সম্ভাব্য কাজ

- [x] 3D volume rendering: বিস্তারিত [3D_VR_PLAN.md](3D_VR_PLAN.md)-এ
- [ ] আরও hanging protocol নিয়ম (যেমন আগের আর এখনকার স্টাডি পাশাপাশি তুলনা)
- [ ] অনেক বড় স্টাডিতে (৫০০+ slice) মেমোরি সীমা: cache-এর আকার বেঁধে দেওয়া, আর volume তৈরির আগে সতর্কবার্তা দেখানো

### ধাপ ২

- [ ] Viewer lazy-load (landing page-এর বান্ডেল ছোট রাখা)
- [ ] কোনো slice লোড না হলে ইউজারকে বার্তা দেখানো (`IMAGE_LOAD_ERROR` ইভেন্ট)
- [ ] ZIP আর DICOMDIR সাপোর্ট
- [ ] মাল্টি-ভিউপোর্ট লেআউট (1×1, 1×2, 2×2)
- [ ] Cine প্লেব্যাক (FPS কন্ট্রোল সহ)
- [ ] MPR (axial/sagittal/coronal), `VolumeViewport` দিয়ে
- [ ] পরিচয় মুছে (anonymize) DICOM এক্সপোর্ট
- [ ] টাচ জেসচার (pinch zoom, দুই আঙুলে pan)
- [ ] PWA, যাতে অফলাইনেও চলে
- [ ] বহু-ভাষা সাপোর্ট (English, বাংলা)

### ধাপ ৩ (ঐচ্ছিক বা paid)

- [ ] 3D volume rendering
- [ ] এনক্রিপ্টেড শেয়ার লিংক (ইউজারের অনুমতি নিয়ে, ক্লায়েন্টেই encrypt হবে)
- [ ] DICOMweb (QIDO/WADO) থেকে লোড করা
- [ ] White-label বা ক্লিনিক ব্র্যান্ডিং

## 6. ফোল্ডার স্ট্রাকচার (MVP)

```
scripts/copy-wasm.mjs      # codec WASM → public/wasm (predev/prebuild)
src/
  main.tsx                 # entry (StrictMode ছাড়া, WebGL context দুবার তৈরি এড়াতে)
  App.tsx                  # layout, state, কিবোর্ড শর্টকাট, drag & drop
  cornerstone/
    init.ts                # core/tools/loader initialization
    tools.ts               # tool group আর mouse binding
    viewer.ts              # rendering engine + viewport actions (W/L, invert, rotate, PNG…)
  dicom/
    loadFiles.ts           # File[] → studies/series index (শুধু header পড়ে)
    collectFiles.ts        # drop করা folder recursive ভাবে পড়া
    tagDictionary.ts       # সাধারণ DICOM tag-এর নাম/VR
    types.ts
  components/
    Welcome.tsx, FilePickers.tsx, Sidebar.tsx, Toolbar.tsx, toolButtons.ts,
    Viewport.tsx, TagPanel.tsx
  index.css
```

### বাস্তবায়নের সময় পাওয়া গুরুত্বপূর্ণ বিষয়

- **Legacy loader লাগবে:** Cornerstone 5-এর নতুন "naturalized metadata" loader লোকাল `dicomfile:` imageId-এর pixel data খুঁজে পায় না ("no COMPRESSED_FRAME_DATA")। তাই `useLegacyMetadataProvider: true` দেওয়া আছে। Cornerstone আপগ্রেড করার সময় এটা আবার পরীক্ষা করতে হবে।
- **fileManager purge করা যাবে না:** `purge()` করলে imageId আবার `dicomfile:0` থেকে শুরু হয় আর পুরোনো cache-এর সাথে মিলে যায়। তাই নতুন ফাইল খোলার সময় শুধু `cache.purgeCache()` আর `dataSetCacheManager.purge()` করা হয় (`releaseLoadedImages`)।
- **Vite কনফিগারেশন:** `dicom-image-loader`-কে `optimizeDeps.exclude`-এ রাখতে হয়, আর codec-এর `decodewasmjs` মডিউলগুলোকে `optimizeDeps.include`-এ (এগুলো CommonJS)।
- **Node polyfill:** vtk.js → xmlbuilder2 Node-এর `events` মডিউল ব্যবহার করে। `events` আর `url` npm প্যাকেজ ইনস্টল না করলে ব্রাউজারে "Class extends value undefined" error আসে।
- **বান্ডেল সাইজ:** মূল JS প্রায় 3.9 MB (gzip করলে ~1.1 MB)। ধাপ ২-এ viewer অংশটা lazy-load করতে হবে, যাতে landing page দ্রুত লোড হয় (SEO-র জন্য জরুরি)।

## 7. পারফরম্যান্স

- ইমেজ ডিকোডিং web worker-এ হয় (dicom-image-loader নিজেই worker pool চালায়)।
- সিরিজ খোলার সময় প্রথম ইমেজ আগে দেখানো হয়, বাকিগুলো স্ক্রল করার সময় লোড হয়।
- হেডার পড়তে পুরো ফাইল না পড়ে শুধু প্রথম অংশ পড়া (ধাপ ২: `untilTag: 'x7fe00010'`)।
- Cornerstone-এর cache-এর একটা সীমা দেওয়া থাকবে, যাতে মোবাইলে মেমোরি শেষ না হয়।

## 8. প্রাইভেসি আর আইনি দিক

- সব প্রসেসিং ক্লায়েন্ট-সাইডে হয়। নেটওয়ার্কে কোনো DICOM ডেটা যায় না।
- Analytics হবে cookieless (যেমন Plausible বা Cloudflare Web Analytics)। কোনো ইভেন্টে রোগীর তথ্য (PHI) পাঠানো হবে না।
- প্রতিটা পেজে ডিসক্লেইমার থাকবে: *"For educational and informational use only. Not for diagnostic use."*
- ওপেন-সোর্স লাইব্রেরিগুলোর লাইসেন্স (MIT) মেনে চলা হবে, আর সেগুলোর credit দেওয়া হবে।

## 9. SEO আর গ্রোথ

- মূল কিওয়ার্ড: *free online dicom viewer*, *open dcm file online*, *view MRI CD online*, *dicom viewer no upload*
- আলাদা landing/guide পেজ: "How to open MRI CD on Mac/Windows", "What is a DICOM file"
- Schema.org `WebApplication` markup আর দ্রুত লোড হওয়া (Core Web Vitals) গুরুত্বপূর্ণ।
- আয়ের উপায়: Pro ফিচার (শেয়ার লিংক, ব্র্যান্ডিং, PACS) আর white-label লাইসেন্স।

## 10. টেস্টিং

- নমুনা ডেটা: পরিচয় মুছে ফেলা পাবলিক ডেটাসেট, যেমন pydicom test files, TCIA বা dicomlibrary-র স্যাম্পল।
- বিভিন্ন transfer syntax পরীক্ষা: Explicit/Implicit VR, JPEG Baseline, JPEG 2000, JPEG-LS, RLE
- বিভিন্ন modality পরীক্ষা: CT, MR, CR/DX, US (multi-frame), MG
- ব্রাউজার: Chrome, Firefox, Safari (iOS সহ)

## 11. ডেপ্লয়

```
npm run build   # dist/
# Cloudflare Pages: build command = npm run build, output = dist
```

WASM ফাইলগুলো যেন `application/wasm` MIME টাইপ দিয়ে সার্ভ হয়, সেটা খেয়াল রাখতে হবে।
