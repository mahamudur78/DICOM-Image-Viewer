// Advanced 3D: transfer functions, lighting, blend modes, cropping and
// clipping, the scalpel, surface picking and measuring, iso-surfaces,
// snapshots and the endoscopy camera. vtk.js details stay in this file.
import { Enums, cache, getRenderingEngine, metaData, volumeLoader, type Types } from '@cornerstonejs/core'
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor'
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper'
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane'
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData'
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray'
import vtkImageMarchingCubes from '@kitware/vtk.js/Filters/General/ImageMarchingCubes'
import { create } from 'zustand'
import { cross, dot, firstHit, indexToWorld, normalize, scale, sub, add, type VolumeGrid } from '../volume/grid'
import { meshMeasures, trianglesFromPolys, type Mesh } from '../volume/mesh'
import { opacityAt, visibleFrom, type Lighting, type TransferFunction } from '../volume/transferFunction'
import { useViewer } from '../store/viewerStore'
import { RENDERING_ENGINE_ID } from './constants'

const currentPreset = () => useViewer.getState().preset

type Vtk = { [key: string]: (...args: never[]) => unknown }
type Triple = [number, number, number]
const v3 = (a: number[]) => a as Triple

export function vrViewport(viewportId: string): Types.IVolumeViewport | undefined {
  const viewport = getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(viewportId)
  return viewport?.type === Enums.ViewportType.VOLUME_3D ? (viewport as Types.IVolumeViewport) : undefined
}

/** The volume actor of a 3D viewport and its vtk parts. */
function volumeParts(viewportId: string) {
  const viewport = vrViewport(viewportId)
  const entry = viewport?.getActors().find((a) => a.uid !== SURFACE_UID)
  if (!viewport || !entry) return null
  const actor = entry.actor as unknown as Vtk & { getProperty(): Vtk & { getRGBTransferFunction(i: number): Vtk; getScalarOpacity(i: number): Vtk }; getMapper(): Vtk }
  return { viewport, actor, property: actor.getProperty(), mapper: actor.getMapper(), volumeId: entry.referencedId ?? entry.uid }
}

// --- the volume as a grid ------------------------------------------------------------------

export function volumeGrid(volumeId: string): VolumeGrid | null {
  const volume = cache.getVolume(volumeId)
  if (!volume) return null
  const scalars = (volume.voxelManager as unknown as { getCompleteScalarDataArray(): ArrayLike<number> }).getCompleteScalarDataArray()
  return {
    dimensions: [...volume.dimensions] as [number, number, number],
    spacing: [...volume.spacing] as [number, number, number],
    origin: [...volume.origin],
    direction: [...volume.direction],
    scalars,
  }
}

// --- transfer function and lighting ----------------------------------------------------------

/** The transfer function the 3D viewport uses now (after presets and shifts). */
export function getTransferFunction(viewportId: string): TransferFunction | null {
  const parts = volumeParts(viewportId)
  if (!parts) return null
  const ofun = parts.property.getScalarOpacity(0) as unknown as { getSize(): number; getNodeValue(i: number, out: number[]): void }
  const cfun = parts.property.getRGBTransferFunction(0) as unknown as { getSize(): number; getNodeValue(i: number, out: number[]): void }
  const node = new Array(6).fill(0)
  const opacity = Array.from({ length: ofun.getSize() }, (_, i) => {
    ofun.getNodeValue(i, node)
    return { value: node[0], opacity: node[1] }
  })
  const colors = Array.from({ length: cfun.getSize() }, (_, i) => {
    cfun.getNodeValue(i, node)
    return { value: node[0], r: node[1], g: node[2], b: node[3] }
  })
  return { opacity, colors }
}

export function setTransferFunction(viewportId: string, tf: TransferFunction) {
  const parts = volumeParts(viewportId)
  if (!parts) return
  const ofun = parts.property.getScalarOpacity(0) as unknown as { removeAllPoints(): void; addPoint(x: number, y: number): void }
  const cfun = parts.property.getRGBTransferFunction(0) as unknown as { removeAllPoints(): void; addRGBPoint(x: number, r: number, g: number, b: number): void }
  ofun.removeAllPoints()
  for (const p of tf.opacity) ofun.addPoint(p.value, p.opacity)
  cfun.removeAllPoints()
  for (const p of tf.colors) cfun.addRGBPoint(p.value, p.r, p.g, p.b)
  parts.viewport.render()
}

