// Conversions: ordinary images and PDFs into DICOM, and compressed DICOM
// into uncompressed (explicit VR little endian).
import { sniffFile } from '../dicom/fileType'
import { imageToDicom, newImportStudy } from '../dicom/imageImport'
import type { Series } from '../dicom/types'
import { dicomDateTime, dicomFile, element, newUid } from '../dicom/writer'
import { decompress, readDicom, writeDicom } from './dicomEdit'
import { isCompressed } from './dicomValues'
import { safeName, saveFiles, stamp, type OutputFile } from './files'
import type { Progress } from './exportImages'

export interface PatientDetails {
  patientName: string
  patientId: string
  description: string
}

const ENCAPSULATED_PDF = '1.2.840.10008.5.1.4.1.1.104.1'

/** An encapsulated PDF DICOM object holding a PDF file (PS3.3 A.45). */
export async function pdfToDicom(pdf: File, details: PatientDetails, studyUID = newUid()) {
  const { date, time } = dicomDateTime(new Date())
  const bytes = new Uint8Array(await pdf.arrayBuffer())
  const title = pdf.name.replace(/\.pdf$/i, '').slice(0, 64)
  return dicomFile(ENCAPSULATED_PDF, newUid(), [
    element(0x0008, 0x0005, 'CS', 'ISO_IR 192'),
    element(0x0008, 0x0020, 'DA', date),
    element(0x0008, 0x0023, 'DA', date),
    element(0x0008, 0x0030, 'TM', time),
    element(0x0008, 0x0033, 'TM', time),
    element(0x0008, 0x0060, 'CS', 'DOC'),
    element(0x0008, 0x0064, 'CS', 'WSD'),
    element(0x0008, 0x1030, 'LO', (details.description || 'Converted documents').slice(0, 64)),
    element(0x0008, 0x103e, 'LO', title),
    element(0x0010, 0x0010, 'PN', details.patientName),
    element(0x0010, 0x0020, 'LO', details.patientId),
    element(0x0020, 0x000d, 'UI', studyUID),
    element(0x0020, 0x000e, 'UI', newUid()),
    element(0x0020, 0x0011, 'IS', 1),
    element(0x0020, 0x0013, 'IS', 1),
    element(0x0028, 0x0301, 'CS', 'YES'),
    element(0x0042, 0x0010, 'ST', title),
    element(0x0042, 0x0011, 'OB', bytes),
    element(0x0042, 0x0012, 'LO', 'application/pdf'),
  ])
}

/** "%PDF" at the start of the file. */
const isPdf = async (file: Blob) => new TextDecoder().decode(await file.slice(0, 4).arrayBuffer()) === '%PDF'

/**
 * Converts images (JPEG, PNG, BMP, GIF, WebP, TIFF) and PDFs into DICOM
 * files of one new study for the given patient, and downloads them.
 */
export async function convertToDicom(files: File[], details: PatientDetails, onProgress: (p: Progress) => void) {
  const study = newImportStudy(details)
  const out: OutputFile[] = []
  let series = 1
  for (const [i, file] of files.entries()) {
    const type = await sniffFile(file)
    if (type.type === 'image') {
      for (const converted of await imageToDicom({ file, path: file.name }, type.format, study, series++)) out.push({ name: converted.file.name, data: converted.file })
    } else if (await isPdf(file)) {
      out.push({ name: `${safeName(file.name.replace(/\.pdf$/i, ''))}.dcm`, data: new Blob([(await pdfToDicom(file, details, study.studyInstanceUID)) as BlobPart]) })
    }
    onProgress({ done: i + 1, total: files.length })
  }
  await saveFiles(out, `converted-${stamp()}.zip`)
  return out.length
}

/** The image ids of each file of a series (multi-frame files have one per frame). */
export function filesOf(series: Series) {
  const byFile = new Map<File, string[]>()
  for (const image of series.images) byFile.set(image.file, [...(byFile.get(image.file) ?? []), ...(image.imageId ? [image.imageId] : [])])
  return [...byFile]
}

/** Compressed files of a series become uncompressed; uncompressed ones are copied as they are. */
export async function decompressSeries(series: Series, onProgress: (p: Progress) => void) {
  const files = filesOf(series)
  const out: OutputFile[] = []
  for (const [i, [file, imageIds]] of files.entries()) {
    const dicom = await readDicom(file)
    if (isCompressed(dicom) && imageIds.length) await decompress(dicom, imageIds)
    out.push({ name: file.name.endsWith('.dcm') ? file.name : `${file.name}.dcm`, data: writeDicom(dicom) })
    onProgress({ done: i + 1, total: files.length })
  }
  await saveFiles(out, `${safeName(series.description || series.modality)}-uncompressed-${stamp()}.zip`)
  return out.length
}
