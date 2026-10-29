// A small PDF writer: pages of JPEG images and lines of Helvetica text.
// Coordinates are in points (1/72 inch) from the top-left of the page.
import { concat } from './gif'

export interface PdfImage {
  jpeg: Uint8Array
  /** Pixel size of the JPEG. */
  width: number
  height: number
  /** Where it goes on the page, in points. */
  x: number
  y: number
  w: number
  h: number
}

export interface PdfText {
  text: string
  x: number
  y: number
  size: number
}

export interface PdfPage {
  width: number
  height: number
  images: PdfImage[]
  texts: PdfText[]
}

/** Page sizes in points. */
export const PAGE_SIZES = { A4: [595.28, 841.89], Letter: [612, 792] } as const

export const MM = 72 / 25.4

/** Text in a PDF string literal (Latin-1 only; other characters become "?"). */
function pdfString(text: string) {
  const latin = [...text].map((c) => (c.charCodeAt(0) < 256 ? c : '?')).join('')
  return `(${latin.replace(/[\\()]/g, (c) => `\\${c}`)})`
}

const latin1 = (text: string) => Uint8Array.from([...text].map((c) => c.charCodeAt(0) & 0xff))
const num = (n: number) => (Math.round(n * 100) / 100).toString()

export function encodePdf(pages: PdfPage[], title = ''): Uint8Array<ArrayBuffer> {
  const objects: Uint8Array[] = []
  const add = (body: Uint8Array | string) => {
    objects.push(typeof body === 'string' ? latin1(body) : body)
    return objects.length // object numbers start at 1
  }
  const stream = (dict: string, data: Uint8Array) =>
    concat([latin1(`<< ${dict} /Length ${data.length} >>\nstream\n`), data, latin1('\nendstream')])

  // Fixed numbers: 1 catalog, 2 pages, 3 font, 4 info; pages and their content follow.
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('') // pages, filled in at the end
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  add(`<< /Title ${pdfString(title)} /Producer (DicomLens) >>`)

  const pageNumbers: number[] = []
  for (const page of pages) {
    const imageRefs = page.images.map((image) =>
      add(stream(`/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, image.jpeg)),
    )
    const ops: string[] = []
    page.images.forEach((image, i) => {
      // PDF's origin is bottom-left; images are drawn into a unit square scaled to their box.
      ops.push(`q ${num(image.w)} 0 0 ${num(image.h)} ${num(image.x)} ${num(page.height - image.y - image.h)} cm /Im${i} Do Q`)
    })
    for (const t of page.texts) ops.push(`BT /F1 ${num(t.size)} Tf ${num(t.x)} ${num(page.height - t.y - t.size)} Td ${pdfString(t.text)} Tj ET`)
    const content = add(stream('', latin1(ops.join('\n'))))
    const xobjects = imageRefs.map((ref, i) => `/Im${i} ${ref} 0 R`).join(' ')
    pageNumbers.push(
      add(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Contents ${content} 0 R /Resources << /Font << /F1 3 0 R >> /XObject << ${xobjects} >> >> >>`,
      ),
    )
  }
  objects[1] = latin1(`<< /Type /Pages /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageNumbers.length} >>`)

  const parts: Uint8Array[] = [latin1('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')]
  const offsets: number[] = []
  let length = parts[0].length
  objects.forEach((body, i) => {
    offsets.push(length)
    const part = concat([latin1(`${i + 1} 0 obj\n`), body, latin1('\nendobj\n')])
    parts.push(part)
    length += part.length
  })
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n', ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('')
  parts.push(latin1(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${length}\n%%EOF\n`))
  return concat(parts)
}
