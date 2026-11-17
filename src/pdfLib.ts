// Loads the PDF library (PDF.js) the first time it is needed, and tells it where its
// background worker is. Shared by the PDF viewer and the text reader.
let loading: Promise<typeof import('pdfjs-dist')> | null = null;

export function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  loading ??= (async () => {
    const pdfjs = await import('pdfjs-dist');
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url'))
      .default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    return pdfjs;
  })();
  return loading;
}
