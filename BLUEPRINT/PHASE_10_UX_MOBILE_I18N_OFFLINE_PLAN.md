# ফেজ ১০: UX, মোবাইল, ভাষা, অফলাইন — বিস্তারিত পরিকল্পনা

> স্ট্যাটাস: সম্পন্ন · তারিখ: 2026-10-29 · ব্রাঞ্চ: `feature/phase-10-ux-mobile-i18n-offline`
> মূল রোডম্যাপ: [FULL_FEATURE_ROADMAP.md](FULL_FEATURE_ROADMAP.md#ফেজ-১০-ux-মোবাইল-ভাষা-অফলাইন) · আগের ফেজ: [PHASE_9_SEGMENTATION_PLAN.md](PHASE_9_SEGMENTATION_PLAN.md)

## লক্ষ্য

DicomLens-কে প্রতিদিন ব্যবহারের মতো করা:

- ফোন আর ট্যাবলেটে স্বাভাবিক touch।
- পুরো বাংলা অনুবাদ আর অন্য ভাষা যোগ করার কাঠামো (RTL সহ)।
- নিজের শর্টকাট আর মাউস binding, সব পছন্দ এক settings পাতায়।
- হালকা আর high-contrast থিম।
- ইন্টারনেট ছাড়া চলা (PWA) আর ব্রাউজারের ভেতরে স্টাডির লোকাল আর্কাইভ।
- প্রথমবারের গাইড আর স্পষ্ট নোটিস।

## এখনকার অবস্থা

- **বাংলা:** `bn.ts`-এ মাত্র ৪টা লেখা; বাকিটা ইংরেজিতে ফিরে যায়। `en.ts` প্রায় ১০০০ লাইন।
- **Settings:** zustand + localStorage (v5)। ভাষা বদলানোর UI নেই।
- **কীবোর্ড:** `keymap.ts`-এ নির্দিষ্ট শর্টকাট, conflict-এর test আছে। শর্টকাটের তালিকা শুধু README-তে।
- **Touch:** Cornerstone-এর ডিফল্ট (এক আঙুলে বাম বোতামের টুল)। দুই আঙুলের zoom/pan নেই। লম্বা চাপে menu নেই।
- **চেহারা:** শুধু অন্ধকার; Tailwind-এর `slate` রং সব জায়গায়।
- **অফলাইন:** service worker নেই, manifest নেই, আর্কাইভ নেই।

## নকশার সিদ্ধান্ত

| বিষয় | সমাধান |
|---|---|
| **Touch** | প্রতিটা tool group-এ: দুই আঙুলে `ZoomTool` (pinch zoom, সাথে pan — Cornerstone-এর `pinchToZoom` আর `pan`), তিন আঙুলে W/L। এক আঙুল: বাছাই করা টুল; settings-এ "এক আঙুলে স্ক্রল" বেছে নেওয়া যায়। লম্বা চাপে (৬০০ ms, প্রায় না নড়লে) context menu। |
| ফোনের লেআউট | `lg`-এর নিচে টুলবার নিচে, বোতাম বড়। প্যানেল নিচ থেকে sheet (উচ্চতার ৬০%), টেনে বন্ধ নয়, বোতামে বন্ধ। |
| Stylus | Pen-এর pointer event Cornerstone-এ মাউসের মতো আসে। আলাদা কাজ নেই; যাচাই নোটে। |
| মোবাইলে মেমোরি | ফেজ ২-এর `isSmallDevice` আর volume-এর বাজেট এখন fusion overlay, export (বড় ZIP) আর cine prefetch-এও। ভারী কাজের আগে সতর্কবার্তা। |
| **অনুবাদ** | `bn.ts`-এ `en.ts`-এর সব key। Test: বাংলায় কোনো key বাদ নেই (plural-এ `_one`/`_other`)। |
| RTL আর অন্য ভাষা | ভাষার তালিকায় দিক (`dir`)। `<html dir>` বদলায়; বিন্যাসে Tailwind-এর logical class (`ms-`/`me-`/`start-`/`end-`) যেখানে দরকার। ভাষা যোগ করার নির্দেশিকা `docs/TRANSLATING.md`-এ। আরবি আর হিন্দি শুরু হিসেবে (মূল UI-এর লেখা); বাকিটা ইংরেজিতে ফিরে যায়। |
| Locale অনুযায়ী বিন্যাস | তারিখ, সংখ্যা আর একক `Intl` দিয়ে (বাংলায় বাংলা অঙ্ক)। DICOM মান (UID, ট্যাগ) অপরিবর্তিত। |
| **শর্টকাট** | `?` চাপলে সব কমান্ড আর শর্টকাটের ডায়ালগ, খোঁজা যায়। Settings-এ প্রতিটা কমান্ডের শর্টকাট বদলানো যায় (চাপ ধরে রেকর্ড); conflict হলে সতর্ক করে আর সেভ হয় না। ডিফল্টে ফেরানো যায়। |
| মাউস binding | মাঝের বোতাম, ডান বোতাম আর হুইলে কোন টুল (pan, zoom, W/L, স্ক্রল) — settings থেকে; tool group-এ প্রয়োগ। |
| **Settings পাতা** | একটা ডায়ালগ, ট্যাবে ভাগ: সাধারণ (ভাষা, থিম, একক, DPI), প্রদর্শন, মাউস ও touch, শর্টকাট, আর্কাইভ, তথ্য। সব পছন্দ JSON-এ export/import। |
| **থিম** | Tailwind v4-এর রং CSS variable। `[data-theme=light]`-এ `slate` স্কেল উল্টো, আর `[data-theme=contrast]`-এ কালো/সাদা ও হলুদ চিহ্ন। ছবির এলাকা সব থিমে কালো থাকে। `prefers-color-scheme` থেকে ডিফল্ট ("system")। |
| High-DPI | Canvas layer-গুলো `devicePixelRatio` মানে (আগে থেকেই)। Cornerstone নিজেই DPR মানে কিনা E2E-তে যাচাই। |
| Accessibility | সব জায়গায় `:focus-visible` ring। প্যানেল/ডায়ালগে Esc আর ফোকাস ফেরত। Icon বোতামে `aria-label` (আছে)। Skip link "Skip to viewer"। Contrast থিম। |
| **PWA** | Manifest (নাম, আইকন, থিম রং, `file_handlers` .dcm/.zip)। নিজস্ব ছোট Vite plugin build-এর পর `sw.js`-এ সব asset-এর তালিকা লেখে (WASM codec সহ)। Service worker install-এ সব precache করে, cache-first, পুরোনো cache মোছে। শুধু production-এ register হয়। `launchQueue` থেকে খোলা ফাইল viewer-এ যায়। |
| **লোকাল আর্কাইভ** | IndexedDB (`dicomlens-archive`): `studies` (metadata: রোগী, তারিখ, modality, বিবরণ, সংখ্যা, আকার, keyword, status, সময়) আর `files` (Blob)। ব্যবহারকারী "Save to archive" চাপলে তবেই সেভ হয়, নিজে থেকে নয়। Archive পাতা: খোঁজা (রোগী/ID/বিবরণ/keyword), status ফিল্টার, খোলা, মোছা, keyword ও status বদলানো, CSV। জায়গার হিসাব `navigator.storage.estimate()`; settings-এ সীমা (MB), সীমা পার হলে সেভ হয় না। একাধিক আর্কাইভ: ঐচ্ছিক, এই ফেজে নয়। |
| Status | Unread, In progress, Reviewed, Urgent, Signed। |
| **Onboarding** | প্রথমবার welcome-এ ছোট গাইড (৪ ধাপ, বন্ধ করা যায়, আর দেখায় না)। "Try a sample study": ব্রাউজারেই একটা synthetic CT (৪০ slice) বানিয়ে খোলে, ইন্টারনেট ছাড়াই। |
| নোটিস | Welcome আর About-এ "Not for diagnostic use" আর privacy (ফাইল ডিভাইসেই থাকে; আর্কাইভও এই ব্রাউজারেই)। |

## টাস্ক

### ১০.১ মোবাইল ও touch
- [x] দুই আঙুলে zoom/pan, তিন আঙুলে W/L, এক আঙুলে টুল বা স্ক্রল
- [x] লম্বা চাপে context menu
- [x] ফোনে নিচে টুলবার, প্যানেল নিচের sheet
- [x] Stylus (যাচাই)
- [x] মোবাইলে মেমোরির সীমা: MPR, 3D, fusion, cine, export

### ১০.২ ভাষা
- [x] বাংলা পুরো অনুবাদ, test
- [x] RTL আর আরও ভাষার কাঠামো, আরবি/হিন্দির শুরু
- [x] তারিখ, সংখ্যা, একক locale অনুযায়ী
- [x] `docs/TRANSLATING.md`

### ১০.৩ শর্টকাট ও পছন্দ
- [x] `?` শর্টকাট ডায়ালগ
- [x] শর্টকাট বদলানো, conflict যাচাই
- [x] মাউস binding
- [x] Settings পাতা, export/import

### ১০.৪ চেহারা
- [x] হালকা, high-contrast, system থিম
- [x] High-DPI যাচাই
- [x] Accessibility: ফোকাস, skip link, Esc, ARIA

### ১০.৫ অফলাইন ও আর্কাইভ
- [x] PWA: manifest, service worker, offline
- [x] File handling (`launchQueue`)
- [x] লোকাল আর্কাইভ: সেভ, তালিকা, খোঁজা, খোলা, মোছা
- [x] Keyword, status, CSV
- [x] জায়গার হিসাব ও সীমা

### ১০.৬ অন্যান্য ও সমাপ্তি
- [x] Onboarding আর নমুনা স্টাডি
- [x] "Not for diagnostic use" আর privacy নোটিস
- [x] Unit + E2E (মোবাইল touch, বাংলা, থিম, শর্টকাট, settings, আর্কাইভ, offline), dev + prod, বাজেট, ডকুমেন্টেশন
- [x] Commit শুধু ব্যবহারকারী বললে

## ঝুঁকি

| ঝুঁকি | প্রতিকার |
|---|---|
| থিমে কিছু রং হাতে লেখা (সাদা লেখা, কালো পটভূমি) | ছবির এলাকা ইচ্ছাকৃতভাবে কালো; বাকি জায়গা screenshot দেখে ঠিক করা |
| Service worker পুরোনো build ধরে রাখে | Build-এর hash দিয়ে cache-এর নাম; নতুন SW এলে পুরোনো cache মোছে আর জানায় |
| IndexedDB-তে বড় স্টাডি | জায়গার হিসাব আর সীমা; সেভের সময় অগ্রগতি |
| Touch E2E | Playwright-এর touch event সীমিত; CDP দিয়ে বহু-আঙুলের touch পাঠানো |
| অনুবাদের মান | চিকিৎসার প্রচলিত শব্দ ইংরেজিতে (CT, MPR, SUV, W/L); বাকিটা সহজ বাংলায় |

## বাস্তবায়নের নোট

**মোবাইল ও touch:**
- **Binding:** `applyInputBindings` (`src/cornerstone/tools.ts`) settings থেকে প্রয়োগ হয়, আর বদলালে সাথে সাথে।
  - মাঝের আর ডান বোতাম, হুইল।
  - দুই আঙুলে `ZoomTool` (pinch, সাথে pan), তিন আঙুলে W/L।
  - এক আঙুলে বাছাই করা টুল বা স্ক্রল।
  - 3D tool group আগের মতোই থাকে।
- **লম্বা চাপ (৬০০ ms):** context menu খোলে। ব্রাউজারের নিজের লম্বা চাপের `contextmenu` event-ও ধরা হয়।
  - আঙুল তোলার পর যে click আসে, তা মেনুর ঠিক জায়গায় পড়ে কোনো আইটেম চালিয়ে দিচ্ছিল। এখন সেই click আটকানো হয় (E2E-তে ধরা পড়েছিল)।
- **ফোনের লেআউট** (`max-sm`, <640 px): টুলবার নিচে, এক সারিতে স্ক্রল হয়, বোতাম ৪৪ px। প্যানেল নিচের sheet (উচ্চতার ৬৫%); `lg`-এর নিচে সব প্যানেল sheet।
- **মেমোরি:** `confirmVolumeMemory` এখন MPR/3D ছাড়াও fusion-এর overlay আর segmentation-এর আগে।

**ভাষা:**
- `bn.ts`-এ `en.ts`-এর সব key। Test নিশ্চিত করে যে কোনো key বাদ নেই আর placeholder একই।
- হিন্দি আর আরবি শুরু হিসেবে (welcome আর ফাইল খোলা)। আরবিতে `dir="rtl"`।
- ইংরেজি ছাড়া সব ভাষা lazy chunk। প্রথম render-এর আগে সেভ করা ভাষা লোড হয় (`languageReady`), তাই ঝলকানি নেই।
  - কারণ: বাংলা যোগ করায় initial JS ১২৪.৮ KB হয়ে বাজেট (১২০) ছাড়িয়েছিল; lazy করার পর ১০৯.১ KB।
- `src/i18n/format.ts`: `Intl` থেকে ভাষার অঙ্ক (বাংলায় ০–৯ বাংলা অঙ্কে), স্টাডির তারিখ ভাষা অনুযায়ী। Viewport-এর কোণের লেখা আর মাপের লেখায় প্রয়োগ। DICOM মান অপরিবর্তিত।
- নির্দেশিকা: `docs/TRANSLATING.md`।

**শর্টকাট ও settings:**
- `COMMANDS`-এর key এখন settings-এর keymap (ব্যবহারকারীর) + ডিফল্ট থেকে, আর বদলালে সাথে সাথে।
- `?` (ShortcutsDialog) আর `Ctrl+,` (SettingsDialog)। হেডারে Archive, ?, ⚙ বোতাম সব সময় থাকে।
- Settings v6:
  - থিম, input, keymap, আর্কাইভের সীমা, onboarding।
  - ট্যাব: সাধারণ, প্রদর্শন, মাউস ও টাচ, শর্টকাট (চাপ রেকর্ড, conflict-এ সতর্ক করে আর সেভ হয় না), ব্যাকআপ (JSON export/import, সব রিসেট), পরিচিতি।

**চেহারা:**
- `src/theme.ts`: `<html data-theme>`।
- CSS:
  - হালকা থিমে slate স্কেল উল্টো; hover-এ সাদা লেখা হালকায় গাঢ় হয়।
  - Contrast থিমে কালো/সাদা আর হলুদ ফোকাস।
  - Viewport-এর ভেতরে আসল অন্ধকার স্কেল।
- Accessibility:
  - সব জায়গায় `:focus-visible`।
  - "Skip to the viewer" link, `main#main`।
  - Modal-এ Esc আর ফোকাস ফেরত (আগে থেকেই)।
  - Settings-এ `role=tablist/tab/tabpanel`।
  - Onboarding non-modal region; প্রথমে dialog ছিল, তাতে অন্য dialog-এর test-এর সাথে গোলমাল হচ্ছিল।

**PWA ও আর্কাইভ:**
- `vite.config.ts`-এর ছোট plugin build-এর সব ফাইল + `public/wasm` codec-এর তালিকা দিয়ে `sw.js` লেখে (`src/pwa/sw-template.js`)।
  - Cache-এর নাম build সংস্করণ দিয়ে; পুরোনো cache মোছে।
  - Cache-first, navigation offline হলে app shell।
  - `ignoreVary`: সার্ভারের `Vary` header-এর কারণে module script cache থেকে মিলছিল না (অফলাইন E2E-তে ধরা পড়ে)।
- `public/manifest.webmanifest`: আইকন, `file_handlers` (.dcm, .dicom, .zip)। `launchQueue` থেকে খোলা ফাইল viewer-এ যায়।
- নতুন অ্যাপ আইকন (`favicon.svg`, `icon-192/512.png`); আগে Vite-এর লোগো ছিল।
- আর্কাইভ (`src/archive/`):
  - IndexedDB: `studies` + `files` (Blob, `study` index)।
  - সেভ শুধু ব্যবহারকারী চাইলে (Reports ▸ Archive বা Archive ডায়ালগ)। প্রথম সেভে `navigator.storage.persist()`।
  - খোঁজা, status (Unread … Signed), keyword, CSV, খোলা, মোছা, ব্যবহৃত/সীমা আর ব্রাউজারের খালি জায়গা।
  - সীমা পার হলে সেভ হয় না। পুরোনো কপি বদলালে একবারই গোনা হয়।

**অন্যান্য:**
- Onboarding: ৪ ধাপ, বাদ দেওয়া যায়, settings থেকে আবার দেখানো যায়।
- "Try a sample study": ব্রাউজারেই একটা synthetic chest CT (৪০ slice, ১২৮²) বানিয়ে খোলে, ইন্টারনেট ছাড়াই।
- Welcome-এ "Not for diagnostic use" আর privacy নোটিস; About-এ আর্কাইভের নোটিসও।
- **থিমের ডিফল্ট:** প্রথমে "system" ভাবা হয়েছিল। কিন্তু headless আর অনেক OS হালকা, তাতে ডিফল্ট চেহারা হঠাৎ বদলে যেত। তাই ডিফল্ট অন্ধকার; "system" একটা বিকল্প।

**বাজেট:** Initial ১০৯.১ KB (বাজেট ১২০), মোট ১৯৮১.৬ KB (বাজেট ২০০০)। বাজেট বাড়াতে হয়নি, তবে মোট বাজেট প্রায় শেষ।

**ফল:**
- Unit test ১৭৮টা পাস।
- E2E:
  - dev: ১৩২টা পাস + ৩টা skip (password ZIP, dev-এ অফলাইন টেস্ট, desktop-এ ফোনের টেস্ট)।
  - prod: অফলাইনসহ পাস।
    - একটা রানে MPR-এর oblique টেস্ট (crosshair-এর hover handle) একবার ব্যর্থ হয়েছিল; আলাদা করে ৩ বার চালালে পাস।
    - আরেকটা রানে Chrome-এর H.264 ভিডিও টেস্ট একবার ব্যর্থ হয়েছিল; আবার চালালে পাস।
  - নতুন `e2e/ux.spec.ts`-এ ৯টা টেস্ট:
    - onboarding আর নমুনা
    - বাংলা/আরবি
    - থিম
    - শর্টকাট আর conflict
    - মাউস binding
    - settings ব্যাকআপ
    - আর্কাইভ
    - অফলাইন
    - ফোন (নিচে টুলবার, sheet, লম্বা চাপ, pinch zoom)
- `npm run lint` পরিষ্কার।

**যা পরীক্ষা করা হয়নি বা সীমিত:**
- **Stylus:** pen event মাউসের মতো আসে বলে আলাদা কাজ করা হয়নি; আসল ট্যাবলেটে যাচাই হয়নি।
- **তিন আঙুলে W/L আর এক আঙুলে স্ক্রল:** E2E-তে নেই। দুই আঙুলের pinch আর লম্বা চাপ যাচাই হয়েছে।
- **Export আর cine-এর মেমোরি:** cache-এর সীমা আগে থেকেই আছে, তবে বড় export-এর আগে আলাদা সতর্কবার্তা নেই।
- **হিন্দি আর আরবি:** আংশিক; বাকিটা ইংরেজি।
  - পুরোনো লেআউটের সব `left`/`right` logical class-এ বদলানো হয়নি, তাই RTL-এ কিছু জায়গা বাঁ-ডান না-ও উল্টাতে পারে।
- **High-DPI:** canvas layer আগে থেকেই `devicePixelRatio` মানে। Cornerstone-এর নিজের canvas আলাদা করে যাচাই হয়নি।
- **File Handling API:** আসল ইনস্টল করা PWA-তে OS থেকে ডাবল-ক্লিক যাচাই হয়নি (কোডের পথ `launchQueue`)।
- **একাধিক আর্কাইভ:** ঐচ্ছিক ছিল; এই ফেজে নেই।
- **থিমের রং:** কয়েকটা হাতে লেখা রং (যেমন ECG-র কাগজ সাদা, কিছু badge) সব থিমে একই থাকে।
