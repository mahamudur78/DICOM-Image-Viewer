// Applies the chosen theme (or the system's) to the page.
import { useSettings, type Theme } from './store/settingsStore'

const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null

export const resolvedTheme = (theme: Theme) => (theme === 'system' ? (query?.matches ? 'light' : 'dark') : theme)

function apply() {
  document.documentElement.dataset.theme = resolvedTheme(useSettings.getState().theme)
}

apply()
useSettings.subscribe((state, previous) => state.theme !== previous.theme && apply())
query?.addEventListener('change', apply)
