/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  File,
  Trash2,
  ArrowRight,
  Download,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileCheck,
  Search,
  Scale,
  GitCompare,
  Layers,
} from 'lucide-react';
import { ProcessingStage } from '../types.ts';

interface DocumentUploaderProps {
  onAnalyzeFiles: (files: File[]) => void;
  onLoadSample: (datasetId: string) => void;
  isAnalyzing: boolean;
  processingStage: ProcessingStage;
  analysisProgress: string;
}

const STAGES: { stage: ProcessingStage; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { stage: 'Uploading', label: 'Uploading', description: 'Transmitting PDF document payloads', icon: UploadCloud },
  { stage: 'Extracting text', label: 'Extracting text', description: 'Parsing document streams and page boundaries', icon: FileCheck },
  { stage: 'Extracting facts', label: 'Extracting facts', description: 'Semantic and numerical extraction with page citations', icon: Search },
  { stage: 'Normalizing', label: 'Normalizing', description: 'Standardizing currencies, scales, and reporting periods', icon: Scale },
  { stage: 'Comparing', label: 'Comparing', description: 'Deterministic cross-document matching & relationship classification', icon: GitCompare },
  { stage: 'Complete', label: 'Complete', description: 'Knowledge Layer ready for audit', icon: CheckCircle2 },
];

