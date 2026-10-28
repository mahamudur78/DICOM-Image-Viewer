// Measurements made of several annotations: a length ratio (two lines) and an
// ellipsoid volume (three diameters, on any images or MPR planes). Members are
// tagged in their own data, so groups survive undo, copy and JSON files.
import { utilities } from '@cornerstonejs/core'
import { annotation as csAnnotation } from '@cornerstonejs/tools'
import type { Annotation } from '@cornerstonejs/tools/types'
import { ellipsoidVolume } from './geometry'
import { measureAnnotation, toolNameOf } from './measure'

export const RATIO_TOOL = 'LengthRatio'
export const ELLIPSOID_TOOL = 'EllipsoidAxis'

/** Annotations per group, by tool. */
export const GROUP_SIZES: Record<string, number> = { [RATIO_TOOL]: 2, [ELLIPSOID_TOOL]: 3 }

interface GroupData {
  groupId?: string
  groupIndex?: number
}

const groupData = (annotation: Annotation) => annotation.data as GroupData

const sameTool = (toolName: string) =>
  csAnnotation.state.getAllAnnotations().filter((a) => toolNameOf(a) === toolName && groupData(a).groupId)

/** Adds a newly drawn annotation to the open group of its tool, or starts a new group. */
export function joinGroup(annotation: Annotation) {
  const toolName = toolNameOf(annotation)
  const size = GROUP_SIZES[toolName]
  const data = groupData(annotation)
  if (!size || data.groupId) return
  const others = sameTool(toolName).filter((a) => a !== annotation)
  const last = others.at(-1) && groupData(others.at(-1)!).groupId
  const members = last ? others.filter((a) => groupData(a).groupId === last).length : size
  data.groupId = members < size ? last! : utilities.uuidv4()
  data.groupIndex = members < size ? members : 0
}

/** Members of an annotation's group in drawing order. */
export function groupMembers(annotation: Annotation) {
  const { groupId } = groupData(annotation)
  if (!groupId) return [annotation]
  return sameTool(toolNameOf(annotation))
    .filter((a) => groupData(a).groupId === groupId)
    .sort((a, b) => (groupData(a).groupIndex ?? 0) - (groupData(b).groupIndex ?? 0))
}

export interface GroupResult {
  /** Position of this annotation in its group (0-based) and the group's size. */
  index: number
  size: number
  ratio?: number
  /** Ellipsoid volume in base units cubed. */
  volume?: number
  base?: string
}

export function groupResult(annotation: Annotation): GroupResult | null {
  const size = GROUP_SIZES[toolNameOf(annotation)]
  if (!size) return null
  const members = groupMembers(annotation)
  const index = members.indexOf(annotation)
  const results = members.map(measureAnnotation)
  const lengths = results.map((r) => r?.length)
  const result: GroupResult = { index, size }
  if (members.length < size || lengths.some((l) => l === undefined)) return result
  const base = results[0]!.base
  if (size === 2 && lengths[1]! > 0) result.ratio = lengths[0]! / lengths[1]!
  // A volume needs all three diameters in the same unit.
  if (size === 3 && results.every((r) => r!.base === base)) {
    result.volume = ellipsoidVolume(lengths[0]!, lengths[1]!, lengths[2]!)
    result.base = base
  }
  return result
}
