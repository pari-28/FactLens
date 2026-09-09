/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import multer from 'multer';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { extractPdfPages } from './server/pdf.ts';
import { extractFactsFromDocument } from './server/gemini.ts';
import { buildCrossDocumentRelationships } from './src/lib/deterministic-matcher.ts';
import { getSampleDatasets } from './server/sample-generator.ts';
import { AnalysisResponse, DocumentMetadata, ExtractedFact, DocumentPage } from './src/types.ts';

dotenv.config();

const app = express();
const PORT = 3000;

// Enable CORS for all routes (ensures seamless operation in AI Studio iframes and preview domains)
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  })
);
app.options('*', cors());

// Setup multer in-memory storage for handling PDF uploads (max 25MB per file to stay safely within Nginx's 32M limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 10,
  },
});

app.use(express.json({ limit: '32mb' }));
app.use(express.urlencoded({ extended: true, limit: '32mb' }));

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    geminiKeyConfigured: !!process.env.GEMINI_API_KEY,
  });
});

// 2. Available Sample Datasets
app.get('/api/samples', (req, res) => {
  const datasets = getSampleDatasets().map(d => ({
    id: d.id,
    name: d.name,
    description: d.description,
    fileCount: d.documents.length,
    filenames: d.documents.map(doc => doc.filename),
  }));
  res.json(datasets);
});

// 3. Download a sample PDF
app.get('/api/download-sample/:datasetId/:docIndex', (req, res) => {
  const { datasetId, docIndex } = req.params;
  const datasets = getSampleDatasets();
  const dataset = datasets.find(d => d.id === datasetId);
  if (!dataset) {
    res.status(404).send('Sample dataset not found');
    return;
  }
  const idx = parseInt(docIndex, 10);
  if (isNaN(idx) || idx < 0 || idx >= dataset.documents.length) {
    res.status(404).send('Document index out of range');
    return;
  }
  const doc = dataset.documents[idx];
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${doc.filename}"`);
  res.send(doc.buffer);
});

// 4. Load & Process a Sample Dataset
app.post('/api/samples/load', async (req, res) => {
  try {
    const { datasetId } = req.body;
    const datasets = getSampleDatasets();
    const dataset = datasets.find(d => d.id === datasetId) || datasets[0];

    if (!dataset) {
      res.status(404).json({ error: 'Sample dataset not found' });
      return;
    }

    console.log(`Processing sample dataset: "${dataset.name}" with ${dataset.documents.length} documents...`);

    // Process documents in parallel for rapid response times
    const docResults = await Promise.all(
      dataset.documents.map(async (doc, i) => {
        const docId = `doc_${i + 1}_${Date.now()}`;
        console.log(`[1/3] Extracting text and pages for: ${doc.filename}...`);
        const { totalPages, pages } = await extractPdfPages(doc.buffer);

        const meta: DocumentMetadata = {
          id: docId,
          filename: doc.filename,
          totalPages,
          fileSize: doc.buffer.length,
          uploadDate: new Date().toISOString(),
          pages,
        };

        console.log(`[2/3] Extracting semantic facts for: ${doc.filename} (${totalPages} pages)...`);
        const extraction = await extractFactsFromDocument(docId, doc.filename, pages);
        console.log(`Extracted ${extraction.facts.length} facts from ${doc.filename} (mode: ${extraction.mode})`);

        return {
          meta,
          facts: extraction.facts,
          mode: extraction.mode,
          notice: extraction.notice,
        };
      })
    );

    const usedFallback = docResults.some(r => r.mode === 'deterministic-fallback');
    const fallbackNotice = docResults.find(r => r.notice)?.notice;

    const documentMetas = docResults.map(r => r.meta);
    const allFacts = docResults.flatMap(r => r.facts);

    console.log(`[3/3] Executing deterministic cross-document comparison across ${allFacts.length} facts...`);
    const relationships = buildCrossDocumentRelationships(allFacts);

    const summary = {
      totalDocuments: documentMetas.length,
      totalFacts: allFacts.length,
      corroboratedCount: relationships.filter(r => r.type === 'CORROBORATED').length,
      contradictedCount: relationships.filter(r => r.type === 'CONTRADICTED').length,
      reconciledCount: relationships.filter(r => r.type === 'RECONCILED BY CONTEXT').length,
      uncertainCount: relationships.filter(r => r.type === 'UNCERTAIN').length,
    };

    const responseData: AnalysisResponse = {
      documents: documentMetas,
      facts: allFacts,
      relationships,
      summary,
      extractionMode: usedFallback ? 'deterministic-fallback' : 'gemini',
      extractionNotice: usedFallback ? fallbackNotice || 'Processed using deterministic knowledge layer' : undefined,
      isDeveloperTestData: true,
    };

    res.setHeader('Content-Type', 'application/json');
    res.json(responseData);
  } catch (error: any) {
    console.error('Error loading sample dataset:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({
      error: error.message || 'Failed to process sample dataset',
    });
  }
});

