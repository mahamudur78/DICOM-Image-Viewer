# DicomLens: সম্পূর্ণ Feature রোডম্যাপ (ফেজ ও টাস্ক)

> তারিখ: 2026-10-28 · স্ট্যাটাস: ফেজ ০–৮ সম্পন্ন, ফেজ ৯ বাকি
> ভিত্তি: [DICOM_VIEWER_FEATURE_STUDY.md](DICOM_VIEWER_FEATURE_STUDY.md) · আগের কাজ: [DICOM_VIEWER_PLAN.md](DICOM_VIEWER_PLAN.md), [3D_VR_PLAN.md](3D_VR_PLAN.md)

## লক্ষ্য

স্টাডিতে পাওয়া **সব** feature DicomLens-এ বানানো। এর মধ্যে আছে RadiAnt, MicroDicom, Weasis, OHIF, OsiriX/Horos, MedDream আর PostDICOM-এর feature। সব শেষ হলে প্রকল্পটা **আমাদের নিজস্ব সার্ভারে** deploy হবে। ততদিন Cloudflare Pages (`dicomlens.pages.dev`) শুধু অস্থায়ী হোস্ট হিসেবে থাকবে।

## কাজের নিয়ম

1. **একটার পর একটা ফেজ।** একটা ফেজ পুরো শেষ হলে (সব টাস্ক, পরীক্ষা আর ডকুমেন্টেশন) তবেই পরেরটা শুরু।
2. **প্রতিটা ফেজের নিজের branch:** `feature/phase-<নম্বর>-<নাম>`। Commit শুধু ব্যবহারকারী বললে।
3. **শুরুর আগে বিস্তারিত plan:** বড় ফেজের জন্য আলাদা ফাইল `BLUEPRINT/PHASE_<N>_<NAME>.md`-এ API যাচাই আর ঝুঁকি লেখা থাকবে, যেমন `3D_VR_PLAN.md`।
4. **প্রতিটা ফেজে "সম্পূর্ণ হওয়ার শর্ত" (Definition of Done)** পূরণ হতে হবে:
   - `npm run build` আর `npm run lint` পরিষ্কার
   - ব্রাউজারে (Playwright) প্রতিটা নতুন feature হাতে-কলমে পরীক্ষা, ডেস্কটপ আর মোবাইল দুটো সাইজে
   - Production build (`vite preview`)-এ পরীক্ষা
   - Console-এ কোনো error নেই
   - README আর এই ফাইলের চেকবক্স আপডেট
   - যা পরীক্ষা করা যায়নি, তা ফেজের নোটে স্পষ্ট লেখা
5. **"No upload" নীতি** সার্ভার ফেজ (ফেজ ১১) পর্যন্ত বজায় থাকবে। তার আগে কোনো ফাইল ব্রাউজারের বাইরে যাবে না।
6. **Test data:** আসল রোগীর ডেটা repo-তে রাখা হবে না। Phantom generator (`scripts/generate-phantom.mjs`) বাড়ানো হবে, আর পাবলিক anonymized ডেটাসেট (TCIA ইত্যাদি) `.playwright-mcp/`-এ রাখা হবে।

## ফেজের সারসংক্ষেপ

| ফেজ | নাম | মূল ফল |
|---|---|---|
| ০ | ভিত্তি ও কাঠামো | state, settings, টেস্ট, lazy loading: পরের সব কাজের ভিত্তি |
| ১ | ফাইল খোলা ও ফরম্যাট | ZIP, DICOMDIR, সাধারণ ছবি, multi-frame, CINE, ভিডিও, PDF, SR |
| ২ | 2D দেখার টুল | W/L ইনপুট, custom preset, filter, overlay, ফুল-স্ক্রিন, বড় লেআউট |
| ৩ | মাপজোখ ও annotation | সব মাপের টুল, calibration, পরিসংখ্যান, মাপের প্যানেল, undo |
| ৪ | তুলনা ও sync | zoom/pan sync, ভিন্ন স্টাডির sync, 3D cursor, hanging protocol |
| ৫ | Export, প্রিন্ট ও anonymize | ছবি/মুভি/PDF/প্রিন্ট, tag export ও edit, anonymize, DICOM রূপান্তর |
| ৬ | উন্নত MPR ও 3D | oblique, clipping, scalpel, snapshot, মুভি, STL, surface, endoscopy, curved MPR |
| ৭ | Fusion ও ফাংশনাল ইমেজিং | PET-CT/MR fusion, SUV, TIC, DSA, 4D |
| ৮ | বিশেষ DICOM object | SR, KO/PR, SEG, RTSTRUCT/RTDOSE/DVH, ECG, অডিও, microscopy, parametric map |
| ৯ | Segmentation সম্পাদনা | brush, threshold, region grow, volume মাপা, SEG সেভ |
| ১০ | UX, মোবাইল, ভাষা, অফলাইন | touch, বাংলা/ইংরেজি, শর্টকাট, থিম, PWA, লোকাল আর্কাইভ |
| ১১ | নিজস্ব সার্ভার ও ব্যাকএন্ড | PACS, DICOMweb, আপলোড, অ্যাকাউন্ট, শেয়ার লিংক, embed, deploy |
| ১২ | চূড়ান্ত মান যাচাই ও রিলিজ | পারফরম্যান্স, নিরাপত্তা, accessibility, ডকুমেন্টেশন, লঞ্চ |

ক্রমের কারণ: আগে ভিত্তি (০)। তারপর যা সবাই রোজ ব্যবহার করে (১–৫)। তারপর উন্নত ইমেজিং (৬–৯)। ১০ নম্বরে অভিজ্ঞতা ঘষামাজা। সবশেষে সার্ভার (১১), কারণ ব্যবহারকারীর সিদ্ধান্ত অনুযায়ী সার্ভার আসবে feature সম্পূর্ণ হওয়ার পর। ফেজ ১১-এর কিছু অংশ, যেমন DICOMweb client, আগেই করা যায়, কারণ শুধু ক্লায়েন্টে চলে। সেটা ফেজের ভেতরে চিহ্নিত আছে।

---

## ফেজ ০: ভিত্তি ও কাঠামো ✅

> সম্পন্ন 2026-10-28 · বিস্তারিত: [PHASE_0_FOUNDATION_PLAN.md](PHASE_0_FOUNDATION_PLAN.md)

পরের ফেজগুলোতে অনেক প্যানেল, সেটিং আর টুল যোগ হবে। এখনকার `App.tsx`-এর state সেই বোঝা নিতে পারবে না, তাই আগে কাঠামো ঠিক করা হবে।

