# পরীক্ষার ডেটা (Test data)

> শেষ আপডেট: 2026-10-28 · সম্পর্কিত: [PHASE_0_FOUNDATION_PLAN.md](PHASE_0_FOUNDATION_PLAN.md)

**নিয়ম:** আসল রোগীর কোনো ডেটা repo-তে রাখা হবে না। পরীক্ষার সব ডেটা হয় স্ক্রিপ্ট দিয়ে বানানো (synthetic), নয়তো পাবলিক anonymized নমুনা নামানো। তিন ধরনের ডেটাই `e2e/.data/`-এ থাকে, যা gitignored।

## ১. CT phantom: `scripts/generate-phantom.mjs`

`npm run test:e2e` চালালে নিজে থেকে `e2e/.data/phantom`-এ তৈরি হয়। হাতে বানাতে: `node scripts/generate-phantom.mjs <dir>`।

| সিরিজ | কী | কী পরীক্ষা করে |
|---|---|---|
| #1 SCOUT | coronal localizer, ১টা ছবি | hanging protocol (scout আগে), reference line |
| #2 Native | axial, ৪০ slice × 2.5 mm | stack, W/L preset, MPR, 3D |
| #3 +C | axial, contrast-এ aorta উজ্জ্বল | sync, 3D-তে রক্তনালি (CT-AAA) |
| #4 Recon 2 | axial, ২০ slice × 5 mm, lung window | ভিন্ন spacing-এ position-ভিত্তিক sync |

সব সিরিজ একই FrameOfReferenceUID-এ। দেহে পাঁজর, মেরুদণ্ড, sternum, ফুসফুস (একটা nodule সহ) আর বাঁকা aorta আছে।

## ২. বিশেষ ফরম্যাটের নমুনা: `scripts/generate-samples.mjs`

এগুলো `e2e/.data/samples`-এ নিজে থেকে তৈরি হয়। স্ক্রিপ্টের `SAMPLES_VERSION` বদলালে পরের E2E run-এ আবার তৈরি হয়। ভিডিও আর JPEG/BMP/GIF বানাতে ffmpeg লাগে; না থাকলে ওগুলো বাদ যায়, সাথে সতর্কবার্তা দেখায়।

| ফোল্ডার / ফাইল | কী | কী পরীক্ষা করে |
|---|---|---|
| `basic/us_cine.dcm` | US, RGB, ২৪ frame, frame time 50 ms | CINE, header থেকে 20 fps |
| `basic/mr_mixed/` | একই সিরিজে axial T1 + sagittal T2 | sequence ভাগ ("(1/2)", "(2/2)") |
| `basic/pet/` | PET, BQML, ডোজ/half-life/ওজন | ফেজ ২ ও ৭: SUV; SR-এর image reference |
| `basic/dx_no_spacing.dcm` | DX, MONOCHROME1, spacing নেই | ফেজ ৩: calibration |
| `basic/broken.dcm`, `basic/notes.txt` | ভাঙা ফাইল, DICOM না | issue তালিকা ("damaged"), ফোল্ডার থেকে বাদ |
| `enhanced/enhanced_ct.dcm` | Enhanced CT, ১২ frame, position শুধু per-frame group-এ | frame-ভিত্তিক geometry, frame-এর W/L, MPR |
| `color/` | PALETTE COLOR, RGB planar 1, YBR_FULL | রঙ ঠিক আসে কিনা (লাল-সবুজ-নীল) |
| `video/` | H.264 Annex-B, H.264-ভরা MP4, MPEG-2 | MP4-এ রূপান্তর, চালানো (Chrome), MPEG-2 ডাউনলোড |
| `docs/report_pdf.dcm` | Encapsulated PDF (১ পাতা) | pdf.js, zoom, ডাউনলোড, thumbnail |
| `docs/report_sr.dcm` | Comprehensive SR, UTF-8, বাংলা নাম ও লেখা | SR tree, character set, "Show image" |
| `cd/CD/` | DICOMDIR (`;1` পাথসহ), extension ছাড়া ফাইল, একটা না-পাওয়া ফাইল, viewer-এর লোগো | DICOMDIR মেনে চলা, missing issue |
| `zip/` | সাধারণ ZIP (`__MACOSX`-সহ), ZIP-এর ভেতরে ZIP, ZipCrypto, AES (পাসওয়ার্ড `dicom123`) | ZIP খোলা, পাসওয়ার্ড ডায়ালগ |
| `images/` | PNG, JPEG, BMP, GIF, ১×১ WebP, দুই পাতার TIFF | সাধারণ ছবি → Secondary Capture |
| `sort/` | ৫টা slice; instance, position, সময় আর নামের ক্রম আলাদা | সাজানোর চারটা বিকল্প |
| `edge/blank.dcm` | পুরো একরঙা ছবি | শূন্য-প্রস্থ W/L এড়ানো |
| `measure/dx_ermf.dcm` | DX, শুধু Imager Pixel Spacing 0.2 আর ERMF 1.25; 100×100, মাঝে 40×40 বর্গ (মান 1000, বাকি 100) | ERMF-সংশোধিত মাপ (0.16 mm/pixel), ROI পরিসংখ্যান, redaction export |
| `prior/current/`, `prior/prior/` | একই রোগী, ২০২৬ ও ২০২৫-এর দুটো CT স্টাডি; ২০টা axial slice; আলাদা frame of reference, অবস্থান ১০০০ mm সরানো | Add files, prior তুলনা, lock sync, "CT with prior" hanging |
| `measure/us_region.dcm` | US, একই ছবি, পুরোটা জুড়ে একটা region (0.05 cm/pixel) | আল্ট্রাসাউন্ড region calibration |