export const DocumentUploader: React.FC<DocumentUploaderProps> = ({
  onAnalyzeFiles,
  onLoadSample,
  isAnalyzing,
  processingStage,
  analysisProgress,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showDevTestData, setShowDevTestData] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesAdded = (files: FileList | File[]) => {
    const validPdfs: File[] = [];
    const fileArray = Array.from(files);

    const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB per file to stay well within Nginx 32MB payload limit
    const MAX_TOTAL_SIZE = 28 * 1024 * 1024; // 28MB total payload

    for (const f of fileArray) {
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        if (f.size > MAX_FILE_SIZE) {
          setValidationError(`"${f.name}" exceeds the 25MB file limit (${(f.size / (1024 * 1024)).toFixed(1)}MB). Please upload a smaller or compressed PDF.`);
          return;
        }
        if (!selectedFiles.some(existing => existing.name === f.name)) {
          validPdfs.push(f);
        }
      }
    }

    if (validPdfs.length === 0 && fileArray.length > 0) {
      setValidationError('Please upload PDF files (.pdf) only.');
      return;
    }

    const currentTotalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);
    const newTotalSize = validPdfs.reduce((acc, f) => acc + f.size, currentTotalSize);
    if (newTotalSize > MAX_TOTAL_SIZE) {
      setValidationError(`Total upload size exceeds 28MB (${(newTotalSize / (1024 * 1024)).toFixed(1)}MB). Please analyze 2-5 files at a time.`);
      return;
    }

    setValidationError(null);
    setSelectedFiles(prev => [...prev, ...validPdfs]);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setValidationError(null);
  };

  const handleStartAnalysis = () => {
    if (selectedFiles.length < 2) {
      setValidationError('Cross-document comparison requires at least two documents. Please upload at least 2 PDF files.');
      return;
    }
    setValidationError(null);
    onAnalyzeFiles(selectedFiles);
  };

  // Determine stage status
  const currentStageIndex = STAGES.findIndex(s => s.stage === processingStage);

  return (
    <div id="document-uploader-section" className="w-full space-y-6">
      {/* Primary Section Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="max-w-3xl space-y-2">
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-100">
            <Layers className="w-3.5 h-3.5" />
            <span>Multi-Document Fact Knowledge Layer</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Cross-Document Factual Verification Engine
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Upload arbitrary PDF documents to extract granular numerical and semantic facts, preserve exact page citations,
            normalize units and periods, and deterministically classify cross-document relationships into{' '}
            <strong className="text-emerald-700">Corroborated</strong>,{' '}
            <strong className="text-rose-700">Contradicted</strong>,{' '}
            <strong className="text-amber-700">Reconciled by Context</strong>, and{' '}
            <strong className="text-slate-700">Uncertain</strong>.
          </p>
        </div>
      </div>

      {/* Primary PDF Upload Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <h3 className="text-base font-bold text-slate-900">Upload PDF Documents</h3>
          <p className="text-xs text-slate-500">
            Select 2 or more PDF documents to analyze and cross-verify facts across sources.
          </p>
        </div>

        {/* Drag & Drop Zone */}
        <div
          id="pdf-dropzone"
          onDragOver={e => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
            isDragOver
              ? 'border-indigo-500 bg-indigo-50/50 scale-[1.005]'
              : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={e => {
              if (e.target.files) handleFilesAdded(e.target.files);
            }}
          />
          <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 shadow-2xs">
            <UploadCloud className="w-7 h-7" />
          </div>
          <h3 className="text-sm sm:text-base font-semibold text-slate-900">
            Drag and drop your PDF documents here
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            or click to browse from your computer (minimum 2 PDFs required)
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400">
            <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">Financial Reports</span>
            <span>•</span>
            <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">SEC Filings (10-K / 10-Q)</span>
            <span>•</span>
            <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">Earnings Releases</span>
            <span>•</span>
            <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">Audit Disclosures</span>
          </div>
        </div>

        {/* Validation or Error Message */}
        {validationError && (
          <div className="flex items-center space-x-2.5 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl shadow-2xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-medium">{validationError}</span>
          </div>
        )}

        {/* Minimum 2 Documents Guidance Notice */}
        {selectedFiles.length === 1 && !validationError && (
          <div className="flex items-center space-x-2.5 p-3.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl shadow-2xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>
              <strong>1 document selected.</strong> Cross-document comparison requires at least two documents. Please add at least one more PDF to compare.
            </span>
          </div>
        )}

        {/* Selected Files List */}
        {selectedFiles.length > 0 && (
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Selected Documents ({selectedFiles.length})
              </span>
              <button
                onClick={() => setSelectedFiles([])}
                className="text-xs font-medium text-slate-400 hover:text-rose-600 transition-colors"
              >
                Clear all
              </button>
            </div>

            <div className="divide-y divide-slate-200/80 bg-white rounded-lg border border-slate-200">
              {selectedFiles.map((file, idx) => (
                <div key={idx} className="p-3 flex items-center justify-between">
                  <div className="flex items-center space-x-3 truncate">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                      <File className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-semibold text-slate-900 truncate">{file.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {(file.size / 1024).toFixed(1)} KB • Document #{idx + 1}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleRemoveFile(idx);
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                    title="Remove file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Action Bar */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                {selectedFiles.length >= 2
                  ? `Ready to cross-compare ${selectedFiles.length} documents.`
                  : 'Add at least 1 more document to enable cross-document analysis.'}
              </span>
              <button
                id="btn-start-analysis"
                onClick={handleStartAnalysis}
                disabled={isAnalyzing || selectedFiles.length < 2}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 py-2.5 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold text-xs rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                <span>Analyze & Cross-Verify Documents ({selectedFiles.length})</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active Multi-Stage Processing Visualizer */}
      {isAnalyzing && (
        <div className="bg-white border border-indigo-200 rounded-2xl p-6 shadow-md space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2.5">
              <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
              <h4 className="text-sm font-bold text-slate-900">
                Processing Documents Through Fact Knowledge Layer
              </h4>
            </div>
            <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
              Stage: {processingStage}
            </span>
          </div>

          {/* 6 Step Stepper */}
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {STAGES.map((s, idx) => {
              const Icon = s.icon;
              const isPast = currentStageIndex > idx;
              const isCurrent = currentStageIndex === idx;

              let cardBg = 'bg-slate-50 border-slate-200 text-slate-400';
              let iconBg = 'bg-slate-200/70 text-slate-500';

              if (isPast) {
                cardBg = 'bg-emerald-50/50 border-emerald-200 text-emerald-900';
                iconBg = 'bg-emerald-100 text-emerald-700';
              } else if (isCurrent) {
                cardBg = 'bg-indigo-50 border-indigo-300 text-indigo-900 ring-1 ring-indigo-200';
                iconBg = 'bg-indigo-600 text-white';
              }

              return (
                <div
                  key={s.stage}
                  className={`p-3 rounded-xl border transition-all space-y-1.5 flex flex-col justify-between ${cardBg}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Step {idx + 1}
                    </span>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${iconBg}`}>
                      {isCurrent ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isPast ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Icon className="w-3.5 h-3.5" />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold leading-tight">{s.label}</p>
                    <p className="text-[10px] opacity-80 leading-snug mt-0.5">{s.description}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-slate-500 text-center font-medium">
            {analysisProgress || 'Executing verifiable fact extraction and deterministic relationship matching...'}
          </p>
        </div>
      )}

      {/* Developer Test Data Fixture (Isolated, Collapsible, Strictly Labeled) */}
      <div className="border border-slate-200 rounded-2xl bg-slate-50/60 p-4 transition-all">
        <button
          onClick={() => setShowDevTestData(prev => !prev)}
          className="w-full flex items-center justify-between text-left text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700 rounded">
              Developer Tool
            </span>
            <span>Developer Test Data Fixture (Offline Benchmark)</span>
          </div>
          <div className="flex items-center space-x-1 text-slate-400">
            <span className="text-[11px]">{showDevTestData ? 'Hide' : 'Show'}</span>
            {showDevTestData ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showDevTestData && (
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
            <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 space-y-1">
              <p className="font-semibold flex items-center space-x-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                <span>Notice: Developer Test Data Only</span>
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                This synthetic test dataset is retained exclusively for offline development verification and automated testing.
                It is never mixed with real uploaded-document results. For actual evaluation, use the primary PDF upload flow above.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                Synthetic test pair: 2 pre-generated PDFs with calibrated corroborations, contradictions, and reconciliations.
              </div>
              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <button
                  id="btn-load-dev-sample"
                  onClick={() => onLoadSample('acme_financial_pair')}
                  disabled={isAnalyzing}
                  className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
                  <span>Load Developer Test Fixture</span>
                </button>
              </div>
            </div>

            {/* Download Test PDFs */}
            <div className="flex items-center space-x-3 text-[11px] text-slate-500 pt-1">
              <span>Inspect Test PDF Files:</span>
              <a
                href="/api/download-sample/acme_financial_pair/0"
                download="Test_Release.pdf"
                className="inline-flex items-center space-x-1 text-indigo-600 hover:underline"
              >
                <Download className="w-3 h-3" />
                <span>Test_Release.pdf</span>
              </a>
              <span>•</span>
              <a
                href="/api/download-sample/acme_financial_pair/1"
                download="Test_Report.pdf"
                className="inline-flex items-center space-x-1 text-indigo-600 hover:underline"
              >
                <Download className="w-3 h-3" />
                <span>Test_Report.pdf</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

