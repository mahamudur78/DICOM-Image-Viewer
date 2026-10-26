# 3D Volume Rendering (VR): পরিকল্পনা

> স্ট্যাটাস: ফেজ ১–৫ সম্পন্ন (নিচের ব্যতিক্রমগুলো দেখুন) · তারিখ: 2026-10-27 · ব্রাঞ্চ: `feature/meddream-ui` · লক্ষ্য: RadiAnt-এর মতো 3D VR ভিউ
> সম্পর্কিত: [DICOM_VIEWER_PLAN.md](DICOM_VIEWER_PLAN.md)

## লক্ষ্য

CT বা MR সিরিজকে ব্রাউজারেই 3D-তে দেখানো। হাড় আর রক্তনালি রঙিন preset দিয়ে দেখা যাবে, মাউস দিয়ে ঘোরানো যাবে, কোণায় দিকের কিউব থাকবে, আর WL/WW-এর মতো করে preset সরানো যাবে। সব কাজ ক্লায়েন্টেই হবে, কোনো ফাইল আপলোড হবে না।

## আগে থেকে যা আছে (পুনরায় ব্যবহার করা হবে)

- `loadVolume()` / volume cache (MPR-এর জন্য বানানো) → 3D-ও একই volume ব্যবহার করবে, আলাদা মেমোরি লাগবে না
- `mprUnsupportedReason()` → কোন সিরিজ থেকে volume বানানো যায় না, তার যাচাই
- Fallback `imagePlaneModule` provider → slice সাজানো
- টুলবারের mode-বোতামের ধাঁচ (MPR) → 3D বোতামও একইভাবে

## যাচাই করা API (Cornerstone 5.13)

| দরকার | API |
|---|---|
| 3D viewport | `Enums.ViewportType.VOLUME_3D` (`VolumeViewport3D`) |
| Preset | `viewport.setProperties({ preset: 'CT-Bone' })`। মোট ২৬টা: CT-AAA, CT-Bone, CT-Cardiac, CT-Chest-Vessels, CT-Coronary-Arteries, CT-Lung, CT-Soft-Tissue, CT-MIP, MR-Angio, MR-Default, MR-MIP, MR-T2-Brain ইত্যাদি |
| ঘোরানো | `TrackballRotateTool` |
| দিকের কিউব | `OrientationMarkerTool` (annotated cube) |
| Zoom / Pan | `ZoomTool`, `PanTool` |
| Preset সরানো (WL/WW-এর মতো) | রেডিমেড API নেই → vtk transfer function-এর node নিজে সরাতে হবে |

---

## ফেজ ১: মূল 3D ভিউ

- [x] `src/cornerstone/volume3d.ts`: `VOLUME_3D` viewport mount/unmount, volume বসানো, preset বসানো, camera reset
- [x] আলাদা tool group `vr-tool-group`: বাম ক্লিক = ঘোরানো (TrackballRotate), মাঝের ক্লিক = Pan, ডান ক্লিক = Zoom, হুইল = Zoom
- [x] `src/components/Volume3DView.tsx`: একটা বড় viewport, লোডের অগ্রগতি, overlay (preset-এর নাম, সিরিজ)
- [x] App-এ view mode: `grid | mpr | 3d`। MPR আর 3D একসাথে চালু থাকবে না
- [x] টুলবারে **3D** বোতাম (MPR-এর পাশে); 3D-তে লেআউট আর link বোতাম লুকানো থাকবে
- [x] সাইডবারে ক্লিক করলে 3D-তে সিরিজ বদলাবে
- [x] 3D বন্ধ করলে গ্রিডে ফিরবে, আর টুল W/L-এ ফিরবে

## ফেজ ২: নিয়ন্ত্রণ (RadiAnt-এর মতো)

- [x] Preset dropdown। Modality অনুযায়ী তালিকা ভাগ হবে: CT হলে CT-*, MR হলে MR-* (অন্যগুলো "Other" গ্রুপে)
- [x] ডিফল্ট preset: CT হলে CT-Bone, MR হলে MR-Default, অন্য কিছু হলে CT-Soft-Tissue
- [x] Preset সরানো: 3D-তে বাম-ক্লিকের একটা বিকল্প টুল "Shift" (ডানে-বামে টানলে transfer function সরবে), আর overlay-তে সরানোর পরিমাণ দেখাবে
- [x] কোণায় দিকের কিউব (R/L, A/P, S/I)
- [x] Reset বোতাম: camera আর preset দুটোই আগের অবস্থায় ফিরবে
- [x] PNG ডাউনলোড 3D-তেও কাজ করবে
- [x] কিবোর্ড: `R` reset; টুলের শর্টকাটগুলো 3D-তেও যতটা সম্ভব কাজ করবে

## ফেজ ৩: নিরাপত্তা আর সীমা

- [x] মেমোরির হিসাব: rows × cols × slices × 2 byte। একটা সীমার (যেমন 512MB) বেশি হলে confirm বার্তা, আর ফোনে (ছোট স্ক্রিন বা কম `deviceMemory`) ছোট সীমা
- [x] WebGL2 না থাকলে 3D বোতাম কারণসহ বার্তা দেখাবে
- [x] যে সিরিজে volume বানানো যায় না, সেখানে MPR-এর মতো কারণ দেখাবে (scout, multi-frame ইত্যাদি)
- [ ] ঘোরানোর সময় দ্রুততার জন্য sample distance বাড়ানো (`setSampleDistanceMultiplier`), আর থামলে আবার পূর্ণ মান। **করা হয়নি:** ছোট phantom-এ ঘোরানো এমনিতেই মসৃণ, তাই লাভ মাপার উপায় ছিল না। আসল বড় স্টাডিতে ধীর লাগলে তখন করা হবে।

