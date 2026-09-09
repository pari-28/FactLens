/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Layers, RefreshCw, FileText, Download } from 'lucide-react';

interface HeaderProps {
  documentCount: number;
  factsCount: number;
  isAnalyzing: boolean;
  onReset: () => void;
  onOpenExport: () => void;
  hasResults: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  documentCount,
  factsCount,
  isAnalyzing,
  onReset,
  onOpenExport,
  hasResults,
}) => {
  return (
    <header id="app-header" className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <Layers className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">FactLens</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Fact Knowledge Layer
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Multi-Document Cross-Verification & Deterministic Fact Reconciliation
              </p>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center space-x-3">
            {hasResults && (
              <>
                <div className="hidden md:flex items-center space-x-2 text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span><strong>{documentCount}</strong> Documents</span>
                  <span className="text-slate-300">|</span>
                  <span><strong>{factsCount}</strong> Extracted Facts</span>
                </div>

                <button
                  id="btn-export-audit"
                  onClick={onOpenExport}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Export Audit</span>
                </button>

                <button
                  id="btn-reset-analysis"
                  onClick={onReset}
                  disabled={isAnalyzing}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>New Analysis</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
