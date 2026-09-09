/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  FileText,
  Layers,
  ArrowRightLeft,
  Database,
  ExternalLink,
  AlertCircle,
  X,
  Sparkles,
  Search,
} from 'lucide-react';
import { Header } from './components/Header.tsx';
import { DocumentUploader } from './components/DocumentUploader.tsx';
import { SummaryMetrics } from './components/SummaryMetrics.tsx';
import { RelationshipCard } from './components/RelationshipCard.tsx';
import { FactExplorer } from './components/FactExplorer.tsx';
import { DocumentViewerModal } from './components/DocumentViewerModal.tsx';
import { AuditExportModal } from './components/AuditExportModal.tsx';
import { AnalysisResponse, DocumentMetadata, ProcessingStage, RelationshipType } from './types.ts';
import { extractTextFromPdfFile } from './lib/client-pdf.ts';

// Ping server health to ensure container and reverse proxy are active
async function checkServerWarmup(): Promise<void> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    await fetch('/api/health', { signal: controller.signal });
    clearTimeout(timer);
  } catch {
    // If warming up, brief pause
    await new Promise(r => setTimeout(r, 800));
  }
}

// Helper for resilient fetch with automatic warmup retry
async function fetchWithWarmupRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  onWarmup?: (msg: string) => void
): Promise<Response> {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(input, init);
      const contentType = res.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');

      if (isJson) {
        return res;
      }

      // If we received non-JSON (like HTML proxy warmup) and have retries left
      if (attempt < maxRetries) {
        if (onWarmup) {
          onWarmup(`Server initializing verification engine (attempt ${attempt + 1}/${maxRetries})...`);
        }
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }

      return res;
    } catch (netErr: any) {
      if (attempt < maxRetries) {
        if (onWarmup) {
          onWarmup(`Connecting to verification server (attempt ${attempt + 1}/${maxRetries})...`);
        }
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw netErr;
    }
  }
  throw new Error('Connection failed after retry attempts.');
}

// Helper to parse responses cleanly, handling both JSON and HTML errors gracefully
async function parseApiResponse<T>(res: Response, defaultError: string): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    let errorMsg = `${defaultError} (HTTP ${res.status})`;
    if (isJson) {
      try {
        const errJson = await res.json();
        errorMsg = errJson.error || errJson.message || errorMsg;
      } catch {
        // use default
      }
    } else {
      try {
        const text = await res.text();
        if (
          text.includes('Starting Server') ||
          text.includes('warmup') ||
          text.includes('Please wait while your application starts') ||
          text.includes('nginx') ||
          text.includes('502 Bad Gateway') ||
          text.includes('504 Gateway Time-out')
        ) {
          errorMsg = 'The verification server is warming up or initializing. Please retry in a few moments.';
        } else {
          const preMatch = text.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
          const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          if (preMatch) {
            errorMsg = preMatch[1].replace(/<br\s*\/?>/gi, '\n').trim();
          } else if (titleMatch) {
            errorMsg = titleMatch[1].trim();
          } else if (text && text.length < 300) {
            errorMsg = text.trim();
          }
        }
      } catch {
        // use default
      }
    }
    throw new Error(errorMsg);
  }

  if (!isJson) {
    const rawText = await res.text().catch(() => '');
    if (
      rawText.startsWith('<!doctype') ||
      rawText.includes('<html') ||
      rawText.includes('Starting Server') ||
      rawText.includes('warmup') ||
      rawText.includes('Please wait while your application starts')
    ) {
      throw new Error(
        'The application server is warming up or initializing. Please retry in a few moments.'
      );
    }
    console.error('Server returned non-JSON response:', rawText.slice(0, 300));
    throw new Error(
      'The server returned an unexpected response format. Please verify the documents contain valid selectable text and try again.'
    );
  }

  return res.json();
}

