// The PET/CT layout: CT, PET and their fusion in three planes, with a
// rotating PET MIP.
import { metaData } from '@cornerstonejs/core'
import type { DisplaySet, Series, Study } from '../dicom/types'
import { openVolumeView } from '../store/viewerActions'
import { useViewer } from '../store/viewerStore'
import { MPR_KEY, startFusion } from './fusionStore'

const frameOfReference = (series: Series) =>
  (metaData.get('imagePlaneModule', series.images[0]?.imageId) as { frameOfReferenceUID?: string } | undefined)?.frameOfReferenceUID

/** The CT and PET of a study to show together (preferring the same frame of reference, then most slices). */
export function petCtPair(studies: Study[], base: DisplaySet | null): { ct: DisplaySet; pet: DisplaySet } | null {
  const study = base?.study ?? studies[0]
  if (!study || !studies.includes(study)) return null
  const volumes = (modality: string) =>
    study.series.filter((s) => s.kind === 'image' && s.modality === modality && s.hasOrientation && !s.isLocalizer && s.images.length >= 3).sort((a, b) => b.images.length - a.images.length)
  const pets = volumes('PT')
  const cts = volumes('CT')
  if (!pets.length || !cts.length) return null
  const pet = base && base.series.modality === 'PT' ? base.series : pets[0]
  const ct = cts.find((s) => frameOfReference(s) && frameOfReference(s) === frameOfReference(pet)) ?? cts[0]
  return { ct: { study, series: ct }, pet: { study, series: pet } }
}

/** Opens MPR of the CT with the PET fused, laid out as PET/CT. */
export function openPetCt(ct: DisplaySet, pet: DisplaySet) {
  openVolumeView('mpr', ct)
  const view = useViewer.getState().volumeView
  if (!view || view.displaySet.series !== ct.series) return
  useViewer.setState({ volumeView: { ...view, petct: pet }, mprWith3d: false })
  void startFusion(MPR_KEY, ct, pet, null)
}

export function closePetCt() {
  const view = useViewer.getState().volumeView
  if (view?.petct) useViewer.setState({ volumeView: { ...view, petct: undefined } })
}
