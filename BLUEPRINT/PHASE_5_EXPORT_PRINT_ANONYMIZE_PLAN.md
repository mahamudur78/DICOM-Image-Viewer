# ফেজ ৫: Export, প্রিন্ট ও anonymize — বিস্তারিত পরিকল্পনা

> স্ট্যাটাস: সম্পন্ন (commit-এর অপেক্ষায়) · তারিখ: 2026-10-29 · ব্রাঞ্চ: `feature/phase-5-export-print-anonymize`
> মূল রোডম্যাপ: [FULL_FEATURE_ROADMAP.md](FULL_FEATURE_ROADMAP.md#ফেজ-৫-export-প্রিন্ট-ও-anonymize) · আগের ফেজ: [PHASE_4_COMPARISON_SYNC_PLAN.md](PHASE_4_COMPARISON_SYNC_PLAN.md)

## লক্ষ্য

ছবি, মুভি, প্রিন্ট/PDF, tag আর মূল DICOM বের করে নেওয়া। DICOM edit আর anonymize করা, সাধারণ ছবি ও PDF-কে DICOM-এ রূপান্তর। সব কাজ ব্রাউজারেই হয়, কিছু আপলোড হয় না।

## নকশার সিদ্ধান্ত

| বিষয় | সমাধান |
|---|---|
| কোড কোথায় | নতুন ফোল্ডার `src/export/`। ভারী অংশ (ZIP লেখা, encoder, dcmjs) প্রথমবার ব্যবহারের সময় লোড হয় (lazy chunk)। |
| ছবি বানানো | দুই রকম: **স্ক্রিনের মতো**: viewport-এর canvas + annotation-এর SVG + (চাইলে) রোগী/স্টাডির লেখা, আমরা নিজেরাই canvas-এ আঁকি; privacy চালু থাকলে নাম/ID বাদ যায়। **মূল পিক্সেল মাপে**: একই W/L, invert, colormap দিয়ে একটা offscreen viewport-এ ছবির আসল মাপে রেন্ডার। |
| ফরম্যাট | PNG, JPEG (মান বাছাই), WebP হয় `canvas.toBlob` দিয়ে; BMP (২৪-বিট) আর TIFF (RGB, uncompressed) নিজের ছোট encoder, test-সহ। |
| কী export হবে | এখনকার viewport, পুরো সিরিজ, সব দৃশ্যমান viewport, বা সিরিজের নির্দিষ্ট পরিসর (যেমন ৩–১০) |
| একাধিক ছবি | zip.js দিয়ে ZIP (আগে থেকেই আছে) |
| মুভি | **MP4**: WebCodecs `VideoEncoder` (H.264, না থাকলে VP9) + mp4-muxer। **WebM**: VP8/VP9 + `webm-muxer` (ছোট লাইব্রেরি, mp4-muxer-এর লেখকের)। **GIF**: নিজের encoder (LZW; grayscale ছবির জন্য ২৫৬ ধূসর রং, রঙিনের জন্য 6×6×6 + ধূসর)। **AVI**: নিজের MJPEG AVI (RIFF) writer। **WMV** ব্রাউজারে সম্ভব নয় (Microsoft-এর বন্ধ codec) — নোটে কারণ। |
| Clipboard | Ctrl+C (লেখা সিলেক্ট না থাকলে) → `ClipboardItem` PNG। "অংশ ক্যাপচার": viewport-এর উপর আয়তক্ষেত্র টেনে কপি বা ডাউনলোড। |
| মূল DICOM | সিরিজ/স্টাডি/সব-এর ফাইল নিজেদের নামসহ ZIP-এ |
| প্রিন্ট | প্রিন্ট ডায়ালগ: ছবি/পাতা (১, ২, ৪, ৬, ৯, ১২), পাতার সাইজ (A4, Letter), দিক, হেডার/ফুটার, true size। প্রিন্টের জন্য আলাদা DOM + `@page` CSS + `window.print()`। |
| PDF | নিজের ছোট PDF writer: JPEG ছবি (DCTDecode) + Helvetica লেখা, একই লেআউট; true size হলে mm মেপে বসানো। বিশুদ্ধ মডিউল, test-সহ। |
| Tag | Tag প্যানেলে export (TXT/CSV/JSON; একটা ফাইল বা পুরো সিরিজ), nested sequence, প্রিয় tag উপরে পিন (settings), দুই ফাইলের diff |
| Tag edit | **dcmjs** (lazy): পড়া → naturalized dataset → মান বদলানো, যোগ, মুছা → লেখা। নতুন SOP Instance UID ঐচ্ছিক। ডাউনলোড। |
| Anonymize | নিজের PS3.15 Basic Profile টেবিল (D/Z/X/K/U action) dcmjs-এর dataset-এ প্রয়োগ। বিকল্প: তারিখ রাখা, UID নতুন (একই রানে একই map), private tag মোছা, বর্ণনা রাখা, নতুন নাম/ID। Template settings-এ। পরিধি: ফাইল/সিরিজ/স্টাডি/সব → ZIP। রিপোর্ট: কোন tag কী হলো। |
| Burned-in | `BurnedInAnnotation = YES`, বা US/SC/ES/XC/OT হলে সতর্কতা। ফেজ ৩-এর redaction box থাকলে anonymize-এর সময় সেই পিক্সেলগুলো কালো করা হয় (uncompressed করে লেখা)। |
| রূপান্তর | সাধারণ ছবি → SC DICOM (আছে `imageImport.ts`; ডায়ালগে রোগী/স্টাডির তথ্য); PDF → encapsulated PDF DICOM; compressed → uncompressed (Cornerstone-এর decode করা পিক্সেল দিয়ে explicit VR LE)। উল্টো (uncompressed → compressed) ঐচ্ছিক, বাদ রাখা হলো। |

## টাস্ক

### ৫.১ ছবি export
- [x] Render: স্ক্রিনের মতো (annotation, লেখা, privacy) আর মূল পিক্সেল মাপে
- [x] Encoder: PNG, JPEG (মান), WebP, BMP, TIFF
- [x] পরিধি: viewport, সিরিজ (পরিসর), সব দৃশ্যমান viewport; একাধিক → ZIP
- [x] Export ডায়ালগ (মনে থাকে)
- [x] MPR আর 3D viewport-ও (স্ক্রিনের মতো)

### ৫.২ মুভি
- [x] MP4 (H.264, না থাকলে VP9), WebM, GIF, AVI (MJPEG)
- [x] fps, স্ক্রিন/মূল মাপ, লেখা সহ বা ছাড়া; অগ্রগতি দেখানো, বাতিল করা যায়
- [x] WMV না থাকার কারণ ডায়ালগে আর নোটে

### ৫.৩ Clipboard ও অংশ ক্যাপচার
- [x] Ctrl+C → এখনকার viewport-এর ছবি clipboard-এ
- [x] অংশ সিলেক্ট করে কপি বা PNG

### ৫.৪ মূল DICOM export
- [x] সিরিজ, স্টাডি, সব → ZIP

### ৫.৫ প্রিন্ট ও PDF
- [x] প্রিন্ট ডায়ালগ: ছবি/পাতা, সাইজ, দিক, হেডার/ফুটার, true size, উৎস (viewport, সিরিজ, দৃশ্যমান সব)
- [x] ব্রাউজারে প্রিন্ট
- [x] PDF ফাইল

### ৫.৬ DICOM tag
- [x] Export TXT/CSV/JSON (ফাইল বা সিরিজ), sequence সহ
- [x] প্রিয় tag পিন
- [x] দুই ফাইলের diff
- [x] Tag edit → নতুন ফাইল ডাউনলোড (dcmjs)

### ৫.৭ Anonymization
- [x] Basic Profile টেবিল (বিশুদ্ধ, test-সহ) আর বিকল্প
- [x] Template সেভ/বাছাই
- [x] ফাইল/সিরিজ/স্টাডি/সব → ZIP, অগ্রগতি
- [x] Burned-in সতর্কতা, redaction পিক্সেলে প্রয়োগ
- [x] রিপোর্ট

### ৫.৮ রূপান্তর
- [x] ছবি → SC DICOM (তথ্যসহ, অনেক একসাথে)
- [x] PDF → encapsulated PDF DICOM
- [x] Compressed → uncompressed

### ৫.৯ পরীক্ষা ও সমাপ্তি
- [x] Unit: BMP/TIFF/GIF/AVI/PDF encoder, anonymize নিয়ম, UID map, tag export, diff
- [x] E2E: প্রতিটা export, মুভি (Chrome-এ MP4), clipboard, প্রিন্ট পাতা, PDF, tag export/diff/edit, anonymize (ফলাফল আবার খুলে যাচাই), রূপান্তর, মোবাইল
- [x] dev + prod; বাজেট (নতুন chunk lazy); README, এই ফাইল, রোডম্যাপ
- [ ] Commit শুধু ব্যবহারকারী বললে

## ঝুঁকি

| ঝুঁকি | প্রতিকার |
|---|---|
| dcmjs বড় | শুধু edit/anonymize-এর সময় lazy লোড; বাজেট দরকার হলে নোটসহ বাড়ানো |
| Playwright-এর Chromium-এ H.264 encoder নেই | VP9-এ MP4; H.264 পরীক্ষা Chrome project-এ |
| মূল মাপে রেন্ডার বড় ছবিতে ধীর | offscreen viewport একটাই, ছবি একে একে; অগ্রগতি + বাতিল |
| Anonymize-এ PHI থেকে যাওয়া | Basic Profile টেবিল test-এ বাঁধা; private tag ডিফল্টে মোছা; burned-in সতর্কতা; রিপোর্ট |
| ব্রাউজারের প্রিন্ট ভিন্ন | CSS `@page` সাইজ; PDF বিকল্প সবসময় একই রকম |

## বাস্তবায়নের নোট

**গঠন** (`src/export/`):
- `encoders/`: BMP, TIFF, GIF (LZW), AVI (MJPEG), PDF; সবগুলো বিশুদ্ধ, test-সহ।
  - TIFF যাচাই হয় utif2 দিয়ে উল্টো পড়ে।
  - GIF-এর LZW একটা সাধারণ decoder দিয়ে যাচাই হয়, আর E2E-তে ব্রাউজার নিজে GIF খুলে দেখে।
  - PDF-এর xref offset test-এ মেলানো হয়।
- `render.ts`: স্ক্রিনের মতো ছবি বানানো আর লুকানো export viewport।
- `exportImages.ts`: ছবি ও মুভি।
- `layout.ts` + `print.ts`: প্রিন্ট আর PDF।
- `anonymize.ts`: Basic Profile টেবিল, বিশুদ্ধ, dcmjs দিয়ে Node-এ test।
- `dicomValues.ts`, `dicomEdit.ts`, `convert.ts`, `jobs.ts`, `ExportDialogs.tsx` (lazy), `RegionCapture.tsx`।
- Tag-এর সারি ও diff আছে `src/dicom/tagRows.ts`-এ, test-সহ।

**Render:**
- এখনকার ছবি বানাতে viewport-এর নিজের canvas ব্যবহার হয়। তার উপর আঁকা হয়:
  - DICOM overlay (`drawOverlayPlanes`, `DicomOverlayLayer` থেকে আলাদা করা)
  - Cornerstone-এর annotation SVG (serialize করে ছবি হিসেবে)
  - redaction (সবসময় কালো)
  - চাইলে কোণের লেখা (privacy মানে)
- সিরিজ বা মূল মাপের ছবির জন্য পর্দার বাইরে একটা লুকানো stack viewport থাকে।
  - সেটা একই tool group-এ, তাই annotation-ও আঁকা হয়।
  - W/L, invert, colormap আর (স্ক্রিন মোডে) view presentation একই রাখা হয়।
  - পর্দার viewport নড়ে না। sync আর reference line-এ এটা যোগ হয় না।

**মুভি:**
- MP4 আর WebM: WebCodecs `VideoEncoder` + mp4-muxer / webm-muxer।
  - MP4-এ H.264, না থাকলে VP9। Playwright-এর Chromium-এ H.264 encoder নেই; MP4 test চলে Chrome project-এ।
- GIF-এর palette নির্দিষ্ট: ধূসর ছবিতে ২৫৬ ধূসর, রঙিনে 6×6×6 + ৪০ ধূসর; dithering নেই। সবচেয়ে লম্বা দিক ১০২৪ পর্যন্ত।
- AVI = MJPEG।
- WMV সম্ভব নয়: Microsoft-এর codec ব্রাউজারে নেই। ডায়ালগেও এটা বলা আছে।

**প্রিন্ট ও PDF:**
- লেআউট mm-এ; true size হলে মূল মাপে রেন্ডার আর pixel spacing দিয়ে mm মাপা হয়, পাতায় না ধরলে fit।
- হেডার আর ফুটার canvas-এ লেখা ছবি হিসেবে বসে, কারণ PDF-এর Helvetica শুধু Latin-1; এভাবে বাংলা নামও ঠিক আসে।
- প্রিন্টে `#print-root` + `@page` CSS দিয়ে আলাদা পাতা হয়, প্রিন্টের পর মুছে যায়। E2E-তে `window.print` stub করা হয়।

**dcmjs:**
- Cornerstone (`@cornerstonejs/metadata`) আগে থেকেই dcmjs 0.52.0 বান্ডল করে।
- প্রথমে 0.52.2 নিয়েছিলাম; তাতে দুটো কপি হয়ে runtime chunk ১৮০ KB বেড়ে বাজেট ছাড়িয়েছিল।
- একই 0.52.0 বেঁধে দেওয়ায় এখন একটাই কপি, edit/anonymize প্রায় বিনা খরচে।
- dcmjs-এর type নেই, তাই `src/types/dcmjs.d.ts` লেখা হয়েছে।
- মান বদলালে `_rawValue` বাদ দিতে হয়; নইলে dcmjs পুরনো মান লেখে।

**Anonymize:**
- PS3.15 Table E.1-1-এর দৈনন্দিন ছবির সারিগুলো আছে: রোগী, মানুষ ও জায়গা, তারিখ, UID। sequence-এর ভেতরেও একই নিয়ম চলে।
- Private tag ডিফল্টে মোছা হয়। UID-গুলো এক রানে একই map দিয়ে বদলায়, তাই স্টাডি আর রেফারেন্স ঠিক থাকে। Meta header-এর UID-ও বদলায়।
- `PatientIdentityRemoved` = YES আর De-identification Method দেওয়া হয়।
- Redaction box পিক্সেলে পোড়ানো হয়; compressed ছবি আগে uncompressed করা হয়। পোড়ানোর পর `BurnedInAnnotation` = NO।
- `report.csv`-এ পুরনো মান লেখা হয় না, কারণ সেগুলোই রোগীকে চিনিয়ে দেয়।

**রূপান্তর:**
- Compressed → uncompressed: image loader-কে pre-scaling ছাড়া দিয়ে কাঁচা মান নেওয়া হয়, তারপর explicit VR LE-তে লেখা।
- রঙিন ছবি RGB, interleaved হয়ে যায়।
- নতুন নমুনা RLE Lossless (generator-এ নিজের PackBits encoder)।

**শর্টকাট:** Ctrl+C (লেখা সিলেক্ট না থাকলে) ছবি কপি করে, Ctrl+S ছবি export, Ctrl+P প্রিন্ট।

**ফল:**
- Unit test ১১৯টা পাস (নতুন: encoder, layout, tag rows, anonymize, dicom values)।
- E2E dev আর prod দুটোতেই ৮৬টা পাস + ১টা skip (আগের password ZIP টেস্ট)।
  - নতুন `e2e/export.spec.ts`-এ ১২টা টেস্ট: Chrome-এর MP4 আর মোবাইলেরটা সহ।
- Initial JS ১০১.২ KB, runtime chunk ৯৯৬.৯ KB, মোট ১৮৬৭.৫ KB। কোনো বাজেট বাড়াতে হয়নি।

**যা বাকি বা সীমিত:**
- Uncompressed → compressed (JPEG ইত্যাদি) রূপান্তর করা হয়নি।
- Tag edit শুধু উপরের স্তরের লেখা/সংখ্যার tag বদলায়; sequence আর binary বদলায় না।
- Basic Profile-এর সব ~৪০০ সারি নেই, দৈনন্দিন ছবির সারিগুলো আছে। পিক্সেলে লেখা থাকলে তা নিজে থেকে খোঁজা হয় না; সতর্কতা আর redaction দিয়ে হাতে করতে হয়।
- Export ডায়ালগ প্রতিবার খুললে ছবির পরিসর আবার পুরো সিরিজ হয়ে যায়; অন্য পছন্দ মনে থাকে।
- বাংলা অনুবাদ ফেজ ১০-এ।
