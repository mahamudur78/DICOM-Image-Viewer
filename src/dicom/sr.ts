import type dicomParser from 'dicom-parser'
import { decodedText, firstItem, text } from './header'
import { formatDate, formatPersonName } from './parse'

/** One content item of a structured report (PS3.3 C.17.3). */
export interface SrNode {
  valueType: string
  relationship?: string
  /** Concept name, e.g. "Finding". */
  concept?: string
  /** Display value; empty for containers. */
  value?: string
  /** Referenced image (IMAGE / COMPOSITE items). */
  reference?: { sopClassUID?: string; sopInstanceUID: string; frames?: number[] }
  children: SrNode[]
}

export interface StructuredReport {
  title: string
  completion?: string
  verification?: string
  root: SrNode
}

const codeMeaning = (item: dicomParser.DataSet | undefined, charset: string | undefined) =>
  item && (decodedText(item, 'x00080104', charset) ?? text(item, 'x00080100'))

const formatTime = (value: string | undefined) =>
  value?.replace(/^(\d{2})(\d{2})(\d{2}).*/, '$1:$2:$3') ?? ''

/** Display value of a content item by value type. */
function valueOf(item: dicomParser.DataSet, valueType: string, charset: string | undefined): string | undefined {
  switch (valueType) {
    case 'TEXT':
      return decodedText(item, 'x0040a160', charset)
    case 'CODE':
      return codeMeaning(firstItem(item, 'x0040a168'), charset)
    case 'NUM': {
      const measured = firstItem(item, 'x0040a300')
      if (!measured) return undefined
      const value = text(measured, 'x0040a30a')
      const unitItem = firstItem(measured, 'x004008ea')
      // UCUM units are short codes ("mm", "cm2"); other schemes read better as their meaning.
      const unit = unitItem && (text(unitItem, 'x00080102') === 'UCUM' ? text(unitItem, 'x00080100') : codeMeaning(unitItem, charset))
      return [value, unit && unit !== '1' ? unit : ''].filter(Boolean).join(' ')
    }
    case 'DATE':
      return formatDate(text(item, 'x0040a121'))
    case 'TIME':
      return formatTime(text(item, 'x0040a122'))
    case 'DATETIME': {
      const value = text(item, 'x0040a120') ?? ''
      return `${formatDate(value.slice(0, 8))} ${formatTime(value.slice(8))}`.trim()
    }
    case 'PNAME':
      return formatPersonName(decodedText(item, 'x0040a123', charset))
    case 'UIDREF':
      return text(item, 'x0040a124')
    default:
      return undefined
  }
}

function readNode(item: dicomParser.DataSet, charset: string | undefined, depth: number): SrNode {
  const valueType = text(item, 'x0040a040') ?? 'UNKNOWN'
  const node: SrNode = {
    valueType,
    relationship: text(item, 'x0040a010'),
    concept: codeMeaning(firstItem(item, 'x0040a043'), charset),
    value: valueOf(item, valueType, charset),
    children: [],
  }
  const referenced = firstItem(item, 'x00081199')
  if (referenced) {
    const sopInstanceUID = text(referenced, 'x00081155')
    if (sopInstanceUID) {
      const frames = text(referenced, 'x00081160')?.split('\\').map(Number).filter(Number.isFinite)
      node.reference = { sopClassUID: text(referenced, 'x00081150'), sopInstanceUID, frames }
    }
  }
  // Deeply nested reports exist, but guard against malformed recursion.
  if (depth < 50) {
    for (const child of item.elements.x0040a730?.items ?? []) {
      if (child.dataSet) node.children.push(readNode(child.dataSet, charset, depth + 1))
    }
  }
  return node
}

/** The content tree of an SR document (the root dataset is itself the root CONTAINER). */
export function parseStructuredReport(dataSet: dicomParser.DataSet): StructuredReport {
  const charset = dataSet.string('x00080005')
  const root = readNode(dataSet, charset, 0)
  return {
    title: root.concept ?? 'Report',
    completion: text(dataSet, 'x0040a491'),
    verification: text(dataSet, 'x0040a493'),
    root,
  }
}