export function getLighting(viewportId: string): Lighting | null {
  const parts = volumeParts(viewportId)
  if (!parts) return null
  const p = parts.property as unknown as { getShade(): boolean; getAmbient(): number; getDiffuse(): number; getSpecular(): number; getSpecularPower(): number }
  return { shade: p.getShade(), ambient: p.getAmbient(), diffuse: p.getDiffuse(), specular: p.getSpecular(), specularPower: p.getSpecularPower() }
}

export function setLighting(viewportId: string, lighting: Lighting) {
  const parts = volumeParts(viewportId)
  if (!parts) return
  const p = parts.property as unknown as { setShade(v: boolean): void; setAmbient(v: number): void; setDiffuse(v: number): void; setSpecular(v: number): void; setSpecularPower(v: number): void }
  p.setShade(lighting.shade)
  p.setAmbient(lighting.ambient)
  p.setDiffuse(lighting.diffuse)
  p.setSpecular(lighting.specular)
  p.setSpecularPower(lighting.specularPower)
  parts.viewport.render()
}

// --- blend mode ----------------------------------------------------------------------------

export type Blend = 'composite' | 'mip' | 'minip'

const VTK_BLEND: Record<Blend, number> = { composite: 0, mip: 1, minip: 2 }

/** Volume rendering, or a maximum / minimum intensity projection through the whole volume. */
export function setBlend(viewportId: string, blend: Blend, window?: { lower: number; upper: number }) {
  const parts = volumeParts(viewportId)
  if (!parts) return
  ;(parts.mapper as unknown as { setBlendMode(n: number): void }).setBlendMode(VTK_BLEND[blend])
  if (blend !== 'composite' && window) {
    // Projections look like X-rays: gray values over the window, fully opaque.
    setTransferFunction(viewportId, {
      opacity: [
        { value: window.lower, opacity: 1 },
        { value: window.upper, opacity: 1 },
      ],
      colors: [
        { value: window.lower, r: 0, g: 0, b: 0 },
        { value: window.upper, r: 1, g: 1, b: 1 },
      ],
    })
  }
  parts.viewport.render()
}

// --- quality while interacting ----------------------------------------------------------------

/** Coarser sampling while the user rotates or zooms, full quality as soon as they stop. */
export function installInteractiveQuality(viewportId: string, element: HTMLElement) {
  let timer = 0
  const coarse = () => {
    window.clearTimeout(timer)
    vrViewport(viewportId)?.setProperties({ sampleDistanceMultiplier: 3 })
  }
  const fine = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      const viewport = vrViewport(viewportId)
      viewport?.setProperties({ sampleDistanceMultiplier: 1 })
      viewport?.render()
    }, 150)
  }
  element.addEventListener('pointerdown', coarse)
  element.addEventListener('pointerup', fine)
  element.addEventListener('pointercancel', fine)
  element.addEventListener('wheel', () => {
    coarse()
    fine()
  })
  return () => {
    window.clearTimeout(timer)
    element.removeEventListener('pointerdown', coarse)
    element.removeEventListener('pointerup', fine)
    element.removeEventListener('pointercancel', fine)
  }
}

// --- cropping and clipping -------------------------------------------------------------------

/** Kept parts of the volume along i, j, k, as fractions 0–1. */
export interface CropBox {
  min: [number, number, number]
  max: [number, number, number]
}

/** A cutting plane through the volume centre region: normal (patient axes) and offset (mm from the centre). */
export interface ClipPlane {
  normal: [number, number, number]
  offset: number
}

export const FULL_BOX: CropBox = { min: [0, 0, 0], max: [1, 1, 1] }

