import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { COMMANDS } from '../commands/commands'
import { DEFAULT_KEYMAP, effectiveKeymap, keyConflicts, keyFromEvent, keyLabel } from '../commands/keymap'
import { downloadText } from '../measurements/manage'
import { LANGUAGES } from '../i18n'
import { DEFAULT_SETTINGS, migrateSettings, useSettings, type DisplaySettings, type MouseTool, type Settings, type Theme } from '../store/settingsStore'
import { closeDialog } from './dialogStore'
import { Modal, SECONDARY } from './Modal'

const TABS = ['general', 'display', 'input', 'shortcuts', 'data', 'about'] as const
type Tab = (typeof TABS)[number]

const SELECT = 'rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1 text-sm text-slate-200">
      <span>{label}</span>
      {children}
    </label>
  )
}

/** Every preference in one place, with export and import. */
export default function SettingsDialog({ tab: initial }: { tab?: string }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>(TABS.includes(initial as Tab) ? (initial as Tab) : 'general')
  return (
    <Modal title={t('settings.title')} onClose={closeDialog}>
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <nav role="tablist" aria-label={t('settings.title')} className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-800 p-2 sm:flex-col sm:border-b-0 sm:border-e">
          {TABS.map((name) => (
            <button
              key={name}
              role="tab"
              aria-selected={tab === name}
              onClick={() => setTab(name)}
              className="whitespace-nowrap rounded px-3 py-1.5 text-start text-sm text-slate-300 hover:bg-slate-800 aria-selected:bg-sky-600 aria-selected:text-white"
            >
              {t(`settings.tabs.${name}`)}
            </button>
          ))}
        </nav>
        <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto p-4" data-testid={`settings-${tab}`}>
          {tab === 'general' && <General />}
          {tab === 'display' && <Display />}
          {tab === 'input' && <Input />}
          {tab === 'shortcuts' && <Shortcuts />}
          {tab === 'data' && <Data />}
          {tab === 'about' && <About />}
        </div>
      </div>
      <div className="flex justify-end border-t border-slate-800 px-4 py-3">
        <button className={SECONDARY} onClick={closeDialog}>
          {t('dialogs.close')}
        </button>
      </div>
    </Modal>
  )
}

function General() {
  const { t } = useTranslation()
  const s = useSettings()
  return (
    <div className="space-y-1">
      <Row label={t('settings.language')}>
        <select aria-label={t('settings.language')} className={SELECT} value={s.language} onChange={(e) => s.setLanguage(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
              {l.complete ? '' : ` (${t('settings.partial')})`}
            </option>
          ))}
        </select>
      </Row>
      <Row label={t('settings.theme')}>
        <select aria-label={t('settings.theme')} className={SELECT} value={s.theme} onChange={(e) => s.setTheme(e.target.value as Theme)}>
          {(['system', 'dark', 'light', 'contrast'] as const).map((theme) => (
            <option key={theme} value={theme}>
              {t(`settings.themes.${theme}`)}
            </option>
          ))}
        </select>
      </Row>
      <Row label={t('settings.unit')}>
        <select aria-label={t('settings.unit')} className={SELECT} value={s.measureUnit} onChange={(e) => s.setMeasureUnit(e.target.value as 'mm' | 'cm')}>
          <option value="mm">mm</option>
          <option value="cm">cm</option>
        </select>
      </Row>
      <Row label={t('settings.dpi')}>
        <input aria-label={t('settings.dpi')} type="number" min={50} max={600} className={`${SELECT} w-24`} value={s.screenDpi} onChange={(e) => Number(e.target.value) >= 50 && s.setScreenDpi(Number(e.target.value))} />
      </Row>
      <Row label={t('settings.archiveLimit')}>
        <input aria-label={t('settings.archiveLimit')} type="number" min={50} step={50} className={`${SELECT} w-24`} value={s.archiveLimitMb} onChange={(e) => Number(e.target.value) >= 50 && s.setArchiveLimit(Number(e.target.value))} />
      </Row>
      <button className={`${SECONDARY} mt-2`} onClick={() => s.setOnboardingDone(false)}>
        {t('settings.showGuide')}
      </button>
    </div>
  )
}

