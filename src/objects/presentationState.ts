// Grayscale Softcopy Presentation State (GSPS): window, rotation and flip,
// displayed area, shutters and annotations for referenced images.
import { dicomDateTime, dicomFile, newUid } from '../dicom/writer'
import { decodedText, floats, items, numbers, referenceOf, slongs, text, type DataSet } from './dicom'
import { dicomLabToRgb } from './labels'
import { commonElements, element, floatBytes, int32Bytes, referencedSop, sequence, type ImageRef, type ObjectSource } from './write'

export const GRAYSCALE_PRESENTATION_STATE = '1.2.840.10008.5.1.4.1.1.11.1'

type Point = [number, number]
type Units = 'PIXEL' | 'DISPLAY'

export interface PresentationText {
  text: string
  units: Units
  anchor?: Point
  box?: [number, number, number, number]
}

export interface PresentationGraphic {
  type: 'POINT' | 'POLYLINE' | 'INTERPOLATED' | 'CIRCLE' | 'ELLIPSE'
  units: Units
  points: Point[]
  filled: boolean
}

export interface PresentationAnnotation {
  /** Images it applies to; all referenced images when absent. */
  images?: string[]
  layer: string
  color?: [number, number, number]
  texts: PresentationText[]
  graphics: PresentationGraphic[]
}

export interface DisplayedArea {
  images?: string[]
  /** Image (column, row), 1-based pixel corners as in the standard. */
  topLeft: Point
  bottomRight: Point
  mode: string
}

export type Shutter =
  | { shape: 'RECTANGULAR'; left: number; right: number; top: number; bottom: number }
  | { shape: 'CIRCULAR'; center: Point; radius: number }
  | { shape: 'POLYGONAL'; points: Point[] }

export interface PresentationState {
  label?: string
  description?: string
  seriesInstanceUIDs: string[]
  images: string[]
  voi: { images?: string[]; center: number; width: number }[]
  rotation: number
  flip: boolean
  inverse: boolean
  areas: DisplayedArea[]
  shutters: Shutter[]
  annotations: PresentationAnnotation[]
}

const pointPairs = (values: number[]): Point[] => Array.from({ length: Math.floor(values.length / 2) }, (_, i) => [values[i * 2], values[i * 2 + 1]])
const imagesOf = (item: DataSet) => {
  const refs = items(item, 'x00081140').flatMap((ref) => referenceOf(ref)?.sopInstanceUID ?? [])
  return refs.length ? refs : undefined
}

/** CIELab colour of a graphic layer, as sRGB (when given). */
function layerColors(dataSet: DataSet) {
  const colors = new Map<string, [number, number, number]>()
  for (const layer of items(dataSet, 'x00700060')) {
    const name = text(layer, 'x00700002')
    const lab = layer.elements.x00700401 ? Array.from({ length: 3 }, (_, i) => layer.uint16('x00700401', i) ?? 0) : null
    if (name && lab) colors.set(name, dicomLabToRgb(lab))
  }
  return colors
}

function shuttersOf(dataSet: DataSet): Shutter[] {
  const shapes = (text(dataSet, 'x00181600') ?? '').split('\\')
  const out: Shutter[] = []
  if (shapes.includes('RECTANGULAR')) {
    const [left, right, top, bottom] = ['x00181602', 'x00181604', 'x00181606', 'x00181608'].map((tag) => numbers(dataSet, tag)?.[0] ?? 0)
    out.push({ shape: 'RECTANGULAR', left, right, top, bottom })
  }
  if (shapes.includes('CIRCULAR')) {
    const [row, column] = numbers(dataSet, 'x00181610') ?? [0, 0]
    out.push({ shape: 'CIRCULAR', center: [column, row], radius: numbers(dataSet, 'x00181612')?.[0] ?? 0 })
  }
  if (shapes.includes('POLYGONAL')) {
    // Vertices are stored as row\column pairs.
    out.push({ shape: 'POLYGONAL', points: pointPairs(numbers(dataSet, 'x00181620') ?? []).map(([row, column]) => [column, row]) })
  }
  return out
}

export function readPresentationState(dataSet: DataSet): PresentationState {
  const series = items(dataSet, 'x00081115')
  const colors = layerColors(dataSet)
  return {
    label: text(dataSet, 'x00700080'),
    description: decodedText(dataSet, 'x00700081'),
    seriesInstanceUIDs: series.flatMap((s) => text(s, 'x0020000e') ?? []),
    images: series.flatMap((s) => items(s, 'x00081140').flatMap((ref) => referenceOf(ref)?.sopInstanceUID ?? [])),
    voi: items(dataSet, 'x00283110').flatMap((item) => {
      const center = numbers(item, 'x00281050')?.[0]
      const width = numbers(item, 'x00281051')?.[0]
      return center !== undefined && width ? [{ images: imagesOf(item), center, width }] : []
    }),
    rotation: dataSet.uint16('x00700042') ?? 0,
    flip: text(dataSet, 'x00700041') === 'Y',
    inverse: text(dataSet, 'x20500020') === 'INVERSE',
    areas: items(dataSet, 'x0070005a').flatMap((item) => {
      const [topLeft, bottomRight] = [slongs(item, 'x00700052'), slongs(item, 'x00700053')]
      return topLeft.length === 2 && bottomRight.length === 2 ? [{ images: imagesOf(item), topLeft: topLeft as Point, bottomRight: bottomRight as Point, mode: text(item, 'x00700100') ?? 'SCALE TO FIT' }] : []
    }),
    shutters: shuttersOf(dataSet),
    annotations: items(dataSet, 'x00700001').map((item) => {
      const layer = text(item, 'x00700002') ?? ''
      return {
        images: imagesOf(item),
        layer,
        color: colors.get(layer),
        texts: items(item, 'x00700008').map((t): PresentationText => {
          const anchor = floats(t, 'x00700014')
          const [tl, br] = [floats(t, 'x00700010'), floats(t, 'x00700011')]
          const units = (text(t, 'x00700004') ?? text(t, 'x00700003') ?? 'PIXEL') as Units
          return {
            text: decodedText(t, 'x00700006') ?? '',
            units,
            ...(anchor.length === 2 && { anchor: anchor as Point }),
            ...(tl.length === 2 && br.length === 2 && { box: [tl[0], tl[1], br[0], br[1]] as [number, number, number, number] }),
          }
        }),
        graphics: items(item, 'x00700009').map((g) => ({
          type: (text(g, 'x00700023') ?? 'POLYLINE') as PresentationGraphic['type'],
          units: (text(g, 'x00700005') ?? 'PIXEL') as Units,
          points: pointPairs(floats(g, 'x00700022')),
          filled: text(g, 'x00700024') === 'Y',
        })),
      }
    }),
  }
}