**বড় স্টাডি:** `scripts/generate-large-study.mjs <dir> [count]` ২০০০টা 64×64 slice বানায় (`e2e/.data/large`)। E2E এটা খুলতে কত সময় লাগে মাপে (2026-10-28: ৪.৮ সেকেন্ড)।

DICOM লেখার সাধারণ কোড আছে `scripts/dicom-writer.mjs`-এ। এটা explicit VR little endian লেখে, আর SQ, encapsulated pixel data ও যে কোনো transfer syntax সমর্থন করে। ব্রাউজারের ভেতরের সমতুল্য কোড `src/dicom/writer.ts`।

## ৩. পাবলিক নমুনা: `scripts/fetch-sample-data.mjs`

`npm run samples:fetch` চালালে `e2e/.data/public`-এ নামে। ইন্টারনেট লাগে, CI-তে চালানো হয় না।

উৎস: [pydicom](https://github.com/pydicom/pydicom) `v3.0.1` (test_files) আর [pydicom-data](https://github.com/pydicom/pydicom-data) (MIT, commit `abc42b9`)। দুটো version pin করা, তাই ফাইল কখনো বদলাবে না। প্রতিটা ফাইলের উৎস আর লাইসেন্স pydicom-এর test_files README-তে আছে। আমরা শুধু লোকালি পরীক্ষার জন্য নামাই; repo-তে রাখি না বা বিতরণ করি না।

| ফাইল | কী | এখনকার অবস্থা (2026-10-28, ফেজ ১-এর পর) |
|---|---|---|
| CT_small.dcm | CT, explicit VR LE | ✅ খোলে |
| MR_small.dcm | MR, explicit VR LE | ✅ খোলে |
| MR_small_jp2klossless.dcm | MR, JPEG 2000 lossless | ✅ খোলে |
| JPEG2000.dcm | NM, JPEG 2000 lossy | ✅ খোলে |
| JPEG-LL.dcm | NM, JPEG lossless | ✅ খোলে |
| SC_rgb.dcm | SC, RGB | ✅ খোলে |
| SC_rgb_rle.dcm | SC, RGB, RLE | ✅ খোলে |
| US1_J2KR.dcm | US, YBR_RCT, JPEG 2000 lossless | ✅ খোলে |
| color3d_jpeg_baseline.dcm | US, রঙিন, ১২০ frame, JPEG baseline | ✅ খোলে (১২০টা frame) |
| emri_small.dcm | MR, ১০ frame | ✅ খোলে |
| liver.dcm | DICOM SEG, ৩ frame | ◐ সাধারণ ছবি হিসেবে খোলে; overlay ফেজ ৮-এ |
| rtdose.dcm | RT Dose, ১৫ frame, implicit VR | ◐ সাধারণ ছবি হিসেবে খোলে; isodose ফেজ ৮-এ |
| rtstruct.dcm | RTSTRUCT, Part 10 header নেই | ◐ পড়া যায় (raw dataset); তালিকায় "cannot be shown yet · RT Structure Set" — ফেজ ৮ |
| waveform_ecg.dcm | 12-lead ECG | ◐ তালিকায় "cannot be shown yet · 12-lead ECG" — ফেজ ৮ |

কোনো ফাইলেই console error আসেনি।

## ৪. পরে যোগ করার মতো পাবলিক ডেটাসেট

বড় ও আসল-ধরনের স্টাডির জন্য (পারফরম্যান্স, ফেজ ৭–১২)। নামানোর আগে প্রতিটার লাইসেন্স আবার যাচাই করতে হবে:

- **TCIA (The Cancer Imaging Archive):** CT, MR, PET-CT, SEG, RTSTRUCT; বেশিরভাগ CC BY 4.0, কিছু সংগ্রহে সীমাবদ্ধতা আছে
- **OHIF-এর পাবলিক demo স্টাডি** (DICOMweb): PET-CT, SEG, SR, microscopy; ফেজ ১১-এর DICOMweb পরীক্ষায়
- **NEMA WG-04 compression sample set:** সব transfer syntax-এর নমুনা
- **dicomlibrary.com**-এর anonymized নমুনা

এখানে কোনোটা যোগ হলে টেবিলে উৎস, লাইসেন্স আর কী পরীক্ষা করে তা লিখতে হবে।