// 5. User Upload & Process Multiple PDF Documents
app.post('/api/analyze-files', (req, res) => {
  upload.array('files', 10)(req, res, async (uploadErr: any) => {
    if (uploadErr) {
      console.error('[FactLens] File upload error:', uploadErr);
      if (uploadErr instanceof multer.MulterError) {
        if (uploadErr.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: 'One or more uploaded PDF documents exceed the 25MB file size limit. Please upload smaller or compressed PDF files.',
          });
        }
        if (uploadErr.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            error: 'Too many files uploaded. Please upload at most 10 PDF documents at once.',
          });
        }
        return res.status(400).json({
          error: `Upload error: ${uploadErr.message}`,
        });
      }
      return res.status(400).json({
        error: uploadErr.message || 'Failed to process uploaded files.',
      });
    }

    try {
      const files = req.files as Express.Multer.File[];

      if (!files || files.length < 2) {
        return res.status(400).json({
          error: 'Cross-document comparison requires at least two documents. Please upload at least two PDF files.',
        });
      }

      console.log(`Received ${files.length} uploaded PDF files for analysis.`);

      // Extract text and facts across all uploaded files in parallel to optimize response time
      const fileResults = await Promise.all(
        files.map(async (file, i) => {
          const docId = `upload_${i + 1}_${Date.now()}`;

          console.log(`Extracting pages from uploaded file: ${file.originalname}...`);
          const { totalPages, pages } = await extractPdfPages(file.buffer);

          if (pages.length === 0 || pages.every(p => !p.text || p.text.trim().length === 0)) {
            throw new Error(
              `Document "${file.originalname}" has no extractable text. Please ensure the PDF contains selectable text (not scanned images without OCR).`
            );
          }

          const meta: DocumentMetadata = {
            id: docId,
            filename: file.originalname,
            totalPages,
            fileSize: file.size,
            uploadDate: new Date().toISOString(),
            pages,
          };

          console.log(`Running fact extraction on "${file.originalname}" (${totalPages} pages)...`);
          const extraction = await extractFactsFromDocument(docId, file.originalname, pages);

          return {
            meta,
            facts: extraction.facts,
            mode: extraction.mode,
            notice: extraction.notice,
          };
        })
      );

      const usedFallback = fileResults.some(r => r.mode === 'deterministic-fallback');
      const fallbackNotice = fileResults.find(r => r.notice)?.notice;

      const documentMetas = fileResults.map(r => r.meta);
      const allFacts = fileResults.flatMap(r => r.facts);

      // Step 3: Deterministic Cross-document Matching & Relationship Classification
      console.log(`Comparing ${allFacts.length} extracted facts across documents deterministically...`);
      const relationships = buildCrossDocumentRelationships(allFacts);

      const summary = {
        totalDocuments: documentMetas.length,
        totalFacts: allFacts.length,
        corroboratedCount: relationships.filter(r => r.type === 'CORROBORATED').length,
        contradictedCount: relationships.filter(r => r.type === 'CONTRADICTED').length,
        reconciledCount: relationships.filter(r => r.type === 'RECONCILED BY CONTEXT').length,
        uncertainCount: relationships.filter(r => r.type === 'UNCERTAIN').length,
      };

      const responseData: AnalysisResponse = {
        documents: documentMetas,
        facts: allFacts,
        relationships,
        summary,
        extractionMode: usedFallback ? 'deterministic-fallback' : 'gemini',
        extractionNotice: usedFallback ? fallbackNotice || 'Processed using deterministic knowledge layer' : undefined,
        isDeveloperTestData: false,
      };

      res.setHeader('Content-Type', 'application/json');
      return res.json(responseData);
    } catch (error: any) {
      console.error('Error analyzing uploaded documents:', error);
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({
        error: error.message || 'An unexpected error occurred during document processing.',
      });
    }
  });
});

