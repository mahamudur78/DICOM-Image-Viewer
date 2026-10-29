import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { closeDialog } from '../dialogs/dialogStore'
import { Modal, PRIMARY, SECONDARY } from '../dialogs/Modal'
import { downloadBlob, stamp } from '../export/files'
import { notify } from '../notifications/toastStore'
import { addCprToStudy, cprWindow, makeCpr, renderGray } from './actions'

/** The straightened curved reformat of the drawn path, with its height and slab thickness. */
export default function CprDialog() {
  const { t } = useTranslation()
  const [height, setHeight] = useState(60)
  const [thickness, setThickness] = useState(0)
  const holder = useRef<HTMLDivElement>(null)
  const image = useMemo(() => makeCpr(height, thickness), [height, thickness])
  const canvas = useMemo(() => {
    if (!image) return null
    const window = cprWindow() ?? { lower: -160, upper: 240 }
    const rendered = renderGray(image.data, image.columns, image.rows, window)
    rendered.className = 'max-h-[50dvh] w-full object-contain [image-rendering:pixelated]'
    rendered.setAttribute('aria-label', t('cpr.image'))
    rendered.setAttribute('role', 'img')
    return rendered
  }, [image, t])

  useEffect(() => {
    if (canvas && holder.current) holder.current.replaceChildren(canvas)
  }, [canvas])

  return (
    <Modal title={t('cpr.title')} onClose={closeDialog}>
      <div className="space-y-3 overflow-auto p-4 text-sm text-slate-300">
        {!image ? (
          <p>{t('cpr.needPath')}</p>
        ) : (
          <>
            <div ref={holder} className="rounded bg-black" />
            <p data-testid="cpr-size">{t('cpr.size', { length: Math.round(image.length), columns: image.columns, rows: image.rows })}</p>
            <label className="flex items-center justify-between gap-2">
              {t('cpr.height')}
              <input aria-label={t('cpr.height')} type="number" min={10} max={300} value={height} onChange={(e) => setHeight(Math.max(10, Math.min(300, Number(e.target.value) || 60)))} className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1" />
            </label>
            <label className="flex items-center justify-between gap-2">
              {t('cpr.thickness')}
              <input aria-label={t('cpr.thickness')} type="number" min={0} max={40} value={thickness} onChange={(e) => setThickness(Math.max(0, Math.min(40, Number(e.target.value) || 0)))} className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1" />
            </label>
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-800 p-3">
        <button className={SECONDARY} onClick={closeDialog}>
          {t('dialogs.close')}
        </button>
        <button className={SECONDARY} disabled={!canvas} onClick={() => canvas?.toBlob((blob) => blob && downloadBlob(blob, `cpr-${stamp()}.png`), 'image/png')}>
          {t('cpr.savePng')}
        </button>
        <button
          className={PRIMARY}
          disabled={!image}
          onClick={async () => {
            await addCprToStudy(image!)
            notify(t('cpr.added'), 'success')
            closeDialog()
          }}
        >
          {t('cpr.addSeries')}
        </button>
      </div>
    </Modal>
  )
}
