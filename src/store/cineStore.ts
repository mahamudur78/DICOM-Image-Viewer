import { create } from 'zustand'
import type { Series } from '../dicom/types'

export type CineMode = 'loop' | 'bounce'

/** Cine playback of one viewport, tied to the series it was started for. */
export interface CineState {
  seriesId: string
  playing: boolean
  fps: number
  mode: CineMode
}

export const MIN_FPS = 1
export const MAX_FPS = 60

/**
 * Header frame rate when present. Otherwise loops without patient orientation
 * (ultrasound, angiography) play faster than cross-sectional slices (CT/MR).
 */
export function defaultFps(series: Series) {
  if (series.frameRate) return Math.min(MAX_FPS, Math.max(MIN_FPS, Math.round(series.frameRate)))
  return series.hasOrientation ? 10 : 15
}

export const useCine = create<{ viewports: Record<string, CineState> }>()(() => ({ viewports: {} }))

/** The cine state of a viewport showing `series` (a new series starts stopped). */
export function cineStateFor(viewportId: string, series: Series): CineState {
  const state = useCine.getState().viewports[viewportId]
  return state?.seriesId === series.id ? state : { seriesId: series.id, playing: false, fps: defaultFps(series), mode: 'loop' }
}

function update(viewportId: string, series: Series, change: Partial<CineState>) {
  useCine.setState((s) => ({
    viewports: { ...s.viewports, [viewportId]: { ...cineStateFor(viewportId, series), ...change } },
  }))
}

export const setCinePlaying = (viewportId: string, series: Series, playing: boolean) =>
  update(viewportId, series, { playing })

export const toggleCine = (viewportId: string, series: Series) =>
  update(viewportId, series, { playing: !cineStateFor(viewportId, series).playing })

export const setCineFps = (viewportId: string, series: Series, fps: number) =>
  update(viewportId, series, { fps: Math.min(MAX_FPS, Math.max(MIN_FPS, Math.round(fps))) })

export const changeCineFps = (viewportId: string, series: Series, delta: number) =>
  setCineFps(viewportId, series, cineStateFor(viewportId, series).fps + delta)

export const setCineMode = (viewportId: string, series: Series, mode: CineMode) => update(viewportId, series, { mode })

/** Stops playback when a viewport goes away (layout change, MPR, new files). */
export function stopCine(viewportId: string) {
  const state = useCine.getState().viewports[viewportId]
  if (state?.playing) useCine.setState((s) => ({ viewports: { ...s.viewports, [viewportId]: { ...state, playing: false } } }))
}
