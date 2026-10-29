import { create } from 'zustand'
import type { LoadIssue } from '../dicom/types'

/** A field of a form dialog; labels are i18n keys. */
export interface FormField {
  name: string
  label: string
  type: 'number' | 'text'
  value: string
  min?: number
  max?: number
  step?: number
  required?: boolean
}

export type DialogRequest =
  | { type: 'password'; zipName: string; retry: boolean; resolve: (password: string | null) => void }
  | { type: 'issues'; issues: LoadIssue[] }
  | { type: 'form'; title: string; fields: FormField[]; submit: string; resolve: (values: Record<string, string> | null) => void }
  | { type: 'presets'; modality: string; current: { width: number; center: number } | null }
  | { type: 'hanging' }
  | { type: 'export'; kind: 'images' | 'movie' | 'print' | 'anonymize' | 'convert' | 'tagEdit' }
  | { type: 'cpr' }
  | { type: 'shortcuts' }
  | { type: 'settings'; tab?: string }
  | { type: 'archive' }

/** One modal dialog at a time; requests made while one is open wait in line. */
export const useDialogs = create<{ queue: DialogRequest[] }>()(() => ({ queue: [] }))

const push = (request: DialogRequest) => useDialogs.setState((state) => ({ queue: [...state.queue, request] }))

export const closeDialog = () => useDialogs.setState((state) => ({ queue: state.queue.slice(1) }))

/** Asks for a ZIP password; resolves to null when cancelled. */
export function askPassword(zipName: string, retry: boolean) {
  return new Promise<string | null>((resolve) => push({ type: 'password', zipName, retry, resolve }))
}

export const showIssues = (issues: LoadIssue[]) => push({ type: 'issues', issues })

/** Asks for a few values (e.g. a window or an angle); resolves to null when cancelled. */
export function askForm(title: string, fields: FormField[], submit: string) {
  return new Promise<Record<string, string> | null>((resolve) => push({ type: 'form', title, fields, submit, resolve }))
}

/** The user's window presets for one modality: rename, reorder, delete, add the current window. */
export const managePresets = (modality: string, current: { width: number; center: number } | null) =>
  push({ type: 'presets', modality, current })

/** The user's hanging protocols (and the built-in ones): list, delete. */
export const manageHangingRules = () => push({ type: 'hanging' })

/** One of the export, print, anonymize, convert or tag-edit dialogs (loaded on first use). */
export const openExportDialog = (kind: Extract<DialogRequest, { type: 'export' }>['kind']) => push({ type: 'export', kind })

/** Every command and its keys (`?`). */
export const openShortcuts = () => push({ type: 'shortcuts' })

/** All preferences in one place. */
export const openSettings = (tab?: string) => push({ type: 'settings', tab })

/** Studies saved in this browser. */
export const openArchive = () => push({ type: 'archive' })

/** The curved reformat of the drawn path (loaded on first use). */
export const openCprDialog = () => push({ type: 'cpr' })
