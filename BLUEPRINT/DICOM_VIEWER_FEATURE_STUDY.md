# জনপ্রিয় DICOM Viewer-এর feature স্টাডি ও আমাদের ঘাটতি

> তারিখ: 2026-10-28 · প্রকল্প: DicomLens (`dicomlens.pages.dev`) · সম্পর্কিত: [DICOM_VIEWER_PLAN.md](DICOM_VIEWER_PLAN.md), [3D_VR_PLAN.md](3D_VR_PLAN.md)

## উদ্দেশ্য

RadiAnt (মূল তুলনা) আর অন্য জনপ্রিয় viewer-এ কী কী feature আছে তা দেখা। তারপর আমাদের অ্যাপে কী নেই সেটা বের করা, আর কোনগুলো আগে করা উচিত তার অগ্রাধিকার ঠিক করা।

আমাদের সীমা মাথায় রেখে বিশ্লেষণ করা হয়েছে: অ্যাপটা **শুধু ব্রাউজারে চলে, কোনো সার্ভার নেই, আর ফাইল আপলোড হয় না**। তাই কিছু feature (যেমন DIMSE PACS, লোকাল ডেটাবেস, CD burning) হুবহু করা যাবে না। সেগুলোর বদলে কী করা যায় তা আলাদা করে লেখা আছে।

## যেসব viewer দেখা হয়েছে

| Viewer | ধরন | কেন গুরুত্বপূর্ণ |
|---|---|---|
| **RadiAnt** | Windows ডেস্কটপ, পেইড (trial আছে) | দ্রুত, সহজ UI; ব্যবহারকারীর মূল রেফারেন্স |
| **MicroDicom** | Windows ডেস্কটপ, অ-বাণিজ্যিক ব্যবহারে ফ্রি | ফ্রি viewer-এর মধ্যে সবচেয়ে বেশি feature |
| **Weasis** | ডেস্কটপ (Java), ওপেন সোর্স | SEG/RT/SR/ECG-এর মতো বিশেষ DICOM object সাপোর্ট |
| **OHIF** | ওয়েব, ওপেন সোর্স (Cornerstone3D-এর উপর) | আমাদের মতো একই প্রযুক্তি; ওয়েবে কী সম্ভব তার প্রমাণ |
| **OsiriX / Horos** | macOS | Curved MPR, surface rendering, plugin |
| **MedDream** | ওয়েব (HTML5), বাণিজ্যিক | অনলাইন viewer, শেয়ারিং আর anonymization |
| **PostDICOM, DICOM Library** | ক্লাউড | লিংক দিয়ে স্টাডি শেয়ার |

---

## ১. RadiAnt-এর বিস্তারিত feature

**ফাইল খোলা ও ফরম্যাট**
- CD/DVD/Blu-ray, USB, লোকাল বা নেটওয়ার্ক ফোল্ডার থেকে খোলা; **ZIP (পাসওয়ার্ডসহ)** থেকেও খোলা যায়
- Modality: CR, DX, MG, CT, MR, PT, US (IVUS-সহ), XA, NM, SC, ES, SM, SR, **encapsulated PDF**
- RLE, JPEG lossy/lossless, JPEG 2000, JPEG-LS; **MPEG2/MPEG4 DICOM ভিডিও**
- Asynchronous loading: পুরো স্টাডি লোড হওয়ার আগেই দেখা শুরু করা যায়

**মূল টুল**
- মসৃণ zoom/pan, W/L, negative
- CT preset, **নিজের বানানো preset**, **সঠিক W/L মান হাতে লেখা**, PET-এ SUVbw
- 90°/180° ঘোরানো, flip
- **Image filter:** sharpen, smooth, edge, emboss
- **CINE playback** (FPS ঠিক করা যায়)
- **DICOM overlay** দেখানো (ছবির ভেতরে থাকা গ্রাফিক্স)
- সার্চসহ DICOM tag browser

