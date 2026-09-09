/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, FileText, CheckCircle2, ChevronRight, Hash, Layers } from 'lucide-react';
import { DocumentMetadata, ExtractedFact } from '../types.ts';

interface DocumentViewerModalProps {
  document: DocumentMetadata | null;
  initialPageNumber?: number;
  facts: ExtractedFact[];
  onClose: () => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  document,
  initialPageNumber = 1,
  facts,
  onClose,
}) => {
  if (!document) return null;

  const [activePageNumber, setActivePageNumber] = useState<number>(initialPageNumber);

  const docPages = document.pages || [];
  const currentPage =
    docPages.find(p => p.pageNumber === activePageNumber) || docPages[0];

  const factsList = facts || [];
  const factsOnThisPage = factsList.filter(
    f => f.documentId === document.id && f.pageNumber === activePageNumber
  );

  return (
    <div
      id="document-viewer-modal"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
    >
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                {document.filename}
              </h3>
              <p className="text-xs text-slate-500">
                {document.totalPages} Pages • {(document.fileSize / 1024).toFixed(1)} KB • Page-Preserved Extraction
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Page Selector Tabs */}
        <div className="px-4 py-2 border-b border-slate-200 bg-white flex items-center space-x-2 overflow-x-auto">
          {docPages.map(page => {
            const pageFactCount = factsList.filter(
              f => f.documentId === document.id && f.pageNumber === page.pageNumber
            ).length;
            const isActive = page.pageNumber === activePageNumber;

            return (
              <button
                key={page.pageNumber}
                onClick={() => setActivePageNumber(page.pageNumber)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 flex items-center space-x-1.5 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                }`}
              >
                <span>Page {page.pageNumber}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {pageFactCount} facts
                </span>
              </button>
            );
          })}
        </div>

        {/* Modal Body: Split view of Extracted Raw Text & Extracted Grounded Facts */}
        <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-200 overflow-y-auto flex-1">
          {/* Left: Raw Page Text */}
          <div className="md:col-span-7 p-4 sm:p-5 space-y-3 bg-slate-50/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Extracted Text — Page {activePageNumber}
              </span>
              <span className="text-[11px] text-slate-400">
                Preserved verbatim from PDF stream
              </span>
            </div>
            <pre className="text-xs text-slate-800 font-mono whitespace-pre-wrap bg-white p-4 rounded-xl border border-slate-200 shadow-2xs leading-relaxed max-h-[480px] overflow-y-auto select-text">
              {currentPage?.text || 'No extractable text on this page.'}
            </pre>
          </div>

          {/* Right: Facts grounded in this page */}
          <div className="md:col-span-5 p-4 sm:p-5 space-y-3 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Facts Citing Page {activePageNumber} ({factsOnThisPage.length})
              </span>
            </div>

            {factsOnThisPage.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-6 text-center">
                No high-confidence factual claims extracted from this page.
              </p>
            ) : (
              <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                {factsOnThisPage.map(fact => (
                  <div
                    key={fact.id}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">{fact.metric}</span>
                      <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-[11px]">
                        {fact.rawValue}
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px]">{fact.statement}</p>
                    <div className="text-[10px] text-slate-500 bg-white p-2 rounded border border-slate-200/60 italic">
                      "{fact.evidenceText}"
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
