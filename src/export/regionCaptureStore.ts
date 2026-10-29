import { create } from 'zustand'

/** While true, a rectangle drawn over the active viewport is captured. */
export const useRegionCapture = create(() => ({ active: false }))

export const startRegionCapture = () => useRegionCapture.setState({ active: true })
export const stopRegionCapture = () => useRegionCapture.setState({ active: false })