- [x] **State management:** viewer state (স্টাডি, সিরিজ, লেআউট, active viewport, mode, টুল, link) একটা store-এ আনা (Zustand বা React context + reducer; ফেজের plan-এ সিদ্ধান্ত)
- [x] **Settings store:** ব্যবহারকারীর পছন্দ (preset, শর্টকাট, ভাষা, থিম, ইউনিট) localStorage-এ, version আর migration-সহ
- [x] **Viewport registry:** কোন viewport-এ কোন display set, কোন ধরন (stack/volume/3D/video/pdf/sr/ecg), এক জায়গা থেকে জানা
- [x] **Panel system:** ডান/বাম পাশে একাধিক প্যানেল (tag, measurement, segmentation, report) বদলানোর কাঠামো; ফোনে নিচের sheet
- [x] **Command/action registry:** টুলবার, শর্টকাট, context menu আর touch সব একই action ডাকবে (পরে শর্টকাট বদলানো আর i18n সহজ হবে)
- [x] **Context menu (ডান-ক্লিক মেনু)** কাঠামো: viewport-এ আর মাপের উপর
- [x] **Toast/notification আর error boundary:** লোডের ভুল, unsupported ফাইল, মেমোরি সতর্কতা এক ধাঁচে দেখানো
- [x] **Lazy loading:** MPR, 3D, PDF, ভিডিও, ECG, fusion, export-এর কোড আলাদা chunk-এ (`import()`), যাতে প্রথম লোড হালকা থাকে
- [x] **Bundle size নজরদারি:** build-এ chunk size রিপোর্ট; প্রথম লোডের সীমা ঠিক করা
- [x] **i18n কাঠামো (শুধু কাঠামো):** `i18next` বসানো, সব UI লেখা key-তে আনা (অনুবাদ ফেজ ১০-এ)
- [x] **টেস্ট কাঠামো:**
  - Unit test: Vitest (DICOM পার্সিং, sort, anonymize, হিসাব)
  - E2E: Playwright test ফাইল (এখন হাতে করা পরীক্ষাগুলো স্ক্রিপ্টে)
- [x] **Test data বাড়ানো:** phantom-এ multi-frame, US color cine, MR multi-sequence, PET, ভুল/অসম্পূর্ণ ফাইল; পাবলিক anonymized ডেটাসেটের তালিকা ও ডাউনলোড স্ক্রিপ্ট
- [x] **CI:** GitHub Actions-এ build + lint + unit test
- [x] **HMR সমস্যা** (Cornerstone init আবার চলা) সমাধান বা dev-এ ঠিকভাবে সামলানো
- [x] Definition of Done পূরণ

## ফেজ ১: ফাইল খোলা ও ফরম্যাট ✅

> সম্পন্ন 2026-10-28 · বিস্তারিত: [PHASE_1_FILES_PLAN.md](PHASE_1_FILES_PLAN.md) (character set সমর্থন আর একরঙা ছবির ঠিক করাও এই ফেজে যোগ হয়েছে)

- [x] **ZIP খোলা** (`fflate`, worker-এ): সাধারণ ZIP; ভেতরের ফোল্ডার ও nested ZIP
- [x] **পাসওয়ার্ডওয়ালা ZIP** (ZipCrypto/AES; লাইব্রেরি যাচাই) আর পাসওয়ার্ড চাওয়ার ডায়ালগ
- [x] **DICOMDIR পার্স:** রোগী → স্টাডি → সিরিজ → ফাইলের ক্রম; ফাইলের নাম বড়/ছোট হাতের অক্ষর আর CD-র পাথ সামলানো
- [x] **সাধারণ ছবি খোলা:** JPEG, PNG, BMP, GIF, TIFF (secondary capture হিসেবে দেখানো)
- [x] **Multi-frame সম্পূর্ণ সমর্থন:** US, XA, NM, enhanced CT/MR (per-frame functional group থেকে position/orientation)
- [x] **CINE playback:**
  - play/pause, FPS (DICOM-এর frame time/rate থেকে ডিফল্ট), loop / bounce, আগের-পরের frame
  - stack (সাধারণ সিরিজ)-এও cine
  - একাধিক viewport একসাথে চালানো (sync cine)
  - কিবোর্ড শর্টকাট
- [x] **Color ছবি:** RGB, YBR, palette color ঠিকমতো (US, endoscopy, SC)
- [x] **DICOM ভিডিও** (MPEG-2, MPEG-4/H.264, HEVC transfer syntax): `<video>` দিয়ে বাজানো; ব্রাউজারে না চললে স্পষ্ট বার্তা
- [x] **Encapsulated PDF:** viewport-এ PDF দেখানো (pdf.js বা ব্রাউজারের নিজস্ব), ডাউনলোড বোতাম
- [x] **Structured Report (SR) পড়া:** content tree লেখা হিসেবে দেখানো (measurement SR-এর ছবি-সংযোগ ফেজ ৮-এ)
- [x] **ছবি সাজানোর বিকল্প:** instance number, slice position, acquisition time, ফাইলের নাম; সিরিজ-ভিত্তিক বদলানো
- [x] **Multi-sequence সিরিজ ভাগ করা:** একই সিরিজে ভিন্ন orientation/echo/b-value/phase থাকলে আলাদা display set
- [x] **অসম্পূর্ণ বা ভুল ফাইল:** কোনটা লোড হলো না তার তালিকা আর কারণ; বাকিগুলো দেখানো চালু থাকবে
- [x] **বড় স্টাডি:** হাজার হাজার ফাইলে UI জমে যাবে না (পার্সিং worker-এ বা ভাগে ভাগে), অগ্রগতি দেখানো, মেমোরি সীমা ও cache নীতি
- [x] **একাধিক রোগী/স্টাডি একসাথে:** সাইডবারে রোগী → স্টাডি → সিরিজ গাছ, ফিল্টার ও সার্চ
- [x] Definition of Done পূরণ

## ফেজ ২: 2D দেখার টুল ✅

> সম্পন্ন 2026-10-29 · বিস্তারিত: [PHASE_2_2D_TOOLS_PLAN.md](PHASE_2_2D_TOOLS_PLAN.md)

