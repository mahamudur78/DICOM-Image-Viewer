import type { Translation } from './en'

// Arabic: a start (the welcome page and file opening). Untranslated keys fall
// back to English; see docs/TRANSLATING.md to complete it.
export const ar: Translation = {
  app: {
    name: 'عارض DICOM',
    privacyBadge: '🔒 تبقى الملفات على جهازك',
    readingFiles: 'جارٍ قراءة الملفات… {{done}} / {{total}}',
    dropOverlay: 'أفلت ملفات أو مجلدات DICOM لفتحها',
  },
  welcome: {
    title: 'عارض DICOM مجاني على الإنترنت',
    intro: 'اعرض صور الرنين المغناطيسي والأشعة المقطعية والأشعة السينية في متصفحك.',
    introStrong: 'لا تغادر ملفاتك جهازك أبدًا',
    introEnd: ': بلا رفع وبلا تسجيل.',
    dropHint: 'اسحب ملفات DICOM أو مجلدًا كاملًا (مثلًا من قرص) وأفلتها هنا',
    disclaimer: 'للاستخدام التعليمي والمعلوماتي فقط. ليس للاستخدام التشخيصي.',
  },
  files: {
    openFiles: 'فتح ملفات',
    openFolder: 'فتح مجلد',
  },
}