**মাপজোখ ও ROI**
- দৈর্ঘ্য মাপা, **হাতে calibration** (পিক্সেল স্পেসিং না থাকলে)
- আল্ট্রাসাউন্ডের calibrated region
- বৃত্ত/ellipse ROI: mean/min/max (HU, SUV) আর ক্ষেত্রফল
- **Polygon:** ক্ষেত্রফল ও পরিধি; open polygon-এর দৈর্ঘ্য
- কোণ, **Cobb angle**, **deviation distance**
- **তীর চিহ্ন, ফ্রিহ্যান্ড পেন্সিল**
- **Length ratio, ellipsoid volume** (2023.1)

**সিরিজ তুলনা**
- একই উইন্ডোতে বা আলাদা উইন্ডোতে একাধিক সিরিজ
- একই plane-এর সিরিজ নিজে থেকেই sync হয়
- **ভিন্ন স্টাডির সিরিজ হাতে sync** (আগের ও এখনকার স্টাডি তুলনা)
- Cross-reference line
- **3D cursor:** এক ছবিতে বিন্দু দিলে অন্য সব সিরিজে সেই জায়গা দেখায়
- **Multi-sequence সিরিজ আলাদা প্যানেলে ভাগ করা**

**অ্যাডভান্সড**
- 2D orthogonal MPR আর **3D oblique MPR** (MIP/MinIP/Avg)
- **Fusion:** PET-CT, MR T1/T2-এর উপর DWI
- **Time-intensity curve** (ব্রেস্ট MRI: type Ia, Ib, II, III)
- 3D VR, **3D snapshot সেভ ও ফেরত আনা**
- **ঘোরানোর মুভি আর snapshot-ভিত্তিক ভিডিও**
- **STL export** (3D প্রিন্টের জন্য)
- **3D-তে scalpel** দিয়ে অংশ কেটে বাদ দেওয়া, 3D-তে দৈর্ঘ্য মাপা
- **DSA:** mask বিয়োগ, auto ও manual pixel shift
- 2D, MPR আর 3D-তে একসাথে axis intersection sync (2025.2)

**Export / শেয়ার**
- JPEG, BMP; **MP4, WMV মুভি**; একটা ছবি, পুরো সিরিজ বা সব খোলা ছবি
- **মূল DICOM ফরম্যাটে export**
- Clipboard-এ কপি (Ctrl+C)
- **প্রিন্ট ও PDF** (2024.2)
- **Anonymization**, template সেভ করা যায় (2024.1)

**PACS / আর্কাইভ**
- C-ECHO, C-FIND, C-MOVE, C-STORE; লোকাল ডেটাবেস, keyword, CSV-তে স্টাডির তালিকা

**ইন্টারফেস**
- ফুল-স্ক্রিন আর distraction-free মোড
- **Multi-touch:** এক আঙুলে স্ক্রল, দুই আঙুলে zoom/pan, তিন আঙুলে W/L
- ৩০টার বেশি ভাষা
- **কিবোর্ড শর্টকাট বদলানো যায়**
- `radiant://` URL protocol আর command line দিয়ে অন্য সফটওয়্যার থেকে খোলা
- **2D ছবি সাজানো:** instance number, position, acquisition time বা ফাইলের নাম অনুযায়ী

## ২. অন্য viewer-এ যা বাড়তি পাওয়া গেছে

**MicroDicom**
- DICOMDIR পড়া, JPEG/PNG/TIFF খোলা
- **ROI দিয়ে W/L:** একটা জায়গা বেছে নিলে সেই অনুযায়ী W/L ঠিক হয়
- Rectangle, freehand, open/closed curve ROI; **median আর standard deviation**
- **Text annotation, spine label, অংশ ঢেকে রাখা (hidden area)**
- Morphological filter
- Zoom, pan আর W/L-এর আলাদা sync
- 3D-তে clipping, 3D surface-এ মাপা
- **Tag export: TXT, CSV, JSON**; **সাধারণ ছবিকে DICOM-এ রূপান্তর**
- **Tag edit**, প্রিয় tag-এর তালিকা
- **স্টাডির স্ট্যাটাস:** Unread, In Progress, Reviewed, Urgent, Signed
- **নির্দিষ্ট অংশ সিলেক্ট করে ক্যাপচার**
- এক পাতায় একাধিক ছবি দিয়ে প্রিন্ট
- Export ও প্রিন্টে রোগীর তথ্য লুকানো
- DICOMweb (QIDO-RS, WADO-RS, STOW-RS)

