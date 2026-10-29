import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { COMMANDS } from '../commands/commands'
import { keyLabel } from '../commands/keymap'
import { useSettings } from '../store/settingsStore'
import { closeDialog, openSettings } from './dialogStore'
import { INPUT, Modal, SECONDARY } from './Modal'

/** Every command that has a shortcut, searchable (opened with `?`). */
export default function ShortcutsDialog() {
  const { t } = useTranslation()
  useSettings((s) => s.keymap)
  const [query, setQuery] = useState('')
  const rows = useMemo(
    () =>
      COMMANDS.filter((c) => c.keys?.length)
        .map((c) => ({ id: c.id, label: t(c.label, c.labelValues), keys: c.keys!.map(keyLabel).join(', ') }))
        .filter((row) => !query || `${row.label} ${row.keys}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())),
    [t, query],
  )
  return (
    <Modal title={t('help.shortcutsTitle')} onClose={closeDialog}>
      <div className="flex min-h-0 flex-col gap-2 p-4">
        <input aria-label={t('help.search')} placeholder={t('help.search')} className={INPUT} value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="min-h-0 overflow-y-auto">
          <table className="w-full text-left text-sm" data-testid="shortcut-list">
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-800">
                  <td className="py-1 pe-3 text-slate-200">{row.label}</td>
                  <td className="py-1 text-end">
                    <kbd className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-slate-100">{row.keys}</kbd>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-800 px-4 py-3">
        <button
          className={SECONDARY}
          onClick={() => {
            closeDialog()
            openSettings('shortcuts')
          }}
        >
          {t('help.changeShortcuts')}
        </button>
        <button className={SECONDARY} onClick={closeDialog}>
          {t('dialogs.close')}
        </button>
      </div>
    </Modal>
  )
}
