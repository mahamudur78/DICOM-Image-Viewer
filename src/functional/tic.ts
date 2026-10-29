// Time-intensity curves of dynamic contrast imaging, classified as in
// breast MR (Kuhl): type I persistent (Ia straight, Ib bending), type II
// plateau, type III washout.

export interface CurvePoint {
  /** Seconds from the first phase. */
  t: number
  value: number
}

export type CurveType = 'Ia' | 'Ib' | 'II' | 'III'

export interface CurveAnalysis {
  type: CurveType
  baseline: number
  peak: number
  /** Seconds from the first phase to the peak. */
  timeToPeak: number
  /** Enhancement at the early point, % over baseline. */
  initialEnhancement: number
  /** % of baseline per minute, from baseline to the early point. */
  washIn: number
  /** % of the peak per minute, from the peak to the last point (negative when it falls). */
  washOut: number
  /** Change from the early point to the last one, %. */
  delayedChange: number
}

/** The early (initial-phase) point: the highest within 2 minutes, or the second point. */
function earlyIndex(curve: CurvePoint[]) {
  let best = 1
  for (let i = 1; i < curve.length && curve[i].t - curve[0].t <= 120; i++) if (curve[i].value > curve[best].value) best = i
  return best
}

export function analyzeCurve(curve: CurvePoint[]): CurveAnalysis | null {
  if (curve.length < 3) return null
  const baseline = curve[0].value
  const early = earlyIndex(curve)
  const last = curve[curve.length - 1]
  let peakIndex = 0
  curve.forEach((p, i) => p.value > curve[peakIndex].value && (peakIndex = i))
  const peak = curve[peakIndex]
  const percent = (a: number, b: number) => (b === 0 ? 0 : ((a - b) / Math.abs(b)) * 100)
  const minutes = (dt: number) => (dt > 0 ? dt / 60 : 1)
  const delayedChange = percent(last.value, curve[early].value)

  let type: CurveType
  if (delayedChange > 10) {
    // Persistent: straight (Ia) when the late rise keeps its pace, else bending (Ib).
    const late = curve.slice(early)
    const half = Math.floor(late.length / 2)
    const slope = (a: CurvePoint, b: CurvePoint) => (b.value - a.value) / Math.max(1e-6, b.t - a.t)
    const first = slope(late[0], late[half])
    const second = slope(late[half], late[late.length - 1])
    type = second >= first * 0.7 ? 'Ia' : 'Ib'
  } else if (delayedChange >= -10) type = 'II'
  else type = 'III'

  return {
    type,
    baseline,
    peak: peak.value,
    timeToPeak: peak.t - curve[0].t,
    initialEnhancement: percent(curve[early].value, baseline),
    washIn: percent(curve[early].value, baseline) / minutes(curve[early].t - curve[0].t),
    washOut: peakIndex === curve.length - 1 ? 0 : percent(last.value, peak.value) / minutes(last.t - peak.t),
    delayedChange,
  }
}

export function curvesCsv(curves: { name: string; points: CurvePoint[] }[]) {
  const times = [...new Set(curves.flatMap((c) => c.points.map((p) => p.t)))].sort((a, b) => a - b)
  const header = ['Time (s)', ...curves.map((c) => `"${c.name.replace(/"/g, '""')}"`)]
  const rows = times.map((t) => [t, ...curves.map((c) => c.points.find((p) => p.t === t)?.value.toFixed(2) ?? '')])
  return [header, ...rows].map((r) => r.join(',')).join('\r\n') + '\r\n'
}