- [x] **W/L হাতে লেখা:** W আর L ইনপুট (ড্রপডাউনে "Custom…" বা টুলবারে)
- [x] **নিজের preset:** যোগ, নাম বদল, মুছে ফেলা, ক্রম বদল; modality অনুযায়ী (CT, MR, PT…); শর্টকাট `1`–`9`
- [x] **MR আর অন্য modality-র জন্য preset** (DICOM-এর window explanation থেকেও)
- [x] **ROI দিয়ে W/L:** একটা আয়তক্ষেত্র টানলে তার min/max থেকে W/L
- [x] **Auto W/L** (histogram থেকে)
- [x] **VOI LUT আর Presentation LUT** (DICOM-এ থাকলে) মেনে চলা; sigmoid
- [x] **PET ইউনিট:** SUVbw (আর SUVlbm/SUVbsa) হিসাব, PET-এর জন্য উল্টো grayscale ও colormap
- [x] **Colormap / pseudocolor:** hot iron, rainbow, jet ইত্যাদি (সব modality-তে)
- [x] **Image filter:** sharpen, smooth, edge, emboss, morphological (erode/dilate); শক্তি নিয়ন্ত্রণ; reset
- [x] **DICOM overlay plane** (60xx group) দেখানো, চালু/বন্ধ
- [x] **ঘোরানো:** 90° দুই দিকে, 180°; flip (আছে) — আর ইচ্ছেমতো কোণে ঘোরানো
- [x] **Zoom বিকল্প:** fit, 1:1 (প্রকৃত পিক্সেল), নির্দিষ্ট %, "actual size" (ক্যালিব্রেটেড মনিটরে mm)
- [x] **Interpolation চালু/বন্ধ** (pixel দেখতে)
- [x] **Overlay লেখা কাস্টমাইজ:** কোন কোণায় কোন তথ্য; রোগীর তথ্য লুকানো (privacy mode)
- [x] **বড় লেআউট:** 1×3, 3×1, 2×3, 3×2, 3×3, 4×4, আর কাস্টম (rows × cols নির্বাচন)
- [x] **ফুল-স্ক্রিন** (পুরো অ্যাপ আর একটা viewport) আর **distraction-free মোড** (টুলবার, সাইডবার লুকানো)
- [x] **Scale bar** আর ruler overlay
- [x] **Pixel value overlay:** মাউসের নিচের HU/মান আর স্থানাঙ্ক (probe ছাড়াই, সবসময়)
- [x] Definition of Done পূরণ

## ফেজ ৩: মাপজোখ ও annotation

**টুল**
- [x] Rectangle ROI
- [x] Circle ROI
- [x] Polygon (বন্ধ): ক্ষেত্রফল, পরিধি
- [x] Open polyline: দৈর্ঘ্য
- [x] Freehand ROI (বন্ধ) আর freehand open curve
- [x] Spline ROI / curve
- [x] Bidirectional (দীর্ঘ ও ছোট অক্ষ, RECIST)
- [x] Cobb angle
- [x] Deviation distance (একটা রেখা থেকে বিন্দুর দূরত্ব)
- [x] Length ratio (দুটো দৈর্ঘ্যের অনুপাত, যেমন cardiothoracic ratio)
- [x] Ellipsoid volume (তিন অক্ষ থেকে আয়তন)
- [x] Arrow + লেখা (annotation)
- [x] শুধু লেখা (text label)
- [x] ফ্রিহ্যান্ড পেন্সিল ড্রয়িং
- [x] Spine labeling (C1…S1 স্বয়ংক্রিয় ক্রমে)
- [x] Hidden area / redaction box (ছবির অংশ ঢাকা; export-এও ঢাকা থাকবে)
- [x] পুরনো টুলগুলোর মান ঠিক আছে কিনা পুনরায় যাচাই (length, angle, ellipse, probe)

**Calibration ও ইউনিট**
- [x] হাতে calibration: পরিচিত দৈর্ঘ্যের রেখা টেনে mm বসানো (pixel spacing না থাকলে বা ভুল থাকলে)
- [x] Imager pixel spacing / estimated radiographic magnification factor (DX/CR/MG) মেনে চলা, কোন spacing ব্যবহার হলো তা দেখানো
- [x] আল্ট্রাসাউন্ডের calibrated region (Sequence of Ultrasound Regions) থেকে মাপ
- [x] ইউনিট সেটিং: mm/cm, mm²/cm²

**পরিসংখ্যান**
- [x] প্রতিটা ROI-তে mean, median, min, max, std dev, ক্ষেত্রফল, পিক্সেল সংখ্যা
- [x] HU (CT), SUV (PET), কাঁচা মান (অন্য)
- [x] ROI histogram (প্যানেলে চার্ট)

**ব্যবস্থাপনা**
- [x] **মাপের প্যানেল:** সব মাপের তালিকা (সিরিজ ও ছবি অনুযায়ী), মান, ক্লিক করলে সেই ছবিতে যাওয়া
- [x] নির্বাচন, সরানো, সম্পাদনা, label দেওয়া, রং বদলানো
- [x] একটা মুছে ফেলা (Delete key), ছবির সব, সিরিজের সব, সব মুছে ফেলা
- [x] Undo / Redo (Ctrl+Z / Ctrl+Y)
- [x] মাপ কপি করে অন্য ছবিতে বসানো
- [x] মাপ লুকানো/দেখানো (সব বা একটা)
- [x] মাপের মান কপি (clipboard) আর CSV export
- [x] **মাপ সেভ ও লোড (JSON ফাইল):** পরের বার খুললে ফেরত আনা (DICOM SR-এ সেভ ফেজ ৮-এ)
- [x] MPR viewport-এও মাপ (volume-এ; ক্ষেত্রফলের পরিসংখ্যান Cornerstone-এর নিজের হিসাব থেকে)
- [x] Definition of Done পূরণ (বিস্তারিত ও বাকি থাকা কথা: [PHASE_3_MEASUREMENTS_PLAN.md](PHASE_3_MEASUREMENTS_PLAN.md))

## ফেজ ৪: তুলনা ও sync

- [x] **Zoom/pan sync** (টুলবারে আলাদা link বোতাম)
- [x] **Sync-এর ধরন আলাদা করে বাছা:** slice, W/L, zoom/pan, cine; viewport-ভিত্তিক group
- [x] **ভিন্ন স্টাডির হাতে sync:** দুটো viewport-এ মিলিয়ে নিয়ে "lock", তারপর পার্থক্য রেখে একসাথে স্ক্রল (ভিন্ন frame of reference)
- [x] **আগের স্টাডির সাথে তুলনা (prior):** একই রোগীর পুরনো স্টাডি পাশে খোলা, তারিখ অনুযায়ী সাজানো
- [x] **গ্রিডে 3D cursor:** এক viewport-এ ক্লিক → অন্য সব viewport (ভিন্ন plane সহ) সেই বিন্দুর slice-এ যাবে আর বিন্দু দেখাবে
- [x] **2D, MPR আর 3D-তে একসাথে axis intersection sync** (RadiAnt 2025.2-এর মতো)
- [x] **Reference line-এর উন্নতি:** সব viewport-এর রেখা একসাথে, প্রথম/শেষ slice-এর রেখা, রং অনুযায়ী
- [x] **Hanging protocol ইঞ্জিন:** নিয়ম (modality, body part, সিরিজের বর্ণনা, prior আছে কিনা) থেকে লেআউট ও কোন viewport-এ কোন সিরিজ; ব্যবহারকারী নিজের নিয়ম সেভ করতে পারবে
- [x] **Viewport-এর অবস্থা সেভ:** সিরিজ বদলে ফেরত এলে আগের zoom/W/L/slice
- [x] **আলাদা ব্রাউজার উইন্ডোতে সিরিজ খোলা** (multi-monitor; `window.open` + BroadcastChannel দিয়ে sync)
- [x] Definition of Done পূরণ (বিস্তারিত: [PHASE_4_COMPARISON_SYNC_PLAN.md](PHASE_4_COMPARISON_SYNC_PLAN.md))

