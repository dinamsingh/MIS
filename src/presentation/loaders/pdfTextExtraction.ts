/**
 * Client-side PDF text extraction (pdfjs-dist), used by the admin syllabus
 * upload flow. Runs entirely in the browser — the PDF binary itself never
 * leaves the client; only the extracted plain text is sent to the server for
 * AI extraction (functions/api/parse-syllabus-pdf.ts).
 */

import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves this worker asset at build time (pdfjs-dist ships a ready
// worker bundle); ?url gives us the built asset path instead of the source.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** Reads a File (must be a PDF) and returns its concatenated plain text, page by page. */
export async function extractTextFromPdf(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pageTexts: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    pageTexts.push(pageText);
  }

  return pageTexts.join('\n\n');
}
