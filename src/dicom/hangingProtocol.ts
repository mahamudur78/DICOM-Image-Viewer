import type { PlaneName } from '../comparison/planes'
import type { DisplaySet, Series, Study } from './types'

/**
 * Orders series for the initial grid: localizers (scouts) first so reference
 * lines show up on them, then images, then videos, reports and PDFs, each
 * in study/series order.
 */
export function hangingOrder(studies: Study[]): DisplaySet[] {
  const displaySets = studies.flatMap((study) => study.series.map((series) => ({ study, series })))
  const images = displaySets.filter(({ series }) => series.kind === 'image')
  return [
    ...images.filter(({ series }) => series.isLocalizer),
    ...images.filter(({ series }) => !series.isLocalizer),
    ...displaySets.filter(({ series }) => series.kind !== 'image'),
  ]
}

// --- rules -------------------------------------------------------------------------

/** What a grid cell should show: a series of the current or prior study. */
export interface CellRule {
  /** From the patient's most recent earlier study instead of the current one. */
  prior?: boolean
  modality?: string
  /** Words the series description must contain; "|" separates alternatives ("dwi|diffusion"). */
  description?: string
  plane?: PlaneName
}

/** When a study opens with a matching series, lay the grid out like this. */
export interface HangingRule {
  id: string
  name: string
  modality: string
  /** Body Part Examined, or words of the study/series description; "|" separates alternatives. */
  bodyPart?: string
  needsPrior?: boolean
  layout: { rows: number; cols: number }
  cells: CellRule[]
  builtIn?: boolean
}

export const BUILT_IN_RULES: HangingRule[] = [
  {
    id: 'builtin-mr-brain',
    name: 'MR brain',
    modality: 'MR',
    bodyPart: 'head|brain|neuro',
    layout: { rows: 2, cols: 2 },
    cells: [{ description: 't1' }, { description: 't2' }, { description: 'flair' }, { description: 'dwi|diffusion|adc' }],
    builtIn: true,
  },
  {
    id: 'builtin-ct-prior',
    name: 'CT with prior',
    modality: 'CT',
    needsPrior: true,
    layout: { rows: 1, cols: 2 },
    cells: [{ modality: 'CT', plane: 'axial' }, { prior: true, modality: 'CT', plane: 'axial' }],
    builtIn: true,
  },
  {
    id: 'builtin-mr-prior',
    name: 'MR with prior',
    modality: 'MR',
    needsPrior: true,
    layout: { rows: 1, cols: 2 },
    cells: [{ modality: 'MR' }, { prior: true, modality: 'MR' }],
    builtIn: true,
  },
]

const lower = (text: string | undefined) => (text ?? '').toLocaleLowerCase()

/** Whether text contains every word of one of the "|"-separated alternatives. */
export function matchesWords(text: string, pattern: string) {
  const haystack = lower(text)
  return pattern
    .split('|')
    .map((alternative) => lower(alternative).split(/\s+/).filter(Boolean))
    .some((words) => words.length > 0 && words.every((word) => haystack.includes(word)))
}

function cellScore(series: Series, rule: CellRule) {
  if (series.kind !== 'image') return -1
  if (rule.modality && series.modality !== rule.modality) return -1
  if (rule.description && !matchesWords(series.description, rule.description)) return -1
  if (rule.plane && series.plane && series.plane !== rule.plane) return -1
  return (rule.plane && series.plane === rule.plane ? 2 : 0) + (series.isLocalizer ? 0 : 1) + series.images.length / 1e6
}

/**
 * The first rule matching the current study (the newest study of the first
 * patient), with the display set of every cell; cells no series fits get the
 * remaining series in the default order, so nothing is hidden.
 */
export function applyHangingRules(rules: HangingRule[], studies: Study[]) {
  const current = studies[0]
  if (!current) return null
  const prior = studies.find((s, i) => i > 0 && (s.patientId || s.patientName) === (current.patientId || current.patientName) && s.studyDate <= current.studyDate)
  for (const rule of rules) {
    if (!current.series.some((s) => s.kind === 'image' && s.modality === rule.modality)) continue
    if (rule.needsPrior && !prior) continue
    if (rule.bodyPart && !current.series.some((s) => matchesWords([s.bodyPart, s.description, current.description].join(' '), rule.bodyPart!))) continue

    const used = new Set<Series>()
    const cells: (DisplaySet | null)[] = rule.cells.map((cellRule) => {
      const study = cellRule.prior ? prior : current
      if (!study) return null
      const best = study.series
        .filter((s) => !used.has(s))
        .map((series) => ({ series, score: cellScore(series, cellRule) }))
        .filter((c) => c.score >= 0)
        .sort((a, b) => b.score - a.score)[0]
      if (!best) return null
      used.add(best.series)
      return { study, series: best.series }
    })
    // A rule that places nothing of the current study does not apply.
    if (!cells.some((cell) => cell?.study === current)) continue
    const rest = hangingOrder(studies).filter((d) => !used.has(d.series))
    const filled = cells.map((cell) => cell ?? rest.shift() ?? null)
    return { rule, layout: rule.layout, cells: filled, rest }
  }
  return null
}

/** A rule that reproduces the current grid for studies like this one. */
export function ruleFromGrid(name: string, layout: { rows: number; cols: number }, cells: (DisplaySet | null)[], current: Study): HangingRule | null {
  const shown = cells.slice(0, layout.rows * layout.cols)
  const first = shown.find((cell) => cell?.study === current) ?? shown.find(Boolean)
  if (!first) return null
  return {
    id: `rule-${Date.now().toString(36)}`,
    name,
    modality: first.series.modality,
    bodyPart: first.series.bodyPart || undefined,
    needsPrior: shown.some((cell) => cell && cell.study !== current),
    layout,
    cells: shown.map((cell) =>
      cell
        ? {
            prior: cell.study !== current || undefined,
            modality: cell.series.modality,
            description: cell.series.description.trim() || undefined,
            plane: cell.series.plane,
          }
        : {},
    ),
  }
}
