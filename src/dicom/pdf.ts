import dicomParser from 'dicom-parser'

/** The PDF bytes of an Encapsulated PDF object (0042,0011). */
export async function encapsulatedPdf(file: Blob): Promise<Uint8Array> {
  const dataSet = dicomParser.parseDicom(new Uint8Array(await file.arrayBuffer()))
  const element = dataSet.elements.x00420011
  if (!element) throw new Error('No encapsulated document')
  // The value may be padded to an even length; PDF readers ignore bytes after %%EOF.
  return dataSet.byteArray.slice(element.dataOffset, element.dataOffset + element.length)
}
