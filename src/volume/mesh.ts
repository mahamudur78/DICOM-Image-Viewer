// Triangle meshes (from marching cubes) written as STL, OBJ or PLY, in mm.

export interface Mesh {
  /** x, y, z of each vertex. */
  points: Float32Array | number[]
  /** Three vertex indexes per triangle. */
  triangles: Uint32Array | number[]
}

const vertex = (mesh: Mesh, i: number) => [mesh.points[i * 3], mesh.points[i * 3 + 1], mesh.points[i * 3 + 2]]

function normal(a: number[], b: number[], c: number[]) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
  const l = Math.hypot(n[0], n[1], n[2]) || 1
  return n.map((x) => x / l)
}

/** Binary STL: 80-byte header, triangle count, then normal + 3 vertices + 2 bytes per triangle. */
export function encodeStl(mesh: Mesh, header = 'DicomLens surface (mm)'): Uint8Array<ArrayBuffer> {
  const count = mesh.triangles.length / 3
  const out = new Uint8Array(84 + count * 50)
  const view = new DataView(out.buffer)
  out.set([...header.slice(0, 80)].map((c) => c.charCodeAt(0) & 0x7f))
  view.setUint32(80, count, true)
  for (let t = 0; t < count; t++) {
    const [a, b, c] = [0, 1, 2].map((k) => vertex(mesh, mesh.triangles[t * 3 + k]))
    const values = [...normal(a, b, c), ...a, ...b, ...c]
    values.forEach((v, i) => view.setFloat32(84 + t * 50 + i * 4, v, true))
  }
  return out
}

export function encodeObj(mesh: Mesh): string {
  const lines = ['# DicomLens surface, mm']
  for (let i = 0; i < mesh.points.length; i += 3) lines.push(`v ${mesh.points[i]} ${mesh.points[i + 1]} ${mesh.points[i + 2]}`)
  for (let t = 0; t < mesh.triangles.length; t += 3) lines.push(`f ${mesh.triangles[t] + 1} ${mesh.triangles[t + 1] + 1} ${mesh.triangles[t + 2] + 1}`)
  return lines.join('\n') + '\n'
}

export function encodePly(mesh: Mesh): string {
  const vertices = mesh.points.length / 3
  const faces = mesh.triangles.length / 3
  const lines = ['ply', 'format ascii 1.0', 'comment DicomLens surface, mm', `element vertex ${vertices}`, 'property float x', 'property float y', 'property float z', `element face ${faces}`, 'property list uchar int vertex_indices', 'end_header']
  for (let i = 0; i < mesh.points.length; i += 3) lines.push(`${mesh.points[i]} ${mesh.points[i + 1]} ${mesh.points[i + 2]}`)
  for (let t = 0; t < mesh.triangles.length; t += 3) lines.push(`3 ${mesh.triangles[t]} ${mesh.triangles[t + 1]} ${mesh.triangles[t + 2]}`)
  return lines.join('\n') + '\n'
}

/** Surface area (mm²) and, for a closed mesh, enclosed volume (mm³, divergence theorem). */
export function meshMeasures(mesh: Mesh) {
  let area = 0
  let volume = 0
  for (let t = 0; t < mesh.triangles.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => vertex(mesh, mesh.triangles[t + k]))
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    area += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
  }
  return { area, volume: Math.abs(volume) }
}

/** Triangles from vtk polys (a cell array of [n, i0, i1, …]); polygons are fanned into triangles. */
export function trianglesFromPolys(polys: ArrayLike<number>): Uint32Array {
  const out: number[] = []
  for (let i = 0; i < polys.length; ) {
    const n = polys[i]
    for (let k = 1; k + 1 < n; k++) out.push(polys[i + 1], polys[i + 1 + k], polys[i + 2 + k])
    i += n + 1
  }
  return Uint32Array.from(out)
}