function Display() {
  const { t } = useTranslation()
  const display = useSettings((s) => s.display)
  const toggle = useSettings((s) => s.toggleDisplay)
  return (
    <div>
      {(Object.keys(display) as (keyof DisplaySettings)[]).map((key) => (
        <label key={key} className="flex items-center gap-2 py-1 text-sm text-slate-200">
          <input type="checkbox" checked={display[key]} onChange={() => toggle(key)} />
          {t(`display.${key}`)}
        </label>
      ))}
    </div>
  )
}

function Input() {
  const { t } = useTranslation()
  const input = useSettings((s) => s.input)
  const setInput = useSettings((s) => s.setInput)
  const tools: MouseTool[] = ['pan', 'zoom', 'windowLevel', 'scroll', 'none']
  const select = (field: 'middle' | 'right') => (
    <select aria-label={t(`settings.input.${field}`)} className={SELECT} value={input[field]} onChange={(e) => setInput({ [field]: e.target.value as MouseTool })}>
      {tools.map((tool) => (
        <option key={tool} value={tool}>
          {t(`settings.mouseTools.${tool}`)}
        </option>
      ))}
    </select>
  )
  return (
    <div className="space-y-1">
      <p className="pb-2 text-xs text-slate-400">{t('settings.input.leftHint')}</p>
      <Row label={t('settings.input.middle')}>{select('middle')}</Row>
      <Row label={t('settings.input.right')}>{select('right')}</Row>
      <Row label={t('settings.input.wheel')}>
        <select aria-label={t('settings.input.wheel')} className={SELECT} value={input.wheel} onChange={(e) => setInput({ wheel: e.target.value as 'scroll' | 'zoom' })}>
          <option value="scroll">{t('settings.mouseTools.scroll')}</option>
          <option value="zoom">{t('settings.mouseTools.zoom')}</option>
        </select>
      </Row>
      <Row label={t('settings.input.oneFinger')}>
        <select aria-label={t('settings.input.oneFinger')} className={SELECT} value={input.oneFinger} onChange={(e) => setInput({ oneFinger: e.target.value as 'tool' | 'scroll' })}>
          <option value="tool">{t('settings.input.selectedTool')}</option>
          <option value="scroll">{t('settings.mouseTools.scroll')}</option>
        </select>
      </Row>
      <p className="pt-2 text-xs text-slate-400">{t('settings.input.touchHint')}</p>
    </div>
  )
}

