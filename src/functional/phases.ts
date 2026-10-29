// Dynamic series: the same slice positions imaged at several times (DCE,
// perfusion, 4D CT). Splits a series' images into phases.

export interface PhaseInput {
  /** Position along the slice normal (mm), or null. */
  sliceLocation: number | null
  /** Temporal Position Identifier (0020,0100). */
  temporalPosition?: number
  /** Trigger Time (0018,1060), ms. */
  triggerTime?: number
  /** Acquisition time, seconds since midnight. */
  acquisitionTime: number | null
  instanceNumber: number
}

export interface Phases {
  /** Image indexes of each phase, in slice-position order. */
  byPhase: number[][]
  /** Time of each phase in seconds from the first one (or the phase number when no time is known). */
  times: number[]
  /** Whether times are real (from the header), not just phase numbers. */
  timed: boolean
}

const round = (v: number) => Math.round(v * 100) / 100

/**
 * The phases of a series, or null when it is not dynamic (every phase must
 * cover the same slice positions, and there must be at least two phases).
 */
export function splitPhases(images: PhaseInput[]): Phases | null {
  if (images.length < 2) return null
  const indexes = images.map((_, i) => i)
  let groups: number[][]
  const temporal = new Set(images.map((image) => image.temporalPosition).filter((t) => t !== undefined))
  if (temporal.size > 1) {
    const keys = [...temporal].sort((a, b) => a! - b!)
    groups = keys.map((key) => indexes.filter((i) => images[i].temporalPosition === key))
  } else {
    // Without temporal tags: the n-th image at each position belongs to phase n.
    const byPosition = new Map<number, number[]>()
    for (const i of indexes) {
      const location = images[i].sliceLocation
      if (location === null) return null
      const key = round(location)
      byPosition.set(key, [...(byPosition.get(key) ?? []), i])
    }
    const lists = [...byPosition.values()].map((list) =>
      list.sort((a, b) => (images[a].acquisitionTime ?? 0) - (images[b].acquisitionTime ?? 0) || images[a].instanceNumber - images[b].instanceNumber),
    )
    const count = lists[0].length
    if (count < 2 || lists.some((list) => list.length !== count)) return null
    groups = Array.from({ length: count }, (_, phase) => lists.map((list) => list[phase]))
  }
  if (groups.length < 2) return null
  const size = groups[0].length
  if (groups.some((g) => g.length !== size)) return null
  // The same positions in every phase.
  const positions = (g: number[]) => g.map((i) => round(images[i].sliceLocation ?? NaN)).sort((a, b) => a - b).join()
  if (groups.some((g) => positions(g) !== positions(groups[0]))) return null
  const byPhase = groups.map((g) => [...g].sort((a, b) => (images[a].sliceLocation ?? 0) - (images[b].sliceLocation ?? 0)))

  const timeOf = (g: number[]) => {
    const trigger = images[g[0]].triggerTime
    if (trigger !== undefined) return trigger / 1000
    const acquisition = images[g[0]].acquisitionTime
    return acquisition ?? null
  }
  const raw = byPhase.map(timeOf)
  const timed = raw.every((t) => t !== null) && new Set(raw).size === raw.length
  const times = timed ? raw.map((t) => round(t! - raw[0]!)) : byPhase.map((_, i) => i)
  return { byPhase, times, timed }
}

/** The image of a phase at the same slice position as another image of the series. */
export function sameSliceInPhase(phases: Phases, imageIndex: number, phase: number) {
  for (const group of phases.byPhase) {
    const slot = group.indexOf(imageIndex)
    if (slot >= 0) return phases.byPhase[phase][slot]
  }
  return -1
}
