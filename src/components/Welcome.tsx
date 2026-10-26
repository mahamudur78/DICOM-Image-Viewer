import { FilePickers } from './FilePickers'

export function Welcome({ onFiles }: { onFiles: (files: File[]) => void }) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-sky-500/10 text-3xl">🩻</div>
      <h1 className="text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">Free Online DICOM Viewer</h1>
      <p className="mt-3 text-slate-400">
        View MRI, CT and X-ray images right in your browser.{' '}
        <strong className="text-slate-200">Your files never leave your device</strong>: no upload, no signup.
      </p>

      <div className="mt-8 w-full rounded-2xl border-2 border-dashed border-slate-700 bg-slate-900/50 px-6 py-10">
        <p className="mb-4 text-slate-300">Drag & drop DICOM files or a whole folder (e.g. from a CD) here</p>
        <FilePickers onFiles={onFiles} />
        <p className="mt-4 text-xs text-slate-500">Supports .dcm and extension-less DICOM files, CT, MR, CR/DX, US and more</p>
      </div>

      <ul className="mt-8 grid w-full gap-3 text-left text-sm text-slate-400 sm:grid-cols-3">
        <li className="rounded-lg bg-slate-900 p-3">🔒 100% private: processed locally</li>
        <li className="rounded-lg bg-slate-900 p-3">📏 Window/level, zoom and measurements</li>
        <li className="rounded-lg bg-slate-900 p-3">🏷️ Full DICOM tag inspector</li>
      </ul>

      <p className="mt-8 text-xs text-slate-600">
        For educational and informational use only. Not for diagnostic use.
      </p>
    </div>
  )
}
