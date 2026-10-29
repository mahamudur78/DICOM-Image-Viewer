# ফেজ ৭: Fusion ও ফাংশনাল ইমেজিং — বিস্তারিত পরিকল্পনা

> স্ট্যাটাস: সম্পন্ন · তারিখ: 2026-10-29 · ব্রাঞ্চ: `feature/phase-7-fusion-functional`
> মূল রোডম্যাপ: [FULL_FEATURE_ROADMAP.md](FULL_FEATURE_ROADMAP.md#ফেজ-৭-fusion-ও-ফাংশনাল-ইমেজিং) · আগের ফেজ: [PHASE_6_ADVANCED_MPR_3D_PLAN.md](PHASE_6_ADVANCED_MPR_3D_PLAN.md)

## লক্ষ্য

- **Fusion:** একটা সিরিজের উপর আরেকটা রঙে দেখানো, যেমন PET-CT, PET-MR, SPECT-CT, বা T1-এর উপর DWI/ADC।
  - সাধারণ 2D গ্রিড, MPR আর 3D তিনটাতেই।
  - ভিন্ন frame of reference হলে হাতে মিলিয়ে নেওয়া (registration)।
- **PET:** PET/CT লেআউট, ঘোরানো MIP, ROI ও 3D বলে SUVmax, SUVmean, SUVpeak।
- **Time-intensity curve (TIC):** ডায়নামিক সিরিজের ROI থেকে।
- **DSA:** mask, shift, split/magic mask, landmark।
- **4D:** সময়ের slider-সহ volume।

## এখনকার অবস্থা

- **SUV:** loader পিক্সেলকে SUVbw-তে বদলায় (`calculate-suv`)। পিক্সেল মানে SUVlbm আর SUVbsa-ও দেখায়। ROI-র পরিসংখ্যান SUV-তে আসে। SUVpeak আর 3D বল নেই।
- **সিরিজ ভাগ:** orientation, মাপ, echo আর b-value আলাদা হলে ভাগ হয়। একই অবস্থানে একাধিক সময় (phase) একই সিরিজেই থাকে।

## নকশার সিদ্ধান্ত

| বিষয় | সমাধান |
|---|---|
| **2D fusion** | Overlay সিরিজটাকে volume হিসেবে লোড করা হয়। Viewport-এর প্রতিটা canvas বিন্দু → world → (registration) → overlay-এর মান (ফেজ ৬-এর trilinear sampling) → colormap আর opacity → নিজের canvas layer। |
| ↳ কেন এভাবে | Zoom, pan, ঘোরানো, flip, oblique আপনা থেকেই মেলে। একই কোড stack গ্রিড আর MPR viewport-এ চলে। আধা রেজোলিউশনে হিসাব করে মসৃণ করে আঁকা হয়। |
| Fusion নিয়ন্ত্রণ | প্রতিটা cell-এর জন্য: কোন সিরিজ, colormap (hot, PET, jet, rainbow, cool, ধূসর), opacity, threshold (নিচে স্বচ্ছ), মানের সীমা (window)। প্যানেল "Fusion"-এ। |
| 3D fusion | 3D view-তে দ্বিতীয় volume (overlay) রঙিন transfer function দিয়ে, প্রথমটার সাথে। Cornerstone-এর একাধিক volume। |
| Registration | Overlay-এর জন্য অনুবাদ (mm) আর তিন অক্ষে ঘোরানো (ডিগ্রি), overlay-এর কেন্দ্র ঘিরে। ভিন্ন frame of reference হলে শুরুতে দুই volume-এর কেন্দ্র মেলানো হয়। Slider আর arrow-বোতাম দিয়ে। স্বয়ংক্রিয় registration পরে (রোডম্যাপ অনুযায়ী ঐচ্ছিক)। |
| **PET/CT লেআউট** | আলাদা মোড "PET/CT": ৩×৩ গ্রিড (সারি: CT, PET, fusion; কলাম: axial, sagittal, coronal), ডানে লম্বা ঘোরানো MIP। Cornerstone-এর orthographic viewport, crosshair একসাথে চলে। Fusion সারিতে আমাদের overlay layer। |
| ঘোরানো MIP | VolumeViewport3D-তে PET, mapper-এ MIP, উল্টো ধূসর রং; play/pause, গতি। |
| SUVpeak, 3D বল | নতুন টুল "Sphere ROI" (CircleROI-এর subclass)। বৃত্তের কেন্দ্র আর ব্যাসার্ধ = গোলক। PET volume থাকলে 3D-তে, না থাকলে ওই slice-এ হিসাব। SUVmax, SUVmean, SUVpeak (১ cm³ গোলকের সর্বোচ্চ গড়, PERCIST), আয়তন। সাধারণ ROI-তেও SUVpeak (slice-ভিত্তিক)। |
| ডায়নামিক সিরিজ | বিশুদ্ধ মডিউল: সিরিজের ছবিকে অবস্থান × সময়ে ভাগ করা হয়। সময় আসে Temporal Position Identifier, Trigger Time, Acquisition Time থেকে; না থাকলে একই অবস্থানের ক্রম। Phase-এর সংখ্যা আর সময় সেখান থেকে। |
| TIC | ডায়নামিক সিরিজের যে কোনো ROI → সব phase-এ একই slice অবস্থানে গড় মান (ছবিগুলো লোড করে)। চার্ট SVG-তে, একাধিক ROI একসাথে। Curve-এর ধরন বিশুদ্ধ ফাংশনে: Ia, Ib, II, III; peak, time-to-peak, wash-in আর wash-out হার। CSV। |
| **DSA** | মাল্টিফ্রেম XA/XRF-এর জন্য "DSA" সিরিজ বানানো (নিজস্ব `dsa:` image loader)। প্রতিটা frame = live − mask × (1 − landmark) + offset। |
| ↳ বিকল্প | mask frame; shift (হাতে x/y, বা নির্বাচিত অংশে স্বয়ংক্রিয়: ±১০ px-এ বিয়োগফলের পার্থক্য সর্বনিম্ন); split mask (frame-পরিসর অনুযায়ী আলাদা mask); magic mask (প্রতিটা frame-এর জন্য প্রথম কয়েকটার মধ্যে সবচেয়ে মেলা mask); landmark। সব বিশুদ্ধ, test-সহ। |
| **4D** | ডায়নামিক সিরিজ (প্রতি phase-এ পূর্ণ volume) MPR/3D-তে খুললে সময়ের slider আর cine। প্রতিটা phase-এর জন্য আলাদা volume, বদলালে সেটা দেখানো হয়, crosshair জায়গায় থাকে। |
| TMTV / MTV | রোডম্যাপ অনুযায়ী ফেজ ৯-এ (segmentation দরকার) |

## টাস্ক

### ৭.১ Fusion
- [x] Overlay layer (2D গ্রিড আর MPR), colormap, opacity, threshold, window
- [x] Fusion প্যানেল: সিরিজ বাছাই (একই রোগী), cell অনুযায়ী
- [x] PET-CT, PET-MR/SPECT-CT, MR (DWI/ADC) — একই কোড; নমুনায় যাচাই
- [x] 3D fusion
- [x] হাতে registration (সরানো/ঘোরানো), রিসেট

### ৭.২ PET
- [x] PET/CT লেআউট (৩×৩ + MIP)
- [x] ঘোরানো MIP
- [x] SUV হিসাবের test (decay, lbm, bsa)
- [x] Sphere ROI: SUVmax/mean/peak, আয়তন; ROI-তে SUVpeak

### ৭.৩ TIC
- [x] ডায়নামিক সিরিজ চেনা, phase আর সময়
- [x] ROI-র curve, একাধিক ROI, চার্ট
- [x] Curve-এর ধরন আর মান; CSV

### ৭.৪ DSA
- [x] DSA সিরিজ, mask frame
- [x] হাতে আর স্বয়ংক্রিয় pixel shift
- [x] Split mask, magic mask
- [x] Landmark

### ৭.৫ 4D
- [x] Phase অনুযায়ী volume, সময়ের slider, cine (MPR ও 3D)

### ৭.৬ পরীক্ষা ও সমাপ্তি
- [x] নমুনা:
  - fusion: একই FoR-এ CT + PET (সরানো FoR-এর PET নমুনা বানানো হয়নি, নিচে দেখুন)
  - ডায়নামিক MR: ৬ phase, তিন ধরনের curve
  - XA: mask, contrast, নড়াচড়া
  - 4D CT
- [x] Unit: overlay mapping, registration, phase-এ ভাগ, TIC-এর ধরন, DSA গণিত (বিয়োগ, shift খোঁজা, magic mask), SUVpeak
- [x] E2E: প্রতিটা বৈশিষ্ট্য, মোবাইল
- [x] dev + prod; বাজেট; README, এই ফাইল, রোডম্যাপ
- [x] Commit শুধু ব্যবহারকারী বললে

## ঝুঁকি

| ঝুঁকি | প্রতিকার |
|---|---|
| Overlay হিসাব ধীর (বড় canvas) | আধা রেজোলিউশন, ক্যামেরা বদলালে frame-এ একবার; overlay volume সাধারণত ছোট (PET) |
| PET/CT লেআউটে অনেক WebGL viewport | একটাই rendering engine; CI-তে ছোট নমুনা |
| ডায়নামিক সিরিজের ভিন্ন ভিন্ন tag | কয়েকটা উৎস থেকে সময়, না পেলে ক্রম |
| DSA-তে বড় frame | mask আর frame একবার পড়া, shift-এর খোঁজ ছোট অংশে |

## বাস্তবায়নের নোট

**গঠন (`src/functional/`):**
- বিশুদ্ধ, test-সহ: `fusion.ts` (colormap, registration, overlay পিক্সেল), `phases.ts` (phase-এ ভাগ), `tic.ts` (curve-এর ধরন, CSV), `dsa.ts` (বিয়োগ, shift খোঁজা, magic/split mask), `suvStats.ts` (গোলকে SUVmax/mean/peak, slice-এ disc peak)।
- App-এর সাথে যুক্ত: `fusionStore.ts` (cell বা "mpr" অনুযায়ী fusion), `petct.ts` আর `petctViews.ts` (PET/CT লেআউট), `series.ts` (phase-এর সিরিজ), `dsaSeries.ts`, `sphereVolume.ts`।
- UI: `FusionLayer.tsx`, `FusionPanel.tsx`, `PetCtRows.tsx`, `TicPanel.tsx`, `DsaPanel.tsx`, `PhaseControls.tsx`। টুলবারে "Functional ▾" মেনু; Measure মেনুতে "Sphere ROI"।

**Fusion:**
- Overlay আমাদের নিজের canvas layer; প্রতিটা বিন্দু canvas → world → registration → overlay volume (trilinear)। আধা রেজোলিউশনে।
- একই frame of reference হলে registration শূন্য; না হলে দুই কেন্দ্র মেলানো হয়।
- 3D-তে overlay আলাদা volume actor (`userMatrix`-এ registration), রঙিন TF।
- PET/CT লেআউটে fused সারির viewport FusionLayer-এর পরে তৈরি হয় (parent-এর effect পরে চলে)। তাই layer viewport না পেলে ২০০ ms পরে আবার খোঁজে।

**PET:**
- Sphere ROI = CircleROI-এর subclass। PET volume cache-এ থাকলে 3D গোলকে হিসাব, না থাকলে ওই slice-এ (লেখায় "3D" বা "this slice")।
- PT ROI-তে SUVpeak: ১ cm³ গোলকের ব্যাসার্ধের disc, ROI-র প্রতিটা pixel কেন্দ্র ধরে সর্বোচ্চ গড়।

**TIC:**
- ছবি লোড হলেই measurement version বাড়ে। তাই curve আবার হিসাব হয় শুধু ROI-র জ্যামিতি বা label বদলালে (key)। আগে এতে অসীম লুপ হয়ে প্যানেল আটকে যেত।

**DSA:**
- পরিকল্পনায় নিজস্ব `dsa:` image loader ছিল। তার বদলে বিয়োগফল ফেজ ৬-এর reformat-DICOM লেখক দিয়ে নতুন DICOM সিরিজ বানিয়ে স্টাডিতে যোগ হয়। ফলে সাইডবার, export, cine সব আপনা থেকে কাজ করে।
- Window শূন্যকে কেন্দ্র করে। প্যানেলে বর্তমান frame-এর preview।
- স্বয়ংক্রিয় shift ছবির মাঝের সর্বোচ্চ ১২৮×১২৮ px অংশে, ±১০ px।

**4D:**
- ডায়নামিক সিরিজে MPR/3D খুললে প্রথম phase-এর volume খোলে, `volumeView.phases`-এ সব phase। Slider আর cine (৭০০ ms/phase) টুলবারে।
- Phase বদলালে slab, preset আর টুল একই থাকে।

**বাজেট:** মোট JS ১৯০৭.৮ KB, তাই মোট বাজেট ১৯০০ থেকে ১৯৫০ KB করা হয়েছে (বেশিরভাগ নতুন কোড lazy প্যানেলে)। Initial ১০৪.১ KB, runtime chunk ৯৯৬.৮ KB।

**ফল:**
- Unit test ১৪৪টা পাস।
- E2E dev আর prod: ১০৩টা পাস + ১টা skip (আগের password ZIP)। নতুন `e2e/functional.spec.ts`-এ ৭টা টেস্ট, একটা মোবাইলের।
- `npm run lint` পরিষ্কার।

**যা পরীক্ষা করা হয়নি বা সীমিত:**
- ভিন্ন frame of reference (কেন্দ্র মেলানো) — নমুনা নেই, E2E-তে যাচাই হয়নি।
- PET-MR, SPECT-CT, DWI/ADC fusion একই কোডে চলে, কিন্তু আলাদা নমুনায় পরীক্ষা হয়নি।
- 3D fusion আর 3D-তে 4D-র phase বদল E2E-তে নেই (MPR-এ আছে)।
- ঘোরানো MIP দেখা যায়; ঘুরছে কিনা E2E যাচাই করে না।
- Sphere ROI-র E2E ২D পথে চলে (volume লোড ছিল না); 3D হিসাব unit test-এ যাচাই।
- Split mask-এ নতুন mask হয় সেই frame-ই, যেখান থেকে পরিসর শুরু। পরিসরের জন্য অন্য কোনো frame-কে mask হিসেবে বাছার UI নেই।
- বাংলা অনুবাদ ফেজ ১০-এ।