## ফেজ ৫: Export, প্রিন্ট ও anonymize

**ছবি ও মুভি**
- [x] Export ফরম্যাট: PNG, JPEG (মান নির্বাচন), BMP, TIFF, WebP
- [x] কী export হবে: এখনকার viewport, পুরো সিরিজ, সব খোলা viewport, নির্বাচিত ছবি
- [x] Annotation/overlay/রোগীর তথ্য সহ বা ছাড়া (privacy)
- [x] রেজোলিউশন: স্ক্রিনের মাপে বা মূল পিক্সেল মাপে
- [x] একাধিক ছবি → ZIP
- [x] **মুভি:** সিরিজ বা cine → MP4 (WebCodecs/`MediaRecorder`), WebM, GIF, আর AVI/WMV (যেখানে সম্ভব; না হলে নোটে কারণ) — AVI (MJPEG) হয়েছে, WMV ব্রাউজারে সম্ভব নয়
- [x] **Clipboard-এ কপি** (Ctrl+C) আর **নির্দিষ্ট অংশ সিলেক্ট করে ক্যাপচার**
- [x] মূল DICOM ফাইল export (সিরিজ/স্টাডি → ZIP)

**প্রিন্ট ও PDF**
- [x] প্রিন্ট লেআউট: এক পাতায় ১, ২, ৪, ৬, ৯, ১২ ছবি; পাতার সাইজ (A4, Letter), দিক
- [x] হেডার (রোগী/স্টাডির তথ্য, ঐচ্ছিক) আর ফুটার
- [x] 2D, MPR আর 3D ভিউ থেকে প্রিন্ট
- [x] PDF ফাইল হিসেবে সেভ
- [x] Film-এর মতো মাপের প্রিন্ট (true size, ঐচ্ছিক)

**DICOM tag**
- [x] Tag export: TXT, CSV, JSON (একটা ফাইল বা পুরো সিরিজ)
- [x] Sequence (nested) tag ঠিকমতো দেখানো ও export
- [x] প্রিয় tag-এর তালিকা (উপরে পিন করা)
- [x] দুটো ফাইলের tag তুলনা (diff)
- [x] **Tag edit:** মান বদলানো, যোগ, মুছে ফেলা → নতুন DICOM ফাইল ডাউনলোড (`dcmjs`)

**Anonymization**
- [x] DICOM PS3.15 Basic Application Confidentiality Profile অনুযায়ী tag মোছা বা বদলানো
- [x] বিকল্প: তারিখ রাখা/সরানো, UID নতুন করা (স্টাডির ভেতরে সম্পর্ক ঠিক রেখে), private tag মোছা, বর্ণনা রাখা
- [x] Template সেভ (যেমন "গবেষণা", "শিক্ষা")
- [x] নতুন রোগীর নাম/ID বসানো
- [x] এক ফাইল, সিরিজ, স্টাডি বা সব একসাথে (batch) → ZIP
- [x] Burned-in annotation সতর্কতা (`BurnedInAnnotation` tag, US/SC) আর পিক্সেলের অংশ ঢাকার টুল (ফেজ ৩-এর redaction ব্যবহার করে)
- [x] Anonymize করার পর যাচাই রিপোর্ট (কোন tag বদলেছে)

**রূপান্তর**
- [x] সাধারণ ছবি (JPEG/PNG) → DICOM (secondary capture), রোগী/স্টাডির তথ্য দিয়ে, এক বা অনেক
- [x] PDF → encapsulated PDF DICOM
- [x] Transfer syntax বদলানো (compressed → uncompressed; উল্টোটা বাদ রাখা হয়েছে, নোট দেখুন)
- [x] Definition of Done পূরণ (বিস্তারিত: [PHASE_5_EXPORT_PRINT_ANONYMIZE_PLAN.md](PHASE_5_EXPORT_PRINT_ANONYMIZE_PLAN.md))

## ফেজ ৬: উন্নত MPR ও 3D

**MPR**
- [x] Oblique MPR: crosshair-এর rotation handle চালু ও পরীক্ষা; plane রিসেট
- [x] Double-oblique
- [x] Slab-এর বেধ crosshair থেকে টেনে বদলানো
- [x] MPR-এ W/L preset, invert, PNG (আছে কিনা যাচাই), মাপজোখ
- [x] MPR থেকে নতুন সিরিজ তৈরি (নির্দিষ্ট দূরত্বে slice → stack, export করা যায়)
- [x] **Curved MPR (CPR):** পথ বরাবর বিন্দু দেওয়া → stretched / straightened ভিউ; ডেন্টাল panoramic
- [x] বড় volume-এ দ্রুত MPR (progressive load, কম রেজোলিউশনে আগে)

**3D**
- [x] **ঘোরানোর সময় sample distance বাড়ানো** ([3D_VR_PLAN.md](3D_VR_PLAN.md)-এ বাকি কাজ) আর progressive rendering
- [x] **Clipping box / crop** (ছয় দিক থেকে কাটা)
- [x] **Clipping plane** (যে কোনো দিকে)
- [x] **Scalpel:** মাউস দিয়ে আঁকা অংশ ভেতরে বা বাইরে কেটে বাদ দেওয়া; undo
- [x] **3D-তে মাপা:** surface-এ দুই বিন্দুর দূরত্ব
- [x] **Transfer function editor:** রং আর opacity-র বিন্দু হাতে বদলানো, নিজের preset সেভ
- [x] আলো/shading নিয়ন্ত্রণ (ambient, diffuse, specular)
- [x] **3D snapshot:** camera + preset + clipping সেভ ও ফেরত
- [x] **ঘোরানোর মুভি** (৩৬০°, অক্ষ বাছাই) আর **snapshot-ভিত্তিক ভিডিও** (snapshot-গুলোর মধ্যে মসৃণ পরিবর্তন) → MP4
- [x] **Surface rendering** (iso-surface, threshold বাছাই)
- [x] **STL export** (marching cubes; mesh সরল করা; mm-এ মাপ ঠিক)
- [x] OBJ/PLY export (ঐচ্ছিক)
- [x] **Virtual endoscopy** (ভেতর থেকে ক্যামেরা; পথ ধরে fly-through)
- [x] 3D-তে MIP/MinIP রেন্ডারিং (VR-এর পাশাপাশি)
- [x] 3D প্রিন্ট বা PNG-তে উচ্চ রেজোলিউশন
- [x] Definition of Done পূরণ (বিস্তারিত: [PHASE_6_ADVANCED_MPR_3D_PLAN.md](PHASE_6_ADVANCED_MPR_3D_PLAN.md))