export function applyClipping(viewportId: string, box: CropBox, plane: ClipPlane | null) {
  const parts = volumeParts(viewportId)
  const grid = parts && volumeGrid(parts.volumeId)
  if (!parts || !grid) return
  const mapper = parts.mapper as unknown as { removeAllClippingPlanes(): void; addClippingPlane(p: unknown): void }
  mapper.removeAllClippingPlanes()
  const axisOf = (n: number) => grid.direction.slice(n * 3, n * 3 + 3)
  const last = grid.dimensions.map((d) => d - 1)
  for (let n = 0; n < 3; n++) {
    const axis = axisOf(n)
    const low = box.min[n] * last[n]
    const high = box.max[n] * last[n]
    if (box.min[n] > 0) mapper.addClippingPlane(vtkPlane.newInstance({ origin: v3(indexToWorld(grid, [0, 1, 2].map((m) => (m === n ? low : 0)))), normal: v3(axis) }))
    if (box.max[n] < 1) mapper.addClippingPlane(vtkPlane.newInstance({ origin: v3(indexToWorld(grid, [0, 1, 2].map((m) => (m === n ? high : 0)))), normal: v3(scale(axis, -1)) }))
  }
  if (plane) {
    const centre = indexToWorld(grid, last.map((d) => d / 2))
    const normal = normalize(plane.normal)
    mapper.addClippingPlane(vtkPlane.newInstance({ origin: v3(add(centre, scale(normal, plane.offset))), normal: v3(normal) }))
  }
  parts.viewport.render()
}

// --- picking points on the surface -------------------------------------------------------------

/**
 * The first visible voxel under a canvas point: the ray from the viewer
 * through the point, against the current transfer function.
 */
export function pickSurface(viewportId: string, canvasPoint: [number, number]): number[] | null {
  const parts = volumeParts(viewportId)
  const grid = parts && scalpelGrid(parts.volumeId)
  const tf = getTransferFunction(viewportId)
  if (!parts || !grid || !tf) return null
  const camera = parts.viewport.getCamera()
  const onPlane = parts.viewport.canvasToWorld(canvasPoint as Types.Point2)
  const toward = camera.viewPlaneNormal as number[] // points toward the viewer
  let origin: number[]
  let direction: number[]
  if (camera.parallelProjection === false) {
    origin = camera.position as number[]
    direction = normalize(sub(onPlane, origin))
  } else {
    origin = add(onPlane, scale(toward, 2000))
    direction = scale(toward, -1)
  }
  const threshold = Math.max(visibleFrom(tf), -Infinity)
  const clip = clippingTest(viewportId, grid)
  const smallest = Math.min(...grid.spacing) / 2
  return firstHit(grid, origin, direction, (v) => v >= threshold && opacityAt(tf, v) > 0.05, smallest, 4000, clip)
}

/** Whether a world point survives the crop box and clipping plane of a viewport. */
function clippingTest(viewportId: string, grid: VolumeGrid) {
  const state = useVr3d.getState().views[viewportId]
  if (!state) return undefined
  const { box, plane } = state
  const last = grid.dimensions.map((d) => d - 1)
  const centre = indexToWorld(grid, last.map((d) => d / 2))
  return (world: number[]) => {
    const d = sub(world, grid.origin)
    for (let n = 0; n < 3; n++) {
      const f = dot(d, grid.direction.slice(n * 3, n * 3 + 3)) / grid.spacing[n] / (last[n] || 1)
      if (f < box.min[n] - 1e-6 || f > box.max[n] + 1e-6) return false
    }
    if (plane && dot(sub(world, add(centre, scale(normalize(plane.normal), plane.offset))), normalize(plane.normal)) < 0) return false
    return true
  }
}

// --- scalpel ---------------------------------------------------------------------------------------

/**
 * The scalpel cuts a copy of the volume made for the 3D view (MPR keeps the
 * original). Each cut remembers the voxels it changed, for undo.
 */
const EDIT_PREFIX = 'dicomlens-3d-edit:'

let editWindowProvider = false

/**
 * Cornerstone looks up a window for a new volume from the metadata of its
 * middle slice, and would try to load the copy's slices (which only exist in
 * memory) when there is none. The copy's slices answer with a full-range window.
 */
function registerEditWindowProvider() {
  if (editWindowProvider) return
  editWindowProvider = true
  metaData.addProvider((type: string, imageId: string) => {
    if (type !== 'voiLutModule' || typeof imageId !== 'string' || !imageId.startsWith(EDIT_PREFIX)) return undefined
    return { windowCenter: [1000], windowWidth: [4000] }
  }, 1000)
}

const scalpelCopies = new Map<string, string>()
const cutHistory = new Map<string, { indexes: Uint32Array; values: Float32Array }[]>()

const scalpelGrid = (volumeId: string) => volumeGrid(volumeId)

