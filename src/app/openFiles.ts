// Opening files from anywhere (welcome page, drop, OS file handler, archive).
import type { SourceFile } from '../dicom/collectFiles'
import { loadRuntime, startViewer } from '../runtime'
import { useViewer } from '../store/viewerStore'

/** Opens files once the viewer runtime is ready (it may still be downloading). */
export async function openFiles(files: SourceFile[]) {
  if (files.length === 0) return
  useViewer.setState({ loading: { done: 0, total: files.length } })
  try {
    await startViewer()
  } catch {
    useViewer.setState({ loading: null })
    return // startViewer's failure is already reported by App
  }
  const runtime = await loadRuntime()
  await runtime.openFiles(files)
}