## ফেজ ৭: Fusion ও ফাংশনাল ইমেজিং

**Fusion**
- [x] **PET-CT fusion:** CT-র উপর PET colormap, opacity slider, threshold
- [x] PET-MR, SPECT-CT
- [x] **MR fusion:** T1/T2-এর উপর DWI/ADC বা অন্য সিরিজ
- [x] Fusion 2D stack, MPR আর 3D তিনটাতেই
- [x] ভিন্ন frame of reference হলে হাতে registration (সরানো/ঘোরানো) — ঐচ্ছিক স্বয়ংক্রিয় registration পরে
- [x] **PET/CT hanging layout** (OHIF-এর মতো 3×3: CT, PET, fusion × তিন plane + MIP)
- [x] **PET MIP ঘোরানো** (rotating MIP)
- [x] **SUV হিসাব** (`@cornerstonejs/calculate-suv`): SUVbw, SUVlbm, SUVbsa; decay correction যাচাই
- [x] ROI-তে SUVmax, SUVmean, SUVpeak; 3D ROI (sphere/"3D ball")
- [ ] ~~**TMTV / MTV** (মোট metabolic tumor volume, threshold-ভিত্তিক) — ফেজ ৯-এর segmentation দরকার, তাই সেখানে শেষ হবে~~ → ফেজ ৯

**Time-intensity curve (TIC)**
- [x] Dynamic/multi-phase সিরিজ চেনা (temporal position)
- [x] ROI-র mean সব phase-এ → চার্ট
- [x] Curve type: Ia, Ib, II (plateau), III (washout); peak, time-to-peak, wash-in/wash-out হার
- [x] একাধিক ROI-র curve একসাথে, CSV export

**DSA (digital subtraction angiography)**
- [x] Mask frame বাছাই (ডিফল্ট প্রথম frame)
- [x] Live frame থেকে mask বিয়োগ
- [x] Auto pixel shift (নির্বাচিত অংশে মিলিয়ে) আর manual pixel shift
- [x] Split mask (ভিন্ন অংশে ভিন্ন mask), magic mask
- [x] Landmarking (মাস্কের হালকা অংশ ফেরত আনা)

**4D**
- [x] 4D (সময় + volume, যেমন কার্ডিয়াক CT, perfusion) volume হিসেবে লোড, সময়ের slider ও cine
- [x] Definition of Done পূরণ (বিস্তারিত: [PHASE_7_FUSION_FUNCTIONAL_PLAN.md](PHASE_7_FUSION_FUNCTIONAL_PLAN.md))

## ফেজ ৮: বিশেষ DICOM object

- [x] **Measurement SR (TID 1500) পড়া:** মাপ ছবির উপর দেখানো (`@cornerstonejs/adapters`)
- [x] **Measurement SR লেখা:** আমাদের মাপ DICOM SR হিসেবে সেভ/ডাউনলোড
- [x] **Key Object Selection (KO):** গুরুত্বপূর্ণ ছবি চিহ্নিত করা, সেভ, পড়া, শুধু key image দেখার ফিল্টার
- [x] **Presentation State (GSPS) পড়া:** W/L, zoom, ঘোরানো, annotation প্রয়োগ
- [x] **GSPS লেখা:** এখনকার দেখার অবস্থা সেভ
- [x] **DICOM SEG পড়া:** 2D, MPR, 3D-তে overlay; segment তালিকা, রং, opacity, লুকানো
- [x] **RTSTRUCT:** contour দেখানো (2D/MPR/3D), structure তালিকা
- [x] **RTDOSE:** isodose রেখা ও color wash
- [x] **DVH** (dose-volume histogram) চার্ট
- [x] RTPLAN-এর মৌলিক তথ্য দেখানো
- [x] **Parametric map** (যেমন ADC map, AI-র ফলাফল) colormap সহ
- [x] **AI-র তৈরি object** (SC, SEG, SR, GSPS) চেনা ও আলাদা চিহ্ন
- [x] **ECG waveform:** 12-lead গ্রিড, mm/mV ও গতি স্কেল, মাপার caliper
- [x] অন্য waveform (hemodynamic ইত্যাদি) মৌলিকভাবে
- [x] **DICOM অডিও** বাজানো
- [x] **Whole-slide microscopy (SM):** tiled pyramid দেখা (zoom, pan), annotation — আলাদা viewer অংশ
- [x] Ophthalmology (OP/OPT) আর ডেন্টাল (IO/PX) ছবি ঠিকমতো দেখানো
- [x] Mammography: MLO/CC হ্যাঙ্গিং, দুই পাশ মুখোমুখি (mirror) সাজানো; **Breast tomosynthesis (DBT)**
- [x] Definition of Done পূরণ (বিস্তারিত: [PHASE_8_SPECIAL_OBJECTS_PLAN.md](PHASE_8_SPECIAL_OBJECTS_PLAN.md))

## ফেজ ৯: Segmentation সম্পাদনা

- [ ] Segmentation-এর মূল কাঠামো (labelmap, একাধিক segment, নাম, রং)
- [ ] Brush ও eraser (আকার নিয়ন্ত্রণ), 2D আর MPR-এ
- [ ] Threshold brush আর threshold দিয়ে পুরো volume-এ segment
- [ ] Region growing / flood fill
- [ ] Scissors (rectangle, circle, freehand দিয়ে ভরানো/মোছা)
- [ ] Slice-এর মধ্যে interpolation
- [ ] Contour (RTSTRUCT ধাঁচ) আঁকা ও সম্পাদনা
- [ ] Segment-এর আয়তন, mean HU/SUV, সর্বোচ্চ ব্যাস
- [ ] 3D-তে segment দেখা (surface)
- [ ] **TMTV** (ফেজ ৭ থেকে) সম্পূর্ণ করা
- [ ] DICOM SEG হিসেবে সেভ/ডাউনলোড; RTSTRUCT হিসেবে সেভ (ঐচ্ছিক)
- [ ] Segment থেকে STL export
- [ ] Undo/redo
- [ ] Definition of Done পূরণ

