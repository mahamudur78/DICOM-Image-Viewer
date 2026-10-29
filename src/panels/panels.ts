import { lazy, type ComponentType } from 'react'
import type { PanelId } from '../store/viewerStore'

export interface PanelDefinition {
  id: PanelId
  /** i18n key */
  title: string
  component: ComponentType
}

/** Side panels. Later phases add measurements, segmentation, reports, … here. */
export const PANELS: Record<PanelId, PanelDefinition> = {
  tags: {
    id: 'tags',
    title: 'tags.title',
    component: lazy(() => import('../components/TagPanel').then((m) => ({ default: m.TagPanel }))),
  },
  volume3d: {
    id: 'volume3d',
    title: 'vr.panelTitle',
    component: lazy(() => import('../components/Volume3DPanel').then((m) => ({ default: m.Volume3DPanel }))),
  },
  measurements: {
    id: 'measurements',
    title: 'measure.panelTitle',
    component: lazy(() => import('../components/MeasurementPanel').then((m) => ({ default: m.MeasurementPanel }))),
  },
  fusion: {
    id: 'fusion',
    title: 'fusion.panelTitle',
    component: lazy(() => import('../components/FusionPanel').then((m) => ({ default: m.FusionPanel }))),
  },
  tic: {
    id: 'tic',
    title: 'tic.panelTitle',
    component: lazy(() => import('../components/TicPanel').then((m) => ({ default: m.TicPanel }))),
  },
  segment: {
    id: 'segment',
    title: 'segment.panelTitle',
    component: lazy(() => import('../components/SegmentationPanel').then((m) => ({ default: m.SegmentationPanel }))),
  },
  dsa: {
    id: 'dsa',
    title: 'dsa.panelTitle',
    component: lazy(() => import('../components/DsaPanel').then((m) => ({ default: m.DsaPanel }))),
  },
}