**Weasis**
- **KO/PR (Key Object, Presentation State)** সেভ: মাপজোখ DICOM ফরম্যাটে রাখা
- **ROI histogram**
- **DICOM SEG overlay** (2D, MPR আর 3D-তে)
- **RTSTRUCT contour, RTDOSE isodose, DVH**
- **AI-র তৈরি object:** parametric map, GSPS, SR, segmentation
- **ECG waveform, অডিও, 4D**
- একাধিক মনিটর, high-DPI, থিম, ডকিং লেআউট
- `weasis://` protocol দিয়ে পোর্টাল থেকে খোলা

**OHIF (ওয়েব, Cornerstone3D)**
- **Study list:** রোগীর নাম, MRN, তারিখ, modality দিয়ে ফিল্টার
- **Mode ভিত্তিক workflow:** Basic, measurement tracking, segmentation, PET/CT fusion (3×3), TMTV, microscopy, ultrasound
- **Measurement panel:** সব মাপের তালিকা, ক্লিক করলে সেই ছবিতে যাওয়া, **DICOM SR হিসেবে সেভ**
- **Segmentation:** brush, threshold, labelmap; SEG import/export
- **Hanging protocol:** নিয়ম লিখে লেআউট নিজে থেকে সাজানো
- RT Dose, RT Structure, DICOM Labelmap (v3.11)
- **ভিডিও আর whole-slide microscopy**

**OsiriX / Horos**
- **Curved MPR** (aorta বা bronchus বরাবর)
- **3D surface rendering, 3D endoscopy (virtual endoscopy)**
- **3D ROI ("3D ball")**, 2D/3D ROI-র পরিসংখ্যান
- রিয়েলটাইম 2D/3D SUV
- Plugin সিস্টেম

**MedDream / PostDICOM / DICOM Library (ওয়েব)**
- **লিংক দিয়ে স্টাডি শেয়ার:** পাসওয়ার্ড, মেয়াদ, ডাউনলোড বন্ধ রাখা
- **Anonymize করে শেয়ার** (শিক্ষা ও গবেষণার জন্য)
- iframe embed, URL parameter দিয়ে নির্দিষ্ট স্টাডি খোলা
- ECG, ডেন্টাল, চোখের (retinal), endoscopy, ভিডিও, PDF, SR
- ক্লাউড (AWS HealthImaging, Azure, Google Healthcare API)

---

## ৩. তুলনা: আমাদের অ্যাপ বনাম অন্যরা

✅ = আছে · ◐ = আংশিক · ❌ = নেই · — = ওয়েবে প্রযোজ্য নয় বা সম্ভব নয়

