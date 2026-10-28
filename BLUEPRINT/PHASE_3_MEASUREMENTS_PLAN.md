# ফেজ ৩: মাপজোখ ও annotation — বিস্তারিত পরিকল্পনা

> স্ট্যাটাস: সম্পন্ন (commit-এর অপেক্ষায়) · তারিখ: 2026-10-29 · ব্রাঞ্চ: `feature/phase-3-measurements`
> মূল রোডম্যাপ: [FULL_FEATURE_ROADMAP.md](FULL_FEATURE_ROADMAP.md#ফেজ-৩-মাপজোখ-ও-annotation) · আগের ফেজ: [PHASE_2_2D_TOOLS_PLAN.md](PHASE_2_2D_TOOLS_PLAN.md)

## লক্ষ্য

রেডিওলজিস্টের রোজকার সব মাপের টুল, সঠিক calibration আর পরিসংখ্যান। সাথে মাপগুলো সামলানোর একটা প্যানেল:
- তালিকা, মুছে ফেলা, undo/redo
- কপি, CSV আর JSON-এ সেভ ও ফেরত আনা

## যাচাই করা API (Cornerstone tools 5.13)

| দরকার | সমাধান |
|---|---|
| Rectangle, Circle, Bidirectional, Cobb, Arrow, Label | রেডিমেড টুল |
| Polygon (বন্ধ) ও polyline (খোলা) | `SplineROITool`, `splineType: LINEAR`; খোলাটার জন্য `allowOpenSplines` |
| Spline curve | `SplineROITool` (CATMULLROM) |
| Freehand বন্ধ / খোলা / পেন্সিল | `PlanarFreehandROITool` (`allowOpenContours`); পেন্সিল = আলাদা instance, পরিসংখ্যান ছাড়া |
| Undo / redo | core-এর `utilities.HistoryMemo.DefaultHistoryMemo` (annotation টুলগুলো memo রাখে) |
| Calibration | tools-এর `utilities.calibrateImageSpacing`; ইউনিট `getCalibratedLengthUnitsAndScale` (ERMF, projection, US region) |
| মাপ JSON থেকে ফেরত আনা / কপি | `utilities.annotationHydration` বা `annotation.state.addAnnotation` |
| লেখা কাস্টমাইজ (mm/cm) | প্রতিটা টুলের `getTextLines` কনফিগারেশন |
| **নেই:** deviation distance, length ratio, ellipsoid volume, spine label, redaction | নিজেরা: মাপের "দল" (group) + নিজের SVG layer; spine label = `LabelTool` subclass; redaction = `RectangleROITool` subclass |
| **নেই:** median, histogram, পিক্সেল সংখ্যা | নিজেরা: ROI-কে image-স্থানাঙ্কে polygon বানিয়ে ভেতরের পিক্সেল |

## টাস্ক

### ৩.১ টুল
- [x] Rectangle ROI, Circle ROI
- [x] Polygon (বন্ধ): ক্ষেত্রফল, পরিধি — click করে বিন্দু
- [x] Open polyline: দৈর্ঘ্য
- [x] Freehand ROI (বন্ধ) আর freehand খোলা রেখা
- [x] Spline curve (CatmullRom)
- [x] Bidirectional (দীর্ঘ ও ছোট অক্ষ)
- [x] Cobb angle
- [x] Arrow + লেখা, শুধু লেখা — লেখা ডায়ালগে
- [x] Pencil (মুক্ত হাতে আঁকা, মাপ ছাড়া)
- [x] Spine labeling: পরপর C1…C7, T1…T12, L1…L5, S1; শুরুর লেবেল বাছাই
- [x] Redaction box (কালো বাক্স), PNG export-এও ঢাকা থাকবে
- [x] Deviation distance: একটা রেখা আর একটা বিন্দু → লম্ব দূরত্ব (লম্ব রেখাসহ আঁকা)
- [x] Length ratio: দুটো রেখা → অনুপাত (যেমন cardiothoracic ratio)
- [x] Ellipsoid volume: তিনটা রেখা (যে কোনো viewport বা plane-এ) → π/6·L·W·H
- [x] পুরনো টুল (length, angle, ellipse, probe) আবার যাচাই, geometry-ছাড়া ছবিতেও
- [x] টুলবার: আগের ৪টা বোতাম থাকবে, বাকিগুলো "Measure ▾" মেনুতে; শর্টকাট keymap-এ

### ৩.২ Calibration ও ইউনিট
- [x] হাতে calibration: একটা রেখা টেনে তার আসল দৈর্ঘ্য (mm) লেখা → পুরো সিরিজের spacing বদলায়
- [x] Pixel spacing না থাকলে "px", Imager Pixel Spacing/ERMF হলে কোনটা ব্যবহার হলো সেটা দেখানো (Cornerstone-এর calibration type)
- [x] আল্ট্রাসাউন্ড region calibration (Sequence of Ultrasound Regions) — নমুনা দিয়ে যাচাই
- [x] ইউনিট: mm / cm, mm² / cm² (settings, মনে থাকে)

### ৩.৩ পরিসংখ্যান
- [x] প্রতিটা ROI-তে mean, median, min, max, std dev, ক্ষেত্রফল, পিক্সেল সংখ্যা
- [x] HU (CT), SUV (PET), কাঁচা মান (অন্য)
- [x] ROI histogram (প্যানেলে ছোট চার্ট)

### ৩.৪ মাপের প্যানেল ও ব্যবস্থাপনা
- [x] প্যানেল: সব মাপ সিরিজ ও ছবি অনুযায়ী, মান সহ; ক্লিক করলে সেই ছবিতে যাওয়া ও বাছাই
- [x] লেবেল দেওয়া, রং বদলানো
- [x] একটা মুছে ফেলা (Delete key), এই ছবির সব, এই সিরিজের সব, সব
- [x] Undo / Redo (Ctrl+Z / Ctrl+Shift+Z, Ctrl+Y)
- [x] মাপ কপি করে অন্য ছবিতে বসানো (একই সিরিজের আরেক ছবি, বা একই মাপের অন্য সিরিজ)
- [x] লুকানো/দেখানো (একটা বা সব)
- [x] মান কপি (clipboard) আর CSV export
- [x] JSON-এ সেভ ও লোড (SOP Instance UID + frame দিয়ে মেলানো, যাতে পরের বার খুললেও বসে)
- [x] MPR viewport-এও মাপ (প্যানেলে আসে)

### ৩.৫ পরীক্ষা ও সমাপ্তি
- [x] নমুনা: আল্ট্রাসাউন্ড region-সহ; pixel spacing-ছাড়া DX (আছে); ERMF-সহ DX
- [x] Unit test: polygon-এর ভেতরের পিক্সেল, পরিসংখ্যান (median, std), ellipsoid/ratio/deviation গণিত, ইউনিট রূপান্তর, JSON serialization
- [x] E2E: প্রতিটা টুল আঁকা ও মান, calibration, প্যানেল, মুছে ফেলা, undo/redo, কপি, CSV, JSON সেভ/লোড, redaction export, মোবাইল
- [x] dev + prod সবুজ; স্ক্রিনশট; README, এই ফাইল, রোডম্যাপ
- [ ] Commit শুধু ব্যবহারকারী বললে

## ঝুঁকি

| ঝুঁকি | প্রতিকার |
|---|---|
| Cornerstone-এর tool আচরণ (spline শেষ করা, open contour) অস্পষ্ট | প্রতিটার জন্য E2E আগে, দরকারে subclass |
| JSON-এ world স্থানাঙ্ক অন্য geometry-তে ভুল জায়গায় বসা | ছবির নিজের geometry একই থাকে (একই ফাইল); SOP UID না মিললে বাদ ও জানানো |
| একসাথে অনেক টুল → টুলবার ভিড় | "Measure ▾" মেনু |
| Undo-র সাথে আমাদের নিজস্ব group/label অসঙ্গত | group-কে annotation-এর metadata-তে রাখা, আলাদা state নয় |

## বাস্তবায়নের নোট

**গঠন:** নতুন ফোল্ডার `src/measurements/`:
- `geometry.ts`: বিশুদ্ধ গণিত (polygon-এর ক্ষেত্রফল, পিক্সেল, পরিসংখ্যান, histogram, ellipsoid, লম্ব দূরত্ব, ইউনিট), unit test-সহ
- `measure.ts`: annotation-এর world বিন্দু → ছবির pixel → physical (mm/px)। ছবির উপরের লেখা আর প্যানেল দুটোই এখান থেকে আসে, তাই সবসময় এক। ফলাফল WeakMap-এ cache হয়; বিন্দু, calibration বা ছবি লোড বদলালে নতুন করে হিসাব হয়।
- `tools.ts`: টুলের class আর configuration
- `groups.ts`: ratio (২টা রেখা) আর ellipsoid (৩টা রেখা, যে কোনো ছবি বা plane-এ)। দলের পরিচয় annotation-এর data-তে রাখা হয়, তাই undo, কপি আর JSON-এর পরেও টিকে থাকে।
- `text.ts`, `manage.ts`, `fileFormat.ts`, `spine.ts`

**টুল:**
- Polygon, polyline আর curve হলো `SplineROITool`-এর subclass (LINEAR / খোলা LINEAR / CatmullRom)।
- Freehand একটাই টুল: শুরুর কাছে শেষ করলে বন্ধ ROI, নইলে খোলা রেখা (Cornerstone-এর `allowOpenContours`)।
- নিজের render দুটো টুলে:
  - Deviation: `AngleTool` subclass, রেখা আর বিন্দু থেকে লম্ব (dashed) আঁকে।
  - Redaction: `RectangleROITool` subclass, কালো ভরাট আঁকে। PNG export-এ ওই বাক্সগুলো canvas-এ কালো রঙ করা হয়।
- টুলবারে আগের ৪টা বোতামই আছে; বাকি সব "Measure ▾" মেনুতে।
- Polygon/polyline/curve/arrow/label/spine সক্রিয় থাকলে double-click viewport বড় করে না, কারণ ওই টুলগুলো double-click-এ আঁকা শেষ করে বা লেখা বদলায়।

**Calibration:**
- Pixel Spacing না থাকলে loader এখন Imager Pixel Spacing ও ERMF পড়ে, আর default plane-এ spacing = imager ÷ ERMF হয়।
- লেখায় উৎস দেখায়: "(ERMF)", "(detector)", "(calibrated)", "(US region)"।
- হাতে calibration-এ রেখার দৈর্ঘ্য জিজ্ঞেস করে পুরো সিরিজে একটা factor বসানো হয়। এটা আমাদের নিজস্ব; Cornerstone-এর `calibrateImageSpacing` নেওয়া হয়নি, কারণ 5.13-এ USER type দিলে শুধু x-অক্ষের scale বদলায়।
- **সীমা:** scale bar (Cornerstone-এর `ScaleOverlayTool`) হাতে করা calibration মানে না।

**Undo/redo:**
- আঁকা আর সম্পাদনার undo Cornerstone-এর `DefaultHistoryMemo` দিয়ে।
- মুছে ফেলা আর কপি করার জন্য নিজের memo; একাধিক মুছলে এক undo-তেই সব ফেরে।
- শর্টকাটে এখন "ctrl+" যুক্ত key-ও থাকে (⌘-ও চলে)।
- Backspace Cornerstone-এর কাছে থাকে: contour আঁকার সময় শেষ বিন্দু মোছে। Delete key আঁকার মাঝে মাপ মোছে না।

**যে ভুলগুলো পেয়ে ঠিক করা হয়েছে:**
- `defaultPlane` সবসময় `usingDefaultValues: true` দিচ্ছিল। ফলে spacing-ওয়ালা geometry-ছাড়া ছবিতেও মাপ px-এ আসত।
- Cornerstone একই calibration রেখাকে দুবার "completed" বলে (আলাদা object, একই UID)। তাই এখন UID দিয়ে একবারই প্রশ্ন করা হয়।
- Form-এ `min=0.001` আর `step=0.01` থাকলে ব্রাউজার ২০-কে অবৈধ ধরে submit আটকাচ্ছিল। step সরানো হয়েছে।
- MPR volume লোড হওয়ার আগে Deviation-এর render target খুঁজতে গিয়ে error দিচ্ছিল। এখন annotation থাকলেই খোঁজে, আর error ধরে ফেলে।
- হলুদ লেখা সাদা হাড়ের উপর পড়া যাচ্ছিল না; লেখার পেছনে আধা-স্বচ্ছ কালো background দেওয়া হয়েছে।

**ফল:**
- Unit test ৮৮টা পাস (নতুন: geometry, file format, CSV, spine)।
- E2E dev-এ ৬৪টা পাস + ১টা skip; নতুন `e2e/measure.spec.ts`-এ ৯টা টেস্ট, একটা মোবাইলের।
- E2E prod-এ ৬৪টা পাস + ১টা skip।
- Initial JS ৯৮.১ KB, মোট ১৮১৯.৩ KB।
- Cornerstone runtime chunk ৯৮৬.৬ KB হয়েছে (নতুন টুল class init-এ রেজিস্টার হয়, আলাদা করা যায় না)। তাই একক chunk-এর বাজেট ৯৬০ থেকে ১০২৪ KB করা হয়েছে।

**যা বাকি বা সীমিত:**
- MPR-এ মাপের ক্ষেত্রফলের পরিসংখ্যান Cornerstone-এর নিজের হিসাব থেকে আসে (median, পিক্সেল সংখ্যা, histogram নেই)।
- MPR-এর যে মাপ কোনো আসল ছবির plane-এ পড়ে না, সেটা JSON-এ সেভ হয় না। Axial plane-এর মাপ ছবির সাথে মিলে যায়, তাই সেভ হয়।
- বাংলা অনুবাদ ফেজ ১০-এ।
