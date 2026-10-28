# ফেজ ০: ভিত্তি ও কাঠামো — বিস্তারিত পরিকল্পনা

> স্ট্যাটাস: সম্পন্ন (commit বাকি) · তারিখ: 2026-10-28 · ব্রাঞ্চ: `feature/phase-0-foundation`
> মূল রোডম্যাপ: [FULL_FEATURE_ROADMAP.md](FULL_FEATURE_ROADMAP.md#ফেজ-০-ভিত্তি-ও-কাঠামো)

## লক্ষ্য

ব্যবহারকারীর দিক থেকে অ্যাপ **ঠিক আগের মতোই** কাজ করবে। শুধু তিনটা ছোট দৃশ্যমান উন্নতি আসবে: ডান-ক্লিক মেনু, toast বার্তা, আর link সেটিং মনে রাখা।

ভেতরের কাঠামো এমনভাবে বদলানো হবে যাতে ফেজ ১–১২-এর শত শত feature সহজে যোগ করা যায়।

## এখনকার অবস্থা (সমস্যা)

- `App.tsx` (৩৮২ লাইন)-এ ১৮টা `useState`। সব state props দিয়ে নিচে পাঠানো হয়, আর `Toolbar` ২৪টা prop নেয়। নতুন প্যানেল বা টুল যোগ করলে প্রতিবার App, Toolbar আর মাঝের সব কম্পোনেন্ট বদলাতে হয়।
- কিবোর্ড শর্টকাট `App.tsx`-এর একটা বড় `if/else`-এ, আর টুলবার বোতাম আলাদা জায়গায়। একই কাজ দুই জায়গায় লেখা।
- Viewport-এর ধরন (stack/MPR/3D) বোঝা হয় ID-র নাম দেখে (`isVrViewport`)।
- বার্তা দেখানোর জায়গা একটাই (হলুদ ব্যানার), পরের বার্তা আগেরটাকে মুছে দেয়।
- কোনো স্বয়ংক্রিয় টেস্ট নেই। সব পরীক্ষা হাতে করা।
- সব কোড একটা JS ফাইলে (~2.5MB)।
- UI-র লেখা কোডে সরাসরি (ইংরেজি), তাই অনুবাদের উপায় নেই।
- Dev-এ ফাইল সেভ করলে (HMR) Cornerstone আবার init হয়, তাই খোলা 3D ভেঙে যায়।

## সিদ্ধান্ত

| বিষয় | সিদ্ধান্ত | কারণ |
|---|---|---|
| State | **Zustand** | ছোট (~1KB), React-এর বাইরে থেকেও (Cornerstone event, command) state পড়া ও বদলানো যায়, selector দিয়ে অপ্রয়োজনীয় re-render এড়ানো যায়। Context + reducer-এ বাইরে থেকে পড়া ঝামেলার। |
| Settings | Zustand `persist` middleware, `version` + `migrate` | localStorage ব্যর্থ হলে (private মোড) অ্যাপ চলতেই থাকবে |
| i18n | `i18next` + `react-i18next` | সবচেয়ে প্রচলিত; plural, interpolation, lazy ভাষা ফাইল |
| Unit test | **Vitest** | Vite-এর কনফিগই ব্যবহার করে |
| E2E | **@playwright/test** (Chromium) | এখন হাতে করা পরীক্ষাগুলোই স্ক্রিপ্টে; phantom ডেটা global setup-এ তৈরি |
| CI | GitHub Actions | repo GitHub-এ |
| Bundle | নিজের ছোট স্ক্রিপ্ট (`scripts/check-bundle.mjs`), gzip আকার + বাজেট | বাড়তি dependency লাগে না |

## টাস্ক (ক্রম অনুযায়ী)

### ০.১ টেস্ট কাঠামো (আগে, যাতে refactor-এর সময় ভাঙলে ধরা পড়ে)
- [x] Vitest বসানো, `npm test`
- [x] Unit test: `formatPersonName`, `formatDate`, slice location, ছবি সাজানো, `isLocalizer`, `hangingOrder`, `defaultLayoutFor`, W/L preset মেলানো
- [x] এজন্য বিশুদ্ধ (Cornerstone ছাড়া) ফাংশনগুলো আলাদা ফাইলে আনা: `src/dicom/parse.ts`
- [x] Playwright test runner: `npm run test:e2e`; global setup-এ phantom তৈরি; dev server নিজে চালু
- [x] E2E (refactor-এর আগে এখনকার আচরণ ধরে রাখা):
  - ফাইল খোলা → সিরিজ, thumbnail, 2×2 লেআউট
  - W/L preset → ড্রপডাউনের লেখা ও viewport-এর W/L
  - কিবোর্ড: `I` invert, `R` reset, তীর দিয়ে slice
  - লেআউট বদলানো, ডাবল-ক্লিকে বড় করা
  - Tag প্যানেল খোলা ও সার্চ
  - MPR খোলা (তিনটা viewport), 3D খোলা, গ্রিডে ফেরা
  - Console-এ কোনো error নেই

### ০.২ State management
- [x] `src/store/viewerStore.ts`: স্টাডি, cells, cell index, লেআউট, active cell, maximize, mode/volumeView, MPR active viewport, mprWith3d, slab, 3D preset, active tool, প্যানেল
- [x] `src/store/uiStore.ts` (বা একই store-এর অংশ): loading progress, dragging
- [x] `App.tsx` থেকে সব state store-এ সরানো; কম্পোনেন্ট সরাসরি store থেকে পড়বে
- [x] Toolbar-এর prop কমানো (২৪ → প্রায় ০)
- [x] আচরণ বদলাবে না: E2E সবুজ থাকবে

### ০.৩ Settings store
- [x] `src/store/settingsStore.ts`: `persist`, `version: 1`, `migrate`
- [x] প্রথম সেটিং: link-এর পছন্দ (reference line, sync, W/L sync) — reload করলেও মনে থাকবে; ভাষা (`en`)
- [x] localStorage না থাকলে চুপচাপ মেমোরিতে চলা
- [x] Unit test: migrate আর ডিফল্ট

### ০.৪ Viewport registry
- [x] `src/cornerstone/viewportRegistry.ts`: viewportId → `{ kind: 'stack' | 'mpr' | 'volume3d', displaySet }`
- [x] mount/unmount-এর সময় register/unregister
- [x] `isVrViewport` আর ID-র নাম দেখে ধরন বোঝার জায়গাগুলো registry দিয়ে
- [x] Reset, invert ইত্যাদি action ধরন অনুযায়ী ঠিক ফাংশন ডাকবে (পরে video/pdf/ecg kind যোগ করা যাবে)

### ০.৫ Command registry ও কিবোর্ড
- [x] `src/commands/`: প্রতিটা command-এ `id`, `label` (i18n key), `icon`, `shortcut`, `isAvailable(ctx)`, `run(ctx)`
- [x] সব টুল বাছাই, invert, rotate, flip, reset, PNG, tags, mode বদল, লেআউট, link command হিসেবে
- [x] একটাই কিবোর্ড handler: shortcut → command
- [x] Toolbar বোতাম command থেকে তৈরি
- [x] আগের সব শর্টকাট একইভাবে কাজ করবে

### ০.৬ Context menu
- [x] Viewport-এ ডান-ক্লিক (টানা ছাড়া) → মেনু; ডান-বোতাম টেনে zoom আগের মতোই
- [x] মেনুর আইটেম command registry থেকে: reset, invert, rotate, flip, PNG, tags
- [x] Escape বা বাইরে ক্লিকে বন্ধ; কিবোর্ডে নেভিগেশন; স্ক্রিনের কিনারায় ঠিক জায়গায়
- [ ] মোবাইলে লম্বা চাপ (long press) → **ফেজ ১০-এ সরানো** (touch gesture-এর সাথে একসাথে; রোডম্যাপে যোগ করা হয়েছে)

### ০.৭ Panel system
- [x] `src/panels/`: প্যানেল রেজিস্ট্রি (`id`, `title`, `component`)
- [x] ডান পাশে প্যানেল হোস্ট (ডেস্কটপ), ফোনে নিচের sheet / পুরো স্ক্রিন
- [x] Tag প্যানেল এই কাঠামোয় আনা
- [x] পরের ফেজের প্যানেল (measurement, segmentation, report) শুধু রেজিস্ট্রিতে যোগ করলেই চলবে

### ০.৮ Toast ও error boundary
- [x] `src/notifications/`: toast store (info/success/warning/error), একাধিক toast, নিজে থেকে বন্ধ (error ছাড়া), বন্ধ বোতাম
- [x] হলুদ ব্যানার (`message`) সরিয়ে toast
- [x] React error boundary: কোনো কম্পোনেন্ট crash করলে পুরো অ্যাপ সাদা না হয়ে বার্তা + reload বোতাম
- [x] `window.onerror` / `unhandledrejection` → console + (dev-এ) toast

### ০.৯ Lazy loading ও bundle
- [x] `MprView`, `Volume3DView`, `TagPanel` → `React.lazy` (Suspense fallback)
- [x] Cornerstone init-এ MPR/3D-র যা দরকার নেই তা আলাদা করা সম্ভব কিনা যাচাই (core নিজেই vtk টানে কিনা মাপা)
- [x] `scripts/check-bundle.mjs`: প্রতিটা chunk-এর gzip আকার, মোট প্রথম লোড; বাজেট ছাড়ালে error; `npm run size`
- [x] আগে-পরের আকার এই ফাইলে লেখা

### ০.১০ i18n কাঠামো
- [x] `i18next` + `react-i18next`, `src/i18n/` (`en.json`)
- [x] সব UI লেখা key-তে (Welcome, Toolbar, Sidebar, Viewport overlay label, প্যানেল, বার্তা, confirm)
- [x] ভাষা settings store থেকে; `<html lang>` আপডেট
- [x] বাংলা অনুবাদ ফেজ ১০-এ (এখন শুধু কাঠামো; `bn.json` ফাঁকা নয় — অন্তত কাঠামো যাচাইয়ের জন্য কয়েকটা key)

### ০.১১ Test data
- [x] Phantom generator বাড়ানো: multi-frame (US ধাঁচের RGB cine), MR (দুটো sequence একই সিরিজে), PET (SUV-র tag সহ), DX (pixel spacing ছাড়া), ভাঙা ফাইল, DICOM নয় এমন ফাইল
- [x] `BLUEPRINT/TEST_DATA.md`: কোন phantom কী পরীক্ষা করে; পাবলিক anonymized ডেটাসেটের তালিকা (লাইসেন্সসহ)
- [x] `scripts/fetch-sample-data.mjs`: পাবলিক নমুনা ফাইল `.playwright-mcp/samples`-এ নামানো (repo-তে রাখা হবে না)

### ০.১২ CI
- [x] `.github/workflows/ci.yml`: install → lint → typecheck/build → unit test → bundle size → E2E (Chromium)
- [x] ব্যর্থ হলে Playwright report artifact

### ০.১৩ HMR সমস্যা
- [x] Cornerstone init-কে HMR-এ একবারই চালানো (globalThis-এ রাখা) বা cornerstone মডিউল বদলালে full reload
- [x] যাচাই: dev-এ 3D খোলা অবস্থায় একটা কম্পোনেন্ট সেভ করলে ভাঙে না

### ০.১৪ সমাপ্তি
- [x] `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run size` সব সবুজ
- [x] ব্রাউজারে হাতে পরীক্ষা (ডেস্কটপ + মোবাইল সাইজ), production build-এ পরীক্ষা
- [x] README (নতুন script, কাঠামো), এই ফাইল আর রোডম্যাপের চেকবক্স
- [ ] Commit শুধু ব্যবহারকারী বললে

## ঝুঁকি

| ঝুঁকি | প্রতিকার |
|---|---|
| বড় refactor-এ পুরনো feature নিঃশব্দে ভাঙা | আগে E2E লেখা (০.১), প্রতিটা ধাপের পর চালানো |
| Zustand-এ re-render বেড়ে viewport ঝাঁকুনি | ছোট selector, Cornerstone object store-এ না রাখা (শুধু ID/সাধারণ ডেটা) |
| `File`/`Study` object store-এ রাখা | persist করা হবে না (settings আলাদা store) |
| CI-তে WebGL নেই (headless) | Chromium-এ SwiftShader/`--use-angle=swiftshader`; না চললে MPR/3D E2E CI-তে skip, লোকালে চলবে — নোটে লেখা |
| i18n-এ সব লেখা সরাতে গিয়ে কিছু বাদ | grep দিয়ে JSX-এ বাকি ইংরেজি লেখা খোঁজা |

---

## বাস্তবায়নের নোট

**নতুন কাঠামো**

| ফোল্ডার / ফাইল | কাজ |
|---|---|
| `src/store/viewerStore.ts` | session state (স্টাডি, cell, লেআউট, mode, টুল, প্যানেল) + selector + সাধারণ setter; Cornerstone import করে না, তাই Node-এ test করা যায় |
| `src/store/viewerActions.ts` | Cornerstone-সহ action (`openFiles`, `openVolumeView`, `changeMode`, `resetTargetViewport`) আর `useCornerstoneBridge` (store → tool, sync, reference line, slab) |
| `src/store/settingsStore.ts` | localStorage-এ পছন্দ (`dicomlens-settings`, version 1, `migrateSettings`); `safeStorage.ts` ব্যর্থ হলে মেমোরিতে চলে |
| `src/cornerstone/constants.ts` | ID আর ডিফল্ট (Cornerstone ছাড়া) |
| `src/cornerstone/viewportRegistry.ts` | mount হওয়া viewport-এর ধরন (`stack` / `mpr` / `volume3d`); reactive store |
| `src/commands/` | সব action-এর একটা তালিকা; টুলবার, কিবোর্ড আর context menu এখান থেকে তৈরি |
| `src/components/ContextMenu.tsx`, `contextMenuTrigger.ts` | ডান-ক্লিক মেনু; ৪px-এর কম নড়লে click, বেশি হলে zoom-drag |
| `src/panels/` | প্যানেল রেজিস্ট্রি + হোস্ট (ডেস্কটপে ডান কলাম, ফোনে পুরো স্ক্রিন) |
| `src/notifications/` | toast store ও UI, ErrorBoundary, dev-এ unhandled error toast |
| `src/i18n/` | i18next; `locales/en.ts` সব key-র উৎস, `bn.ts` নমুনা (বাকিটা ফেজ ১০) |
| `src/runtime.ts`, `runtimeEntry.ts`, `Workspace.tsx` | viewer runtime আলাদা chunk-এ; Welcome পাতা আগে দেখায় |
| `scripts/dicom-writer.mjs`, `generate-samples.mjs`, `fetch-sample-data.mjs` | test data ([TEST_DATA.md](TEST_DATA.md)) |
| `scripts/check-bundle.mjs` | bundle বাজেট |
| `e2e/`, `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/ci.yml` | টেস্ট আর CI |

**Bundle (gzip):**

| | আগে | পরে |
|---|---|---|
| প্রথম পাতার JS | ~1122 KB (একটাই chunk, 4 MB) | **89.7 KB** |
| Viewer runtime (পেছনে লোড হয়) | — | 781 + 216 KB |
| মোট JS | ~1180 KB | 1158 KB |

বাজেট: প্রথম পাতা ১২০ KB, একক chunk ৯০০ KB, মোট ১৩০০ KB। প্রথম পাতা দেখানোর পরপরই runtime নামা শুরু হয়। ব্যবহারকারী তার আগে ফাইল দিলে "Reading files…" দেখায় আর runtime-এর জন্য অপেক্ষা করে।

**টেস্ট:**
- Unit (Vitest): ২৩টা। parse, hanging protocol, W/L preset, লেআউট, settings migrate, toast, আর অনুবাদের key।
- অনুবাদের key-র টেস্ট source-এর সব `t('…')` key `en.ts`-এ আছে কিনা দেখে, আর `bn.ts`-এ বাড়তি key আছে কিনা।
- E2E (Playwright): ১২টা। দুই ভাবে সবুজ: `npm run test:e2e` (dev server) আর `npm run test:e2e:prod` (`--mode e2e` production build)।
  - আগের আচরণ: লেআউট, W/L ড্রপডাউন, কিবোর্ড, tag প্যানেল, MPR, 3D, মোবাইল।
  - নতুন: context menu, settings মনে রাখা, toast, ভাষা, sample ফরম্যাট।
- Viewport-এর অবস্থা পড়ার জন্য dev আর e2e build-এ `window.__dicomlensEngine` থাকে। Production build-এ থাকে না।

**HMR:** `vite.config.ts`-এর `reloadOnStatefulModules` plugin যোগ করা হয়েছে। `src/cornerstone`, `src/dicom`, `src/store` বা runtime ফাইল বদলালে পুরো পাতা reload হয়, আর component বদলালে আগের মতো hot-update হয়। একটা অস্থায়ী টেস্টে যাচাই করা হয়েছে:
- 3D খোলা অবস্থায় `VrViewport.tsx` বদলালে 3D চলতে থাকে, preset বদলানোও কাজ করে।
- `volume3d.ts` বদলালে পাতা reload হয়, তারপর আবার স্টাডি খুলে 3D দেখানো যায়।
- কোনো ক্ষেত্রেই console error নেই।

**শেখা বিষয়:**
- Cornerstone ৪০০ ms-এর মধ্যে দুটো mouse-down পেলে সেটাকে double-click ধরে, তাই সেই সময় টানা (drag) শুরু করে না। টেস্টে খুব দ্রুত ক্লিক করলে এটা ধরা পড়ে; মানুষের স্বাভাবিক ব্যবহারে সমস্যা হয় না।
- `@cornerstonejs/core` নিজেই vtk.js টানে। তাই MPR/3D আলাদা করলে লাভ সামান্য, পুরো runtime আলাদা করাটাই কার্যকর।
- পুরো E2E একসাথে চললে পরীক্ষা ধীর হয়ে যায়। Warning toast ৭ সেকেন্ড পরে বন্ধ হয়, তাই টেস্টে toast-টা আগে যাচাই করতে হয়।

**যা যাচাই করা হয়নি:**
- GitHub Actions CI ফাইল লেখা হয়েছে, কিন্তু GitHub-এ push না হওয়া পর্যন্ত চলেনি। Linux-এ SwiftShader দিয়ে WebGL2 পাওয়া যাবে বলে আশা করা হচ্ছে; না পেলে MPR/3D টেস্ট CI-তে skip করতে হবে।
- আসল মোবাইল ফোনে চালানো হয়নি; শুধু Pixel 7 emulation আর স্ক্রিনশট।