| Feature | আমাদের | RadiAnt | MicroDicom | Weasis | OHIF |
|---|---|---|---|---|---|
| ফাইল/ফোল্ডার খোলা, drag & drop | ✅ | ✅ | ✅ | ✅ | ✅ |
| ZIP থেকে খোলা | ❌ | ✅ | ✅ | ✅ | ◐ |
| DICOMDIR পড়া | ❌ (বাদ দেওয়া হয়) | ✅ | ✅ | ✅ | — |
| Compressed codec | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-frame (US, XA) | ◐ (frame হিসেবে লোড হয়) | ✅ | ✅ | ✅ | ✅ |
| **CINE playback** | ❌ | ✅ | ✅ | ✅ | ✅ |
| DICOM ভিডিও (MPEG) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Encapsulated PDF / SR দেখা | ❌ | ✅ | ✅ | ✅ | ✅ |
| W/L, zoom, pan, invert, rotate, flip | ✅ | ✅ | ✅ | ✅ | ✅ |
| CT preset | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Custom preset, W/L হাতে লেখা** | ❌ | ✅ | ✅ | ✅ | ◐ |
| ROI দিয়ে W/L | ❌ | ❌ | ✅ | ❌ | ❌ |
| Image filter (sharpen, smooth) | ❌ | ✅ | ✅ | ✅ | ❌ |
| Magnifier | ✅ | ✅ | ✅ | ✅ | ✅ |
| দৈর্ঘ্য, কোণ, ellipse, probe | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Rectangle, polygon/freehand ROI** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Cobb angle** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **তীর ও লেখা (annotation)** | ❌ | ✅ | ✅ | ✅ | ✅ |
| Calibration | ❌ | ✅ | ✅ | ✅ | ◐ |
| ROI-তে std dev, histogram | ◐ (Cornerstone stats) | ◐ | ✅ | ✅ | ◐ |
| **মাপের তালিকা, মুছে ফেলা** | ❌ | ◐ | ✅ | ✅ | ✅ |
| মাপ সেভ (SR/PR) | ❌ | ❌ | ◐ | ✅ | ✅ |
| Thumbnail, লেআউট, ডাবল-ক্লিকে বড় করা | ✅ (সর্বোচ্চ 2×2) | ✅ | ✅ | ✅ | ✅ |
| বড় লেআউট (3×3, 1×3) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Reference line, scroll sync, W/L sync | ✅ | ✅ | ✅ | ✅ | ✅ |
| Zoom/pan sync | ❌ | ◐ | ✅ | ✅ | ✅ |
| **ভিন্ন স্টাডির হাতে sync** | ❌ | ✅ | ✅ | ✅ | ◐ |
| **3D cursor** | ◐ (শুধু MPR crosshair) | ✅ | ❌ | ✅ | ✅ |
| Orientation marker | ✅ | ✅ | ✅ | ✅ | ✅ |
| Orthogonal MPR + crosshair + slab | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Oblique MPR (plane ঘোরানো)** | ◐ (crosshair ঘোরানো যায় কিনা যাচাই হয়নি) | ✅ | ✅ | ✅ | ✅ |
| Curved MPR | ❌ | ❌ | ❌ | ❌ | ❌ |
| 3D VR + preset + ঘোরানো | ✅ | ✅ | ✅ | ✅ | ✅ |
| **3D clipping / scalpel** | ❌ | ✅ | ✅ | ◐ | ◐ |
| 3D-তে মাপা | ❌ | ✅ | ✅ | ❌ | ❌ |
| STL export | ❌ | ✅ | ✅ | ❌ | ❌ |
| **PET-CT fusion, SUV** | ❌ | ✅ | ✅ | ✅ | ✅ |
| DSA | ❌ | ✅ | ❌ | ❌ | ❌ |
| Time-intensity curve | ❌ | ✅ | ❌ | ❌ | ❌ |
| Segmentation (SEG) | ❌ | ❌ | ❌ | ✅ | ✅ |
| RTSTRUCT / RTDOSE | ❌ | ❌ | ❌ | ✅ | ✅ |
| DICOM tag দেখা ও সার্চ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tag export (CSV/JSON) | ❌ | ❌ | ✅ | ◐ | ❌ |
| PNG export (একটা ছবি) | ✅ | ✅ | ✅ | ✅ | ✅ |
| **পুরো সিরিজ export, MP4 মুভি** | ❌ | ✅ | ✅ | ✅ | ❌ |
| Clipboard-এ কপি | ❌ | ✅ | ✅ | ✅ | ❌ |
| প্রিন্ট / PDF | ❌ | ✅ | ✅ | ✅ | ❌ |
| **Anonymize করে DICOM ডাউনলোড** | ❌ | ✅ | ✅ | ✅ | ❌ |
| Study list / রোগী অনুযায়ী ফিল্টার | ◐ (সাইডবার) | ✅ | ✅ | ✅ | ✅ |
| PACS (DIMSE) | — | ✅ | ✅ | ✅ | — |
| DICOMweb থেকে খোলা | ❌ | ❌ | ✅ | ✅ | ✅ |
| URL দিয়ে স্টাডি খোলা | ❌ | ✅ (`radiant://`) | ❌ | ✅ | ✅ |
| **Touch gesture (ফোন/ট্যাবলেট)** | ◐ (Cornerstone-এর ডিফল্ট) | ✅ | ✅ | ❌ | ◐ |
| ফুল-স্ক্রিন | ❌ | ✅ | ✅ | ✅ | ◐ |
| শর্টকাট সাহায্য / বদলানো | ◐ (README-তে) | ✅ | ✅ | ✅ | ✅ |
| একাধিক ভাষা (বাংলা) | ❌ | ✅ | ✅ | ✅ | ✅ |
| ইনস্টল ছাড়া, ফাইল আপলোড ছাড়া | ✅ | ❌ | ❌ | ❌ | ❌ (সার্ভার লাগে) |
| অফলাইনে চলা (PWA) | ❌ | ✅ | ✅ | ✅ | ❌ |

