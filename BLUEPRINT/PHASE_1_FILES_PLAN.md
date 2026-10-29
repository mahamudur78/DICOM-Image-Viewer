# ফেজ ১: ফাইল খোলা ও ফরম্যাট — বিস্তারিত পরিকল্পনা

> স্ট্যাটাস: সম্পন্ন (commit বাকি) · তারিখ: 2026-10-28 · ব্রাঞ্চ: `feature/phase-1-files`
> মূল রোডম্যাপ: [FULL_FEATURE_ROADMAP.md](FULL_FEATURE_ROADMAP.md#ফেজ-১-ফাইল-খোলা-ও-ফরম্যাট) · আগের ফেজ: [PHASE_0_FOUNDATION_PLAN.md](PHASE_0_FOUNDATION_PLAN.md)

## লক্ষ্য

রোগী বা ডাক্তার যে রূপেই ফাইল পান, viewer যেন সেটা খুলতে পারে:
- ZIP (পাসওয়ার্ডসহ), CD-র ফোল্ডার (DICOMDIR), আর সাধারণ ছবি
- আল্ট্রাসাউন্ড বা এনজিওগ্রামের cine চালানো যায়
- ভিডিও, PDF রিপোর্ট আর SR লেখা দেখা যায়
- হাজার ফাইলের স্টাডিতেও UI জমে যায় না
- কোন ফাইল কেন খোলা গেল না, তা পরিষ্কার জানানো হয়

## যাচাই করা API ও লাইব্রেরি

| দরকার | সমাধান | নোট |
|---|---|---|
| ZIP, পাসওয়ার্ড ZIP (ZipCrypto, AES) | `@zip.js/zip.js` 2.24 (BSD-3) | worker-এ unzip; শুধু ZIP পেলে lazy import |
| TIFF | `utif2` 4.1 (MIT) | Chrome/Firefox TIFF ডিকোড করে না; lazy import |
| JPEG/PNG/BMP/GIF/WebP | ব্রাউজারের `createImageBitmap` | GIF-এর প্রথম frame |
| সাধারণ ছবি → viewer | ব্রাউজারেই **Secondary Capture DICOM বানানো** (`src/dicom/writer.ts`) | তাহলে thumbnail, tag, export, anonymize সব একই পথে চলে; ফেজ ৫-এর "ছবি → DICOM"-এও এটা লাগবে |
| CINE | `@cornerstonejs/tools` `utilities.cine.playClip/stopClip` | `framesPerSecond`, `frameTimeVector`, `loop`, `bounce`, `reverse` আছে |
| H.264 ভিডিও | encapsulated stream → `mp4-muxer` 5.2 (MIT) দিয়ে MP4 → `<video>` | DICOM-এ H.264 সাধারণত Annex-B elementary stream, ব্রাউজার সরাসরি চালাতে পারে না; ভেতরে আগে থেকেই MP4 থাকলে সরাসরি |
| MPEG-2, HEVC ভিডিও | ব্রাউজার চালাতে পারে না (HEVC কিছু ডিভাইসে পারে) | স্পষ্ট বার্তা + stream ডাউনলোড (VLC-তে চালানোর জন্য) |
| PDF | `pdfjs-dist` 6.4 (Apache-2.0), lazy | ফোনের Chrome iframe-এ PDF দেখায় না, তাই pdf.js |
| SR | `dicom-parser` দিয়ে content tree | TEXT, CODE, NUM, DATE, TIME, PNAME, UIDREF, CONTAINER, IMAGE reference |
| Enhanced multi-frame (CT/MR) | Per-frame Functional Groups (5200,9230) → Plane Position (0020,9113); Shared (5200,9229) → orientation, spacing | প্রতিটা frame-এর নিজের position |
| Playwright-এ H.264 | Playwright-এর Chromium-এ H.264 নেই | ভিডিও টেস্ট `channel: 'chrome'`-এ (আসল Chrome; CI-তে `playwright install chrome`) |

## ডেটা মডেলের পরিবর্তন

- `Series.kind`: `'image' | 'video' | 'pdf' | 'sr'`। কোন viewport component দেখাবে, তা এটা দিয়ে ঠিক হবে।
- `ImageEntry`-তে নতুন তথ্য:
  - `acquisitionTime`, `fileName` (সাজানোর জন্য)
  - `frameTime` (cine-এর জন্য)
  - `sequenceKey` (sequence ভাগ করার জন্য)
- `LoadResult.issues`: প্রতিটা বাদ পড়া ফাইলের নাম আর কারণ:
  - DICOM না
  - ফাইল ভাঙা বা অসম্পূর্ণ
  - সমর্থিত না
  - ZIP-এর ভুল পাসওয়ার্ড
  - DICOMDIR-এ উল্লেখ থাকলেও ফাইল পাওয়া যায়নি
- নতুন viewport kind: `video`, `pdf`, `sr`। ফেজ ০-এর registry আর command-এ এগুলোর জন্য আলাদা নিয়ম থাকবে।

## টাস্ক (ক্রম অনুযায়ী)

### ১.১ লোডারের কাঠামো ও বড় স্টাডি
- [x] `loadFiles` ভাগ করা:
  - `readHeader`: ফাইলের শুধু শুরুটা পড়বে (প্রথম 256KB); header বড় হলে পুরো ফাইল
  - `classify`: কোন kind
  - `group`: স্টাডি/সিরিজ ভাগ করা
- [x] ভাগে ভাগে পড়া: প্রতি ~২৫টা ফাইল পর UI-কে সময় দেওয়া; আসল অগ্রগতি দেখানো
- [x] বাদ পড়া ফাইলের তালিকা ও কারণ; toast-এ "বিস্তারিত" বোতাম → ডায়ালগে তালিকা
- [x] Cornerstone cache-এর সীমা ডিভাইস অনুযায়ী (ফোনে ছোট); সীমা ছাড়ালে পুরনো ছবি ফেলে দেওয়া Cornerstone নিজেই করে — যাচাই
- [x] পারফরম্যান্স: ২০০০ ফাইলের synthetic স্টাডি খোলার সময় মাপা, UI সাড়া দেয় কিনা (E2E-তে)
- [x] একই ফাইল দুবার দিলে (SOP Instance UID একই) একবারই দেখানো
- [x] **Specific Character Set (0008,0005)** মেনে লেখা পড়া: UTF-8 (ISO_IR 192), Latin-1/2/5, Cyrillic, Arabic, Greek, Hebrew, Thai, জাপানি/চীনা/কোরিয়ান (ISO 2022, GB18030, GBK)। এখন সব লেখা Latin-1 ধরে পড়া হয়, তাই অ-ইংরেজি নাম ভাঙা দেখায়। *(কাজ করার সময় পাওয়া ঘাটতি)*

### ১.২ ZIP
- [x] `.zip` ফাইল চেনা (নাম + `PK\x03\x04` signature); ফোল্ডারের ভেতরের ZIP-ও
- [x] ZIP-এর ভেতরের ফোল্ডার, nested ZIP (এক স্তর পর্যন্ত, zip bomb ঠেকাতে সীমা: মোট ফাইল আর মোট আকার)
- [x] পাসওয়ার্ড ZIP: পাসওয়ার্ড চাওয়ার ডায়ালগ; ভুল হলে আবার চাওয়া; বাতিল করলে সেই ZIP বাদ (issue)
- [x] Unzip worker-এ; অগ্রগতি দেখানো

### ১.৩ DICOMDIR
- [x] DICOMDIR পার্স: রোগী → স্টাডি → সিরিজ → ফাইল (Referenced File ID)
- [x] ফোল্ডারে DICOMDIR থাকলে শুধু উল্লেখিত ফাইলগুলো পড়া (বাড়তি ফাইল বাদ); পাথ মেলানোর সময় বড়/ছোট হাতের অক্ষর আর `;1` (ISO 9660) উপেক্ষা
- [x] উল্লেখিত কিন্তু না-পাওয়া ফাইলের issue
- [x] শুধু DICOMDIR ফাইল খুললে (অন্য ফাইল ছাড়া) বার্তা: "পুরো CD ফোল্ডারটা খুলুন"
- [x] ফাইলের পাথ মনে রাখা (ড্রপ করা ফোল্ডার আর `webkitdirectory` দুটোতেই)

### ১.৪ সাধারণ ছবি
- [x] `src/dicom/writer.ts`: TypeScript DICOM writer (`scripts/dicom-writer.mjs`-এর মতো)
- [x] JPEG/PNG/BMP/GIF/WebP → RGB → Secondary Capture DICOM (মেমোরিতে); রোগীর নাম ফাঁকা, বর্ণনা = ফাইলের নাম
- [x] TIFF (`utif2`, lazy), বহু-পাতার TIFF → multi-frame
- [x] একই ফোল্ডার/একসাথে দেওয়া সাধারণ ছবিগুলো একটা "Imported images" স্টাডিতে, ফাইল প্রতি একটা সিরিজ
- [x] এখনকার `collectFiles`-এর jpg/png বাদ দেওয়ার নিয়ম বদলানো (CD-র autorun ছবি? → DICOMDIR থাকলে শুধু উল্লেখিত ফাইল, তাই সমস্যা নেই)

### ১.৫ Multi-frame
- [x] Enhanced CT/MR/XA: প্রতিটা frame-এর position/orientation/spacing ফাংশনাল গ্রুপ থেকে (`imagePlaneMetadata`)
- [x] Frame time (0018,1063), frame time vector (0018,1065), cine rate (0018,0040), recommended display frame rate (0008,2144)
- [x] NM multi-frame (detector/rotation): frame হিসেবে দেখানো
- [x] Enhanced multi-frame-এ MPR চালু করা যায় কিনা যাচাই; না গেলে কারণসহ আগের মতো বন্ধ

### ১.৬ Multi-sequence ভাগ
- [x] একটা সিরিজের ভেতরে orientation, ছবির মাপ, echo time, b-value বা image type আলাদা হলে আলাদা display set বানানো (নাম: "বর্ণনা (১/২)")
- [x] Cine/dynamic (একই position, ভিন্ন সময়) ভাগ হবে না

### ১.৭ সাজানোর বিকল্প
- [x] Instance number (ডিফল্ট), slice position, acquisition time, ফাইলের নাম
- [x] সিরিজ-ভিত্তিক; viewport-এর ডান-ক্লিক মেনু থেকে বদলানো; বদলালে viewport আবার লোড হয়

### ১.৮ CINE
- [x] Viewport-এ cine নিয়ন্ত্রণ (>১ ছবি থাকলে): play/pause, FPS (১–৬০), loop / bounce
- [x] ডিফল্ট FPS DICOM থেকে (frame time / cine rate), না থাকলে ১৫ (CT/MR stack-এ ১০)
- [x] কিবোর্ড: Space = play/pause; `[` / `]` = FPS কমানো/বাড়ানো
- [x] "সব চালাও": দৃশ্যমান সব cine viewport একসাথে
- [x] Series/লেআউট বদলালে বা viewport সরালে cine বন্ধ (memory leak নেই)
- [x] মোবাইলে নিয়ন্ত্রণ ছোট কিন্তু ছোঁয়ার মতো বড়

### ১.৯ রঙিন ছবি
- [x] RGB (planar 0 ও 1), YBR_FULL, YBR_FULL_422, PALETTE COLOR — sample দিয়ে যাচাই
- [x] রঙিন ছবিতে W/L preset ড্রপডাউন না দেখানো (শুধু CT-তে দেখায়, আগের মতো) ও invert কাজ করে

- [x] **পুরো একরঙা ছবি** (যেমন খালি frame): min = max হলে W/L-এর প্রস্থ শূন্য হয়, আর vtk console-এ "zero width color range" error দেয়। প্রস্থ কমপক্ষে ১ রাখা। *(কাজ করার সময় পাওয়া ঘাটতি)*

### ১.১০ ভিডিও
- [x] Transfer syntax চেনা: MPEG-2 (`.100`, `.101`), H.264 (`.102`–`.106`), HEVC (`.107`, `.108`)
- [x] Encapsulated fragment জোড়া দিয়ে stream বের করা
- [x] MP4 container হলে সরাসরি; Annex-B H.264 হলে `mp4-muxer` দিয়ে MP4 (SPS/PPS → avcC, NAL → AVCC, IDR = keyframe, সময় frame rate থেকে)
- [x] `video` viewport: `<video>` + নিজের নিয়ন্ত্রণ (play/pause, সময়, গতি ০.২৫–২×, loop), ফ্রেম বাই ফ্রেম (←/→)
- [x] চালানো না গেলে: কারণ + "ভিডিও ডাউনলোড করুন" (.mpg/.h264/.hevc)
- [x] Sidebar thumbnail: প্রথম frame (চালানো গেলে), নইলে 🎬 চিহ্ন

### ১.১১ PDF
- [x] Encapsulated PDF (0042,0011) বের করা; MIME type যাচাই
- [x] `pdf` viewport: pdf.js দিয়ে পাতা ক্যানভাসে, স্ক্রল, zoom (fit width / +/-), পাতা নম্বর
- [x] ডাউনলোড বোতাম (মূল PDF)
- [x] Thumbnail: প্রথম পাতা বা 📄

### ১.১২ SR (structured report) লেখা হিসেবে
- [x] Content tree পার্স (CONTAINER → children; TEXT, CODE, NUM+unit, DATE, TIME, DATETIME, PNAME, UIDREF, IMAGE, COMPOSITE)
- [x] `sr` viewport: শিরোনাম, নিচে nested অংশ; লম্বা লেখা ভাঙবে; completion/verification flag
- [x] IMAGE reference থাকলে "সেই ছবি দেখাও" লিংক (একই স্টাডিতে থাকলে) — মাপ আঁকা ফেজ ৮-এ

### ১.১৩ একাধিক রোগী/স্টাডি
- [x] Sidebar: রোগী → স্টাডি → সিরিজ গাছ; ভাঁজ করা যায়; সিরিজ সংখ্যা
- [x] খোঁজার বাক্স: রোগীর নাম/ID, স্টাডি/সিরিজের বর্ণনা, modality
- [x] ফোনে (আনুভূমিক strip) রোগী/স্টাডি বদলানোর সহজ উপায়
- [x] Hanging protocol: প্রথম রোগীর প্রথম স্টাডি আগে

### ১.১৪ Test data ও টেস্ট
- [x] `generate-samples.mjs`-এ যোগ:
  - enhanced CT (per-frame position)
  - palette color, RGB planar 1
  - H.264 (Annex-B) ভিডিও, MP4-ভরা ভিডিও, MPEG-2 ভিডিও (ffmpeg দিয়ে)
  - PDF, SR
  - DICOMDIR-সহ CD ফোল্ডার
  - ZIP, nested ZIP, ZipCrypto ও AES পাসওয়ার্ড ZIP
  - JPEG/PNG/TIFF ছবি
  - ২০০০ ফাইলের বড় স্টাডি (আলাদা স্ক্রিপ্ট/ফ্ল্যাগ)
  - দ্বিতীয় রোগী
- [x] `scripts/dicom-writer.mjs`-এ encapsulated pixel data লেখা
- [x] Unit test: DICOMDIR পার্স, পাথ মেলানো, sequence key, সাজানো, SR tree, Annex-B → AVCC, frame rate বের করা, writer
- [x] E2E: প্রতিটা ফরম্যাট (উপরের সব), cine (play → index বদলায় → pause), ভিডিও (Chrome channel), PDF, SR, পাসওয়ার্ড ডায়ালগ, issue ডায়ালগ, sidebar খোঁজা, মোবাইল

### ১.১৫ সমাপ্তি
- [x] build, lint, unit, E2E (dev + prod), size সবুজ; নতুন lazy chunk-এর বাজেট
- [x] ব্রাউজারে হাতে দেখা (ডেস্কটপ + মোবাইল), স্ক্রিনশট
- [x] README, TEST_DATA.md, এই ফাইল, রোডম্যাপ
- [ ] Commit শুধু ব্যবহারকারী বললে

## ঝুঁকি

| ঝুঁকি | প্রতিকার |
|---|---|
| ZIP bomb / বিশাল ZIP | মোট ফাইল সংখ্যা ও আকারের সীমা, ছাড়ালে থামা ও জানানো |
| বড় header (enhanced MF) প্রথম 256KB-এ না আঁটা | পার্স ব্যর্থ হলে পুরো ফাইল দিয়ে আবার |
| H.264 stream-এর ধরন (Annex-B বনাম MP4) vendor ভেদে আলাদা | দুটোই সামলানো; ব্যর্থ হলে ডাউনলোড |
| Playwright Chromium-এ H.264 নেই | ভিডিও টেস্ট Chrome channel-এ; না থাকলে skip (কারণ লেখা) |
| pdf.js বড় | শুধু PDF খুললে lazy load; worker আলাদা ফাইল |
| ভুল sequence ভাগ (একই সিরিজ অকারণে ভাগ হওয়া) | সতর্ক key; cine/dynamic ভাগ নয়; phantom-এর CT ভাগ হয় না তা টেস্টে |

---

## বাস্তবায়নের নোট

**নতুন বা বদলানো ফাইল**

| ফাইল | কাজ |
|---|---|
| `src/dicom/loadFiles.ts` | পুরো লোডার: ZIP → DICOMDIR → একসাথে ৮টা ফাইলের header → সাধারণ ছবি → স্টাডি/সিরিজ, sequence ভাগ, duplicate বাদ |
| `src/dicom/collectFiles.ts` | `SourceFile { file, path }`: ড্রপ করা ফোল্ডার ও `webkitdirectory`-এর পাথ |
| `src/dicom/fileType.ts` | প্রথম ১৩২ byte দেখে DICOM / ZIP / ছবির ধরন |
| `src/dicom/header.ts` | শুধু শুরুর 256KB পড়া (দরকারে পুরো), raw dataset, **Specific Character Set** decode |
| `src/dicom/frames.ts` | Enhanced multi-frame-এর functional group (position, orientation, spacing, echo, b-value, W/L, rescale) |
| `src/dicom/zip.ts`, `dicomdir.ts`, `imageImport.ts`, `writer.ts` | ZIP (zip.js), DICOMDIR, ছবি → SC DICOM, DICOM writer |
| `src/dicom/sr.ts`, `pdf.ts`, `studyTree.ts` | SR tree, PDF বের করা, রোগী অনুযায়ী ভাগ ও খোঁজা |
| `src/video/h264.ts`, `dicomVideo.ts` | Annex-B → frame, POC থেকে দেখানোর ক্রম, avcC, MP4 (mp4-muxer) |
| `src/store/cineStore.ts`, `components/CineControls.tsx`, `useCinePlayback.ts` | CINE |
| `components/VideoViewer.tsx`, `PdfViewer.tsx`, `SrViewer.tsx`, `ViewportFrame.tsx` | non-image viewport (lazy) |
| `src/dialogs/` | পাসওয়ার্ড আর "যে ফাইল খোলা যায়নি" ডায়ালগ |
| `src/thumbnails/documentThumbnails.ts` | PDF-এর প্রথম পাতা আর ভিডিওর একটা frame, শুধু দেখা গেলে তৈরি |

**পরিকল্পনা থেকে যা বদলেছে, ও কেন**
- **ZIP worker-এ নয়:** zip.js-এর worker pool Chromium-এ ৮টার বেশি entry হলে আটকে যায় (পরীক্ষায় ধরা পড়েছে)। তাই `useWebWorkers: false` রাখা হয়েছে। Inflate তবুও ব্রাউজারের নিজস্ব `DecompressionStream`-এ main thread-এর বাইরে চলে, আর AES খোলে WebCrypto।
- **DICOMDIR:** শুধু Referenced File ID ব্যবহার হয়, কোন ফাইল পড়া হবে তা ঠিক করতে। রোগী/স্টাডি/সিরিজের গাছ বানানো হয় ফাইলের header থেকেই, তাই DICOMDIR-এর record দুবার পড়ার দরকার পড়ে না।
- **বহু-পাতার TIFF:** প্রতিটা পাতা একই সিরিজের আলাদা instance হয় (multi-frame নয়)। দেখতে আর চালাতে একই রকম, export-ও সহজ।
- **Sequence key-তে image type নেই:** ORIGINAL/DERIVED-এর মতো ছোট পার্থক্যে অকারণে ভাগ হয়ে যেত। Orientation, মাপ, echo time আর b-value যথেষ্ট।
- **ডিফল্ট FPS-এর নিয়ম:** header-এ না থাকলে orientation-ওয়ালা cross-sectional সিরিজে ১০, বাকিগুলোয় (US, XA) ১৫। Multi-frame কিনা দেখে ঠিক করা হয় না, কারণ enhanced CT-ও multi-frame।
- **PDF MIME type:** আলাদা করে যাচাই করা হয় না, কারণ ধরন ঠিক হয় SOP class (Encapsulated PDF) দেখে। CDA-এর মতো অন্য encapsulated document-এর SOP class আলাদা।
- **SR-এর "Show image":** একই স্টাডি নয়, খোলা যে কোনো স্টাডিতে ছবিটা খোঁজে। পাশের cell-এ খোলে, দরকারে 1×2 লেআউটে যায়।
- **মোট JS বাজেট ১৩০০ থেকে ১৯০০ KB:** pdf.js ও তার worker (প্রায় ৪৯০ KB), zip.js, UTIF আর mp4-muxer শুধু সেই ধরনের ফাইল খুললে নামে। প্রথম পাতা এখনো ৯৪ KB। size স্ক্রিপ্ট এখন `.mjs` ফাইলও গোনে, আগে pdf worker হিসাবের বাইরে ছিল।

**কাজের সময় পাওয়া ঘাটতি (ঠিক করা হয়েছে)**
- অ-ইংরেজি নাম ভাঙা দেখাত, কারণ Specific Character Set মানা হতো না। এখন UTF-8, ISO 8859-এর সব সেট, জাপানি, চীনা আর কোরিয়ান decode হয়।
- পুরো একরঙা ছবিতে W/L-এর প্রস্থ ০ হতো, আর vtk error দিত। এখন প্রস্থ কমপক্ষে ১।
- Enhanced CT-এর W/L আর rescale loader পড়ত না (functional group-এ থাকে)। এখন একটা metadata provider (priority 100) দেয়।
- Raw dataset (DICM ছাড়া) ১৩২ byte-এর ছোট হলে পার্স ব্যর্থ হতো।
- Toolbar-এ PDF/SR-এর সময় খালি অংশ আর নিষ্ক্রিয় "Download PNG" দেখাত।
- বোতামওয়ালা toast ("Details") নিজে থেকে বন্ধ হয়ে যেত। এখন ব্যবহারকারী বন্ধ না করা পর্যন্ত থাকে।

**পরীক্ষা**
- Unit: ৬৩টা। নতুন: parse, sort, SR, DICOMDIR, charset, frames, sniff, H.264, cine store, study tree, toast।
- H.264-এর unit test-এ আমাদের বানানো MP4 ffmpeg দিয়ে পুরো ডিকোড হয়: ৫০টা frame, কোনো error নেই, B-frame থাকা সত্ত্বেও।
- E2E: ৩৭টা। dev server আর production build দুটোতেই সবুজ।
  - দুটো `@chrome` ভিডিও টেস্ট আসল Google Chrome-এ চলে, কারণ Playwright-এর Chromium-এ H.264 নেই।
  - ১টা touch টেস্ট শুধু mobile project-এ চলে।
- পারফরম্যান্স: ২০০০টা ফাইল ৪.৮ সেকেন্ডে খোলে, লোডের মাঝে অগ্রগতির সংখ্যা ১৭ বার বদলায়।
- স্ক্রিনশটে হাতে দেখা: ডেস্কটপ (sidebar গাছ, cine, SR, PDF, issue ডায়ালগ) আর ফোন। ফোনে cine বোতাম কালো ছবিতে মিশে যাচ্ছিল, তাই হালকা সীমারেখা যোগ করা হয়েছে।

**শেখা বিষয়**
- Vite dev server প্রথম চালুর পর একসাথে ৫টা ব্রাউজার বিশাল runtime চাইলে ১৫ সেকেন্ডের বেশি লাগতে পারে। E2E-তে প্রথমবার ফাইল খোলার জন্য ৬০ সেকেন্ড অপেক্ষা রাখা হয়েছে (`OPEN_TIMEOUT`)। Production build-এ এই দেরি নেই।
- নতুন নির্ভরতা `optimizeDeps.include`-এ না থাকলে dev server মাঝপথে নতুন করে bundle করে।
- Headless Google Chrome (macOS)-এ animation frame কম চলে, তাই Playwright-এর ক্লিক "স্থির" হওয়ার অপেক্ষায় আটকে যেতে পারে। ভিডিও টেস্ট তাই কিবোর্ড দিয়ে চালানো হয়।

**যা যাচাই করা হয়নি**
- NM multi-frame: US cine-এর একই পথে চলে, কিন্তু NM নমুনা দিয়ে আলাদা যাচাই হয়নি।
- HEVC ভিডিও: MP4-এ থাকলে চলার কথা, Annex-B হলে ডাউনলোডের বিকল্প দেয়। কোনো নমুনা নেই, কারণ ffmpeg-এর HEVC encoder (libx265) এই মেশিনে যাচাই করা হয়নি।
- রঙিন ছবিতে invert, আর Cornerstone cache ভরে গেলে পুরনো ছবি ফেলে দেওয়া — চাপ দিয়ে পরীক্ষা হয়নি।
- আসল ফোন আর Safari/Firefox — ফেজ ১২-এ।
- CI (GitHub Actions) — push না হওয়া পর্যন্ত চলেনি।