async function editableVolume(viewportId: string) {
  const parts = volumeParts(viewportId)
  if (!parts) return null
  if ([...scalpelCopies.values()].includes(parts.volumeId)) return parts.volumeId
  const source = cache.getVolume(parts.volumeId)!
  const copyId = `${EDIT_PREFIX}${parts.volumeId.replace(/^[^:]*:/, '')}`
  registerEditWindowProvider()
  if (!cache.getVolume(copyId)) {
    const scalars = (source.voxelManager as unknown as { getCompleteScalarDataArray(): ArrayLike<number> & { constructor: new (n: ArrayLike<number>) => ArrayLike<number> } }).getCompleteScalarDataArray()
    volumeLoader.createLocalVolume(copyId, {
      scalarData: new (scalars.constructor as new (s: ArrayLike<number>) => Types.PixelDataTypedArray)(scalars),
      metadata: source.metadata,
      dimensions: source.dimensions,
      spacing: source.spacing,
      origin: source.origin,
      direction: source.direction,
    } as never)
  }
  const tf = getTransferFunction(viewportId)
  const lighting = getLighting(viewportId)
  const camera = parts.viewport.getCamera()
  await parts.viewport.setVolumes([{ volumeId: copyId }])
  // The preset sets more than the transfer function (gradient opacity, interpolation…).
  parts.viewport.setProperties({ preset: currentPreset() })
  if (tf) setTransferFunction(viewportId, tf)
  if (lighting) setLighting(viewportId, lighting)
  parts.viewport.setCamera(camera)
  scalpelCopies.set(viewportId, copyId)
  const state = useVr3d.getState().views[viewportId]
  if (state) applyClipping(viewportId, state.box, state.plane)
  return copyId
}

/**
 * Removes the voxels whose projection falls inside (or outside) a polygon
 * drawn on the 3D view, through the whole depth of the volume.
 */
export async function scalpelCut(viewportId: string, polygon: [number, number][], keepInside: boolean) {
  const copyId = await editableVolume(viewportId)
  const parts = volumeParts(viewportId)
  const volume = copyId ? cache.getVolume(copyId) : undefined
  if (!parts || !volume || polygon.length < 3) return 0
  const grid = volumeGrid(copyId!)!
  const scalars = grid.scalars as unknown as Float32Array
  const empty = Math.min(-1024, ...[...(volume.metadata as unknown as { min?: number[] }).min ?? []])
  const changedIndexes: number[] = []
  const changedValues: number[] = []
  const [nx, ny, nz] = grid.dimensions
  const inside = (x: number, y: number) => {
    let hit = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i]
      const [xj, yj] = polygon[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
    }
    return hit
  }
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const index = i + nx * (j + ny * k)
        if (scalars[index] <= empty) continue
        const [x, y] = parts.viewport.worldToCanvas(indexToWorld(grid, [i, j, k]) as Types.Point3)
        if (inside(x, y) !== keepInside) {
          changedIndexes.push(index)
          changedValues.push(scalars[index])
          scalars[index] = empty
        }
      }
  cutHistory.set(viewportId, [...(cutHistory.get(viewportId) ?? []), { indexes: Uint32Array.from(changedIndexes), values: Float32Array.from(changedValues) }])
  writeBack(copyId!, grid.scalars)
  parts.viewport.render()
  useVr3d.setState((s) => ({ cuts: { ...s.cuts, [viewportId]: (s.cuts[viewportId] ?? 0) + 1 } }))
  return changedIndexes.length
}

export function undoCut(viewportId: string) {
  const copyId = scalpelCopies.get(viewportId)
  const history = cutHistory.get(viewportId)
  const volume = copyId ? cache.getVolume(copyId) : undefined
  const last = history?.pop()
  if (!volume || !last) return
  const scalars = volumeGrid(copyId!)!.scalars as unknown as Float32Array
  last.indexes.forEach((index, i) => (scalars[index] = last.values[i]))
  writeBack(copyId!, scalars)
  vrViewport(viewportId)?.render()
  useVr3d.setState((s) => ({ cuts: { ...s.cuts, [viewportId]: Math.max(0, (s.cuts[viewportId] ?? 1) - 1) } }))
}

/**
 * Stores changed voxels in a volume and has the 3D texture uploaded again
 * (the complete array is a copy assembled from the volume's slices).
 */
