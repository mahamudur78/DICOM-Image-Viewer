import { create } from 'zustand'
import type { LoadIssue } from '../dicom/types'

export type DialogRequest =
  | { type: 'password'; zipName: string; retry: boolean; resolve: (password: string | null) => void }
  | { type: 'issues'; issues: LoadIssue[] }

/** One modal dialog at a time; requests made while one is open wait in line. */
export const useDialogs = create<{ queue: DialogRequest[] }>()(() => ({ queue: [] }))

const push = (request: DialogRequest) => useDialogs.setState((state) => ({ queue: [...state.queue, request] }))

export const closeDialog = () => useDialogs.setState((state) => ({ queue: state.queue.slice(1) }))

/** Asks for a ZIP password; resolves to null when cancelled. */
export function askPassword(zipName: string, retry: boolean) {
  return new Promise<string | null>((resolve) => push({ type: 'password', zipName, retry, resolve }))
}

export const showIssues = (issues: LoadIssue[]) => push({ type: 'issues', issues })
