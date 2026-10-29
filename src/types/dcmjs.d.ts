// The parts of dcmjs this app uses (dcmjs ships no type definitions).
declare module 'dcmjs' {
  export interface DicomEntry {
    vr: string
    Value?: unknown[]
    InlineBinary?: string
    _rawValue?: unknown
  }
  export type DicomDataset = Record<string, DicomEntry>

  export class DicomDict {
    constructor(meta: DicomDataset)
    meta: DicomDataset
    dict: DicomDataset
    write(options?: { allowInvalidVRLength?: boolean }): ArrayBuffer
  }

  const dcmjs: {
    data: {
      DicomDict: typeof DicomDict
      DicomMessage: { readFile(buffer: ArrayBuffer, options?: { ignoreErrors?: boolean; untilTag?: string }): DicomDict }
      DicomMetaDictionary: {
        dictionary: Record<string, { tag: string; vr: string; name: string; vm: string } | undefined>
        uid(): string
        punctuateTag(tag: string): string
        unpunctuateTag(tag: string): string
      }
    }
  }
  export default dcmjs
}