**আমাদের শক্তির জায়গা:** কিছু ইনস্টল করতে হয় না, কোনো সার্ভার লাগে না, ফাইল কোথাও আপলোড হয় না, আর ফোনেও চলে। RadiAnt বা MicroDicom শুধু Windows-এ চলে, আর OHIF-এর জন্য PACS সার্ভার লাগে। এই সুবিধাটাই আমাদের মূল পরিচয়, তাই নতুন feature যেন এটা না ভাঙে।

---

## ৪. ঘাটতির বিশ্লেষণ: কোনটা কতটা জরুরি

মূল্যায়নের তিনটা মাপকাঠি: **ব্যবহারকারীর কাছে গুরুত্ব** (রোগী বা ডাক্তার রোজ কী খোঁজেন), **কাজের পরিমাণ**, আর **Cornerstone3D-তে রেডিমেড আছে কিনা**।

### অগ্রাধিকার ১: খুব দরকারি, সহজ (প্রায় সব viewer-এ আছে)

| Feature | কেন দরকার | কীভাবে (Cornerstone3D) | কাজ |
|---|---|---|---|
| **CINE playback** | আল্ট্রাসাউন্ড, এনজিওগ্রাম, কার্ডিয়াক MRI এগুলো ছাড়া দেখাই যায় না | `utilities.cine.playClip/stopClip`, FPS নিয়ন্ত্রণ | ছোট |
| **Multi-frame ঠিকমতো** | US/XA ফাইল খুবই প্রচলিত | `?frame=N` আগে থেকেই আছে; cine-এর সাথে যাচাই | ছোট |
| **বেশি মাপের টুল** | রেডিওলজিস্টের রোজকার কাজ | `RectangleROITool`, `PlanarFreehandROITool`, `CobbAngleTool`, `ArrowAnnotateTool`, `BidirectionalTool`, `CircleROITool` | ছোট |
| **মাপের তালিকা ও মুছে ফেলা** | এখন একটা মাপ মোছার কোনো উপায় নেই | `annotation.state` থেকে তালিকা; Delete key; "সব মুছুন" | মাঝারি |
| **W/L হাতে লেখা ও নিজের preset** | সব viewer-এ আছে | ড্রপডাউনে "Custom…" → ইনপুট; localStorage-এ preset | ছোট |
| **ZIP থেকে খোলা** | রোগীরা সাধারণত ZIP পান (ইমেইল, ক্লাউড ড্রাইভ) | ব্রাউজারে `fflate` দিয়ে unzip করে `File[]` | ছোট |
| **DICOMDIR / CD ফোল্ডার** | রোগীর CD সাধারণত এভাবেই থাকে | এখন ফোল্ডারের সব ফাইল পড়া হয়, তাই কাজ চলে; DICOMDIR পার্স করলে নাম ও ক্রম ঠিক থাকবে | ছোট |
| **ফুল-স্ক্রিন** | ছোট স্ক্রিনে খুবই দরকারি | Fullscreen API | খুব ছোট |
| **কিবোর্ড শর্টকাটের সাহায্য** | নতুন ব্যবহারকারী জানে না | `?` চাপলে একটা ডায়ালগ | খুব ছোট |
| **বড় লেআউট (1×3, 3×3, 3×2)** | তুলনা করার জন্য | `layouts.ts`-এ যোগ করা | খুব ছোট |

