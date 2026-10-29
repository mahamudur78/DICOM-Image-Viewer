// pdf.js with its worker configured; imported lazily (it is large).
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export const { getDocument } = pdfjs
export type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
