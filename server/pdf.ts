/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PDFParse } from 'pdf-parse';
import { DocumentPage } from '../src/types.ts';

/**
 * Extract text from a PDF Buffer while strictly preserving page numbers.
 */
export async function extractPdfPages(buffer: Buffer): Promise<{
  totalPages: number;
  pages: DocumentPage[];
}> {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const totalPages = result.total || (result.pages ? result.pages.length : 1);

    const pages: DocumentPage[] = [];

    if (result.pages && Array.isArray(result.pages) && result.pages.length > 0) {
      for (let i = 0; i < result.pages.length; i++) {
        const p = result.pages[i];
        const pageNumber = p.num !== undefined ? p.num : i + 1;
        const text = (p.text || '').trim();
        pages.push({ pageNumber, text });
      }
    } else if (result.text) {
      // Fallback if pages array wasn't populated
      pages.push({ pageNumber: 1, text: result.text.trim() });
    }

    // Clean up parser if supported
    if (typeof parser.destroy === 'function') {
      try {
        await parser.destroy();
      } catch {
        // ignore cleanup error
      }
    }

    return {
      totalPages: Math.max(totalPages, pages.length),
      pages,
    };
  } catch (error: any) {
    console.error('Error parsing PDF with PDFParse:', error);
    throw new Error(`Failed to extract text from PDF: ${error.message || 'Unknown error'}`);
  }
}