### অগ্রাধিকার ২: গুরুত্বপূর্ণ, মাঝারি কাজ

| Feature | কেন দরকার | কীভাবে | কাজ |
|---|---|---|---|
| **Anonymize করে DICOM ডাউনলোড** | শেয়ার করার আগে রোগীর পরিচয় মুছে ফেলা; আমাদের "privacy" পরিচয়ের সাথে মেলে | `dcmjs` দিয়ে tag মুছে বা বদলে ZIP-এ দেওয়া, DICOM PS3.15 Basic Profile অনুযায়ী | মাঝারি |
| **সিরিজ/ভিউ export: MP4/GIF, ZIP-এ সব PNG** | রিপোর্ট, প্রেজেন্টেশন, রোগীকে দেখানো | `MediaRecorder` + canvas stream (MP4/WebM); সব ছবি PNG করে ZIP | মাঝারি |
| **Clipboard-এ কপি** | Word/PowerPoint-এ ছবি দেওয়া | `navigator.clipboard.write` (PNG) | ছোট |
| **প্রিন্ট / PDF** | রোগীকে কাগজে দেওয়া | একাধিক ছবির একটা প্রিন্ট পাতা + `window.print()` | মাঝারি |
| **Zoom/pan sync** | তুলনার সময় | `createZoomPanSynchronizer` (Cornerstone-এ রেডিমেড) | ছোট |
| **ভিন্ন স্টাডির হাতে sync** | আগের ও এখনকার স্টাডি তুলনা (follow-up) | দুই viewport-এর slice-এর পার্থক্য রেখে একসাথে স্ক্রল | মাঝারি |
| **3D cursor (গ্রিডে)** | এক জায়গা সব সিরিজে খুঁজে পাওয়া | `CrosshairsTool` বা নিজে বানানো: ক্লিক করা world point → অন্য viewport-এ সবচেয়ে কাছের slice | মাঝারি |
| **Image filter** | CR/DX-এ হাড়ের কিনারা স্পষ্ট করা | Sharpen/smooth: canvas বা vtk convolution | মাঝারি |
| **Encapsulated PDF / SR দেখা** | অনেক CD-তে রিপোর্ট PDF হিসেবে থাকে | PDF bytes বের করে `<iframe>`; SR-এর লেখাগুলো text হিসেবে দেখানো | মাঝারি |
| **Touch gesture** | ফোনে বেশিরভাগ ব্যবহারকারী | এক আঙুলে স্ক্রল, দুই আঙুলে zoom/pan, লম্বা চাপে W/L (RadiAnt-এর মতো) | মাঝারি |
| **ভাষা: বাংলা + ইংরেজি** | আমাদের প্রাথমিক ব্যবহারকারী | `i18next`, শুরুতে দুটো ভাষা | মাঝারি |
| **Tag export (CSV/JSON)** | গবেষণার কাজে | TagPanel-এ বোতাম | খুব ছোট |
| **ছবি সাজানোর বিকল্প** | কিছু সিরিজের instance number ভুল থাকে | Instance / position / acquisition time অনুযায়ী সাজানো | ছোট |

### অগ্রাধিকার ৩: উন্নত (বিশেষজ্ঞ ব্যবহারকারীর জন্য)