## ফেজ ১০: UX, মোবাইল, ভাষা, অফলাইন

**মোবাইল ও touch**
- [ ] এক আঙুল: স্ক্রল (বা বাছাই করা টুল), দুই আঙুল: zoom/pan, তিন আঙুল বা লম্বা চাপ: W/L
- [ ] লম্বা চাপে viewport-এর context menu (ফেজ ০ থেকে সরানো)
- [ ] ফোনে টুলবার (নিচে, বড় বোতাম), প্যানেল নিচের sheet হিসেবে
- [ ] ট্যাবলেটে stylus দিয়ে মাপা
- [ ] মোবাইলে মেমোরির সীমা সব ভারী feature-এ (MPR, 3D, fusion, cine, export)

**ভাষা**
- [ ] বাংলা আর ইংরেজি পুরো অনুবাদ
- [ ] আরও ভাষার কাঠামো (হিন্দি, আরবি — RTL সমর্থন)
- [ ] তারিখ, সংখ্যা, ইউনিট locale অনুযায়ী
- [ ] অনুবাদ যোগ করার নির্দেশিকা (কমিউনিটি অনুবাদের জন্য)

**শর্টকাট ও পছন্দ**
- [ ] শর্টকাট সাহায্য ডায়ালগ (`?`)
- [ ] শর্টকাট বদলানো (settings থেকে), conflict যাচাই
- [ ] মাউস বোতামের binding বদলানো (বাম/মাঝ/ডান/হুইলে কোন টুল)
- [ ] Settings পাতা (সব পছন্দ এক জায়গায়, export/import)

**চেহারা**
- [ ] থিম: অন্ধকার (এখন), হালকা, high-contrast
- [ ] High-DPI ঠিকমতো (ছবি ও লেখা ঝাপসা নয়)
- [ ] Accessibility: কিবোর্ডে পুরো নেভিগেশন, ARIA, ফোকাস চিহ্ন, রঙের কনট্রাস্ট

**অফলাইন ও লোকাল আর্কাইভ**
- [ ] **PWA:** service worker, manifest, ইনস্টল করা যায়, ইন্টারনেট ছাড়া চলে (WASM codec সহ cache)
- [ ] OS-এ ফাইল খোলার handler (PWA File Handling API: `.dcm` ডাবল-ক্লিক → DicomLens)
- [ ] **লোকাল আর্কাইভ** (IndexedDB/OPFS, ব্যবহারকারী চাইলে): স্টাডি সেভ, তালিকা, সার্চ, মুছে ফেলা
- [ ] স্টাডিতে keyword/tag দেওয়া
- [ ] **স্টাডির স্ট্যাটাস:** Unread, In Progress, Reviewed, Urgent, Signed
- [ ] স্টাডির তালিকা CSV-তে export
- [ ] একাধিক আর্কাইভ (ডেটাবেস) — ঐচ্ছিক
- [ ] জায়গা ব্যবহারের হিসাব ও সীমা

**অন্যান্য**
- [ ] Onboarding / প্রথমবারের গাইড, নমুনা স্টাডি দিয়ে চেষ্টা করা
- [ ] "Not for diagnostic use" আর privacy নোটিস স্পষ্ট জায়গায়
- [ ] Definition of Done পূরণ

## ফেজ ১১: নিজস্ব সার্ভার ও ব্যাকএন্ড

> সার্ভারের ধরন (VPS, প্রদাতা, OS) আর ব্যাকএন্ড প্রযুক্তি এই ফেজ শুরুর আগে ব্যবহারকারীর সাথে ঠিক করা হবে, আর `BLUEPRINT/PHASE_11_SERVER_PLAN.md`-এ লেখা হবে। নিচে প্রস্তাবিত কাঠামো।

**১১.ক: ক্লায়েন্টে চলে, তাই আগেও করা যায়**
- [ ] **DICOMweb client:** QIDO-RS (সার্চ), WADO-RS/WADO-URI (লোড), STOW-RS (পাঠানো); সার্ভারের URL আর auth (token/basic) সেটিংসে
- [ ] **Study list পাতা:** রোগীর নাম, ID/MRN, তারিখ, modality, accession, বর্ণনা দিয়ে ফিল্টার; paging; সাজানো
- [ ] **URL দিয়ে খোলা:** `?StudyInstanceUIDs=…`, `?url=` (বাইরের DICOM/ZIP), accession/patient ID দিয়ে
- [ ] Progressive/streaming লোড (দূরের সার্ভার থেকে আগে মাঝের ছবি)

**১১.খ: ব্যাকএন্ড ও PACS**
- [ ] DICOM সার্ভার: Orthanc (বা dcm4chee) — DICOMweb plugin সহ
- [ ] **PACS DIMSE:** C-ECHO, C-FIND, C-MOVE, C-GET, C-STORE (SCU ও SCP) — সার্ভারের মাধ্যমে; ব্যবহারকারী UI থেকে বাইরের PACS যোগ, query/retrieve, send
- [ ] **Modality worklist** (ঐচ্ছিক)
- [ ] ব্রাউজার থেকে **আপলোড** (ফাইল/ফোল্ডার/ZIP → STOW-RS), অগ্রগতি, আবার চেষ্টা
- [ ] API সার্ভার (প্রযুক্তি পরে ঠিক হবে): auth, শেয়ার, অনুমতি, audit
- [ ] ডেটাবেস (ব্যবহারকারী, শেয়ার লিংক, অনুমতি, স্ট্যাটাস, report)
- [ ] স্টোরেজ (লোকাল ডিস্ক / S3-সামঞ্জস্যপূর্ণ), সীমা ও পরিষ্কার করা

**১১.গ: অ্যাকাউন্ট ও শেয়ার**
- [ ] অ্যাকাউন্ট: সাইন-আপ, লগইন, পাসওয়ার্ড রিসেট; ঐচ্ছিক Google লগইন; 2FA
- [ ] ভূমিকা: রোগী, ডাক্তার, অ্যাডমিন; প্রতিষ্ঠান (organization)
- [ ] **শেয়ার লিংক:** স্টাডি/সিরিজ/report; পাসওয়ার্ড, মেয়াদ, ডাউনলোড বন্ধ রাখা; লিংক বাতিল
- [ ] শেয়ারের আগে **anonymize করার বিকল্প** (ফেজ ৫-এর কোড)
- [ ] ইমেইলে শেয়ার
- [ ] স্টাডির সাথে PDF/JPEG (non-DICOM) সংযুক্তি
- [ ] স্টাডিতে মন্তব্য / দ্বিতীয় মতামত (second opinion)
- [ ] **Report:** লেখা report (template), key image সহ, PDF/SR হিসেবে সেভ
- [ ] স্ট্যাটাস (ফেজ ১০) সার্ভারে সংরক্ষণ