export default function App() {
  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [processingStage, setProcessingStage] = useState<ProcessingStage>('idle');
  const [analysisProgress, setAnalysisProgress] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);

  // Filter & tab controls
  const [activeFilter, setActiveFilter] = useState<RelationshipType | 'ALL'>('ALL');
  const [activeTab, setActiveTab] = useState<'relationships' | 'facts' | 'documents'>('relationships');
  const [relationshipSearch, setRelationshipSearch] = useState('');

  // Modals
  const [viewerDoc, setViewerDoc] = useState<DocumentMetadata | null>(null);
  const [viewerPage, setViewerPage] = useState<number>(1);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // 1. Analyze user uploaded PDF files
  const handleAnalyzeFiles = async (files: File[]) => {
    if (files.length < 2) {
      setErrorMessage('Cross-document comparison requires at least two documents. Please upload at least 2 PDF files.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage(null);
    setRetryAction(null);
    setProcessingStage('Uploading');
    setAnalysisProgress(`Uploading ${files.length} documents...`);

    const formData = new FormData();
    files.forEach(f => formData.append('files', f));

    // Stagger progress indicators smoothly as pipeline progresses
    const stageTimer1 = setTimeout(() => {
      setProcessingStage('Extracting text');
      setAnalysisProgress('Parsing PDF text and establishing page boundaries...');
    }, 600);

    const stageTimer2 = setTimeout(() => {
      setProcessingStage('Extracting facts');
      setAnalysisProgress('Extracting numerical and categorical claims with page citations...');
    }, 1500);

    const stageTimer3 = setTimeout(() => {
      setProcessingStage('Normalizing');
      setAnalysisProgress('Normalizing currencies, units, and reporting periods...');
    }, 2800);

    const stageTimer4 = setTimeout(() => {
      setProcessingStage('Comparing');
      setAnalysisProgress('Evaluating cross-document variance and reconciling context...');
    }, 3800);

    try {
      await checkServerWarmup();
      let res: Response;

      try {
        res = await fetchWithWarmupRetry(
          '/api/analyze-files',
          {
            method: 'POST',
            body: formData,
          },
          msg => setAnalysisProgress(msg)
        );
      } catch (uploadErr: any) {
        // If binary file upload failed with "Failed to fetch" (e.g. reverse proxy size limit, socket reset, or timeout)
        console.warn('Binary upload failed, initiating client-side text extraction fallback:', uploadErr);
        setProcessingStage('Extracting text');
        setAnalysisProgress('Binary upload interrupted. Extracting document pages locally in browser...');

        const extractedDocs = await Promise.all(
          files.map(f => extractTextFromPdfFile(f))
        );

        setProcessingStage('Extracting facts');
        setAnalysisProgress('Transmitting extracted text payload to verification engine...');

        res = await fetchWithWarmupRetry(
          '/api/analyze-text',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documents: extractedDocs }),
          },
          msg => setAnalysisProgress(msg)
        );
      }

      const data = await parseApiResponse<AnalysisResponse>(res, 'Failed to analyze documents');
      setProcessingStage('Complete');
      setAnalysisData(data);
      setActiveTab('relationships');
      setActiveFilter('ALL');
    } catch (err: any) {
      console.error('Analysis error:', err);
      let message = err?.message || 'Failed to analyze documents.';
      if (message === 'Failed to fetch' || err?.name === 'TypeError') {
        message =
          'The verification server could not be reached. The server may be warming up, or the network connection was interrupted. Please retry in a few moments, or explore the pre-loaded developer test datasets below.';
      }
      setErrorMessage(message);
      setRetryAction(() => () => handleAnalyzeFiles(files));
      setProcessingStage('idle');
    } finally {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);
      clearTimeout(stageTimer4);
      setIsAnalyzing(false);
      setAnalysisProgress('');
    }
  };

  // 2. Load and run developer test fixture
  const handleLoadSample = async (datasetId: string) => {
    setIsAnalyzing(true);
    setErrorMessage(null);
    setRetryAction(null);
    setProcessingStage('Uploading');
    setAnalysisProgress('Loading developer test fixture PDF documents...');

    const stageTimer1 = setTimeout(() => {
      setProcessingStage('Extracting text');
      setAnalysisProgress('Parsing test document text and preserving page numbers...');
    }, 400);

    const stageTimer2 = setTimeout(() => {
      setProcessingStage('Extracting facts');
      setAnalysisProgress('Running factual claim extraction with page citations...');
    }, 1000);

    const stageTimer3 = setTimeout(() => {
      setProcessingStage('Normalizing');
      setAnalysisProgress('Normalizing units, scales, and financial periods...');
    }, 1800);

    const stageTimer4 = setTimeout(() => {
      setProcessingStage('Comparing');
      setAnalysisProgress('Running deterministic relationship classification...');
    }, 2600);

    try {
      await checkServerWarmup();
      const res = await fetchWithWarmupRetry(
        '/api/samples/load',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ datasetId }),
        },
        msg => setAnalysisProgress(msg)
      );

      const data = await parseApiResponse<AnalysisResponse>(res, 'Failed to process test dataset');
      setProcessingStage('Complete');
      setAnalysisData(data);
      setActiveTab('relationships');
      setActiveFilter('ALL');
    } catch (err: any) {
      console.error('Sample dataset error:', err);
      let message = err?.message || 'Failed to load test dataset.';
      if (message === 'Failed to fetch' || err?.name === 'TypeError') {
        message =
          'Connection to verification server was interrupted. The server may be warming up. Please retry in a few moments.';
      }
      setErrorMessage(message);
      setRetryAction(() => () => handleLoadSample(datasetId));
      setProcessingStage('idle');
    } finally {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);
      clearTimeout(stageTimer4);
      setIsAnalyzing(false);
      setAnalysisProgress('');
    }
  };

  const handleReset = () => {
    setAnalysisData(null);
    setActiveFilter('ALL');
    setErrorMessage(null);
    setRelationshipSearch('');
  };

  const handleOpenViewer = (docId: string, pageNumber: number = 1) => {
    if (!analysisData) return;
    const doc = (analysisData.documents || []).find(d => d.id === docId);
    if (doc) {
      setViewerDoc(doc);
      setViewerPage(pageNumber);
    }
  };

  // Filtered relationships
  const filteredRelationships = React.useMemo(() => {
    if (!analysisData || !analysisData.relationships) return [];
    return analysisData.relationships.filter(r => {
      if (activeFilter !== 'ALL' && r.type !== activeFilter) return false;
      if (relationshipSearch.trim()) {
        const q = relationshipSearch.toLowerCase();
        const matches =
          (r.metric || '').toLowerCase().includes(q) ||
          (r.entity || '').toLowerCase().includes(q) ||
          (r.primaryFact?.rawValue || '').toLowerCase().includes(q) ||
          (r.secondaryFact?.rawValue || '').toLowerCase().includes(q) ||
          (r.explanation?.summary || '').toLowerCase().includes(q) ||
          (r.explanation?.deterministicReason || '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [analysisData, activeFilter, relationshipSearch]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* App Header */}
      <Header
        documentCount={analysisData?.documents?.length || 0}
        factsCount={analysisData?.facts?.length || 0}
        isAnalyzing={isAnalyzing}
        onReset={handleReset}
        onOpenExport={() => setIsExportOpen(true)}
        hasResults={!!analysisData}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Error Alert */}
        {errorMessage && (
          <div className="flex items-center justify-between p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl shadow-2xs gap-3">
            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
              <span className="text-xs font-medium break-words">{errorMessage}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {retryAction && (
                <button
                  onClick={() => {
                    const action = retryAction;
                    setErrorMessage(null);
                    setRetryAction(null);
                    action();
                  }}
                  className="px-2.5 py-1 text-xs font-semibold bg-rose-600 text-white rounded-md hover:bg-rose-700 transition-colors shadow-2xs cursor-pointer"
                >
                  Retry Analysis
                </button>
              )}
              <button
                onClick={() => {
                  setErrorMessage(null);
                  setRetryAction(null);
                }}
                className="p-1 hover:bg-rose-100 rounded-md text-rose-600 transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* View 1: Uploader View (when no data loaded or when resetting) */}
        {!analysisData && (
          <DocumentUploader
            onAnalyzeFiles={handleAnalyzeFiles}
            onLoadSample={handleLoadSample}
            isAnalyzing={isAnalyzing}
            processingStage={processingStage}
            analysisProgress={analysisProgress}
          />
        )}

        {/* View 2: Analysis Results Dashboard */}
        {analysisData && (
          <div className="space-y-6">
            {/* Developer Test Data Fixture Banner */}
            {analysisData.isDeveloperTestData && (
              <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl text-xs shadow-2xs">
                <div className="flex items-center space-x-2.5">
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-200 text-amber-900 rounded shrink-0">
                    Developer Test Fixture
                  </span>
                  <span className="font-medium">
                    Currently viewing offline synthetic developer test data. Upload real PDF documents to perform live cross-document analysis.
                  </span>
                </div>
                <button
                  onClick={handleReset}
                  className="px-2.5 py-1 text-xs font-semibold bg-white border border-amber-300 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer shrink-0 ml-3"
                >
                  Upload Real PDFs
                </button>
              </div>
            )}

            {/* Top Summary Metrics Cards */}
            <SummaryMetrics
              summary={analysisData.summary}
              activeFilter={activeFilter}
              onSelectFilter={f => setActiveFilter(f)}
            />

            {/* Extraction Mode Notice */}
            {analysisData.extractionNotice && (
              <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 border border-amber-200/80 text-amber-900 rounded-xl text-xs shadow-2xs">
                <div className="flex items-center space-x-2.5">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="font-medium">{analysisData.extractionNotice}</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100/90 px-2.5 py-0.5 rounded-full border border-amber-200">
                  Deterministic Fallback
                </span>
              </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex items-center justify-between border-b border-slate-200">
              <nav className="flex space-x-4" aria-label="Tabs">
                <button
                  id="tab-relationships"
                  onClick={() => setActiveTab('relationships')}
                  className={`py-3 px-1 border-b-2 font-bold text-xs sm:text-sm flex items-center space-x-2 cursor-pointer transition-all ${
                    activeTab === 'relationships'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>Cross-Document Relationships</span>
                  <span className="ml-1.5 py-0.5 px-2 rounded-full text-xs bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {filteredRelationships.length}
                  </span>
                </button>

                <button
                  id="tab-facts"
                  onClick={() => setActiveTab('facts')}
                  className={`py-3 px-1 border-b-2 font-bold text-xs sm:text-sm flex items-center space-x-2 cursor-pointer transition-all ${
                    activeTab === 'facts'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Database className="w-4 h-4" />
                  <span>Fact Knowledge Base</span>
                  <span className="ml-1.5 py-0.5 px-2 rounded-full text-xs bg-slate-100 text-slate-700">
                    {(analysisData.facts || []).length}
                  </span>
                </button>

                <button
                  id="tab-documents"
                  onClick={() => setActiveTab('documents')}
                  className={`py-3 px-1 border-b-2 font-bold text-xs sm:text-sm flex items-center space-x-2 cursor-pointer transition-all ${
                    activeTab === 'documents'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>Audited Documents</span>
                  <span className="ml-1.5 py-0.5 px-2 rounded-full text-xs bg-slate-100 text-slate-700">
                    {(analysisData.documents || []).length}
                  </span>
                </button>
              </nav>

              {activeTab === 'relationships' && (
                <div className="relative hidden sm:block w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={relationshipSearch}
                    onChange={e => setRelationshipSearch(e.target.value)}
                    placeholder="Search relationships..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              )}
            </div>

            {/* TAB 1: Relationships View */}
            {activeTab === 'relationships' && (
              <div className="space-y-4">
                {filteredRelationships.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 text-xs space-y-2">
                    <p className="font-semibold text-slate-700">
                      No relationships match the current filter ({activeFilter}).
                    </p>
                    <p className="text-slate-400">
                      Try clearing the filter or adjusting your search query.
                    </p>
                    <button
                      onClick={() => {
                        setActiveFilter('ALL');
                        setRelationshipSearch('');
                      }}
                      className="mt-3 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg font-medium hover:bg-indigo-100 transition-colors"
                    >
                      Reset Filters
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredRelationships.map(rel => (
                      <RelationshipCard
                        key={rel.id}
                        relationship={rel}
                        onViewDocumentPage={handleOpenViewer}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Facts Knowledge Base */}
            {activeTab === 'facts' && (
              <FactExplorer
                facts={analysisData.facts}
                onViewDocumentPage={handleOpenViewer}
              />
            )}

            {/* TAB 3: Audited Documents */}
            {activeTab === 'documents' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {analysisData.documents.map(doc => (
                  <div
                    key={doc.id}
                    className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4 hover:border-indigo-200 transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 truncate">
                              {doc.filename}
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              {(doc.fileSize / 1024).toFixed(1)} KB • Extracted {doc.totalPages} Pages
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Fact counts per page */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                        {(doc.pages || []).map(page => {
                          const count = (analysisData.facts || []).filter(
                            f => f.documentId === doc.id && f.pageNumber === page.pageNumber
                          ).length;
                          return (
                            <button
                              key={page.pageNumber}
                              onClick={() => handleOpenViewer(doc.id, page.pageNumber)}
                              className="p-2 rounded-lg bg-slate-50 hover:bg-indigo-50 border border-slate-200/80 text-left transition-colors group cursor-pointer"
                            >
                              <div className="text-[10px] text-slate-400 group-hover:text-indigo-600">
                                Page {page.pageNumber}
                              </div>
                              <div className="text-xs font-bold text-slate-800 group-hover:text-indigo-700">
                                {count} facts
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs text-slate-500 font-medium">
                        Total facts in doc:{' '}
                        <strong>
                          {(analysisData.facts || []).filter(f => f.documentId === doc.id).length}
                        </strong>
                      </span>
                      <button
                        onClick={() => handleOpenViewer(doc.id, 1)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                      >
                        <span>Open Document Viewer</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Document Viewer Modal */}
      {viewerDoc && analysisData && (
        <DocumentViewerModal
          document={viewerDoc}
          initialPageNumber={viewerPage}
          facts={analysisData.facts}
          onClose={() => setViewerDoc(null)}
        />
      )}

      {/* Audit Export Modal */}
      {isExportOpen && analysisData && (
        <AuditExportModal
          data={analysisData}
          onClose={() => setIsExportOpen(false)}
        />
      )}
    </div>
  );
}