| Feature | কেন | কীভাবে | কাজ |
|---|---|---|---|
| **3D clipping / scalpel** | পাঁজর সরিয়ে হৃদপিণ্ড বা aorta দেখা | VOLUME_3D-তে `VolumeCroppingTool` (Cornerstone 3.x+), বা vtk clipping plane | মাঝারি |
| **Oblique MPR যাচাই** | রোগ বরাবর plane | `CrosshairsTool`-এ rotation handle আছে; চালু ও পরীক্ষা করা | ছোট |
| **PET-CT fusion + SUV** | ক্যান্সারের স্টাডিতে অপরিহার্য | দুটো volume একই viewport-এ (`setVolumes` + colormap + opacity); SUV-র জন্য `calculate-suv` প্যাকেজ | বড় |
| **3D snapshot, ঘোরানোর মুভি** | প্রেজেন্টেশন | camera সেভ করা; ধাপে ধাপে ঘুরিয়ে `MediaRecorder` | মাঝারি |
| **STL export** | 3D প্রিন্ট (ডেন্টাল, অর্থো) | Marching cubes (vtk.js `ImageMarchingCubes`) → STL | বড় |
| **মাপ সেভ / লোড** | পরের বার আবার দেখা | প্রথমে JSON ফাইল (ডাউনলোড ও আপলোড), পরে DICOM SR (`@cornerstonejs/adapters`) | মাঝারি |
| **DICOM SEG / RTSTRUCT দেখা** | AI-র ফলাফল, রেডিয়েশন থেরাপি | `@cornerstonejs/adapters` + segmentation state | বড় |
| **DSA** | এনজিওগ্রাফি | mask frame বিয়োগ (custom image loader বা shader) | বড় |
| **Time-intensity curve** | ব্রেস্ট MRI | ROI-র mean সব phase-এ → চার্ট | মাঝারি |
| **Curved MPR** | Aorta, দাঁত (panoramic) | Cornerstone-এ রেডিমেড নেই; নিজে বানাতে হবে | খুব বড় |

### ওয়েবে যা হুবহু সম্ভব নয়, আর তার বিকল্প

| ডেস্কটপ feature | কেন সম্ভব নয় | আমাদের বিকল্প |
|---|---|---|
| PACS (C-FIND/C-MOVE/C-STORE) | ব্রাউজার TCP সকেট খুলতে পারে না | **DICOMweb** (QIDO/WADO): ব্যবহারকারী নিজের সার্ভারের URL দেবেন; CORS লাগবে |
| লোকাল ডেটাবেস / আর্কাইভ | কোনো সার্ভার নেই | **IndexedDB / OPFS**-এ সম্প্রতি খোলা স্টাডি রাখা (ব্যবহারকারী চাইলে); "সম্প্রতি খোলা" তালিকা |
| CD/DVD burning, autorun viewer | ব্রাউজার পারে না | দরকার নেই; লিংকটাই viewer |
| `radiant://` protocol | — | **URL parameter:** `?url=` দিয়ে বাইরের (CORS-সহ) DICOM/ZIP খোলা, বা DICOMweb স্টাডি UID |
| অফলাইনে চলা | — | **PWA (service worker):** একবার খুললে ইন্টারনেট ছাড়াও চলবে |
| GPU-তে দ্রুত 3D | — | WebGL2 আগে থেকেই আছে; বড় volume-এর জন্য sample distance কমানো ([3D_VR_PLAN.md](3D_VR_PLAN.md)-এ বাকি) |
| লিংক দিয়ে শেয়ার (PostDICOM) | ফাইল আপলোড করতে হবে, যা আমাদের "No Upload" নীতির বিরুদ্ধে | শুধু ব্যবহারকারী চাইলে: anonymize করা ZIP ডাউনলোড; ঐচ্ছিক ক্লাউড শেয়ার ভবিষ্যতে আলাদা সিদ্ধান্ত |

---

## ৫. প্রস্তাবিত রোডম্যাপ

প্রতিটা ধাপ আলাদা branch আর commit-এ করা হবে। শুরু করার আগে প্রতিটা ধাপের জন্য আলাদা phase-ভিত্তিক প্ল্যান হবে (যেমন [3D_VR_PLAN.md](3D_VR_PLAN.md))।

