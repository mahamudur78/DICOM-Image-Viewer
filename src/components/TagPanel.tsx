import type dicomParser from 'dicom-parser'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { decodedText, parseHeader } from '../dicom/header'
import { TAG_DICTIONARY } from '../dicom/tagDictionary'
import i18n from '../i18n'
import { selectCurrentFile, useViewer } from '../store/viewerStore'

interface TagRow {
  tag: string
  name: string
  vr: string
  value: string
}

const MAX_VALUE_LENGTH = 200

function formatTag(tag: string) {
  return `(${tag.slice(1, 5)},${tag.slice(5, 9)})`.toUpperCase()
}

function readValue(dataSet: dicomParser.DataSet, element: dicomParser.Element, vr: string): string {
  if (element.items) return `[sequence: ${element.items.length} item(s)]`
  if (element.length === 0) return ''

  const count = (bytes: number) => Math.max(1, Math.floor(element.length / bytes))
  const join = (read: (index: number) => number | undefined, bytes: number) =>
    Array.from({ length: Math.min(count(bytes), 16) }, (_, i) => read(i)).join('\\')

  switch (vr) {
    case 'US':
      return join((i) => dataSet.uint16(element.tag, i), 2)
    case 'SS':
      return join((i) => dataSet.int16(element.tag, i), 2)
    case 'UL':
      return join((i) => dataSet.uint32(element.tag, i), 4)
    case 'SL':
      return join((i) => dataSet.int32(element.tag, i), 4)
    case 'FL':
      return join((i) => dataSet.float(element.tag, i), 4)
    case 'FD':
      return join((i) => dataSet.double(element.tag, i), 8)
    case 'OB':
    case 'OW':
    case 'OF':
    case 'OD':
    case 'UN':
      return `[binary: ${element.length} bytes]`
    case 'AT':
      return `[attribute tag]`
    case 'PN':
    case 'LO':
    case 'SH':
    case 'ST':
    case 'LT':
    case 'UT':
    case 'UC':
      // Free text may use the object's character set (e.g. UTF-8 or Japanese).
      return decodedText(dataSet, element.tag) ?? ''
    default:
      return dataSet.string(element.tag) ?? ''
  }
}

function buildRows(dataSet: dicomParser.DataSet): TagRow[] {
  return Object.values(dataSet.elements)
    .sort((a, b) => a.tag.localeCompare(b.tag))
    .map((element) => {
      const [dictionaryVr, name] = TAG_DICTIONARY[element.tag] ?? []
      const isPrivate = parseInt(element.tag.slice(1, 5), 16) % 2 === 1
      const vr = element.vr ?? dictionaryVr ?? (element.items ? 'SQ' : 'UN')
      const value = readValue(dataSet, element, vr)
      return {
        tag: formatTag(element.tag),
        name: name ?? (isPrivate ? i18n.t('tags.privateTag') : ''),
        vr,
        value: value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}…` : value,
      }
    })
}

export function TagPanel() {
  const file = useViewer(selectCurrentFile)
  const { t } = useTranslation()
  if (!file) return <p className="p-3 text-sm text-slate-500">{t('tags.noImage')}</p>
  return <TagTable file={file} />
}

function TagTable({ file }: { file: File }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<TagRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    file
      .arrayBuffer()
      .then((buffer) => {
        if (cancelled) return
        setRows(buildRows(parseHeader(buffer)))
        setError(null)
      })
      .catch(() => !cancelled && setError(t('tags.readError')))
    return () => {
      cancelled = true
    }
  }, [file, t])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => `${row.tag} ${row.name} ${row.value}`.toLowerCase().includes(q))
  }, [rows, query])

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-3">
        <div className="truncate text-xs text-slate-500">{file.name}</div>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('tags.search')}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <table className="w-full table-fixed text-left font-mono text-[11px]">
            <thead className="sticky top-0 bg-slate-900 text-slate-500">
              <tr>
                <th className="w-24 py-1 font-normal">{t('tags.colTag')}</th>
                <th className="w-36 py-1 font-normal">{t('tags.colName')}</th>
                <th className="w-8 py-1 font-normal">{t('tags.colVr')}</th>
                <th className="py-1 font-normal">{t('tags.colValue')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.tag} className="border-t border-slate-800/60 align-top">
                  <td className="py-1 text-slate-500">{row.tag}</td>
                  <td className="truncate py-1 text-slate-300" title={row.name}>
                    {row.name}
                  </td>
                  <td className="py-1 text-slate-500">{row.vr}</td>
                  <td className="break-all py-1 text-slate-100">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
