import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { openFiles } from '../app/openFiles'
import { closeDialog } from '../dialogs/dialogStore'
import { INPUT, Modal, PRIMARY, SECONDARY } from '../dialogs/Modal'
import { formatStudyDate } from '../i18n/format'
import { downloadText } from '../measurements/manage'
import { useSettings } from '../store/settingsStore'
import { useViewer } from '../store/viewerStore'
import { STATUSES, filterStudies, parseKeywords, studiesCsv, type ArchivedStudy, type StudyStatus } from './archive'
import { deleteStudy, listStudies, loadStudyFiles, storageEstimate, updateStudy } from './db'
import { saveCurrentStudy } from './save'

const SELECT = 'rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-xs text-slate-200'
const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10

/** Studies saved in this browser: search, status, keywords, open, delete, CSV, space used. */
export default function ArchiveDialog() {
  const { t } = useTranslation()
  const [studies, setStudies] = useState<ArchivedStudy[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StudyStatus | 'all'>('all')
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)
  const limit = useSettings((s) => s.archiveLimitMb)
  const hasOpenStudy = useViewer((s) => s.studies.length > 0)

  const refresh = useCallback(async () => {
    try {
      setStudies(await listStudies())
      setEstimate(await storageEstimate())
    } catch (reason) {
      setError(String(reason))
    }
  }, [])

  // Read once the dialog is shown (the database answers asynchronously).
  useEffect(() => {
    void Promise.resolve().then(refresh)
  }, [refresh])

  const shown = studies ? filterStudies(studies, query, status) : []
  const used = (studies ?? []).reduce((sum, s) => sum + s.bytes, 0)
  const change = async (id: string, value: Partial<ArchivedStudy>) => {
    await updateStudy(id, value)
    await refresh()
  }

  return (
    <Modal title={t('archive.title')} onClose={closeDialog}>
      <div className="flex min-h-0 flex-col gap-2 p-4" data-testid="archive">
        <p className="text-xs text-slate-400">{t('notice.archive')}</p>
        <p className="text-xs text-slate-300" data-testid="archive-usage">
          {t('archive.usage', { used: mb(used), limit, count: studies?.length ?? 0 })}
          {estimate && estimate.quota > 0 && ` · ${t('archive.browserSpace', { free: Math.round((estimate.quota - estimate.usage) / 1024 / 1024) })}`}
        </p>
        <div className="flex flex-wrap gap-2">
          {hasOpenStudy && (
            <button className={PRIMARY} onClick={() => void saveCurrentStudy().then(refresh)}>
              {t('archive.saveCurrent')}
            </button>
          )}
          <button className={SECONDARY} disabled={!studies?.length} onClick={() => downloadText(studiesCsv(shown), 'dicomlens-archive.csv', 'text/csv')}>
            {t('archive.csv')}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <input aria-label={t('archive.search')} placeholder={t('archive.search')} className={`${INPUT} min-w-0 flex-1`} value={query} onChange={(e) => setQuery(e.target.value)} />
          <select aria-label={t('archive.statusFilter')} className={SELECT} value={status} onChange={(e) => setStatus(e.target.value as StudyStatus | 'all')}>
            <option value="all">{t('archive.allStatuses')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`archive.statuses.${s}`)}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-red-300">{t('archive.unavailable', { error })}</p>}
        {studies && !studies.length && <p className="text-sm text-slate-400">{t('archive.empty')}</p>}
        <ul className="min-h-0 space-y-2 overflow-y-auto" data-testid="archive-list">
          {shown.map((study) => (
            <li key={study.id} className="rounded border border-slate-800 p-2 text-xs text-slate-300" aria-label={study.patientName || study.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-100">{study.patientName || t('viewport.anonymous')}</span>
                <span>{study.patientId}</span>
                <span>{formatStudyDate(study.studyDate)}</span>
                <span className="text-sky-300">{study.modalities.join(' ')}</span>
                <span className="ms-auto">{t('archive.size', { mb: mb(study.bytes), files: study.files })}</span>
              </div>
              <p className="text-slate-400">{study.description}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <select aria-label={t('archive.status')} className={SELECT} value={study.status} onChange={(e) => void change(study.id, { status: e.target.value as StudyStatus })}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`archive.statuses.${s}`)}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={t('archive.keywords')}
                  placeholder={t('archive.keywords')}
                  defaultValue={study.keywords.join(', ')}
                  className={`${SELECT} min-w-0 flex-1`}
                  onBlur={(e) => void change(study.id, { keywords: parseKeywords(e.target.value) })}
                />
                <button
                  className={PRIMARY}
                  onClick={async () => {
                    const files = await loadStudyFiles(study.id)
                    closeDialog()
                    await openFiles(files)
                  }}
                >
                  {t('archive.open')}
                </button>
                <button
                  className={SECONDARY}
                  onClick={async () => {
                    if (!window.confirm(t('archive.deleteConfirm', { name: study.patientName || study.id }))) return
                    await deleteStudy(study.id)
                    await refresh()
                  }}
                >
                  {t('archive.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-end border-t border-slate-800 px-4 py-3">
        <button className={SECONDARY} onClick={closeDialog}>
          {t('dialogs.close')}
        </button>
      </div>
    </Modal>
  )
}
