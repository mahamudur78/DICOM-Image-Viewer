# ফেজ ৮: বিশেষ DICOM object — বিস্তারিত পরিকল্পনা

> স্ট্যাটাস: সম্পন্ন · তারিখ: 2026-10-29 · ব্রাঞ্চ: `feature/phase-8-special-objects`
> মূল রোডম্যাপ: [FULL_FEATURE_ROADMAP.md](FULL_FEATURE_ROADMAP.md#ফেজ-৮-বিশেষ-dicom-object) · আগের ফেজ: [PHASE_7_FUSION_FUNCTIONAL_PLAN.md](PHASE_7_FUSION_FUNCTIONAL_PLAN.md)

## লক্ষ্য

ছবি নয় এমন DICOM object খোলা, দেখানো আর (যেগুলো দরকার) লেখা:

- **মাপ আর দেখার অবস্থা:** Measurement SR (TID 1500), Key Object Selection (KO), Presentation State (GSPS)।
- **Overlay object:** SEG, RTSTRUCT, RTDOSE (isodose, color wash, DVH), parametric map।
- **নিজস্ব viewer:** RTPLAN-এর তথ্য, ECG ও অন্য waveform, DICOM অডিও, whole-slide microscopy (SM)।
- **বিশেষ ছবি:** ophthalmology, ডেন্টাল, mammography হ্যাঙ্গিং, breast tomosynthesis (DBT)।
- AI-র তৈরি object চেনা।

## এখনকার অবস্থা

- **চেনা kind:** `image`, `video`, `pdf`, `sr`।
- **SR:** লেখা হিসেবে দেখানো হয় (`SrViewer`), রেফার করা ছবিতে যাওয়া যায়। মাপ ছবিতে আসে না।
- **বাকি object:** Rows নেই এমন object (KO, GSPS, RTSTRUCT, RTPLAN, waveform) এখন "unsupported object" issue হয়। SEG, RTDOSE আর parametric map-এ Rows আছে, তাই ভুল করে সাধারণ ছবি হিসেবে খোলে।
- **কাজে লাগবে:**
  - ফেজ ৭-এর fusion layer: canvas → world → overlay-এর মান → রং।
  - ফেজ ৩-এর মাপ JSON লোড/সেভ।
  - ফেজ ৫-এর DICOM লেখক (`src/dicom/writer.ts`)।
  - হ্যাঙ্গিং প্রোটোকল।

## নকশার সিদ্ধান্ত

| বিষয় | সমাধান |
|---|---|
| **Object চেনা** | SOP Class দিয়ে নতুন kind: `ko`, `pr`, `seg`, `rtstruct`, `rtdose`, `rtplan`, `pmap`, `waveform`, `sm`। প্রতিটা object আলাদা "সিরিজ" হিসেবে সাইডবারে থাকে, নিজের আইকন আর ব্যাজসহ। |
| পার্স | `dicom-parser` আর `header.ts`-এর helper (SR-এর মতো)। পুরো ফাইল দরকার হলে তখনই পড়া হয় (lazy)। বিশুদ্ধ মডিউল `src/objects/`-এ, test-সহ। |
| **Overlay object = local volume** | SEG, RTSTRUCT, RTDOSE আর parametric map থেকে একটা `VolumeGrid` বানানো হয়, তারপর Cornerstone local volume। এরপর ফেজ ৭-এর fusion (2D গ্রিড, MPR, 3D) দিয়েই দেখানো হয়। Fusion-এর style-এ নতুন মোড: `labels` (segment-এর রং, লুকানো, nearest sampling) আর `dose` (color wash + isodose রেখা)। |
| SEG | Binary (bit-packed) আর fractional frame। প্রতিটা frame-এর অবস্থান per-frame functional group থেকে। গ্রিড = SEG-এর নিজের plane, frame-এর দূরত্ব দিয়ে slice। প্রতি voxel-এ ৩২টা পর্যন্ত segment-এর bitmask, তাই overlap হারায় না। |
| RTSTRUCT | Contour (CLOSED_PLANAR) রেফার করা CT-র গ্রিডে rasterize করা হয় (একই frame of reference, না থাকলে contour-এর নিজের plane আর ১ mm pixel)। ভেতরটা হালকা রং; তালিকায় structure, রং, লুকানো। |
| RTDOSE | Multi-frame dose grid × Dose Grid Scaling, Grid Frame Offset Vector থেকে slice। Color wash (jet) আর isodose রেখা: আধা রেজোলিউশনের মানে marching squares, নির্দিষ্ট শতাংশে (prescription বা সর্বোচ্চ ধরে)। |
| DVH | RTSTRUCT-এর প্রতিটা structure-এর voxel-এ dose (trilinear) → cumulative histogram। SVG চার্ট, Dmax/Dmean/D95/V20 ধরনের মান, CSV। |
| Parametric map | Float/Double Pixel Data বা integer, Real World Value Mapping। নিজে দেখালে ধূসর বা colormap; রেফার করা সিরিজের উপর fusion। |
| **Measurement SR পড়া** | TID 1500-এর measurement group → SCOORD (POINT, POLYLINE, CIRCLE, ELLIPSE, MULTIPOINT) আর রেফার করা ছবি → আমাদের মাপের JSON → ফেজ ৩-এর লোডার। "Apply to images" বোতাম SR viewer-এ। |
| Measurement SR লেখা | আমাদের মাপ → TID 1500 Comprehensive SR (মান NUM-এ, UCUM একক), ডাউনলোড আর স্টাডিতে যোগ। |
| **KO** | ছবি চিহ্নিত করা (কী-বোর্ড/মেনু), viewport-এ ★। "শুধু key image" ফিল্টার। KO পড়া: রেফার করা ছবি key হয়ে যায়। KO লেখা: Key Object Selection Document (title "Of Interest")। |
| **GSPS পড়া** | VOI LUT (window), Spatial Transformation (ঘোরানো, flip), Displayed Area (zoom/এলাকা), Graphic/Text annotation (PIXEL ও DISPLAY একক) আর shutter। GSPS খুললে রেফার করা ছবি সক্রিয় cell-এ খোলে, অবস্থা প্রয়োগ হয়, annotation আলাদা SVG layer-এ। |
| GSPS লেখা | সক্রিয় viewport-এর window, ঘোরানো, flip, দেখানো এলাকা, আর মাপগুলো graphic annotation (polyline/ellipse) হিসেবে। স্টাডিতে যোগ হয়, ডাউনলোড করা যায়। |
| **RTPLAN** | লেখা-ভিত্তিক viewer: plan-এর নাম, তারিখ, prescription, fraction, beam-এর তালিকা (নাম, ধরন, শক্তি, gantry/collimator/couch কোণ, MU)। |
| **Waveform** | নিজস্ব viewer (SVG): ECG-তে ১২-lead গ্রিড (৩×৪ + rhythm strip), ২৫/৫০ mm/s, ৫/১০/২০ mm/mV, mm গ্রিড; caliper (দুই ক্লিক → ms, mV, হার্ট রেট)। অন্য waveform: প্রতিটা channel আলাদা সারিতে, একক সহ। |
| অডিও | Basic Voice Audio → PCM (৮/১৬-বিট, µ-law/A-law) → Web Audio `AudioBuffer`; play/pause আর অবস্থান। |
| **SM** | আলাদা viewer: tiled pyramid (প্রতিটা level একটা instance), canvas-এ tile আঁকা, zoom অনুযায়ী level বাছাই। Tile: uncompressed RGB, অথবা JPEG/JPEG 2000 নয় — JPEG baseline হলে ব্রাউজারের `createImageBitmap`। মাপার রেখা (µm/mm), label। |
| OP/OPT, IO/PX | নমুনা বানিয়ে যাচাই; ডেন্টাল-এ Pixel Intensity Relationship Sign মানা; OPT multi-frame stack। |
| **Mammography** | Built-in হ্যাঙ্গিং: ২×২ (RCC LCC / RMLO LMLO), ডান পাশের ছবি আয়নার মতো (flip) যাতে বুকের দেয়াল মুখোমুখি। View Position আর Image Laterality থেকে। DBT (Breast Tomosynthesis Image) enhanced multi-frame stack হিসেবে। |
| **AI ব্যাজ** | Algorithm Identification Sequence, Contributing Equipment-এ purpose "109103"/"AI", বা বিবরণে "AI"/"CAD" থাকলে সাইডবারে "AI" ব্যাজ। |
| বাজেট | নতুন viewer আর পার্সার lazy chunk-এ; runtime chunk-এ শুধু kind চেনা। |

## টাস্ক

### ৮.১ ভিত্তি
- [x] নতুন kind, SOP class টেবিল, সাইডবার আইকন/ব্যাজ, AI চেনা
- [x] নমুনা: SR (TID 1500), KO, GSPS, SEG, RTSTRUCT, RTDOSE, RTPLAN, parametric map, ECG, hemodynamic, অডিও, SM, OP/OPT, IO/PX, MG (৪ view), DBT

### ৮.২ মাপ আর দেখার অবস্থা
- [x] Measurement SR পড়া → মাপ ছবিতে
- [x] Measurement SR লেখা
- [x] KO: চিহ্নিত করা, ফিল্টার, পড়া, লেখা
- [x] GSPS পড়া (VOI, ঘোরানো/flip, এলাকা, annotation, shutter)
- [x] GSPS লেখা

### ৮.৩ Overlay object
- [x] Fusion-এ `labels` আর `dose` মোড
- [x] SEG: 2D, MPR, 3D; segment তালিকা, রং, opacity, লুকানো
- [x] RTSTRUCT: contour, structure তালিকা
- [x] RTDOSE: color wash, isodose
- [x] DVH চার্ট
- [x] Parametric map

### ৮.৪ নিজস্ব viewer
- [x] RTPLAN-এর তথ্য
- [x] ECG (১২-lead, স্কেল, caliper), অন্য waveform
- [x] অডিও
- [x] Whole-slide microscopy (zoom, pan, level, মাপ)

### ৮.৫ বিশেষ ছবি
- [x] OP/OPT, IO/PX
- [x] Mammography হ্যাঙ্গিং (mirror), DBT

### ৮.৬ পরীক্ষা ও সমাপ্তি
- [x] Unit: প্রতিটা পার্সার, rasterize, isodose, DVH, waveform ডিকোড, SR/KO/GSPS লেখা আর আবার পড়া
- [x] E2E: প্রতিটা object, মোবাইল
- [x] dev + prod; বাজেট; README, এই ফাইল, রোডম্যাপ, TEST_DATA
- [x] Commit শুধু ব্যবহারকারী বললে

## ঝুঁকি

| ঝুঁকি | প্রতিকার |
|---|---|
| Object-গুলোর বৈচিত্র্য অনেক (বিভিন্ন vendor) | মানদণ্ডের প্রধান পথ আগে; অচেনা অংশ বাদ দিয়ে বাকিটা দেখানো, issue-তে কারণ |
| বড় SEG/RTDOSE | Typed array, একবার পার্স; overlay আধা রেজোলিউশনে |
| SM-এর বিশাল tile pyramid | শুধু দেখা অংশের tile, ক্যাশ সীমিত |
| বাজেট প্রায় শেষ | সব নতুন viewer lazy; দরকার হলে কারণসহ বাজেট বাড়ানো |
| Cornerstone segmentation (ফেজ ৯) এর সাথে মেলানো | এখন নিজস্ব overlay; ফেজ ৯-এ SEG গ্রিড থেকে Cornerstone labelmap বানানো সহজ রাখা |

## বাস্তবায়নের নোট

**গঠন:**
- `src/objects/`-এ বিশুদ্ধ পার্সার আর লেখক, test-সহ (`objects.test.ts`, নমুনা থেকে):
  - `seg.ts`, `rtstruct.ts`, `valueGrids.ts` (RTDOSE, parametric map), `labels.ts` (segment-এর bitmask গ্রিড, CIELab রং)।
  - `dose.ts` (isodose-এর marching squares, DVH), `rtplan.ts`, `waveform.ts`, `slide.ts`।
  - `measurementSr.ts` (TID 1500 পড়া/লেখা), `keyObjects.ts` (KO), `presentationState.ts` (GSPS)।
  - DICOM লেখার সাধারণ অংশ: `write.ts`।
- App-এর সাথে যুক্ত: `apply.ts` (object খোলা), `base.ts` (কোন সিরিজের উপর), `keyImages.ts`, `presentation.ts`, `reports.ts` (SR/KO/GSPS সেভ)।
- UI:
  - Viewer: `ObjectViewer.tsx`, `RtPlanViewer.tsx`, `WaveformViewer.tsx`, `SlideViewer.tsx` — সব lazy chunk।
  - Overlay: `PresentationLayer.tsx`, `ObjectControls.tsx` (Fusion প্যানেলের ভেতরে)।
  - টুলবারে "Reports ▾" মেনু; `*` চাপলে key image চিহ্নিত হয়।
- নমুনা: `scripts/sample-objects.mjs`। এটা `generate-samples.mjs` থেকে চলে (SAMPLES_VERSION 17)।

**Overlay object:**
- SEG, RTSTRUCT, RTDOSE আর parametric map থেকে একটা গ্রিড বানানো হয়। তারপর ফেজ ৭-এর fusion layer দিয়ে দেখানো হয়। Fusion-এর মোড:
  - `labels`: nearest sampling। প্রতিটা pixel-এ প্রথম দৃশ্যমান segment-এর রং, কিনারা পুরো অস্বচ্ছ।
  - `dose`: color wash আর isodose রেখা।
- Overlay-গুলো সিরিজের সাথে বাঁধা (`obj:<series>|<object>`), viewport-এর সাথে নয়।
  - তাই একই সিরিজের গ্রিড cell আর MPR-এ দেখায়।
  - একাধিক object একসাথে দেখানো যায় (যেমন RTSTRUCT + RTDOSE)।
- 3D: গ্রিড একটা Cornerstone local volume-ও হয়। প্যানেলের "Show in 3D" দ্বিতীয় volume যোগ করে; segment-এর রং TF দিয়ে।
- RTSTRUCT rasterize হয় রেফার করা CT-র গ্রিডে। CT না থাকলে contour-এর নিজের plane-এ (১ mm)। একই plane-এর contour even-odd নিয়মে মেলে, তাই ফাঁকা অংশ (hole) ফাঁকা থাকে।
- Dose-এর reference হিসেবে খোলা RTPLAN-এর prescription নেওয়া হয়; plan না থাকলে সর্বোচ্চ dose।
- DVH structure-এর voxel কেন্দ্রে dose (trilinear) নিয়ে হিসাব হয়; সব curve-এর dose অক্ষ একটাই।
- SEG, RTSTRUCT, RTDOSE, parametric map, KO আর GSPS গ্রিডের cell দখল করে না। সাইডবার থেকে বাছলে রেফার করা ছবিতে প্রয়োগ হয়।

**মাপ, key image, presentation state:**
- **SR পড়া:** TID 1500-এর SCOORD আমাদের টুলে বসে।
  - POLYLINE ২ বিন্দু → Length; ৩ বিন্দু আর "angle" → Angle; বাকিগুলো → Freehand।
  - ELLIPSE → Ellipse, CIRCLE → Circle, POINT → Probe।
  - ফেজ ৩-এর JSON লোডার দিয়েই বসানো হয়।
- **SR লেখা:** প্রতিটা মাপের জন্য একটা measurement group (Tracking Identifier, NUM-এ UCUM একক, SCOORD আর IMAGE)।
- **KO:** key image ঘরে ★ দেখায়। "শুধু key image" সিরিজের একটা ফিল্টার করা কপি (`#key`)। KO খুললে সেই ছবিগুলো ফিল্টারসহ খোলে।
- **GSPS পড়া:**
  - Window, inverse, ঘোরানো, flip, displayed area (camera দিয়ে), shutter (আয়তাকার/বৃত্ত/বহুভুজ) আর graphic/text annotation (PIXEL ও DISPLAY একক, layer-এর রং)।
  - Camera সরালে event আবার আসে, তাই প্রয়োগ প্রতিবার একবারই হয় (আগে এতে recursion হচ্ছিল)।
- **GSPS লেখা:** সক্রিয় cell-এর window, ঘোরানো/flip, দেখা এলাকা, আর মাপগুলো graphic ও লেখা (মানসহ) হিসেবে।
- SR, KO আর GSPS সেভ হলে স্টাডিতে যোগ হয় আর ডাউনলোডও হয়।

**অন্যান্য:**
- **Waveform:** ECG-তে ১২-lead থাকলে ৩×৪ + rhythm strip; গতি ১২.৫/২৫/৫০ mm/s, gain ৫/১০/২০ mm/mV, mm গ্রিড, caliper (ms, mV, হার্ট রেট)। অন্য waveform-এ প্রতি channel এক সারি, সারি ভরে scale। অডিও Web Audio-তে বাজে।
- **SM:** একই সিরিজের সব level এক সিরিজে থাকে। TILED_FULL আর TILED_SPARSE, uncompressed আর JPEG tile (ব্রাউজার decode করে)। Zoom অনুযায়ী level বাছা হয়; সর্বোচ্চ ৪০০ tile ক্যাশে থাকে। মাপ µm/mm-এ।
- **Mammography:** built-in হ্যাঙ্গিং RCC, LCC / RMLO, LMLO।
  - Patient Orientation-এর সারির দিক (A/P) দেখে mirror flip: ডান স্তনের বুকের দেয়াল ডানে, বাঁ স্তনের বাঁয়ে।
  - একই view-এর tomosynthesis stack একক ছবির পরে আসে।
- **AI ব্যাজ:** Algorithm Identification, SEG-এর AUTOMATIC segment, বা বিবরণ/manufacturer-এ AI/CAD।

**বাজেট:** মোট JS ১৯৩৮.৫ KB (বাজেট ১৯৫০), initial ১০৫.১ KB, runtime chunk ৯৯৭.০ KB। কোনো বাজেট বাড়াতে হয়নি, তবে মোট বাজেট প্রায় শেষ।

**ফল:**
- Unit test ১৬০টা পাস।
- E2E dev আর prod দুটোতেই ১১৬টা পাস + ১টা skip (আগের password ZIP)।
  - নতুন `e2e/objects.spec.ts`-এ ১২টা টেস্ট, একটা মোবাইলের।
  - একটা dev রানে মেশিন ব্যস্ত থাকায় (রান স্বাভাবিকের দ্বিগুণ সময় নেয়) ৪টা ভারী 3D/মোবাইল টেস্ট timeout হয়েছিল। আলাদা করে চালালে সেগুলো পাস করে, আর পরের পুরো dev রান পরিষ্কার।
- `npm run lint` পরিষ্কার।

**যা পরীক্ষা করা হয়নি বা সীমিত:**
- 3D-তে object overlay আর MPR-এ object overlay E2E-তে নেই। কোড একই পথে চলে, তবে আলাদা যাচাই হয়নি।
- Fractional SEG, TILED_SPARSE আর JPEG tile-এর SM, µ-law/A-law অডিওর নমুনা নেই। Decode ফাংশনগুলো শুধু unit test-এ যাচাই।
- একটা গ্রিডে সর্বোচ্চ ২৪টা segment/structure (Float32-এ bitmask)। 3D-তে overlap হওয়া voxel ঠিক রং পায় না।
- RTSTRUCT: শুধু CLOSED_PLANAR contour; POINT আর OPEN contour বাদ।
- SR: শুধু 2D SCOORD; SCOORD3D আর MULTIPOINT বাদ।
- GSPS-এর সীমা:
  - VOI LUT table (শুধু window), per-frame spatial transformation, graphic layer-এর ক্রম আর color/pseudo-color PS-এর রং প্রয়োগ হয় না।
  - DISPLAY একক মোটামুটি হিসাব করা।
- Key image চিহ্ন শুধু এই session-এ থাকে, যতক্ষণ না KO হিসেবে সেভ করা হয়।
- ECG-র প্যানেলে পুরো ১০ সেকেন্ডের rhythm strip দেখতে স্ক্রল করতে হয়।
- বাংলা অনুবাদ ফেজ ১০-এ।