function Shortcuts() {
  const { t } = useTranslation()
  const keymap = useSettings((s) => s.keymap)
  const setShortcut = useSettings((s) => s.setShortcut)
  const resetShortcuts = useSettings((s) => s.resetShortcuts)
  const [recording, setRecording] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const effective = effectiveKeymap(keymap)

  useEffect(() => {
    if (!recording) return
    const onKey = (event: KeyboardEvent) => {
      if (['Control', 'Meta', 'Shift', 'Alt'].includes(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') return setRecording(null)
      const key = keyFromEvent(event)
      const next = { ...keymap, [recording]: [key] }
      const conflicts = keyConflicts(effectiveKeymap(next)).filter(([k]) => k === key)
      if (conflicts.length) {
        const other = conflicts[0][1].find((id) => id !== recording)!
        const command = COMMANDS.find((c) => c.id === other)
        setProblem(t('settings.conflict', { key: keyLabel(key), command: command ? t(command.label, command.labelValues) : other }))
      } else {
        setShortcut(recording, [key])
        setProblem(null)
      }
      setRecording(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, keymap, setShortcut, t])

  const commands = COMMANDS.filter((c) => DEFAULT_KEYMAP[c.id] || keymap[c.id])
  return (
    <div className="space-y-2">
      {problem && (
        <p role="alert" className="rounded bg-amber-500/15 px-2 py-1 text-xs text-amber-300">
          {problem}
        </p>
      )}
      <table className="w-full text-left text-sm" data-testid="shortcut-editor">
        <tbody>
          {commands.map((c) => {
            const label = t(c.label, c.labelValues)
            const changed = !!keymap[c.id]
            return (
              <tr key={c.id} className="border-t border-slate-800">
                <td className="py-1 pe-2 text-slate-200">{label}</td>
                <td className="py-1 font-mono text-xs text-slate-100">{(effective[c.id] ?? []).map(keyLabel).join(', ') || '—'}</td>
                <td className="py-1 text-end whitespace-nowrap">
                  <button className="rounded px-2 py-0.5 text-xs text-sky-300 hover:bg-slate-800" aria-label={t('settings.changeKey', { command: label })} onClick={() => setRecording(c.id)}>
                    {recording === c.id ? t('settings.pressKey') : t('settings.change')}
                  </button>
                  {changed && (
                    <button className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-800" aria-label={t('settings.resetKey', { command: label })} onClick={() => setShortcut(c.id, null)}>
                      ↺
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <button className={SECONDARY} onClick={resetShortcuts}>
        {t('settings.resetShortcuts')}
      </button>
    </div>
  )
}

function Data() {
  const { t } = useTranslation()
  const [message, setMessage] = useState<string | null>(null)
  const exportSettings = () => {
    const { language, theme, input, keymap, archiveLimitMb, onboardingDone, links, display, presets, screenDpi, measureUnit, hangingRules, exportPrefs, pinnedTags, anonymizeTemplates, vrPresets } = useSettings.getState()
    const settings: Settings = { language, theme, input, keymap, archiveLimitMb, onboardingDone, links, display, presets, screenDpi, measureUnit, hangingRules, exportPrefs, pinnedTags, anonymizeTemplates, vrPresets }
    downloadText(JSON.stringify({ format: 'dicomlens-settings', version: 1, settings }, null, 2), 'dicomlens-settings.json', 'application/json')
  }
  const importSettings = async (file: File | undefined) => {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as { format?: string; settings?: unknown }
      if (parsed.format !== 'dicomlens-settings') throw new Error('format')
      useSettings.getState().replaceAll(migrateSettings(parsed.settings))
      setMessage(t('settings.imported'))
    } catch {
      setMessage(t('settings.importFailed'))
    }
  }
  return (
    <div className="space-y-3 text-sm text-slate-200">
      <p className="text-xs text-slate-400">{t('settings.dataHint')}</p>
      <div className="flex flex-wrap gap-2">
        <button className={SECONDARY} onClick={exportSettings}>
          {t('settings.export')}
        </button>
        <label className={`${SECONDARY} cursor-pointer`}>
          {t('settings.import')}
          <input type="file" accept="application/json,.json" className="sr-only" aria-label={t('settings.import')} onChange={(e) => void importSettings(e.target.files?.[0])} />
        </label>
        <button
          className={SECONDARY}
          onClick={() => {
            if (window.confirm(t('settings.resetConfirm'))) useSettings.getState().replaceAll(DEFAULT_SETTINGS)
          }}
        >
          {t('settings.resetAll')}
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </div>
  )
}

function About() {
  const { t } = useTranslation()
  return (
    <div className="space-y-3 text-sm text-slate-300">
      <p className="rounded border border-amber-500/40 bg-amber-500/10 p-2 font-semibold text-amber-200">{t('notice.diagnostic')}</p>
      <p>{t('notice.privacy')}</p>
      <p>{t('notice.archive')}</p>
      <p className="text-xs text-slate-500">{t('settings.version', { version: __APP_VERSION__ })}</p>
    </div>
  )
}
