import { create } from 'zustand'

export const FILTERS = ['sharpen', 'smooth', 'edge', 'emboss', 'erode', 'dilate'] as const
export type FilterType = (typeof FILTERS)[number]
export type FilterStrength = 1 | 2 | 3

export interface ViewportFilter {
  type: FilterType
  strength: FilterStrength
}

/**
 * Display effects that are ours rather than Cornerstone's (Cornerstone keeps
 * window, colormap, rotation and zoom on the viewport itself), by viewport id.
 */
export const useViewportDisplay = create<{ filters: Record<string, ViewportFilter> }>()(() => ({ filters: {} }))

export function setFilter(viewportId: string, filter: ViewportFilter | null) {
  useViewportDisplay.setState((state) => {
    const { [viewportId]: _old, ...filters } = state.filters
    return { filters: filter ? { ...filters, [viewportId]: filter } : filters }
  })
}

export const getFilter = (viewportId: string): ViewportFilter | null => useViewportDisplay.getState().filters[viewportId] ?? null

/** Element id of the SVG filter for a type and strength. */
export const filterElementId = ({ type, strength }: ViewportFilter) => `dicomlens-filter-${type}-${strength}`