function writeBack(volumeId: string, scalars: ArrayLike<number>) {
  const volume = cache.getVolume(volumeId) as unknown as {
    voxelManager: { setCompleteScalarDataArray(data: ArrayLike<number>): void }
    invalidate(): void
  }
  volume.voxelManager.setCompleteScalarDataArray(scalars)
  volume.invalidate()
}

export function forgetScalpel(viewportId: string) {
  const copyId = scalpelCopies.get(viewportId)
  scalpelCopies.delete(viewportId)
  cutHistory.delete(viewportId)
  if (copyId) cache.removeVolumeLoadObject(copyId)
}

// --- iso-surface --------------------------------------------------------------------------------

const SURFACE_UID = 'iso-surface'
const meshes = new Map<string, Mesh>()

/**
 * An iso-surface at a threshold (marching cubes), shown instead of the volume
 * rendering. `reduce` (1, 2, 4) samples every n-th voxel for a lighter mesh.
 */
export function showSurface(viewportId: string, threshold: number, reduce: number, color: [number, number, number]) {
  const parts = volumeParts(viewportId)
  const grid = parts && volumeGrid(parts.volumeId)
  if (!parts || !grid) return null
  const dims = grid.dimensions.map((d) => Math.max(2, Math.floor((d - 1) / reduce) + 1)) as [number, number, number]
  const values = new Float32Array(dims[0] * dims[1] * dims[2])
  for (let k = 0; k < dims[2]; k++)
    for (let j = 0; j < dims[1]; j++)
      for (let i = 0; i < dims[0]; i++) {
        const source = Math.min(i * reduce, grid.dimensions[0] - 1) + grid.dimensions[0] * (Math.min(j * reduce, grid.dimensions[1] - 1) + grid.dimensions[1] * Math.min(k * reduce, grid.dimensions[2] - 1))
        values[i + dims[0] * (j + dims[1] * k)] = grid.scalars[source]
      }
  const image = vtkImageData.newInstance()
  image.setDimensions(dims)
  image.setSpacing(v3(grid.spacing.map((s) => s * reduce)))
  image.setOrigin(v3(grid.origin))
  image.setDirection(Float32Array.from(grid.direction) as never)
  image.getPointData().setScalars(vtkDataArray.newInstance({ numberOfComponents: 1, values }))
  const cubes = vtkImageMarchingCubes.newInstance({ contourValue: threshold, computeNormals: true, mergePoints: true })
  cubes.setInputData(image)
  cubes.update()
  const polyData = cubes.getOutputData()
  // Marching cubes works in index space scaled by spacing; place the points in the patient's frame.
  const raw = polyData.getPoints().getData() as Float32Array
  const points = new Float32Array(raw.length)
  for (let p = 0; p < raw.length; p += 3) {
    const local = [raw[p] - grid.origin[0], raw[p + 1] - grid.origin[1], raw[p + 2] - grid.origin[2]]
    const index = [local[0] / (grid.spacing[0] * reduce), local[1] / (grid.spacing[1] * reduce), local[2] / (grid.spacing[2] * reduce)]
    const world = indexToWorld({ ...grid, spacing: grid.spacing.map((s) => s * reduce) as [number, number, number] }, index)
    points.set(world, p)
  }
  polyData.getPoints().setData(points, 3)
  const mesh: Mesh = { points, triangles: trianglesFromPolys(polyData.getPolys().getData() as Uint32Array) }
  meshes.set(viewportId, mesh)

  hideSurface(viewportId, false)
  const mapper = vtkMapper.newInstance()
  mapper.setInputData(polyData)
  mapper.setScalarVisibility(false)
  const actor = vtkActor.newInstance()
  actor.setMapper(mapper)
  actor.getProperty().setColor(...color)
  parts.viewport.addActor({ uid: SURFACE_UID, actor: actor as never })
  ;(parts.actor as unknown as { setVisibility(v: boolean): void }).setVisibility(false)
  parts.viewport.render()
  return { triangles: mesh.triangles.length / 3, ...meshMeasures(mesh) }
}

export function hideSurface(viewportId: string, render = true) {
  const viewport = vrViewport(viewportId)
  if (!viewport) return
  if (viewport.getActors().some((a) => a.uid === SURFACE_UID)) viewport.removeActors([SURFACE_UID])
  const parts = volumeParts(viewportId)
  ;(parts?.actor as unknown as { setVisibility(v: boolean): void } | undefined)?.setVisibility(true)
  if (render) viewport.render()
}

