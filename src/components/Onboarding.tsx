import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings } from '../store/settingsStore'

const STEPS = ['open', 'tools', 'menus', 'privacy'] as const

/** A short first-visit guide; closing it (or finishing) does not show it again. */
export function Onboarding() {
  const { t } = useTranslation()
  const done = useSettings((s) => s.onboardingDone)
  const finish = () => useSettings.getState().setOnboardingDone(true)
  const [step, setStep] = useState(0)
  if (done) return null
  const last = step === STEPS.length - 1
  return (
    <section aria-labelledby="onboarding-title" className="mx-auto mt-6 w-full max-w-md rounded-xl border border-sky-500/40 bg-slate-900 p-4 text-start text-sm text-slate-300 shadow-lg" data-testid="onboarding">
      <p className="text-xs text-slate-500">{t('onboarding.step', { step: step + 1, count: STEPS.length })}</p>
      <h2 id="onboarding-title" className="mt-1 font-semibold text-slate-100">
        {t(`onboarding.${STEPS[step]}.title`)}
      </h2>
      <p className="mt-1">{t(`onboarding.${STEPS[step]}.body`)}</p>
      <div className="mt-3 flex justify-end gap-2">
        <button className="rounded px-3 py-1 text-slate-400 hover:bg-slate-800" onClick={finish}>
          {t('onboarding.skip')}
        </button>
        <button className="rounded bg-sky-600 px-3 py-1 font-semibold text-white hover:bg-sky-500" onClick={() => (last ? finish() : setStep(step + 1))}>
          {last ? t('onboarding.done') : t('onboarding.next')}
        </button>
      </div>
    </section>
  )
}
