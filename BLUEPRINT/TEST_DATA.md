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

`e2e/.data/samples`-এ নিজে থেকে তৈরি হয়। E2E: [e2e/samples.spec.ts](../e2e/samples.spec.ts)।

| ফাইল | কী | কোন ফেজে কাজে লাগবে |
|---|---|---|
| `us_cine.dcm` | US, RGB 8-bit, ২৪ frame, frame time 50 ms | ফেজ ১: CINE, multi-frame, color |
| `mr_mixed/` | একই সিরিজে দুটো sequence (axial T1 + sagittal T2) | ফেজ ১: multi-sequence ভাগ করা |
| `pet/` | PET, BQML, ডোজ/half-life/ওজন (SUV-র সব tag), একটা hot lesion | ফেজ ২ ও ৭: SUV, fusion |
| `dx_no_spacing.dcm` | DX, MONOCHROME1, pixel spacing নেই | ফেজ ৩: calibration, "px" ইউনিট |
| `broken.dcm` | মাঝপথে কাটা ফাইল | ভুল ফাইল সামলানো (এখন: "1 file was skipped") |
| `notes.txt` | DICOM না | ফোল্ডার থেকে বাদ দেওয়া |

DICOM লেখার সাধারণ কোড: `scripts/dicom-writer.mjs`। এটা explicit VR little endian-এ লেখে, sequence (SQ) লিখতে পারে, আর element-গুলো নিজে থেকে tag অনুযায়ী সাজায়।

## ৩. পাবলিক নমুনা: `scripts/fetch-sample-data.mjs`

`npm run samples:fetch` চালালে `e2e/.data/public`-এ নামে। ইন্টারনেট লাগে, CI-তে চালানো হয় না।

উৎস: [pydicom](https://github.com/pydicom/pydicom) `v3.0.1` (test_files) আর [pydicom-data](https://github.com/pydicom/pydicom-data) (MIT, commit `abc42b9`)। দুটো version pin করা, তাই ফাইল কখনো বদলাবে না। প্রতিটা ফাইলের উৎস আর লাইসেন্স pydicom-এর test_files README-তে আছে। আমরা শুধু লোকালি পরীক্ষার জন্য নামাই; repo-তে রাখি না বা বিতরণ করি না।

| ফাইল | কী | এখনকার অবস্থা (2026-10-28) |
|---|---|---|
| CT_small.dcm | CT, explicit VR LE | ✅ খোলে |
| MR_small.dcm | MR, explicit VR LE | ✅ খোলে |
| MR_small_jp2klossless.dcm | MR, JPEG 2000 lossless | ✅ খোলে |
| JPEG2000.dcm | NM, JPEG 2000 lossy | ✅ খোলে |
| JPEG-LL.dcm | NM, JPEG lossless | ✅ খোলে |
| SC_rgb.dcm | SC, RGB | ✅ খোলে |
| SC_rgb_rle.dcm | SC, RGB, RLE | ✅ খোলে |
| US1_J2KR.dcm | US, YBR_RCT, JPEG 2000 lossless | ✅ খোলে |
| color3d_jpeg_baseline.dcm | US, রঙিন, ১২০ frame, JPEG baseline | ✅ খোলে (frame হিসেবে; cine ফেজ ১-এ) |
| emri_small.dcm | MR, ১০ frame | ✅ খোলে |
| liver.dcm | DICOM SEG, ৩ frame | ◐ সাধারণ ছবি হিসেবে খোলে; overlay ফেজ ৮-এ |
| rtdose.dcm | RT Dose, ১৫ frame, implicit VR | ◐ সাধারণ ছবি হিসেবে খোলে; isodose ফেজ ৮-এ |
| rtstruct.dcm | RTSTRUCT, Part 10 header নেই | ❌ "No DICOM images" — ফেজ ৮ |
| waveform_ecg.dcm | 12-lead ECG | ❌ "No DICOM images" — ফেজ ৮ |

কোনো ফাইলেই console error আসেনি।

## ৪. পরে যোগ করার মতো পাবলিক ডেটাসেট

বড় ও আসল-ধরনের স্টাডির জন্য (পারফরম্যান্স, ফেজ ৭–১২)। নামানোর আগে প্রতিটার লাইসেন্স আবার যাচাই করতে হবে:

- **TCIA (The Cancer Imaging Archive):** CT, MR, PET-CT, SEG, RTSTRUCT; বেশিরভাগ CC BY 4.0, কিছু সংগ্রহে সীমাবদ্ধতা আছে
- **OHIF-এর পাবলিক demo স্টাডি** (DICOMweb): PET-CT, SEG, SR, microscopy; ফেজ ১১-এর DICOMweb পরীক্ষায়
- **NEMA WG-04 compression sample set:** সব transfer syntax-এর নমুনা
- **dicomlibrary.com**-এর anonymized নমুনা

এখানে কোনোটা যোগ হলে টেবিলে উৎস, লাইসেন্স আর কী পরীক্ষা করে তা লিখতে হবে।
