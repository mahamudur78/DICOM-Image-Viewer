# Translating DicomLens

DicomLens uses [i18next](https://www.i18next.com/). Every text of the interface
has a key in `src/i18n/locales/en.ts`. That English file is the source and the
reference for all other languages.

## Add or complete a language

1. Copy the shape of `en.ts` into `src/i18n/locales/<code>.ts` (for example `ta.ts` for Tamil):

   ```ts
   import type { Translation } from './en'

   export const ta: Translation = {
     app: { name: '…' },
     // …
   }
   ```

   The `Translation` type lets you leave keys out. Missing keys show in English, so
   a partial translation is useful from the first line.

2. Register the language in `src/i18n/index.ts`:
   - Add `{ code, name, dir, complete }` to `LANGUAGES`. `name` is the language's own
     name; `dir` is `'rtl'` for Arabic, Hebrew, Persian or Urdu; set `complete` to
     `true` only when every key is translated.
   - Add a loader to `LOADERS`. Languages other than English download only when
     someone chooses them.

3. Run `npx vitest run src/i18n`. The tests check that:
   - every key you use exists in English;
   - complete languages (today English and Bengali) translate every key, with the
     same `{{placeholders}}`.

## Rules for the text

- **Keep placeholders exactly:** `{{count}}`, `{{name}}`, `{{mm}}` and so on. You may
  move them within the sentence.
- **Plurals:** i18next picks `_one`, `_other` (and, for languages that have them,
  `_zero`, `_two`, `_few`, `_many`) by the language's plural rules. Translate every
  form the language uses.
- **Medical and DICOM terms** that clinicians use in English stay in English: CT,
  MR, PET, SUV, MPR, ROI, W/L, DICOM, Gy, HU.
- **Keep it short:** many texts are buttons or menu items, and phones have little room.
- **Numbers and dates** are formatted by the app in the reader's language (for
  example Bengali digits). Do not write digits into translations, except inside
  fixed examples such as "300–3000 HU".

## Right-to-left languages

With `dir: 'rtl'` the page switches to right-to-left. New layout code should use
logical Tailwind classes (`ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`,
`text-start`/`text-end`) instead of left/right, so it works in both directions.
Images and viewports are never mirrored.

## Checking your translation

```bash
npm run dev
```

Open Settings (⚙) → General → Language, choose your language, and go through the
welcome page, the toolbar menus, the panels and the dialogs.
