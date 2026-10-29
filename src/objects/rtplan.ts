// RT Plan: the facts a reader needs (prescription, fractions, beams).
import { decodedText, firstItem, items, number, numbers, text, type DataSet } from './dicom'

export interface Beam {
  number: number
  name: string
  description?: string
  type?: string
  radiation?: string
  treatmentDelivery?: string
  machine?: string
  /** Nominal energy of the first control point (MV or MeV). */
  energy?: number
  gantry?: number
  gantryEnd?: number
  collimator?: number
  couch?: number
  isocenter?: number[]
  meterset?: number
  controlPoints: number
}

export interface RtPlan {
  label?: string
  name?: string
  description?: string
  date?: string
  geometry?: string
  intent?: string
  prescriptions: { description?: string; type?: string; dose?: number }[]
  fractions?: number
  beams: Beam[]
  ion: boolean
}

export function parseRtPlan(dataSet: DataSet): RtPlan {
  const ion = !!dataSet.elements.x300a03a2
  const group = firstItem(dataSet, 'x300a0070')
  const meterset = new Map(items(group, 'x300c0004').map((item) => [number(item, 'x300c0006'), number(item, 'x300a0086')]))
  const beams = items(dataSet, ion ? 'x300a03a2' : 'x300a00b0').map((beam): Beam => {
    const points = items(beam, ion ? 'x300a03a8' : 'x300a0111')
    const first = points[0]
    const last = points.at(-1)
    const beamNumber = number(beam, 'x300a00c0') ?? 0
    return {
      number: beamNumber,
      name: decodedText(beam, 'x300a00c2') ?? `Beam ${beamNumber}`,
      description: decodedText(beam, 'x300a00c3'),
      type: text(beam, 'x300a00c4'),
      radiation: text(beam, 'x300a00c6'),
      treatmentDelivery: text(beam, 'x300a00ce'),
      machine: decodedText(beam, 'x300a00b2'),
      energy: first && number(first, 'x300a0114'),
      gantry: first && number(first, 'x300a011e'),
      gantryEnd: last && last !== first ? number(last, 'x300a011e') : undefined,
      collimator: first && number(first, 'x300a0120'),
      couch: first && number(first, 'x300a0122'),
      isocenter: first && numbers(first, 'x300a012c'),
      meterset: meterset.get(beamNumber),
      controlPoints: points.length,
    }
  })
  return {
    label: decodedText(dataSet, 'x300a0002'),
    name: decodedText(dataSet, 'x300a0003'),
    description: decodedText(dataSet, 'x300a0004'),
    date: text(dataSet, 'x300a0006'),
    geometry: text(dataSet, 'x300a000c'),
    intent: text(dataSet, 'x300a000a'),
    prescriptions: items(dataSet, 'x300a0010').map((item) => ({
      description: decodedText(item, 'x300a0016'),
      type: text(item, 'x300a0020'),
      dose: number(item, 'x300a0026') ?? number(item, 'x300a0027'),
    })),
    fractions: group && number(group, 'x300a0078'),
    beams,
    ion,
  }
}
