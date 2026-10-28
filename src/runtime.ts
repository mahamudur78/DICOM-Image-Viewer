// The viewer runtime (Cornerstone, vtk.js and the workspace UI) is one large
// chunk. It is loaded separately so the welcome page shows without waiting
// for it; App starts the download right after the first render.

let runtime: Promise<typeof import('./runtimeEntry')> | null = null

export const loadRuntime = () => (runtime ??= import('./runtimeEntry'))

/** Starts Cornerstone (once) and resolves when the viewer can show images. */
export async function startViewer() {
  const { initCornerstone } = await loadRuntime()
  await initCornerstone()
}
