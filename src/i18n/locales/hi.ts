import type { Translation } from './en'

// Hindi: a start (the welcome page and file opening). Untranslated keys fall
// back to English; see docs/TRANSLATING.md to complete it.
export const hi: Translation = {
  app: {
    name: 'DICOM व्यूअर',
    privacyBadge: '🔒 फ़ाइलें आपके डिवाइस पर ही रहती हैं',
    readingFiles: 'फ़ाइलें पढ़ी जा रही हैं… {{done}} / {{total}}',
    dropOverlay: 'खोलने के लिए DICOM फ़ाइलें या फ़ोल्डर यहाँ छोड़ें',
  },
  welcome: {
    title: 'मुफ़्त ऑनलाइन DICOM व्यूअर',
    intro: 'MRI, CT और एक्स-रे छवियाँ सीधे अपने ब्राउज़र में देखें।',
    introStrong: 'आपकी फ़ाइलें कभी आपके डिवाइस से बाहर नहीं जातीं',
    introEnd: ': कोई अपलोड नहीं, कोई साइनअप नहीं।',
    dropHint: 'DICOM फ़ाइलें या पूरा फ़ोल्डर (जैसे CD से) यहाँ खींचकर छोड़ें',
    disclaimer: 'केवल शैक्षिक और सूचनात्मक उपयोग के लिए। निदान के लिए नहीं।',
  },
  files: {
    openFiles: 'फ़ाइलें खोलें',
    openFolder: 'फ़ोल्डर खोलें',
  },
}
