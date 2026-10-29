# ফেজ ৪: তুলনা ও sync — বিস্তারিত পরিকল্পনা

> স্ট্যাটাস: সম্পন্ন (commit-এর অপেক্ষায়) · তারিখ: 2026-10-29 · ব্রাঞ্চ: `feature/phase-4-comparison-sync`
> মূল রোডম্যাপ: [FULL_FEATURE_ROADMAP.md](FULL_FEATURE_ROADMAP.md#ফেজ-৪-তুলনা-ও-sync) · আগের ফেজ: [PHASE_3_MEASUREMENTS_PLAN.md](PHASE_3_MEASUREMENTS_PLAN.md)

## লক্ষ্য

একাধিক সিরিজ আর স্টাডি পাশাপাশি রেখে তুলনা করা:
- কী কী মিলিয়ে চলবে (slice, W/L, zoom/pan, cine), আর কোন viewport-গুলো মিলবে, ব্যবহারকারী বাছবে
- আগের স্টাডির (prior) সাথে তুলনা
- 3D cursor
- নিজের বানানো reference line
- Hanging protocol
- Viewport-এর অবস্থা মনে রাখা
- আলাদা ব্রাউজার উইন্ডো

## এখনকার অবস্থা

- **Slice sync:** Cornerstone-এর `ImageSliceSynchronizer` দিয়ে। শুধু একই frame of reference আর একই plane-এ চলে। উৎস active viewport।
- **W/L sync:** `VOISynchronizer` দিয়ে।
- **Reference line:** `ReferenceLinesTool`। উৎস একটাই (active viewport), আর রেখা একটা।
- **Hanging:** localizer আগে, তারপর বাকি সিরিজ ক্রমে। কোনো নিয়ম নেই।
- **ফাইল খোলা:** নতুন ফাইল খুললে আগের স্টাডি সরে যায়, তাই prior পাশে রাখা যায় না।
- **মনে রাখা:** শুধু slice মনে থাকে (viewport + সিরিজ অনুযায়ী)।

## নকশার সিদ্ধান্ত

| বিষয় | সমাধান |
|---|---|
| Sync-এর ধরন | link বোতাম: slice, W/L, zoom/pan (নতুন), cine (নতুন)। প্রতিটা আলাদা, মনে থাকে। |
| Viewport group | প্রতিটা cell-এর কোণে "link" টগল। শুধু linked cell-গুলো sync হয়, শুরুতে সবাই linked। |
| ভিন্ন frame of reference | নিজের **position sync**: উৎসের slice-এর অবস্থান (normal বরাবর) + offset → লক্ষ্যের সবচেয়ে কাছের slice। "Lock" করলে এখনকার অবস্থানের পার্থক্যই offset হয়, তারপর একসাথে চলে। একই FoR-এ offset শূন্য। Cornerstone-এর `ImageSliceSynchronizer` বাদ যাবে (ভিন্ন FoR পারে না)। |
| Cine sync | উৎসের frame-এর অনুপাতে লক্ষ্যের frame (index ÷ মোট)। play/pause-ও সবার জন্য। |
| Zoom/pan sync | Cornerstone-এর `createPresentationViewSynchronizer`; zoom আর pan আপেক্ষিক, তাই ভিন্ন আকারের ছবিতেও চলে। |
| Prior | **"ফাইল যোগ করুন"** (আগেরটা না সরিয়ে)। রোগীর স্টাডি তারিখ অনুযায়ী (আছে)। "Compare with prior" কমান্ড: ১×২ লেআউট, ডানে active সিরিজ, বাঁয়ে আগের স্টাডির সবচেয়ে মেলা সিরিজ (modality + বর্ণনা + plane), তারপর slice sync lock। |
| 3D cursor | Shift+ক্লিক (বা টুল): world বিন্দু → অন্য সব 2D viewport সেই বিন্দুর সবচেয়ে কাছের slice-এ যায়, বিন্দুতে "+" চিহ্ন দেখায়। MPR-এ crosshair-এর কেন্দ্র সেখানে সরে। "MPR + 3D"-তে 3D ছবিতে ছোট গোলক দেখায়। |
| Reference line | নিজের SVG layer, `ReferenceLinesTool` বাদ। প্রতিটা viewport-এ অন্য viewport-গুলোর plane যেখানে কাটে সেখানে রেখা। রং viewport অনুযায়ী। active viewport-এর সিরিজের প্রথম ও শেষ slice-এর রেখা dashed। সেটিং: শুধু active / সব / বন্ধ। গণিত (plane × image rectangle) বিশুদ্ধ, unit test-সহ। |
| Hanging protocol | নিয়ম = {নাম, modality, শরীরের অংশ, বর্ণনার শব্দ, prior লাগবে কিনা} → {লেআউট, প্রতিটা cell-এ কোন সিরিজ (বর্ণনা/plane/prior মিলিয়ে)}। নিয়ম মিললে ফাইল খোলার সময় নিজে বসে। বিল্ট-ইন নিয়ম আছে; "এই লেআউট নিয়ম হিসেবে সেভ" করা যায়। settings-এ থাকে, ডায়ালগে তালিকা/মুছা/প্রয়োগ। |
| Viewport-এর অবস্থা | সিরিজ অনুযায়ী মনে রাখা: view presentation (zoom, pan, rotation, flip), W/L, invert, colormap, slice। সিরিজ বদলে ফেরত এলে (যে কোনো cell-এ) ফিরে আসে। Reset করলে মুছে যায়। |
| আলাদা উইন্ডো | "Open in new window": `window.open(?secondary=<id>)`। নতুন উইন্ডো `BroadcastChannel`-এ ফাইল চায়, মূল উইন্ডো File object পাঠায় (structured clone)। Slice (position) আর W/L sync একই channel-এ, linked থাকলে। |

## টাস্ক

### ৪.১ Sync-এর ধরন ও group
- [x] নিজের position sync (একই/ভিন্ন FoR, plane মেলানো, offset), `ImageSliceSynchronizer` বাদ
- [x] Lock / unlock: এখনকার অবস্থানের পার্থক্য রেখে একসাথে চলা
- [x] Zoom/pan sync (নতুন link বোতাম)
- [x] Cine sync (নতুন link বোতাম)
- [x] Cell-এর link টগল (viewport group)
- [x] Link সেটিং মনে থাকে (settings v3)

### ৪.২ Prior তুলনা
- [x] "Add files": আগেরগুলো রেখে নতুন ফাইল যোগ (একই ফাইল দুবার এলে বাদ)
- [x] "Compare with prior": মেলানো সিরিজ বাছাই (বিশুদ্ধ ফাংশন, test-সহ), ১×২, sync lock
- [x] সাইডবারে স্টাডির তারিখ আর "prior" চিহ্ন

### ৪.৩ 3D cursor
- [x] Shift+ক্লিক / টুল → সব 2D viewport সেই বিন্দুর slice-এ, "+" চিহ্ন
- [x] MPR: crosshair-এর কেন্দ্র সরে যায়
- [x] MPR + 3D: 3D-তে বিন্দু (গোলক)

### ৪.৪ Reference line
- [x] নিজের layer: plane ∩ ছবির আয়তক্ষেত্র → রেখা (unit test)
- [x] শুধু active / সব viewport-এর রেখা; রং অনুযায়ী
- [x] প্রথম ও শেষ slice-এর রেখা (dashed)

### ৪.৫ Hanging protocol
- [x] নিয়মের ধরন, মেলানো আর সিরিজ বাছাই (বিশুদ্ধ, test-সহ)
- [x] বিল্ট-ইন নিয়ম (যেমন MR brain: ২×২, CT chest prior: ১×২)
- [x] খোলার সময় নিজে প্রয়োগ, আর কমান্ড দিয়ে আবার প্রয়োগ
- [x] এই লেআউট নিয়ম হিসেবে সেভ, তালিকা ও মুছা (ডায়ালগ)

### ৪.৬ Viewport-এর অবস্থা
- [x] সিরিজ অনুযায়ী zoom/pan/rotation/flip/W/L/invert/colormap/slice মনে রাখা ও ফেরত দেওয়া
- [x] Reset করলে মনে রাখা অবস্থা মুছে যায়

### ৪.৭ আলাদা উইন্ডো
- [x] "Open in new window" কমান্ড, BroadcastChannel-এ ফাইল পাঠানো
- [x] উইন্ডোর মধ্যে slice আর W/L sync

### ৪.৮ পরীক্ষা ও সমাপ্তি
- [x] নমুনা: একই রোগীর দুটো স্টাডি (আগের আর পরের তারিখ, ভিন্ন FoR, slice-এর অবস্থান সরানো)
- [x] Unit test: plane-এর কাটা রেখা, position sync-এর slice খোঁজা, prior মেলানো, hanging নিয়ম, settings migration
- [x] E2E: প্রতিটা sync, lock, cell link, add files, compare with prior, 3D cursor, reference line মোড, hanging নিয়ম সেভ/প্রয়োগ, অবস্থা মনে রাখা, নতুন উইন্ডো, মোবাইল
- [x] dev + prod সবুজ; স্ক্রিনশট; README, এই ফাইল, রোডম্যাপ
- [ ] Commit শুধু ব্যবহারকারী বললে

## ঝুঁকি

| ঝুঁকি | প্রতিকার |
|---|---|
| নিজের position sync-এ লুপ (লক্ষ্য আবার উৎস হয়ে যায়) | উৎস শুধু active viewport; আমাদের নিজের পরিবর্তন চলার সময় event উপেক্ষা |
| `ReferenceLinesTool` সরালে আগের E2E ভাঙে | একই আচরণ (active-এর রেখা) ডিফল্ট রাখা, test আপডেট |
| File object অন্য উইন্ডোতে পাঠানো | BroadcastChannel structured clone File সমর্থন করে; না পারলে বার্তা দেখানো |
| Hanging নিয়ম ভুল সিরিজ বসায় | নিয়ম শুধু সাজায়, ব্যবহারকারী সব বদলাতে পারে; মেলানোর নিয়ম test-এ বাঁধা |
| 3D-তে গোলক যোগ করতে vtk-র ভেতরের কাজ | volume3d.ts-এ সীমাবদ্ধ, ছোট actor |

## বাস্তবায়নের নোট

**গঠন:** নতুন ফোল্ডার `src/comparison/`:
- `planes.ts`: বিশুদ্ধ গণিত (normal, plane-এর নাম, সবচেয়ে কাছের slice, দুই ছবির কাটা রেখা দুটো ছবির ভেতরে সীমিত করে), test-সহ
- `priors.ts`: আগের স্টাডি, সিরিজ মেলানো, স্টাডি একত্র করা
- `cursor3d.ts`, `multiWindow.ts`

নিয়ম আছে `src/dicom/hangingProtocol.ts`-এ; sync আছে `src/cornerstone/sync.ts`-এ।

**Sync:**
- Cornerstone-এর `ImageSliceSynchronizer` বাদ দিয়ে নিজেদের position sync লিখেছি।
  - উৎস শুধু active cell। Viewport নতুন ছবি দেখালে linked cell-গুলো normal বরাবর সবচেয়ে কাছের slice-এ যায়।
  - Lock করলে একটা সাধারণ normal আর প্রতিটা সিরিজের তখনকার অবস্থান মনে রাখা হয়, তাই ভিন্ন frame of reference-এও পার্থক্য রেখে চলে।
  - Lock সেই viewport-গুলো লোড হওয়া পর্যন্ত (৬ সেকেন্ড) চেষ্টা করে।
- Cine sync চলে frame-এর অনুপাতে।
- Zoom/pan: Cornerstone-এর `createPresentationViewSynchronizer` (5.13) তার options-কে selector হিসেবে পাঠায়, ফলে কিছুই কপি হয় না। তাই নিজের synchronizer লিখেছি, যেটা `getViewPresentation({ zoom, pan })` কপি করে।
- Cell link: link বন্ধ cell-এ "UNLINKED" লেখা দেখায়। VOI আর zoom/pan synchronizer-এ শুধু linked cell যোগ হয়।

**Reference line:**
- `ReferenceLinesTool` সরিয়ে নিজের SVG layer (`ComparisonLayer`) বানানো হয়েছে।
- Viewport ছবি বা camera বদলালে একটা tick store বাড়ে (frame-এ একবার), তখন রেখা নতুন করে হিসাব হয়।
- রং cell অনুযায়ী। প্রথম ও শেষ slice-এর রেখা dashed।

**3D cursor:**
- Cornerstone টুল `Cursor3D`। toolbar-এ বোতাম আর `K` key; অন্য যে কোনো টুল বাছা থাকলেও Shift+ক্লিকে কাজ করে।
- একই frame of reference-এর অন্য viewport-গুলো সেই বিন্দুর slice-এ যায় (আধা slice-এর মধ্যে থাকলে "+" চিহ্ন)।
- MPR-এ crosshair-এর `setToolCenter` ব্যবহার হয়।
- "MPR + 3D"-তে crosshair-এর কেন্দ্র 3D ছবির উপর SVG চিহ্ন হিসেবে আঁকা হয়।
  - প্রথমে vtk sphere দিয়ে চেষ্টা করেছিলাম, কিন্তু সেটা volume-এর টিস্যুর ভেতরে ঢাকা পড়ে দেখা যেত না।
  - তাই এখন বিন্দুটা worldToCanvas দিয়ে পর্দায় প্রক্ষেপ করে আঁকা হয়।

**Prior ও hanging:**
- "Add files/folder" আগের স্টাডি রেখে নতুন ফাইল যোগ করে। আগে খোলা SOP UID আবার এলে duplicate হিসেবে বাদ যায়।
- সাইডবারে পুরনো স্টাডিতে "PRIOR" চিহ্ন দেখায়। ফোনে স্টাডির শিরোনাম লুকানো থাকে, তাই সেখানে চিহ্নও দেখা যায় না।
- Series-এ নতুন field `plane` আর `bodyPart`।
- বিল্ট-ইন hanging নিয়ম তিনটা: MR brain (২×২), CT with prior, MR with prior।
  - prior-ওয়ালা নিয়ম মিললে খোলার সময়ই ১×২ লেআউট আর lock বসে।
  - ব্যবহারকারীর নিয়ম settings v3-এ থাকে।

**Viewport-এর অবস্থা:**
- সিরিজ অনুযায়ী view presentation, W/L, invert আর colormap মনে থাকে। Slice-ও মনে থাকে সিরিজ অনুযায়ী, যে কোনো cell-এ।
- নতুন সিরিজ দেখালে camera এখন reset হয়। আগে আগের সিরিজের zoom থেকে যেত; test লিখতে গিয়ে এটা ধরা পড়েছে।

**আলাদা উইন্ডো:**
- নতুন উইন্ডো `BroadcastChannel`-এ "hello" পাঠায়, মূল উইন্ডো সিরিজের File object পাঠায়।
- এরপর slice (position) আর W/L sync চলে। প্রতিধ্বনি এড়াতে বাইরে থেকে পরিবর্তন এলে ৪০০ ms নিজের broadcast বন্ধ থাকে।

**ফল:**
- Unit test ১০১টা পাস (নতুন: planes, priors/hanging, settings v3)।
- E2E dev আর prod দুটোতেই ৭৪টা পাস + ১টা skip; নতুন `e2e/compare.spec.ts`-এ ৯টা টেস্ট (একটা মোবাইলের)।
- Initial JS ১০০.৬ KB, মোট ১৮২৬.৫ KB। সব বাজেটের মধ্যে, কোনো বাজেট বাড়াতে হয়নি।
- ফেজ ৩-এর "every tool" টেস্ট সমান্তরাল চালালে ৯০ সেকেন্ড পেরিয়ে যাচ্ছিল, তাই `test.slow()` দেওয়া হয়েছে।

**যা সীমিত:**
- সিরিজের সাধারণ সাজানো বদলালে মনে রাখা view সেই সিরিজের থাকে, কিন্তু slice index নতুন ক্রম অনুযায়ী হয়।
- আলাদা উইন্ডো একটা সিরিজ দেখায়; সেখানে zoom/pan আর cine sync হয় না, শুধু slice আর W/L।
- 3D cursor ভিন্ন frame of reference-এ (lock থাকলেও) যায় না।
