import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ar } from './locales/ar'
import { bn } from './locales/bn'
import { hi } from './locales/hi'
import { en } from './locales/en'

/** Flattens a nested translation into dotted keys. */
function keys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'object' && child !== null ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`],
  )
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'locales' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [path] : []
  })
}

const englishKeys = new Set(keys(en))
// Plural forms are looked up by their base key (e.g. t('messages.skippedFiles', { count })).
const baseKeys = new Set([...englishKeys].map((key) => key.replace(/_(one|other)$/, '')))

describe('translations', () => {
  it('Bengali only uses keys that exist in English', () => {
    expect(keys(bn).filter((key) => !englishKeys.has(key))).toEqual([])
  })

  it('Bengali translates every English text, with the same placeholders', () => {
    const value = (tree: object, key: string) => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], tree) as string
    const placeholders = (text: string) => [...text.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort().join()
    const bengali = new Set(keys(bn))
    expect([...englishKeys].filter((key) => !bengali.has(key))).toEqual([])
    expect([...englishKeys].filter((key) => placeholders(value(en, key)) !== placeholders(value(bn, key)))).toEqual([])
  })

  it('other languages only use English keys', () => {
    for (const language of [ar, hi]) expect(keys(language).filter((key) => !englishKeys.has(key))).toEqual([])
  })

  it('every literal t("…") key in the source exists in English', () => {
    const used = sourceFiles('src').flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)].map((match) => match[1]),
    )
    expect(used.length).toBeGreaterThan(0)
    expect([...new Set(used)].filter((key) => !baseKeys.has(key))).toEqual([])
  })
})