export const surfaceMesh = (viewportId: string) => meshes.get(viewportId) ?? null

// --- endoscopy -------------------------------------------------------------------------------------

/** Puts a perspective camera at a point, looking at another (inside the patient). */
export function setEndoscopyCamera(viewportId: string, position: number[], lookAt: number[], viewAngle = 70) {
  const viewport = vrViewport(viewportId)
  if (!viewport) return
  const forward = normalize(sub(lookAt, position))
  // Any up that is not parallel to the view direction.
  const guess = Math.abs(forward[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1]
  const up = normalize(cross(cross(forward, guess), forward))
  // Cornerstone's setCamera ignores the projection; the vtk camera takes it directly.
  const camera = (viewport as unknown as { getVtkActiveCamera(): { setParallelProjection(v: boolean): void; setViewAngle(v: number): void } }).getVtkActiveCamera()
  camera.setParallelProjection(false)
  camera.setViewAngle(viewAngle)
  viewport.setCamera({
    position: position as Types.Point3,
    focalPoint: add(position, scale(forward, 10)) as Types.Point3,
    viewUp: up as Types.Point3,
  })
  viewport.render()
}

/** Back to the normal outside view: parallel projection, reset camera. */
export function leaveEndoscopy(viewportId: string) {
  const viewport = vrViewport(viewportId)
  if (!viewport) return
  ;(viewport as unknown as { getVtkActiveCamera(): { setParallelProjection(v: boolean): void } }).getVtkActiveCamera().setParallelProjection(true)
  viewport.resetCamera()
  viewport.render()
}

// --- state shared with the 3D panel ---------------------------------------------------------------

export interface ViewSettings {
  box: CropBox
  plane: ClipPlane | null
  blend: Blend
}

export interface Snapshot {
  id: string
  name: string
  camera: Types.ICamera
  tf: TransferFunction
  lighting: Lighting
  settings: ViewSettings
}

/** What a click or drag on the 3D view does, besides rotating. */
export type VrMode = 'none' | 'cutInside' | 'cutOutside' | 'measure'

interface Vr3dState {
  mode: VrMode
  views: Record<string, ViewSettings>
  snapshots: Snapshot[]
  /** Scalpel cuts that can be undone, per viewport. */
  cuts: Record<string, number>
  /** Points picked for a 3D measurement, per viewport (0–2). */
  measure: Record<string, number[][]>
}

export const useVr3d = create<Vr3dState>()(() => ({ mode: 'none', views: {}, snapshots: [], cuts: {}, measure: {} }))

export const setVrMode = (mode: VrMode) => useVr3d.setState({ mode })

/** Adds a picked surface point to the viewport's measurement (a third point starts a new one). */
export function addMeasurePoint(viewportId: string, point: number[]) {
  useVr3d.setState((s) => {
    const current = s.measure[viewportId] ?? []
    return { measure: { ...s.measure, [viewportId]: current.length >= 2 ? [point] : [...current, point] } }
  })
}

export const viewSettings = (viewportId: string): ViewSettings => useVr3d.getState().views[viewportId] ?? { box: FULL_BOX, plane: null, blend: 'composite' }

export function updateViewSettings(viewportId: string, change: Partial<ViewSettings>) {
  const next = { ...viewSettings(viewportId), ...change }
  useVr3d.setState((s) => ({ views: { ...s.views, [viewportId]: next } }))
  applyClipping(viewportId, next.box, next.plane)
}

export function takeSnapshot(viewportId: string, name: string) {
  const viewport = vrViewport(viewportId)
  const tf = getTransferFunction(viewportId)
  const lighting = getLighting(viewportId)
  if (!viewport || !tf || !lighting) return
  const snapshot: Snapshot = { id: crypto.randomUUID(), name, camera: { ...viewport.getCamera() }, tf, lighting, settings: viewSettings(viewportId) }
  useVr3d.setState((s) => ({ snapshots: [...s.snapshots, snapshot] }))
  return snapshot
}

export function restoreSnapshot(viewportId: string, snapshot: Snapshot) {
  const viewport = vrViewport(viewportId)
  if (!viewport) return
  setTransferFunction(viewportId, snapshot.tf)
  setLighting(viewportId, snapshot.lighting)
  updateViewSettings(viewportId, snapshot.settings)
  ;(volumeParts(viewportId)?.mapper as unknown as { setBlendMode(n: number): void } | undefined)?.setBlendMode(VTK_BLEND[snapshot.settings.blend])
  viewport.setCamera(snapshot.camera)
  viewport.render()
}

/** Camera between two snapshots (t = 0–1): positions and directions blended, then renormalised. */
export function blendCameras(a: Types.ICamera, b: Types.ICamera, t: number): Partial<Types.ICamera> {
  const mix = (x: number[] | undefined, y: number[] | undefined) => (x && y ? x.map((v, i) => v + (y[i] - v) * t) : (x ?? y))
  const focalPoint = mix(a.focalPoint, b.focalPoint)!
  // Interpolate the direction and distance from the focal point, not the position itself.
  const da = sub(a.position!, a.focalPoint!)
  const db = sub(b.position!, b.focalPoint!)
  const distance = Math.hypot(...da) + (Math.hypot(...db) - Math.hypot(...da)) * t
  const direction = normalize(mix(normalize(da), normalize(db))!)
  return {
    focalPoint: focalPoint as Types.Point3,
    position: add(focalPoint, scale(direction, distance)) as Types.Point3,
    viewUp: normalize(mix(a.viewUp, b.viewUp)!) as Types.Point3,
    parallelScale: (a.parallelScale ?? 1) + ((b.parallelScale ?? 1) - (a.parallelScale ?? 1)) * t,
  }
}

// --- fusion in 3D --------------------------------------------------------------------------------

/** 4 × 4 matrix (column-major, as vtk wants) moving the overlay: rotate about its centre, then translate. */
export function registrationMatrix(translate: number[], rotate: number[], center: number[]) {
  const [x, y, z] = rotate.map((d) => (d * Math.PI) / 180)
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y), Math.cos(z), Math.sin(z)]
  const r = [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ]
  // p' = R (p − c) + c + t  =  R p + (c − R c + t)
  const offset = [0, 1, 2].map((i) => center[i] - (r[i][0] * center[0] + r[i][1] * center[1] + r[i][2] * center[2]) + translate[i])
  return [r[0][0], r[1][0], r[2][0], 0, r[0][1], r[1][1], r[2][1], 0, r[0][2], r[1][2], r[2][2], 0, offset[0], offset[1], offset[2], 1]
}

