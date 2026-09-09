/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DocumentPage } from '../types.ts';

/**
 * Robust client-side PDF text extractor.
 * Uses pdfjs-dist in the browser to extract text and page numbers directly.
 * If binary upload to /api/analyze-files fails due to reverse proxy size limits,
 * this client extractor converts the PDF to text pages (<150KB) and submits to /api/analyze-text.
 */
export async function extractTextFromPdfFile(file: File): Promise<{
  filename: string;
  fileSize: number;
  totalPages: number;
  pages: DocumentPage[];
}> {
  const arrayBuffer = await file.arrayBuffer();

  try {
    const pdfjsLib = await import('pdfjs-dist');

    // Configure worker if not already configured
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;
      } catch {
        // Fallback: pdfjs-dist can execute without worker in browser
      }
    }

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    const pages: DocumentPage[] = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => (item.str !== undefined ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      pages.push({
        pageNumber: pageNum,
        text: pageText || `[Page ${pageNum} contains visual or graphical content]`,
      });
    }

    return {
      filename: file.name,
      fileSize: file.size,
      totalPages,
      pages,
    };
  } catch (clientParseErr: any) {
    console.warn(`[FactLens] pdfjs-dist client extraction failed for "${file.name}":`, clientParseErr);
    // Fallback: simple text heuristic if arrayBuffer contains ASCII text
    const uint8 = new Uint8Array(arrayBuffer);
    const textDecoder = new TextDecoder('utf-8', { fatal: false });
    const rawContent = textDecoder.decode(uint8.slice(0, 50000));
    
    // Extract stream content or readable text
    const textMatches = rawContent.match(/\(([^()]+)\)\s*Tj/g);
    let extractedText = '';
    if (textMatches && textMatches.length > 0) {
      extractedText = textMatches
        .map(m => m.replace(/^\(/, '').replace(/\)\s*Tj$/, ''))
        .join(' ');
    } else {
      extractedText = rawContent.replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    return {
      filename: file.name,
      fileSize: file.size,
      totalPages: 1,
      pages: [{ pageNumber: 1, text: extractedText.slice(0, 10000) || `Text from ${file.name}` }],
    };
  }
}