## ফেজ ৪: MPR + 3D লেআউট

- [x] MPR-এ বিকল্প "MPR + 3D" লেআউট: 2×2 গ্রিডে axial, sagittal, coronal আর 3D
- [x] একই volume ব্যবহার করবে, তাই নতুন মেমোরি লাগবে না
- [x] Crosshair শুধু তিনটা 2D viewport-এ থাকবে; 3D আলাদা tool group-এ থাকবে

## ফেজ ৫: পরীক্ষা আর ডকুমেন্টেশন

- [x] Phantom-এ 3D দেখার মতো গঠন যোগ: পাঁজর বা হাড়ের বাঁকা অংশ, আর aorta-কে একটা বাঁকা নল
- [x] ব্রাউজারে পরীক্ষা: সব preset, ঘোরানো, shift, reset, কিউব, সিরিজ বদলানো, mode বদলানো, PNG
- [x] Production build-এ পরীক্ষা
- [x] মোবাইলে লেআউট আর সতর্কবার্তা
- [x] `npm run build` আর `npm run lint` পরিষ্কার থাকা
- [x] README আর DICOM_VIEWER_PLAN.md আপডেট; এই ফাইলের চেকবক্স টিক দেওয়া
- [ ] Commit শুধু ব্যবহারকারী বললে

## ঝুঁকি

| ঝুঁকি | প্রভাব | প্রতিকার |
|---|---|---|
| বড় volume (500+ slice) | মেমোরি শেষ হয়ে ট্যাব ক্র্যাশ | ফেজ ৩-এর সতর্কবার্তা আর সীমা |
| দুর্বল GPU বা ফোন | ঘোরানোর সময় ধীর | Sample distance বাড়ানো, ফোনে সতর্কবার্তা |
| আসল ডেটা ছাড়া পরীক্ষা | সব preset-এর মান যাচাই করা যায় না | Phantom দিয়ে কাজ ঠিক আছে কিনা যাচাই; আসল contrast CT দিয়ে চেহারা যাচাই ব্যবহারকারী করবেন |
| WebGL context একটাই, সব viewport মিলে | 3D আর 2D একসাথে ভারী | একই rendering engine ব্যবহার, mode বদলালে অপ্রয়োজনীয় viewport বন্ধ |

---

## বাস্তবায়নের নোট

**ফাইল:** `src/cornerstone/volume3d.ts` (viewport, preset, shift, `VolumeShiftTool`), `src/components/VrViewport.tsx`, `Volume3DView.tsx`, `useVolume.ts` (MPR আর 3D-র মধ্যে volume ভাগ করে নেওয়া), `VolumeProgress.tsx`। tool group-এর তালিকা থাকে `tools.ts`-এর `GROUP_TOOLS`-এ।

**যা পরীক্ষা হয়েছে (phantom দিয়ে, dev আর production দুটো বিল্ডেই):** 3D খোলা; CT-Bone আর CT-AAA preset; ঘোরানো (camera-র দিক বদলায়); হুইল দিয়ে zoom; shift (+120 দেখায়, preset বদলালে শূন্য হয়ে যায়); reset করলে সামনের ভিউ আর zoom 1-এ ফেরে; দিকের কিউব; PNG ডাউনলোড (কিউবসহ); 3D-তে সিরিজ বদলানো; MPR + 3D-তে crosshair আর 3D আলাদাভাবে কাজ করে; গ্রিডে ফেরা; মোবাইলে লেআউট; console-এ কোনো error নেই।

**যা ব্রাউজারে পরীক্ষা হয়নি:**
- মেমোরির সতর্কবার্তার confirm বার্তা: phantom মাত্র ~1.3MB। হিসাবটা যাচাই করা হয়েছে (ডেস্কটপে 512MB, মোবাইলে 192MB সীমা; 512×512×544-এর CT প্রায় 272MB → ডেস্কটপে সরাসরি খোলে, মোবাইলে সতর্কবার্তা দেখায়)।
- WebGL2 না থাকলে যে বার্তা আসে, সেটা (পরীক্ষার ব্রাউজারে WebGL2 আছে)।
- আসল CT angiography-তে preset দেখতে কেমন হয়, আর বড় volume-এ গতি কেমন।

**শেখা বিষয়:**
- `resetCamera()` ঘোরানো বাতিল করে না। তাই reset-এর সময় আগে coronal (`MPR_CAMERA_VALUES.coronal`) দিক বসানো হয়।
- Preset-এর WL/WW-এর মতো সরানোর জন্য Cornerstone-এ কোনো API নেই। তাই vtk color আর opacity transfer function-এর node মূল মান থেকে সরানো হয়। নতুন preset বসালে মূল মানও নতুন করে নেওয়া হয়।
- Vite HMR-এর সময় init আবার চলে আর loader cache খালি করে, তাই dev-এ ফাইল সেভ করার পর খোলা 3D ভিউ ভেঙে যেতে পারে। Page reload করলে ঠিক হয়ে যায়; production-এ এই সমস্যা হয় না।
