import { describe, expect, it } from 'vitest'
import { SPINE_LABELS, nextSpineLabel, peekSpineLabel, setNextSpineLabel } from './spine'
import { parseMeasurementFile, toCsv, toMeasurementFile, type StoredMeasurement } from './fileFormat'

const length: StoredMeasurement = {
  toolName: 'Length',
  sopInstanceUID: '1.2.3',
  frame: 0,
  color: 'rgb(255, 0, 0)',
  data: { points: [[0, 0, 0], [10, 0, 0]], label: 'A' },
  viewPlaneNormal: [0, 0, 1],
}

describe('measurement files', () => {
  it('round-trips measurements', () => {
    const contour: StoredMeasurement = {
      toolName: 'Polygon',
      sopInstanceUID: '1.2.4',
      frame: 2,
      data: { points: [[0, 0, 0], [1, 0, 0], [1, 1, 0]], polyline: [[0, 0, 0], [1, 0, 0], [1, 1, 0]], closed: true, splineType: 'LINEAR' },
    }
    expect(parseMeasurementFile(toMeasurementFile([length, contour]))).toEqual([
      { ...length, hidden: undefined, viewUp: undefined, data: { ...length.data, polyline: undefined, closed: undefined, splineType: undefined, groupId: undefined, groupIndex: undefined } },
      { ...contour, color: undefined, hidden: undefined, viewPlaneNormal: undefined, viewUp: undefined, data: { ...contour.data, label: undefined, groupId: undefined, groupIndex: undefined } },
    ])
  })

  it('rejects other files and skips malformed entries', () => {
    expect(() => parseMeasurementFile('{"hello": 1}')).toThrow()
    expect(() => parseMeasurementFile('not json')).toThrow()
    expect(() => parseMeasurementFile(JSON.stringify({ format: 'dicomlens-measurements', version: 99, measurements: [] }))).toThrow()
    const file = JSON.stringify({
      format: 'dicomlens-measurements',
      version: 1,
      measurements: [length, { toolName: 'Length', sopInstanceUID: '1', data: { points: [[0, 0]] } }, 'junk'],
    })
    expect(parseMeasurementFile(file)).toHaveLength(1)
  })
})

describe('CSV', () => {
  it('quotes and neutralises cells', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"'], [1, '-35 HU', '=SUM(A1)', '-cmd']])).toBe(
      'a,"b,c","say ""hi"""\r\n1,-35 HU,\'=SUM(A1),\'-cmd\r\n',
    )
  })
})

describe('spine labels', () => {
  it('advances through the vertebrae and stops at S1', () => {
    expect(SPINE_LABELS).toHaveLength(25)
    expect(setNextSpineLabel('l4')).toBe(true)
    expect(nextSpineLabel()).toBe('L4')
    expect(nextSpineLabel()).toBe('L5')
    expect(nextSpineLabel()).toBe('S1')
    expect(nextSpineLabel()).toBe('S1')
    expect(setNextSpineLabel('X9')).toBe(false)
    expect(peekSpineLabel()).toBe('S1')
  })
})