const OVERLAY_UID_SUFFIX = '-fusion'

/** Shows a second volume in colour in a 3D view (PET over CT), moved by the registration. */
export async function addOverlayVolume(viewportId: string, volumeId: string, tf: TransferFunction, matrix: number[]) {
  const viewport = vrViewport(viewportId)
  if (!viewport) return
  const uid = `${volumeId}${OVERLAY_UID_SUFFIX}`
  if (!viewport.getActors().some((a) => a.uid === uid)) await viewport.addVolumes([{ volumeId, actorUID: uid } as never])
  const entry = viewport.getActors().find((a) => a.uid === uid)
  if (!entry) return
  const actor = entry.actor as unknown as { getProperty(): { getScalarOpacity(i: number): { removeAllPoints(): void; addPoint(x: number, y: number): void }; getRGBTransferFunction(i: number): { removeAllPoints(): void; addRGBPoint(x: number, r: number, g: number, b: number): void } }; setUserMatrix(m: number[]): void }
  const property = actor.getProperty()
  property.getScalarOpacity(0).removeAllPoints()
  for (const p of tf.opacity) property.getScalarOpacity(0).addPoint(p.value, p.opacity)
  property.getRGBTransferFunction(0).removeAllPoints()
  for (const p of tf.colors) property.getRGBTransferFunction(0).addRGBPoint(p.value, p.r, p.g, p.b)
  actor.setUserMatrix(matrix)
  viewport.render()
}

export function removeOverlayVolumes(viewportId: string) {
  const viewport = vrViewport(viewportId)
  if (!viewport) return
  const uids = viewport.getActors().filter((a) => a.uid.endsWith(OVERLAY_UID_SUFFIX)).map((a) => a.uid)
  if (uids.length) viewport.removeActors(uids)
  viewport.render()
}

export const hasOverlayVolume = (viewportId: string) => vrViewport(viewportId)?.getActors().some((a) => a.uid.endsWith(OVERLAY_UID_SUFFIX)) ?? false