/** Settings that apply to one image: the matching item, or one without references. */
export function forImage<T extends { images?: string[] }>(list: T[], sopInstanceUID: string): T | undefined {
  return list.find((item) => item.images?.includes(sopInstanceUID)) ?? list.find((item) => !item.images)
}

// --- writing -------------------------------------------------------------------------------

export interface PresentationToWrite {
  label: string
  description: string
  images: (ImageRef & { seriesInstanceUID: string })[]
  voi?: { center: number; width: number }
  rotation: number
  flip: boolean
  area?: { topLeft: Point; bottomRight: Point }
  /** Per image: graphics and texts in PIXEL units. */
  annotations: { image: ImageRef; graphics: Omit<PresentationGraphic, 'units'>[]; texts: { text: string; anchor: Point }[] }[]
}

export function writePresentationState(source: ObjectSource, state: PresentationToWrite) {
  const { date, time } = dicomDateTime(new Date())
  const bySeries = new Map<string, ImageRef[]>()
  for (const image of state.images) bySeries.set(image.seriesInstanceUID, [...(bySeries.get(image.seriesInstanceUID) ?? []), image])
  const layer = 'DICOMLENS'
  const elements = [
    ...commonElements({ ...source, modality: 'PR' }),
    element(0x0070, 0x0080, 'CS', state.label.toUpperCase().replace(/[^A-Z0-9_ ]/g, '').slice(0, 16) || 'VIEW'),
    element(0x0070, 0x0081, 'LO', state.description.slice(0, 64)),
    element(0x0070, 0x0082, 'DA', date),
    element(0x0070, 0x0083, 'TM', time),
    element(0x0070, 0x0084, 'PN', ''),
    sequence(0x0008, 0x1115, [...bySeries].map(([series, refs]) => [element(0x0020, 0x000e, 'UI', series), sequence(0x0008, 0x1140, refs.map(referencedSop))])),
    ...(state.voi ? [sequence(0x0028, 0x3110, [[element(0x0028, 0x1050, 'DS', round(state.voi.center)), element(0x0028, 0x1051, 'DS', round(Math.max(1, state.voi.width)))]])] : []),
    element(0x0070, 0x0041, 'CS', state.flip ? 'Y' : 'N'),
    element(0x0070, 0x0042, 'US', ((state.rotation % 360) + 360) % 360),
    ...(state.area
      ? [sequence(0x0070, 0x005a, [[element(0x0070, 0x0052, 'SL', int32Bytes(state.area.topLeft.map(Math.round))), element(0x0070, 0x0053, 'SL', int32Bytes(state.area.bottomRight.map(Math.round))), element(0x0070, 0x0100, 'CS', 'SCALE TO FIT')]])]
      : []),
    ...(state.annotations.length
      ? [
          sequence(0x0070, 0x0060, [[element(0x0070, 0x0002, 'CS', layer), element(0x0070, 0x0062, 'IS', 1)]]),
          sequence(
            0x0070,
            0x0001,
            state.annotations.map((a) => [
              element(0x0070, 0x0002, 'CS', layer),
              sequence(0x0008, 0x1140, [referencedSop(a.image)]),
              ...(a.texts.length ? [sequence(0x0070, 0x0008, a.texts.map((t) => [element(0x0070, 0x0006, 'ST', t.text), element(0x0070, 0x0004, 'CS', 'PIXEL'), element(0x0070, 0x0014, 'FL', floatBytes(t.anchor)), element(0x0070, 0x0015, 'CS', 'N')]))] : []),
              ...(a.graphics.length
                ? [
                    sequence(0x0070, 0x0009, a.graphics.map((g) => [
                      element(0x0070, 0x0005, 'CS', 'PIXEL'),
                      element(0x0070, 0x0020, 'US', 2),
                      element(0x0070, 0x0021, 'US', g.points.length),
                      element(0x0070, 0x0022, 'FL', floatBytes(g.points.flat())),
                      element(0x0070, 0x0023, 'CS', g.type),
                      element(0x0070, 0x0024, 'CS', g.filled ? 'Y' : 'N'),
                    ])),
                  ]
                : []),
            ]),
          ),
        ]
      : []),
    element(0x2050, 0x0020, 'CS', 'IDENTITY'),
  ]
  const sopInstanceUID = newUid()
  return { bytes: dicomFile(GRAYSCALE_PRESENTATION_STATE, sopInstanceUID, elements), sopInstanceUID }
}

const round = (v: number) => Number(v.toFixed(3))
