import { loadPdfjs } from './pdfLib';
import type { PdfTextResult } from './pdfTextFormat';
import {
  documentText,
  hasReadableText,
  MAX_PDF_PAGES,
  pageText,
} from './pdfTextFormat';

// Read all the words of a PDF. Runs here in the app's window (PDF.js works in a
// background worker); the app's main process only asks for the result.
export async function extractPdfText(data: Uint8Array): Promise<PdfTextResult> {
  try {
    const pdfjs = await loadPdfjs();
    // PDF.js takes over the bytes it is given, so give it a copy.
    const task = pdfjs.getDocument({ data: data.slice() });
    try {
      const doc = await task.promise;
      const count = Math.min(doc.numPages, MAX_PDF_PAGES);
      const pages: string[] = [];
      for (let number = 1; number <= count; number++) {
        const page = await doc.getPage(number);
        const content = await page.getTextContent();
        pages.push(pageText(content.items));
        page.cleanup();
      }
      const whole = documentText(pages);
      return {
        ok: true,
        pages: doc.numPages,
        text: hasReadableText(pages) ? whole.text : '',
        scanned: !hasReadableText(pages),
        truncated: whole.truncated || doc.numPages > count,
      };
    } finally {
      void task.destroy();
    }
  } catch {
    return { ok: false };
  }
}
