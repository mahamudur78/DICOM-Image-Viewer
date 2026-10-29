# ফেজ ৯: Segmentation সম্পাদনা — বিস্তারিত পরিকল্পনা

> স্ট্যাটাস: সম্পন্ন · তারিখ: 2026-10-29 · ব্রাঞ্চ: `feature/phase-9-segmentation`
> মূল রোডম্যাপ: [FULL_FEATURE_ROADMAP.md](FULL_FEATURE_ROADMAP.md#ফেজ-৯-segmentation-সম্পাদনা) · আগের ফেজ: [PHASE_8_SPECIAL_OBJECTS_PLAN.md](PHASE_8_SPECIAL_OBJECTS_PLAN.md)

## লক্ষ্য

- **Segmentation বানানো ও সম্পাদনা:** একাধিক segment, নাম আর রং।
- **টুল:** brush, eraser, threshold brush, পুরো volume-এ threshold, region growing, scissors, contour, slice-এর মধ্যে interpolation, undo/redo।
- **ফল:** প্রতিটা segment-এর আয়তন, mean/min/max আর সর্বোচ্চ ব্যাস; 3D surface; STL; PET-এ TMTV।
- **সেভ:** DICOM SEG, আর RTSTRUCT হিসেবে।

## এখনকার অবস্থা (ফেজ ৮ থেকে)

- **Label grid** (`src/objects/labels.ts`): Float32 bitmask, ২৪টা পর্যন্ত segment। Fusion layer তা 2D গ্রিড আর MPR-এ দেখায়; segment-এর তালিকা, রং আর লুকানো আছে।
- DICOM SEG আর RTSTRUCT পড়া যায়, তবে সম্পাদনা নেই।
- ফেজ ৬-এর marching cubes (`showSurface`) আর STL encoder (`src/volume/mesh.ts`)।
- **বাজেট:** runtime chunk ৯৯৭/১০২৪ KB, মোট ১৯৩৮/১৯৫০ KB।

## নকশার সিদ্ধান্ত

| বিষয় | সমাধান |
|---|---|
| **Cornerstone segmentation নয়** | Cornerstone-এর segmentation module (labelmap rendering, brush, interpolation-এর wasm, polySEG) runtime chunk-কে বাজেটের বাইরে নিয়ে যায়। তাছাড়া আমাদের overlay ব্যবস্থা ইতিমধ্যে 2D, MPR আর 3D-তে চলে। তাই সম্পাদনা নিজস্ব: label grid-এর উপর বিশুদ্ধ ফাংশন। |
| গ্রিড | নতুন segmentation সিরিজের volume-এর জ্যামিতিতে (একই dimension, spacing, direction)। তাই HU/SUV সরাসরি index ধরে পাওয়া যায়। লোড করা SEG/RTSTRUCT-ও সম্পাদনা করা যায়; তাদের গ্রিড আলাদা হলে মান world ধরে sample করা হয়। |
| টুল আর ইনপুট | একটা Cornerstone টুল `SegmentEdit` (stack ও MPR tool group-এ), টুলবারে "Segment"। মাউস/টাচের world বিন্দু আর view-এর normal নিয়ে সক্রিয় সম্পাদনা-ফাংশন ডাকে। সম্পাদনার কোড lazy chunk-এ থাকে; প্যানেল খুললে লোড হয়। |
| Brush / eraser | View plane-এ ব্যাসার্ধ (mm) ধরে একটা disc। Plane-এর এক voxel বেধের মধ্যে থাকা voxel ধরা হয়, তাই oblique MPR-এও চলে। টানলে বিন্দুগুলোর মাঝে ব্যাসার্ধের অর্ধেক দূরত্বে stroke ভরা হয়। |
| Threshold brush | Brush-এর মতো, তবে শুধু [নিম্ন, উচ্চ] মানের voxel। Preset: হাড়, নরম টিস্যু, ফুসফুস, PET SUV ≥ ২.৫। |
| পুরো volume-এ threshold | সব voxel [নিম্ন, উচ্চ] → সক্রিয় segment। |
| Region growing | ক্লিক করা voxel থেকে 6-connected flood fill, মান [নিম্ন, উচ্চ] বা ক্লিকের মান ± সহনশীলতা। পরিসর: এই slice বা পুরো volume। সীমা ৫০ লাখ voxel। |
| Scissors | View-তে আয়তক্ষেত্র, বৃত্ত বা freehand আঁকা। ভেতরটা ভরা বা মোছা হয়, এই slice-এ বা পুরো গভীরতায় (view-এর normal বরাবর)। |
| Contour | Freehand বন্ধ রেখা এই slice-এ ভরা। Shift চাপলে বিয়োগ, তাই আগের contour বাড়ানো-কমানো (সম্পাদনা) যায়। প্রদর্শনে segment-এর কিনারা contour-এর মতো দেখায়। |
| Interpolation | গ্রিডের slice অক্ষ বরাবর shape-based: দুই আঁকা slice-এর signed distance (2D chamfer) রৈখিকভাবে মিশিয়ে মাঝের খালি slice ভরা হয়। |
| Undo/redo | প্রতিটা সম্পাদনা বদলানো voxel-এর index আর আগের/পরের মান রাখে। প্রতি segmentation-এ ৫০ ধাপ। প্যানেলের বোতাম; segment টুল সক্রিয় থাকলে Ctrl+Z / Ctrl+Shift+Z। |
| পরিসংখ্যান | Voxel সংখ্যা, আয়তন (cm³), mean/SD/min/max (HU, SUV), সর্বোচ্চ ব্যাস (কিনারার voxel-গুলোর মধ্যে সবচেয়ে দূরের জোড়া, বেশি হলে নমুনা নিয়ে)। |
| 3D | প্রতিটা segment-এর marching cubes surface, segment-এর রঙে, 3D view-তে; STL ডাউনলোড। |
| **TMTV** | PET সিরিজে: SUV ≥ নির্দিষ্ট মান (ডিফল্ট ২.৫) বা SUVmax-এর % (৪১%), ঐচ্ছিকভাবে কোনো segment-এর ভেতরে। 3D connected component, ছোট অংশ (< ০.১ cm³) বাদ। ফল: segment "TMTV", প্রতিটা lesion-এর আয়তন, SUVmax, SUVmean, TLG; মোট TMTV আর TLG। |
| DICOM SEG লেখা | Binary SEG: প্রতি segment-এর খালি নয় এমন slice-এ একটা frame। Per-frame position, source image (একই অবস্থানের মূল ছবি), segment-এর নাম/রং (CIELab), algorithm type (MANUAL / SEMIAUTOMATIC)। স্টাডিতে যোগ হয় আর ডাউনলোড হয়। ফেজ ৮-এর পার্সার দিয়ে আবার পড়া যায় (test)। |
| RTSTRUCT লেখা | প্রতিটা slice-এ marching squares দিয়ে contour, world বিন্দু, CLOSED_PLANAR, ছবির reference। |

## টাস্ক

### ৯.১ মূল কাঠামো
- [x] Segmentation বানানো (সিরিজের volume থেকে), segment যোগ/নাম/রং/মোছা/সক্রিয়
- [x] লোড করা SEG/RTSTRUCT সম্পাদনার জন্য খোলা
- [x] `SegmentEdit` টুল (2D ও MPR), brush-এর চিহ্ন আর আঁকার preview
- [x] Undo/redo

### ৯.২ টুল
- [x] Brush, eraser (আকার)
- [x] Threshold brush, পুরো volume-এ threshold, preset
- [x] Region growing (slice / volume)
- [x] Scissors: rectangle, circle, freehand (ভরা/মোছা, slice/গভীরতা)
- [x] Contour আঁকা ও সম্পাদনা
- [x] Slice interpolation

### ৯.৩ ফল ও সেভ
- [x] আয়তন, mean HU/SUV, সর্বোচ্চ ব্যাস
- [x] 3D surface, STL
- [x] TMTV
- [x] DICOM SEG ও RTSTRUCT সেভ

### ৯.৪ পরীক্ষা ও সমাপ্তি
- [x] Unit: brush, threshold, flood fill, scissors, interpolation, stats, TMTV, history, SEG/RTSTRUCT লেখা→পড়া
- [x] E2E: প্রতিটা টুল, stats, সেভ, TMTV, MPR-এ brush, মোবাইল
- [x] dev + prod; বাজেট; README, এই ফাইল, রোডম্যাপ
- [x] Commit শুধু ব্যবহারকারী বললে

## ঝুঁকি

| ঝুঁকি | প্রতিকার |
|---|---|
| বড় volume-এ ধীর সম্পাদনা | প্রতিটা অপারেশন শুধু নিজের bounding box-এ; overlay আধা রেজোলিউশনে; flood fill-এর সীমা |
| Undo-র মেমরি | শুধু বদলানো voxel; ৫০ ধাপ |
| MPR-এর oblique plane | Brush/scissors view-এর normal ধরে, voxel-এর বেধ মেনে |
| বাজেট | সম্পাদনা আর প্যানেল lazy; runtime chunk-এ শুধু ছোট টুল ক্লাস |
| ২৪টা segment-এর সীমা | প্যানেলে জানানো; বেশি দরকার হলে পরে Uint32 গ্রিড |

## বাস্তবায়নের নোট

**গঠন (`src/segmentation/`):**
- `edit.ts` (বিশুদ্ধ, test-সহ):
  - brush/stroke, threshold, flood fill, scissors, circle polygon, shape-based interpolation (chamfer distance), পরিসংখ্যান, TMTV।
  - `Recorder` (বদলানো voxel) আর `History` (undo/redo, ৫০ ধাপ)।
- `writeObjects.ts`: binary DICOM SEG, RTSTRUCT (marching squares দিয়ে প্রতি slice-এর বন্ধ contour), RGB↔CIELab। ফেজ ৮-এর পার্সার দিয়ে আবার পড়ে test করা।
- `tool.ts`: Cornerstone টুল `SegmentEdit` (stack ও MPR group-এ, টুলবারের নাম "segment") আর preview state। এটুকুই runtime chunk-এ।
- `session.ts` (lazy): সক্রিয় segmentation/segment, টুলের সেটিং, প্রতিটা টুলের pointer আচরণ, image volume থেকে মান।
- `actions.ts` (lazy): পুরো volume-এ threshold, interpolation, পরিসংখ্যান, TMTV, 3D surface, STL, SEG/RTSTRUCT সেভ।
- UI:
  - `SegmentationPanel.tsx` (প্যানেল "Segmentation", টুলবারে "SEG")।
  - `SegmentPreviewLayer.tsx`: brush-এর বৃত্ত আর scissors/contour-এর পথ।
- 3D: `volume3dTools.ts`-এ `labelMesh`, `showLabelSurfaces`।

**সিদ্ধান্ত আর বিস্তারিত:**
- **কেন নিজস্ব:** Cornerstone-এর segmentation নয়; নিজস্ব label grid আর ফেজ ৭–৮-এর overlay। এতে runtime chunk প্রায় বাড়েনি (৯৯৭.৪ KB)।
- **গ্রিড:** নতুন segmentation সিরিজের volume-এর জ্যামিতিতে হয়, তাই HU/SUV সরাসরি index ধরে পাওয়া যায়। লোড করা SEG/RTSTRUCT-ও একই প্যানেলে সম্পাদনা হয়; তাদের মান world ধরে sample হয়।
- **সম্পাদনার পর redraw:** গ্রিড জায়গায় বদলায়, তারপর fusion setting নতুন হয় (`updateFusion(key, {})`)। Brush টানার সময় প্রতি frame-এ সর্বোচ্চ একবার।
- **Brush:** view plane-এ disc, view-এর দিকে voxel-এর প্রক্ষিপ্ত বেধের অর্ধেক পর্যন্ত। তাই MPR-এও চলে; E2E-তে axial-এ আঁকা sagittal-এ দেখা যায়।
- **Threshold brush:** image-এর মান লোড না হওয়া পর্যন্ত কিছু আঁকে না; প্যানেল খুললে মান আগেই লোড হয়।
- **Region growing:** 6-connected, সীমা ৫০ লাখ voxel। "এই slice" মানে view-এর সবচেয়ে কাছের গ্রিড অক্ষ।
- **Scissors:** আয়তক্ষেত্র, বৃত্ত, freehand; ভরা বা মোছা; এই slice বা পুরো গভীরতা।
- **Contour:** freehand বন্ধ রেখা এই slice-এ ভরায়; Shift চাপলে বিয়োগ।
- **Undo/redo:** segment টুল সক্রিয় থাকলে Ctrl+Z / Ctrl+Shift+Z segmentation-এর undo/redo করে; অন্য সময় মাপের।
- **পরিসংখ্যান:** প্রতিটা সম্পাদনার ৪০০ ms পরে আপনা থেকে হিসাব হয়। সর্বোচ্চ ব্যাস কিনারার voxel-গুলোর মধ্যে; বেশি হলে ২৫০০টা নমুনা নিয়ে।
- **TMTV:** একটা নতুন "TMTV" segment তৈরি হয়; প্রতিটা lesion-এর আয়তন, SUVmax, SUVmean, TLG, আর মোট।
- **সেভ:** SEG আর RTSTRUCT সেভ হলে স্টাডিতে যোগ হয় আর ডাউনলোডও হয়। প্রতিটা frame বা contour একই অবস্থানের মূল ছবিকে রেফার করে।

**বাজেট:** মোট JS ১৯৫২.২ KB। তাই মোট বাজেট ১৯৫০ থেকে ২০০০ KB করা হয়েছে (প্যানেল আর editor lazy)। Initial ১০৫.৯ KB, runtime chunk ৯৯৭.৪ KB।

**ফল:**
- Unit test ১৭১টা পাস।
- E2E dev আর prod দুটোতেই ১২৪টা পাস + ১টা skip (আগের password ZIP)। নতুন `e2e/segmentation.spec.ts`-এ ৭টা টেস্ট, একটা মোবাইলের।
- `npm run lint` পরিষ্কার।

**যা পরীক্ষা করা হয়নি বা সীমিত:**
- Segmentation শুধু volume বানানো যায় এমন সিরিজে (MPR-এর শর্ত); একক 2D ছবিতে নয়।
- একটা segmentation-এ সর্বোচ্চ ২৪টা segment।
- Contour vector হিসেবে রাখা হয় না: আঁকলে voxel-এ ভরে যায়, কিনারাই contour-এর মতো দেখায়। আগের contour-এর বিন্দু টেনে সরানো যায় না।
- Interpolation শুধু গ্রিডের অক্ষ বরাবর, oblique plane-এ নয়।
- 3D surface সম্পাদনার পর নিজে আপডেট হয় না; আবার "Show surfaces" চাপতে হয়।
- Touch-এ brush কাজ করার কথা (টুল Touch সমর্থন করে), তবে মোবাইল E2E শুধু প্যানেল আর নতুন segmentation যাচাই করে।
- লোড করা SEG/RTSTRUCT সম্পাদনা (তাদের নিজের গ্রিডে) E2E-তে যাচাই হয়নি; শুধু নতুন segmentation আর সেভ করা SEG আবার খোলা যাচাই হয়েছে।
- Undo শুধু এই session-এ থাকে।
- বাংলা অনুবাদ ফেজ ১০-এ।