// 6. Direct Text Analysis Endpoint (bypasses binary upload limits completely)
app.post('/api/analyze-text', async (req, res) => {
  try {
    const { documents } = req.body as {
      documents: Array<{
        filename: string;
        fileSize?: number;
        pages: DocumentPage[];
      }>;
    };

    if (!documents || !Array.isArray(documents) || documents.length < 2) {
      return res.status(400).json({
        error: 'Cross-document comparison requires at least two documents. Please provide at least two document page sets.',
      });
    }

    console.log(`[FactLens] Processing ${documents.length} documents via direct text payload...`);

    const fileResults = await Promise.all(
      documents.map(async (doc, i) => {
        const docId = `text_doc_${i + 1}_${Date.now()}`;
        const pages = (doc.pages || []).map((p, idx) => ({
          pageNumber: p.pageNumber || idx + 1,
          text: (p.text || '').trim(),
        }));

        const meta: DocumentMetadata = {
          id: docId,
          filename: doc.filename || `Document ${i + 1}`,
          totalPages: pages.length,
          fileSize: doc.fileSize || pages.reduce((acc, p) => acc + p.text.length, 0),
          uploadDate: new Date().toISOString(),
          pages,
        };

        const extraction = await extractFactsFromDocument(docId, meta.filename, pages);
        return {
          meta,
          facts: extraction.facts,
          mode: extraction.mode,
          notice: extraction.notice,
        };
      })
    );

    const usedFallback = fileResults.some(r => r.mode === 'deterministic-fallback');
    const fallbackNotice = fileResults.find(r => r.notice)?.notice;
    const documentMetas = fileResults.map(r => r.meta);
    const allFacts = fileResults.flatMap(r => r.facts);

    const relationships = buildCrossDocumentRelationships(allFacts);

    const summary = {
      totalDocuments: documentMetas.length,
      totalFacts: allFacts.length,
      corroboratedCount: relationships.filter(r => r.type === 'CORROBORATED').length,
      contradictedCount: relationships.filter(r => r.type === 'CONTRADICTED').length,
      reconciledCount: relationships.filter(r => r.type === 'RECONCILED BY CONTEXT').length,
      uncertainCount: relationships.filter(r => r.type === 'UNCERTAIN').length,
    };

    const responseData: AnalysisResponse = {
      documents: documentMetas,
      facts: allFacts,
      relationships,
      summary,
      extractionMode: usedFallback ? 'deterministic-fallback' : 'gemini',
      extractionNotice: usedFallback ? fallbackNotice || 'Processed using deterministic knowledge layer' : undefined,
      isDeveloperTestData: false,
    };

    res.setHeader('Content-Type', 'application/json');
    return res.json(responseData);
  } catch (err: any) {
    console.error('[FactLens] Error analyzing document text:', err);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      error: err.message || 'An error occurred during text analysis.',
    });
  }
});

// Explicit API Error Handler Middleware (ensures JSON responses, never HTML)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[FactLens Unhandled Error]', err);
  if (req.path.startsWith('/api/')) {
    return res.status(res.statusCode >= 400 ? res.statusCode : 500).json({
      error: err.message || 'An internal server error occurred while processing the request.',
    });
  }
  next(err);
});

// Explicit 404 Handler for all /api/* routes so they NEVER fall through to Vite SPA index.html
app.all('/api/*', (req, res) => {
  res.status(404).json({
    error: `API route ${req.method} ${req.path} not found.`,
  });
});

// Start Express server and integrate Vite middleware
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`FactLens server running on http://0.0.0.0:${PORT}`);
  });
  server.timeout = 120000;
  server.keepAliveTimeout = 65000;
}

startServer();
