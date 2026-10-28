import { beforeEach, describe, expect, it } from 'vitest'
import type { Series } from '../dicom/types'
import { changeCineFps, cineStateFor, defaultFps, stopCine, toggleCine, useCine } from './cineStore'

const series = (id: string, frameRate: number | null, crossSectional = true): Series => ({
  id,
  seriesInstanceUID: id,
  seriesNumber: 1,
  description: '',
  modality: 'US',
  kind: 'image',
  hasOrientation: crossSectional,
  isLocalizer: false,
  frameRate,
  frameTimeVector: null,
  sortMode: 'instance',
  images: [{ imageId: 'a', file: new File([], 'a'), path: 'a', instanceNumber: 1, sliceLocation: null, acquisitionTime: null, frame: 0, sopInstanceUID: '' }],
})

beforeEach(() => useCine.setState({ viewports: {} }))

describe('cine store', () => {
  it('uses the header frame rate, or a default by kind of series', () => {
    expect(defaultFps(series('a', 24.6))).toBe(25)
    expect(defaultFps(series('a', null, false))).toBe(15)
    expect(defaultFps(series('a', null))).toBe(10)
    expect(defaultFps(series('a', 500))).toBe(60)
  })

  it('toggles and clamps the speed', () => {
    const s = series('a', 20)
    toggleCine('vp', s)
    expect(cineStateFor('vp', s)).toMatchObject({ playing: true, fps: 20 })
    changeCineFps('vp', s, 100)
    expect(cineStateFor('vp', s).fps).toBe(60)
    changeCineFps('vp', s, -100)
    expect(cineStateFor('vp', s).fps).toBe(1)
  })

  it('starts a new series stopped and stops on unmount', () => {
    const first = series('a', 20)
    toggleCine('vp', first)
    expect(cineStateFor('vp', series('b', 20)).playing).toBe(false)
    stopCine('vp')
    expect(cineStateFor('vp', first).playing).toBe(false)
  })
})
