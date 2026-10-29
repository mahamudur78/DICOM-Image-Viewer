import { useTranslation } from 'react-i18next'
import { BUILT_IN_RULES, type HangingRule } from '../dicom/hangingProtocol'
import { useSettings } from '../store/settingsStore'
import { closeDialog } from './dialogStore'
import { Modal, SECONDARY } from './Modal'

export default function HangingRulesDialog() {
  const { t } = useTranslation()
  const rules = useSettings((s) => s.hangingRules)
  const { removeHangingRule } = useSettings.getState()
  const describe = (rule: HangingRule) =>
    t('hangingDialog.describe', {
      modality: rule.modality,
      rows: rule.layout.rows,
      cols: rule.layout.cols,
      prior: rule.needsPrior ? t('hangingDialog.withPrior') : '',
    }).trim()

  return (
    <Modal title={t('hangingDialog.title')} onClose={closeDialog}>
      <div className="min-h-0 flex-1 overflow-auto p-4 text-sm">
        <p className="mb-3 text-slate-400">{t('hangingDialog.intro')}</p>
        <h3 className="mb-1 text-xs font-semibold text-slate-400">{t('hangingDialog.mine')}</h3>
        {rules.length === 0 && <p className="mb-3 text-slate-500">{t('hangingDialog.empty')}</p>}
        <ul className="mb-4 space-y-1">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center gap-2">
              <span className="flex-1 text-slate-100">{rule.name}</span>
              <span className="text-xs text-slate-400">{describe(rule)}</span>
              <button className={SECONDARY} aria-label={t('hangingDialog.delete', { name: rule.name })} onClick={() => removeHangingRule(rule.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <h3 className="mb-1 text-xs font-semibold text-slate-400">{t('hangingDialog.builtIn')}</h3>
        <ul className="space-y-1">
          {BUILT_IN_RULES.map((rule) => (
            <li key={rule.id} className="flex items-center gap-2">
              <span className="flex-1 text-slate-300">{rule.name}</span>
              <span className="text-xs text-slate-500">{describe(rule)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-end border-t border-slate-800 p-3">
        <button onClick={closeDialog} className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-700">
          {t('dialogs.close')}
        </button>
      </div>
    </Modal>
  )
}
