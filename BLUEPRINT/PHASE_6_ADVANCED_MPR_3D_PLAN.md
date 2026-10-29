# ফেজ ৬: উন্নত MPR ও 3D — বিস্তারিত পরিকল্পনা

> স্ট্যাটাস: সম্পন্ন (commit-এর অপেক্ষায়) · তারিখ: 2026-10-29 · ব্রাঞ্চ: `feature/phase-6-advanced-mpr-3d`
> মূল রোডম্যাপ: [FULL_FEATURE_ROADMAP.md](FULL_FEATURE_ROADMAP.md#ফেজ-৬-উন্নত-mpr-ও-3d) · আগের ফেজ: [PHASE_5_EXPORT_PRINT_ANONYMIZE_PLAN.md](PHASE_5_EXPORT_PRINT_ANONYMIZE_PLAN.md) · আগের 3D কাজ: [3D_VR_PLAN.md](3D_VR_PLAN.md)

## লক্ষ্য

- **MPR:** oblique আর double-oblique; crosshair টেনে slab; MPR থেকে নতুন সিরিজ; curved MPR (CPR) ও ডেন্টাল panoramic।
- **3D:** crop আর clipping; scalpel; 3D-তে মাপা; transfer function editor; আলো; snapshot; ঘোরানোর ও snapshot মুভি; surface rendering; STL/OBJ/PLY; virtual endoscopy; MIP/MinIP; উচ্চ রেজোলিউশনের ছবি।

## যাচাই করা (Cornerstone 5.13)

| দরকার | অবস্থা |
|---|---|
| Oblique / double-oblique | `CrosshairsTool`-এ rotation handle আর slab handle ডিফল্টে চালু। দরকার: plane রিসেট কমান্ড আর test। |
| 3D sample distance | `VolumeViewport3D`-এর mapper `setSampleDistance`; ঘোরানোর সময় বাড়ানো, থামলে ফেরত |
| Clipping | vtk mapper-এর `addClippingPlane` (ছয়টা plane = crop box; একটা plane = যে কোনো দিকে কাটা) |
| আলো | volume property `setAmbient/Diffuse/Specular`, `setShade` |
| MIP/MinIP 3D-তে | `setBlendMode` |
| Surface | vtk.js `ImageMarchingCubes` → polydata → actor |

## নকশার সিদ্ধান্ত

| বিষয় | সমাধান |
|---|---|
| গণিত আলাদা | `src/volume/` ফোল্ডারে বিশুদ্ধ মডিউল, test-সহ: volume-এ trilinear sampling, plane থেকে slice, CPR (পথ বরাবর resample), ray-এ প্রথম "ঘন" voxel (3D-তে বিন্দু বাছাই), transfer function মডেল, STL/OBJ/PLY writer, mesh-এর ক্ষেত্রফল/আয়তন। |
| MPR → সিরিজ | এখনকার MPR plane বরাবর নির্দিষ্ট দূরত্বে slice; নিজেদের sampling থেকে 16-বিট মান; সঠিক position/orientation/spacing আর rescale দিয়ে নতুন DICOM ফাইল (derived) → খোলা স্টাডিতে নতুন সিরিজ হিসেবে যোগ (ফেজ ৪-এর add files)। সেটা export করা যায়। |
| CPR | MPR viewport-এ ক্লিক করে পথ (বিন্দু; Catmull-Rom মসৃণ)। ছবির অনুভূমিক অক্ষ = পথ বরাবর দূরত্ব (mm), উল্লম্ব অক্ষ = plane-এর normal (straightened / panoramic: axial-এ আঁকা চোয়ালের বাঁক → ডেন্টাল panoramic)। ঐচ্ছিক বেধ (MIP)। ফলাফল ডায়ালগে, PNG বা DICOM হিসেবে সেভ। |
| বড় volume | slice-গুলো interleaved ক্রমে লোড (প্রতি ৮টার একটা আগে, তারপর বাকি), তাই পুরো volume মোটা দাগে আগে দেখা যায়। |
| 3D প্যানেল | ডান পাশে "3D" প্যানেল: transfer function editor (opacity আর রঙের বিন্দু, histogram-এর উপর), আলো, crop স্লাইডার (৬ দিক), clipping plane (দিক + অবস্থান), blend (VR/MIP/MinIP), surface (threshold, রং), snapshot তালিকা, মুভি, endoscopy। |
| Scalpel | 3D-তে polygon আঁকা → ভেতর বা বাইরের voxel 3D-র জন্য বানানো আলাদা volume কপিতে মুছে ফেলা (MPR অপরিবর্তিত); প্রতিটা কাট undo-যোগ্য (বদলানো index আর মান রাখা)। |
| 3D মাপ | ক্লিকের ray ধরে volume-এ এগিয়ে প্রথম voxel, যার opacity transfer function অনুযায়ী দৃশ্যমান → সেটাই surface বিন্দু; দুটো বিন্দুর দূরত্ব; 3D-র উপর SVG-তে আঁকা। |
| Transfer function | নিজের মডেল (বিন্দু: মান → opacity, মান → রং)। Preset থেকে শুরু; বদলালে vtk-র piecewise আর color function-এ যায়; নিজের preset settings-এ সেভ। |
| Snapshot | camera, preset/TF, আলো, crop, clipping, blend → session-এ তালিকা; ফেরত আনা যায়। |
| মুভি | ৩৬০° ঘোরানো (অক্ষ: উপর-নিচ বা পাশাপাশি) আর snapshot-এর মধ্যে মসৃণ পরিবর্তন (camera interpolate) → ফেজ ৫-এর WebCodecs + mp4-muxer দিয়ে MP4/WebM। |
| Surface ও STL | vtk `ImageMarchingCubes` (threshold), "সরল করা" = আগে volume কম রেজোলিউশনে (×2, ×4) নামানো। Surface 3D-তে দেখানো, আর STL (binary)/OBJ/PLY-তে mm মাপে। |
| Endoscopy | perspective camera volume-এর ভেতরে; বাতাস স্বচ্ছ, দেয়াল অস্বচ্ছ এমন TF; পথ MPR-এ ক্লিক করে → fly-through অ্যানিমেশন, মাউস/কী দিয়ে এগোনো-পেছানো। |
| উচ্চ রেজোলিউশন | লুকানো বড় 3D viewport (×2/×4) একই camera আর property দিয়ে রেন্ডার → PNG |

## টাস্ক

### ৬.১ MPR
- [x] Oblique/double-oblique: rotation handle test, "Reset planes" কমান্ড
- [x] Slab handle টেনে বেধ বদলানো (test), টুলবারের slab-এর সাথে মিল
- [x] MPR-এ W/L preset, invert, PNG, মাপ যাচাই (test)
- [x] MPR → নতুন সিরিজ (দূরত্ব, সংখ্যা/পরিসর), ডায়ালগ, export
- [x] CPR/panoramic: পথ আঁকা, straightened ছবি, বেধ, সেভ
- [x] বড় volume: interleaved লোড

### ৬.২ 3D রেন্ডারিং
- [x] ঘোরানোর সময় sample distance বাড়ানো, থামলে পূর্ণ মান
- [x] Crop box (৬ দিক) আর clipping plane
- [x] Scalpel (ভেতর/বাইরে) + undo
- [x] 3D মাপ (দুই বিন্দু)
- [x] Transfer function editor + নিজের preset
- [x] আলো
- [x] VR / MIP / MinIP
- [x] Snapshot সেভ/ফেরত
- [x] ঘোরানোর মুভি আর snapshot মুভি
- [x] Surface rendering + STL/OBJ/PLY
- [x] Virtual endoscopy + fly-through
- [x] উচ্চ রেজোলিউশনের PNG

### ৬.৩ পরীক্ষা ও সমাপ্তি
- [x] Unit: sampling, slice, CPR, ray pick, TF, STL/OBJ/PLY, mesh মাপ
- [x] E2E: প্রতিটা বৈশিষ্ট্য (SwiftShader-এ WebGL2), মোবাইল
- [x] dev + prod; বাজেট; README, এই ফাইল, রোডম্যাপ, 3D_VR_PLAN.md-এর বাকি কাজ টিক
- [ ] Commit শুধু ব্যবহারকারী বললে

## ঝুঁকি

| ঝুঁকি | প্রতিকার |
|---|---|
| CI-তে (SwiftShader) 3D ধীর | ছোট phantom, ছোট viewport; test-এ মান মেপে (pixel নয়) যাচাই |
| Scalpel-এর volume কপি স্মৃতি খায় | কপি শুধু প্রথম কাটের সময়; মাপ সীমা পেরোলে সতর্কতা |
| Marching cubes বড় volume-এ ধীর | ডাউনস্যাম্পল বিকল্প; অগ্রগতি দেখানো |
| vtk-র ভেতরের API বদলায় | সব vtk কোড `src/cornerstone/volume3d*.ts`-এ সীমিত |

## বাস্তবায়নের নোট

**গঠন:**
- `src/volume/`:
  - `grid.ts`: trilinear sampling, oblique slice, Catmull-Rom curve, CPR, ray picking।
  - `transferFunction.ts`, `mesh.ts` (STL/OBJ/PLY, ক্ষেত্রফল ও আয়তন), `mprSeries.ts` (reformat করা slice → DICOM)।
  - সবগুলো বিশুদ্ধ, test-সহ।
  - `actions.ts`: নতুন সিরিজ আর CPR। `CprDialog.tsx`।
- `src/cornerstone/`:
  - `volume3dTools.ts`: TF, আলো, blend, crop/clip, পিক, scalpel, surface, endoscopy, snapshot। vtk কোড এখানেই সীমিত।
  - `mprTools.ts`: plane রিসেট, reformat-এর পরিকল্পনা, CPR পথ।
- `src/export/export3d.ts`: ঘোরানোর মুভি, snapshot মুভি, উচ্চ রেজোলিউশন।
- UI:
  - `Volume3DPanel.tsx` (প্যানেল "3D settings")।
  - `VrOverlay.tsx`: scalpel আঁকা আর 3D মাপ।
  - `CprOverlay.tsx`: MPR-এ পথ আঁকা।
  - টুলবারে MPR মোডে "Reformat ▾" মেনু।

**MPR:**
- Cornerstone-এর crosshair-এ rotation আর slab handle আগে থেকেই চালু; এগুলো mouse লাইনের কাছে গেলে দেখা দেয়।
- যোগ হয়েছে "Reset planes": প্রতিটা viewport-এর orientation আর camera, তারপর crosshair রিসেট।
- E2E-তে যাচাই হয়: handle টেনে plane ঘোরে, রিসেটে ফেরে, slab handle টেনে বেধ বাড়ে, আর MPR-এ W/L preset, invert ও PNG কাজ করে।
- নতুন সিরিজ:
  - view-এর ডান/নিচ/normal দিক থেকে পুরো volume ঢাকা slice বানানো হয় (দূরত্ব ব্যবহারকারী দেয়, সর্বোচ্চ ১০০০টা)।
  - 16-বিট মান, পূর্ণসংখ্যা হলে rescale ছাড়া, নইলে slope/intercept।
  - সঠিক IPP/IOP/spacing আর একই frame of reference রাখা হয়।
  - ফেজ ৪-এর add files দিয়ে স্টাডিতে যোগ হয়; তাই সাইডবারে আসে, খোলা যায়, export করা যায়।
- CPR:
  - MPR-এ ক্লিক করা বিন্দু নিয়ে Catmull-Rom বাঁক, প্রতি pixel-spacing mm-এ একটা নমুনা।
  - উল্লম্ব দিক = যে view-এ আঁকা তার normal। তাই axial-এ চোয়ালের বাঁক আঁকলে ডেন্টাল panoramic হয়।
  - ঐচ্ছিক বেধ (MIP)।
  - PNG হিসেবে, বা স্টাডিতে এক ছবির সিরিজ হিসেবে (geometry ছাড়া) সেভ করা যায়।
- বড় volume: Cornerstone-এর `interleavedRetrieveStages` চালু। প্রতি ৪টার একটা slice আগে আসে, পাশের slice দিয়ে ফাঁক ভরা থাকে, তারপর বাকিগুলো।

**3D:**
- **Blend:** Cornerstone-এর 3D `setBlendMode` কিছুই করে না, তাই vtk mapper-এ সরাসরি দেওয়া হয়। MIP/MinIP-এর সময় TF ধূসর আর পুরো অস্বচ্ছ হয়; VR-এ ফিরলে আগের TF ফিরে আসে।
- **Endoscopy:** Cornerstone-এর `setCamera` `parallelProjection` উপেক্ষা করে, তাই vtk camera-তে সরাসরি perspective আর view angle দেওয়া হয়।
- **Scalpel:**
  - প্রথম কাটে volume-এর একটা local কপি বানিয়ে 3D-তে বসানো হয়; MPR আসলটা দেখায়।
  - কপির slice id দিয়ে Cornerstone window খুঁজতে গিয়ে কপির slice লোড করার চেষ্টা করছিল, তাই আমাদের metadata provider window দেয়।
  - `getCompleteScalarDataArray()` আসলে একটা কপি; বদলানোর পর `setCompleteScalarDataArray` + `invalidate()` দিয়ে GPU-তে আবার পাঠাতে হয়।
  - Preset আবার বসানো হয়, যাতে কপি আসলটার মতো দেখায়।
  - Undo আগের মানগুলো ফেরত দেয়।
- **3D মাপ:** viewer থেকে ray, TF-এ দৃশ্যমান প্রথম voxel; crop আর clipping মানা হয়।
- **Surface:**
  - vtk `ImageMarchingCubes`; "Detail" দিয়ে আগে ডাউনস্যাম্পল করে mesh হালকা করা যায়।
  - mesh mm-এ, রোগীর অক্ষ ধরে।
  - আয়তন divergence theorem দিয়ে, তাই শুধু বন্ধ surface-এ অর্থবহ। volume-এর কিনারায় কাটা surface খোলা থাকে।
- **MPR + 3D চিহ্ন:** volume-এর ভেতরের vtk গোলক টিস্যুর আড়ালে ঢাকা পড়ত (ফেজ ৪-এ দেখা), তাই crosshair-কেন্দ্র SVG চিহ্ন হিসেবেই থাকছে।
- vtk.js এখন সরাসরি dependency, Cornerstone-এর একই 36.4.1 (দ্বিতীয় কপি নেই)।

**ফল:**
- Unit test ১৩১টা পাস (নতুন: volume grid, CPR, ray, TF, mesh, reformat DICOM)।
- E2E dev আর prod: ৯৪টা পাস + ১টা skip (আগের password ZIP)।
  - এর পরে আরও একটা MPR টেস্ট (slab/W/L/invert/PNG) যোগ হয়েছে।
  - এখন `e2e/volume.spec.ts`-এ ৮টা টেস্ট, একটা মোবাইলের। পুরো spec আবার চালিয়ে সব পাস (৯টা রান)।
- Initial JS ১০২.৮ KB, runtime chunk ৯৯৪.১ KB, মোট ১৮৯১.৫ KB। কোনো বাজেট বাড়াতে হয়নি, তবে মোট বাজেটের প্রায় শেষ সীমায় আছে।

**যা সীমিত:**
- Surface দেখানো অবস্থায় উচ্চ রেজোলিউশনের ছবিতে volume rendering আসে, surface আসে না।
- Snapshot শুধু এই session-এ থাকে; ফাইলে সেভ হয় না।
- Endoscopy-র পথ MPR-এ আঁকা CPR পথই। কেন্দ্ররেখা নিজে থেকে বের করা হয় না।
- WebGPU/বড় volume-এ গতি আলাদা করে মাপা হয়নি। SwiftShader-এ phantom-এ সব চলে।
- বাংলা অনুবাদ ফেজ ১০-এ।