**১১.ঘ: Integration**
- [ ] **iframe embed** (অনুমতিপ্রাপ্ত domain), postMessage API
- [ ] HIS/RIS/EMR থেকে খোলা: URL parameter + token
- [ ] ক্লাউড DICOM store সংযোগ: AWS HealthImaging, Google Cloud Healthcare API, Azure Health Data Services (DICOMweb দিয়ে)
- [ ] `dicomlens://` বা নিজের URL scheme (PWA protocol handler) — ঐচ্ছিক

**১১.ঙ: নিরাপত্তা ও আইনি**
- [ ] HTTPS, HSTS, CSP, CORS নীতি
- [ ] Data at rest encryption, ব্যাকআপ ও পুনরুদ্ধার পরীক্ষা
- [ ] Audit log (কে কখন কোন স্টাডি দেখল/শেয়ার করল)
- [ ] Rate limiting, আপলোডের আকার সীমা, ফাইল যাচাই
- [ ] Privacy policy, terms, "Not for diagnostic use", ডেটা মুছে ফেলার অনুরোধের ব্যবস্থা
- [ ] প্রযোজ্য আইন যাচাই (বাংলাদেশের ডেটা সুরক্ষা নিয়ম; HIPAA/GDPR যদি বিদেশি ব্যবহারকারী থাকে)

