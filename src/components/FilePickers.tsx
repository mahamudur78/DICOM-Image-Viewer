import { useRef } from 'react'
import { filterCandidates } from '../dicom/collectFiles'

interface FilePickersProps {
  onFiles: (files: File[]) => void
  compact?: boolean
}

/** "Open files" and "Open folder" buttons backed by hidden file inputs. */
export function FilePickers({ onFiles, compact = false }: FilePickersProps) {
  const filesRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) onFiles(filterCandidates(event.target.files))
    event.target.value = ''
  }

  const base = compact
    ? 'rounded-md px-3 py-1.5 text-xs font-medium'
    : 'rounded-lg px-5 py-2.5 text-sm font-semibold'

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button onClick={() => filesRef.current?.click()} className={`${base} bg-sky-600 text-white hover:bg-sky-500`}>
        Open files
      </button>
      <button
        onClick={() => folderRef.current?.click()}
        className={`${base} border border-slate-600 text-slate-200 hover:bg-slate-800`}
      >
        Open folder
      </button>
      <input ref={filesRef} type="file" multiple hidden onChange={handleChange} />
      <input
        ref={folderRef}
        type="file"
        hidden
        onChange={handleChange}
        {...{ webkitdirectory: '', directory: '' }}
      />
    </div>
  )
}