**ধাপ D: রোজকার ঘাটতি পূরণ** (অগ্রাধিকার ১)
1. CINE playback + multi-frame যাচাই (play/pause, FPS, loop)
2. নতুন মাপের টুল: rectangle, freehand/polygon, Cobb angle, arrow + text, bidirectional
3. মাপের তালিকা প্যানেল: ক্লিক করলে সেই ছবিতে যাওয়া, একটা মুছে ফেলা, সব মুছে ফেলা, Delete key
4. W/L হাতে লেখা ও নিজের preset
5. ZIP আর DICOMDIR
6. ফুল-স্ক্রিন, শর্টকাট ডায়ালগ (`?`), বড় লেআউট

**ধাপ E: শেয়ার ও export** (privacy-কেন্দ্রিক)
1. Anonymize করে DICOM ডাউনলোড (ZIP)
2. সিরিজ বা cine → MP4/WebM, সব ছবি PNG ZIP-এ, clipboard
3. প্রিন্ট / PDF পাতা
4. Tag export (CSV/JSON)
5. Encapsulated PDF / SR দেখা

**ধাপ F: তুলনা ও মোবাইল**
1. Zoom/pan sync, ভিন্ন স্টাডির হাতে sync
2. গ্রিডে 3D cursor
3. Touch gesture
4. বাংলা ও ইংরেজি ভাষা
5. PWA (অফলাইন), সম্প্রতি খোলা স্টাডি (IndexedDB, ঐচ্ছিক)

**ধাপ G: উন্নত ইমেজিং**
1. Oblique MPR যাচাই, 3D clipping/scalpel, 3D snapshot ও মুভি
2. PET-CT fusion + SUV
3. মাপ সেভ/লোড (JSON → DICOM SR)
4. Image filter
5. URL / DICOMweb দিয়ে খোলা

**ধাপ H: বিশেষায়িত (চাহিদা থাকলে)**
- SEG/RTSTRUCT, STL export, DSA, time-intensity curve, curved MPR

## ৬. ঝুঁকি ও নীতি

- **"No upload" নীতি:** কোনো feature যেন চুপিচুপি ফাইল বাইরে না পাঠায়। DICOMweb বা URL দিয়ে খোলা হবে শুধু ব্যবহারকারী নিজে URL দিলে।
- **Anonymization সম্পূর্ণ হতে হবে:** শুধু নাম মুছলে হবে না। Private tag, তারিখ, UID বদলানো, আর **ছবির পিক্সেলে লেখা নাম (burned-in)**-এর সতর্কবার্তা দিতে হবে। নিখুঁত না হলে "অসম্পূর্ণ হতে পারে" স্পষ্ট লিখতে হবে।
- **মেমোরি:** cine, fusion, MP4 export বড় স্টাডিতে মেমোরি খায়; ফোনে আলাদা সীমা লাগবে (3D-র মতো)।
- **Bundle size:** `dcmjs`, `fflate`, adapters, i18n যোগ হলে প্রথম লোড ভারী হবে; lazy import ব্যবহার করতে হবে।
- **রোগ নির্ণয়ের কাজে নয়:** সব জায়গায় "Not for diagnostic use" লেখা থাকবে। RadiAnt আর MicroDicom-ও তাই লেখে।

## সূত্র

- RadiAnt হোমপেজ: https://www.radiantviewer.com/
- RadiAnt feature তালিকা (manual): https://www.radiantviewer.com/dicom-viewer-manual/radiant_dicom_viewer_features.html
- RadiAnt manual: https://www.radiantviewer.com/dicom-viewer-manual/
- MicroDicom: https://www.microdicom.com/dicom-viewer.html
- Weasis: https://weasis.org/en/
- OHIF: https://ohif.org/ · https://docs.ohif.org/user-guide/
- OsiriX feature: https://www.osirix-viewer.com/resources/technical-sheet/
- MedDream: https://meddream.com/online-dicom-viewer/
- PostDICOM শেয়ারিং: https://australia.postdicom.com/en/products/medical-image-sharing
