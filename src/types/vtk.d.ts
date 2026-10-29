// vtk.js modules without type definitions that this app uses.
declare module '@kitware/vtk.js/Filters/General/ImageMarchingCubes' {
  const vtkImageMarchingCubes: {
    newInstance(options?: { contourValue?: number; computeNormals?: boolean; mergePoints?: boolean }): {
      setInputData(data: unknown): void
      update(): void
      getOutputData(): {
        getPoints(): { getData(): Float32Array; setData(data: Float32Array, components: number): void }
        getPolys(): { getData(): Uint32Array }
      }
    }
  }
  export default vtkImageMarchingCubes
}
