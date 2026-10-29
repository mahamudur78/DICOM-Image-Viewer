import { create } from 'zustand'

/**
 * What a mounted viewport shows. Actions and toolbar buttons depend on it,
 * e.g. invert only applies to 2D kinds. Video, PDF and report viewports are
 * plain React components, not Cornerstone viewports.
 */
export type ViewportKind = 'stack' | 'mpr' | 'volume3d' | 'video' | 'pdf' | 'sr' | 'document'

/** Mounted viewports by id. It is a store so the toolbar re-renders once a viewport mounts. */
export const useViewportRegistry = create<{ kinds: Record<string, ViewportKind> }>()(() => ({ kinds: {} }))

export function registerViewport(viewportId: string, kind: ViewportKind) {
  useViewportRegistry.setState((state) => ({ kinds: { ...state.kinds, [viewportId]: kind } }))
}

export function unregisterViewport(viewportId: string) {
  useViewportRegistry.setState((state) => {
    const { [viewportId]: _removed, ...kinds } = state.kinds
    return { kinds }
  })
}

export function viewportKind(viewportId: string | null): ViewportKind | null {
  return viewportId ? (useViewportRegistry.getState().kinds[viewportId] ?? null) : null
}

/** 2D viewports (stack and MPR) support invert, rotate, flip and window presets. */
export const is2dKind = (kind: ViewportKind | null) => kind === 'stack' || kind === 'mpr'

/** Viewports rendered by Cornerstone (reset, PNG export, tools). */
export const isCornerstoneKind = (kind: ViewportKind | null) => kind === 'stack' || kind === 'mpr' || kind === 'volume3d'
