// The local archive in IndexedDB: study records and their files (Blobs).
// Nothing is stored unless the user saves a study.
import type { SourceFile } from '../dicom/collectFiles'
import type { ArchivedStudy } from './archive'

const NAME = 'dicomlens-archive'
const STUDIES = 'studies'
const FILES = 'files'

interface StoredFile {
  study: string
  path: string
  name: string
  type: string
  blob: Blob
}

let opening: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      db.createObjectStore(STUDIES, { keyPath: 'id' })
      db.createObjectStore(FILES, { autoIncrement: true }).createIndex('study', 'study')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      opening = null
      reject(request.error)
    }
  })
  return opening
}

const done = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('aborted'))
  })

const result = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

export async function listStudies(): Promise<ArchivedStudy[]> {
  const db = await open()
  return result(db.transaction(STUDIES).objectStore(STUDIES).getAll() as IDBRequest<ArchivedStudy[]>)
}

/** Saves (or replaces) a study and its files. */
export async function saveStudy(record: ArchivedStudy, files: SourceFile[]) {
  const db = await open()
  const transaction = db.transaction([STUDIES, FILES], 'readwrite')
  const fileStore = transaction.objectStore(FILES)
  const old = await result(fileStore.index('study').getAllKeys(record.id))
  for (const key of old) fileStore.delete(key)
  for (const { file, path } of files) fileStore.add({ study: record.id, path, name: file.name, type: file.type, blob: file } satisfies StoredFile)
  transaction.objectStore(STUDIES).put(record)
  await done(transaction)
  // Ask the browser not to clear the archive under storage pressure.
  void navigator.storage?.persist?.()
}

export async function updateStudy(id: string, change: Partial<ArchivedStudy>) {
  const db = await open()
  const transaction = db.transaction(STUDIES, 'readwrite')
  const store = transaction.objectStore(STUDIES)
  const current = await result(store.get(id) as IDBRequest<ArchivedStudy | undefined>)
  if (current) store.put({ ...current, ...change, id })
  await done(transaction)
}

export async function deleteStudy(id: string) {
  const db = await open()
  const transaction = db.transaction([STUDIES, FILES], 'readwrite')
  const fileStore = transaction.objectStore(FILES)
  for (const key of await result(fileStore.index('study').getAllKeys(id))) fileStore.delete(key)
  transaction.objectStore(STUDIES).delete(id)
  await done(transaction)
}

export async function loadStudyFiles(id: string): Promise<SourceFile[]> {
  const db = await open()
  const stored = await result(db.transaction(FILES).objectStore(FILES).index('study').getAll(id) as IDBRequest<StoredFile[]>)
  return stored.map((f) => ({ file: new File([f.blob], f.name, { type: f.type }), path: f.path }))
}

/** Space the browser reports for this site (bytes), when it does. */
export async function storageEstimate() {
  try {
    const estimate = await navigator.storage?.estimate?.()
    return estimate ? { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 } : null
  } catch {
    return null
  }
}
