// Numbers and dates in the reader's language: languages whose numbers use
// their own digits (Bengali) get them; DICOM values (UIDs, tags, IDs) are never passed through here.

let language = 'en'
export const setFormatLanguage = (code: string) => (language = code)

const digitCache = new Map<string, string[] | null>()

/** The ten digits of a language, or null when they are 0–9. */
export function digitsOf(code: string): string[] | null {
  if (!digitCache.has(code)) {
    let digits: string[] | null = null
    try {
      const formatted = Array.from({ length: 10 }, (_, d) => new Intl.NumberFormat(code, { useGrouping: false }).format(d))
      digits = formatted.join('') === '0123456789' ? null : formatted
    } catch {
      digits = null
    }
    digitCache.set(code, digits)
  }
  return digitCache.get(code)!
}

/** Replaces 0–9 in display text by the language's digits. */
export function localizeDigits(text: string, code = language) {
  const digits = digitsOf(code)
  return digits ? text.replace(/[0-9]/g, (d) => digits[Number(d)]) : text
}

/** "YYYY-MM-DD" (as shown for DICOM dates) as a date in the reader's language; other text unchanged. */
export function formatStudyDate(value: string, code = language) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  try {
    return new Intl.DateTimeFormat(code, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  } catch {
    return value
  }
}

export function formatNumber(value: number, maximumFractionDigits = 2, code = language) {
  return new Intl.NumberFormat(code, { maximumFractionDigits }).format(value)
}
