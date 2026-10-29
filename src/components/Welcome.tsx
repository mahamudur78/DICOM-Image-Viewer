import { useTranslation } from 'react-i18next'
import type { SourceFile } from '../dicom/collectFiles'
import { FilePickers } from './FilePickers'
import { Onboarding } from './Onboarding'

export function Welcome({ onFiles }: { onFiles: (files: SourceFile[]) => void }) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-sky-500/10 text-3xl">🩻</div>
      <h1 className="text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">{t('welcome.title')}</h1>
      <p className="mt-3 text-slate-400">
        {t('welcome.intro')} <strong className="text-slate-200">{t('welcome.introStrong')}</strong>
        {t('welcome.introEnd')}
      </p>

      <div className="mt-8 w-full rounded-2xl border-2 border-dashed border-slate-700 bg-slate-900/50 px-6 py-10">
        <p className="mb-4 text-slate-300">{t('welcome.dropHint')}</p>
        <FilePickers onFiles={onFiles} />
        <button className="mt-3 text-sm text-sky-300 underline-offset-2 hover:underline" onClick={() => void import('../app/sampleStudy').then((m) => onFiles(m.sampleStudy()))}>
          {t('welcome.trySample')}
        </button>
        <p className="mt-4 text-xs text-slate-500">{t('welcome.supports')}</p>
      </div>
      <Onboarding />

      <ul className="mt-8 grid w-full gap-3 text-start text-sm text-slate-400 sm:grid-cols-3">
        <li className="rounded-lg bg-slate-900 p-3">{t('welcome.featurePrivate')}</li>
        <li className="rounded-lg bg-slate-900 p-3">{t('welcome.featureTools')}</li>
        <li className="rounded-lg bg-slate-900 p-3">{t('welcome.featureTags')}</li>
      </ul>

      <p className="mt-8 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200" data-testid="diagnostic-notice">
        {t('notice.diagnostic')}
      </p>
      <p className="mt-2 text-xs text-slate-500">{t('notice.privacy')}</p>
    </div>
  )
}