**১১.চ: Deploy**
- [ ] Docker / docker-compose (frontend, API, Orthanc, DB, reverse proxy)
- [ ] Nginx/Caddy, SSL (Let's Encrypt), নিজস্ব domain
- [ ] CI/CD: `main`-এ push → test → deploy
- [ ] Monitoring, log, uptime alert
- [ ] Staging ও production আলাদা
- [ ] Cloudflare Pages থেকে নতুন সার্ভারে সরানো, পুরনো লিংক redirect
- [ ] Definition of Done পূরণ

## ফেজ ১২: চূড়ান্ত মান যাচাই ও রিলিজ

- [ ] **পূর্ণ feature যাচাই:** নিচের "Feature coverage" তালিকার প্রতিটা লাইন আবার পরীক্ষা
- [ ] আসল ধরনের (anonymized পাবলিক) ডেটা দিয়ে প্রতিটা modality পরীক্ষা: CT, MR, PET-CT, US, XA, MG/DBT, CR/DX, NM, SM, ECG, RT, SEG, SR
- [ ] পারফরম্যান্স মাপা: ২০০০+ slice CT, বড় MG, লম্বা US cine; প্রথম লোডের সময়, মেমোরি
- [ ] ব্রাউজার: Chrome, Edge, Firefox, Safari (macOS ও iOS), Android Chrome
- [ ] নিরাপত্তা পর্যালোচনা (`/security-review`), dependency audit
- [ ] Accessibility অডিট
- [ ] ব্যবহারকারী নির্দেশিকা (বাংলা ও ইংরেজি), FAQ, ভিডিও
- [ ] SEO পাতা (landing), changelog
- [ ] DICOM Conformance Statement (কোন SOP class, transfer syntax সমর্থিত)
- [ ] রিলিজ ও লঞ্চ
- [ ] Definition of Done পূরণ

---

## Feature coverage: স্টাডির প্রতিটা feature কোন ফেজে

স্টাডিতে পাওয়া প্রতিটা feature এখানে একবার করে আছে, যাতে কোনোটা বাদ না পড়ে। যেগুলো আগে থেকেই আছে, সেগুলো "আছে" চিহ্নিত।

| Feature (সূত্র) | ফেজ |
|---|---|
| ফাইল/ফোল্ডার, drag & drop | আছে |
| CD/DVD/USB/নেটওয়ার্ক ফোল্ডার (RadiAnt, MicroDicom) | আছে (ফোল্ডার হিসেবে); DICOMDIR → ১ |
| ZIP, পাসওয়ার্ড ZIP (RadiAnt, MicroDicom) | ১ |
| DICOMDIR (MicroDicom) | ১ |
| JPEG/PNG/BMP/GIF/TIFF খোলা (MicroDicom) | ১ |
| Compressed codec (RLE, JPEG, J2K, JPEG-LS, HTJ2K) | আছে |
| Multi-frame, dynamic sequence (সবাই) | ১ |
| CINE + FPS (RadiAnt, MicroDicom) | ১ |
| MPEG2/MPEG4 ভিডিও (RadiAnt, MicroDicom, OHIF) | ১ |
| Encapsulated PDF (RadiAnt, MicroDicom) | ১ |
| SR দেখা (সবাই) | ১ (লেখা), ৮ (মাপ) |
| Asynchronous loading, হাজার ছবি (RadiAnt) | ১ |
| ছবি সাজানোর বিকল্প (RadiAnt 2024.2) | ১ |
| Multi-sequence সিরিজ ভাগ (RadiAnt) | ১ |
| W/L, zoom, pan, invert, rotate, flip | আছে; 180° ও কোণ → ২ |
| CT preset | আছে |
| Custom preset, সঠিক W/L মান (RadiAnt, MicroDicom) | ২ |
| ROI দিয়ে W/L (MicroDicom) | ২ |
| SUVbw (RadiAnt, MicroDicom) | ২ (দেখানো), ৭ (ROI-তে) |
| Image filter: sharpen, smooth, edge, emboss, morphological | ২ |
| DICOM overlay (RadiAnt) | ২ |
| ফুল-স্ক্রিন, distraction-free (RadiAnt, MicroDicom) | ২ |
| Export ও প্রিন্টে রোগীর তথ্য লুকানো (MicroDicom) | ২, ৫ |
| Magnifier | আছে |
| Length, angle, ellipse, probe | আছে |
| Rectangle, circle, polygon, freehand, open/closed curve (MicroDicom, RadiAnt) | ৩ |
| Cobb angle, deviation distance (RadiAnt) | ৩ |
| Length ratio, ellipsoid volume (RadiAnt 2023.1) | ৩ |
| Arrow, text, pencil, spine label, hidden area (RadiAnt, MicroDicom) | ৩ |
| Calibration, US calibrated region (RadiAnt, MicroDicom) | ৩ |
| Mean/median/min/max/std, histogram (MicroDicom, Weasis, OsiriX) | ৩ |
| Bidirectional / RECIST (OHIF) | ৩ |
| Measurement panel, tracking (OHIF) | ৩ |
| Thumbnail, লেআউট, ডাবল-ক্লিকে বড় | আছে; বড় লেআউট → ২ |
| Reference line, slice sync, W/L sync | আছে |
| Zoom/pan sync (MicroDicom) | ৪ |
| ভিন্ন স্টাডির হাতে sync (RadiAnt) | ৪ |
| 3D cursor (RadiAnt) | ৪ |
| 2D/MPR/3D axis sync (RadiAnt 2025.2) | ৪ |
| Hanging protocol (OHIF) | আছে (মৌলিক); ইঞ্জিন → ৪ |
| একাধিক উইন্ডো / মনিটর (RadiAnt, Weasis) | ৪ |
| JPEG/BMP/PNG/GIF/TIFF export (RadiAnt, MicroDicom) | ৫ |
| MP4/AVI/WMV মুভি (RadiAnt, MicroDicom) | ৫ |
| Clipboard, অংশ ক্যাপচার (RadiAnt, MicroDicom) | ৫ |
| মূল DICOM export (RadiAnt) | ৫ |
| প্রিন্ট, PDF, এক পাতায় অনেক ছবি (RadiAnt 2024.2, MicroDicom) | ৫ |
| Tag export TXT/CSV/JSON (MicroDicom) | ৫ |
| Tag edit, প্রিয় tag (MicroDicom) | ৫ |
| Anonymize + template + batch (RadiAnt 2024.1, MicroDicom) | ৫ |
| ছবি → DICOM রূপান্তর (MicroDicom) | ৫ |
| Command-line ব্যাচ কাজ (MicroDicom) | ৫ (ব্রাউজারে batch UI), ১১ (সার্ভার API) |
| Orthogonal MPR, crosshair, slab MIP/MinIP/Avg | আছে |
| Oblique / 3D oblique MPR (RadiAnt, MicroDicom, Weasis) | ৬ |
| Curved MPR (OsiriX) | ৬ |
| 3D VR, preset, ঘোরানো, কিউব | আছে |
| 3D clipping, scalpel (RadiAnt, MicroDicom) | ৬ |
| 3D-তে মাপা (RadiAnt, MicroDicom, OsiriX) | ৬ |
| 3D snapshot, ঘোরানোর মুভি, snapshot ভিডিও (RadiAnt) | ৬ |
| STL export (RadiAnt, MicroDicom, OsiriX) | ৬ |
| Surface rendering, virtual endoscopy (OsiriX) | ৬ |
| Progressive rendering / GPU (RadiAnt) | ৬ |
| PET-CT, PET-MR, SPECT-CT fusion (সবাই) | ৭ |
| MR T1/T2 + DWI fusion (RadiAnt) | ৭ |
| PET/CT 3×3 mode, TMTV (OHIF) | ৭, ৯ |
| 3D ROI / 3D ball (OsiriX) | ৭ |
| Time-intensity curve (RadiAnt) | ৭ |
| DSA, pixel shift, split/magic mask (RadiAnt) | ৭ |
| 4D (Weasis, OHIF) | ৭ |
| KO/PR সেভ (Weasis) | ৮ |
| GSPS, SR, parametric map, AI object (Weasis) | ৮ |
| DICOM SEG (Weasis, OHIF) | ৮ (দেখা), ৯ (সম্পাদনা) |
| RTSTRUCT, RTDOSE, DVH (Weasis, OHIF) | ৮ |
| ECG, অডিও (Weasis, MedDream) | ৮ |
| Microscopy (OHIF, MedDream) | ৮ |
| Ophthalmology, ডেন্টাল, mammography/DBT (MedDream, RadiAnt) | ৮ |
| Segmentation টুল: brush, threshold, labelmap (OHIF) | ৯ |
| Multi-touch (RadiAnt, MicroDicom) | ১০ |
| ৩০+ ভাষা, অনুবাদ টুল (RadiAnt) | ১০ |
| শর্টকাট বদলানো (RadiAnt, Weasis) | ১০ |
| থিম, high-DPI, docking (Weasis) | ১০ |
| অফলাইনে চলা (ডেস্কটপ viewer) | ১০ (PWA) |
| লোকাল ডেটাবেস, keyword, CSV তালিকা (RadiAnt, MicroDicom) | ১০ |
| স্টাডি স্ট্যাটাস (MicroDicom) | ১০ |
| CD/USB viewer প্যাকেজ (RadiAnt, MicroDicom) | ১০ (PWA ইনস্টল; ঐচ্ছিক: অফলাইন HTML প্যাকেজ) |
| PACS C-ECHO/FIND/MOVE/GET/STORE (RadiAnt, MicroDicom, Weasis) | ১১ |
| DICOMweb QIDO/WADO/STOW (MicroDicom, Weasis, OHIF) | ১১ |
| Study list + ফিল্টার (OHIF) | ১১ |
| `radiant://` / `weasis://` protocol, command line | ১১ (URL parameter, protocol handler) |
| শেয়ার লিংক: পাসওয়ার্ড, মেয়াদ, ডাউনলোড বন্ধ (PostDICOM) | ১১ |
| Anonymize করে শেয়ার (MedDream, DICOM Library) | ১১ |
| Non-DICOM সংযুক্তি (PostDICOM) | ১১ |
| iframe embed, HIS/RIS/PACS/EMR integration (MedDream) | ১১ |
| AWS/Azure/Google ক্লাউড (MedDream) | ১১ |
| Conformance statement (MicroDicom) | ১২ |

## খোলা প্রশ্ন (সংশ্লিষ্ট ফেজ শুরুর আগে ঠিক করা হবে)

- ফেজ ০: Zustand নাকি React context — ছোট POC দেখে সিদ্ধান্ত
- ফেজ ৫: MP4 তৈরিতে WebCodecs (দ্রুত, নতুন ব্রাউজারে) নাকি `ffmpeg.wasm` (ভারী, সব জায়গায়)
- ফেজ ৮: Microscopy আলাদা viewer লাইব্রেরি (যেমন OHIF-এর dicom-microscopy-viewer) লাগবে কিনা
- ফেজ ১১: সার্ভারের প্রদাতা, ব্যাকএন্ড ভাষা (Node/Go/Python), DICOM সার্ভার (Orthanc/dcm4chee), domain, বাজেট
- সব ফেজ: আসল রোগীর ধরনের পরীক্ষার ডেটা কোথা থেকে (পাবলিক anonymized ডেটাসেট)
