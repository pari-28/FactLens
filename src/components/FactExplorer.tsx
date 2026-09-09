/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Search, Filter, FileText, ChevronRight, Hash, Layers } from 'lucide-react';
import { ExtractedFact, FactCategory } from '../types.ts';

interface FactExplorerProps {
  facts: ExtractedFact[];
  onViewDocumentPage: (documentId: string, pageNumber: number) => void;
}

export const FactExplorer: React.FC<FactExplorerProps> = ({ facts, onViewDocumentPage }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const factsList = facts || [];

  // Distinct documents
  const documentOptions = useMemo(() => {
    const map = new Map<string, string>();
    factsList.forEach(f => map.set(f.documentId, f.documentName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [factsList]);

  // Distinct categories
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    factsList.forEach(f => set.add(f.category));
    return Array.from(set);
  }, [factsList]);

  // Filtered facts
  const filteredFacts = useMemo(() => {
    return factsList.filter(f => {
      if (selectedDocId !== 'ALL' && f.documentId !== selectedDocId) return false;
      if (selectedCategory !== 'ALL' && f.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          f.metric.toLowerCase().includes(q) ||
          f.entity.toLowerCase().includes(q) ||
          f.rawValue.toLowerCase().includes(q) ||
          f.statement.toLowerCase().includes(q) ||
          f.evidenceText.toLowerCase().includes(q) ||
          f.period.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [factsList, selectedDocId, selectedCategory, searchQuery]);

  return (
    <div id="fact-explorer-container" className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
      {/* Header & Controls */}
      <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/50 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Extracted Facts Knowledge Base
            </h3>
            <p className="text-xs text-slate-500">
              Showing {filteredFacts.length} of {factsList.length} granular factual statements extracted with page-level grounding
            </p>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Search Bar */}
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by metric, value, period, or evidence..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Document Filter */}
          <div className="sm:col-span-3">
            <select
              value={selectedDocId}
              onChange={e => setSelectedDocId(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700"
            >
              <option value="ALL">All Documents ({documentOptions.length})</option>
              {documentOptions.map(doc => (
                <option key={doc.id} value={doc.id}>
                  {doc.name.length > 28 ? `${doc.name.slice(0, 25)}...` : doc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div className="sm:col-span-3">
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700 capitalize"
            >
              <option value="ALL">All Categories</option>
              {categoryOptions.map(cat => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Facts List */}
      {filteredFacts.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500">
          No facts match the selected query and filters.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
          {filteredFacts.map(fact => (
            <div
              key={fact.id}
              className="p-4 hover:bg-slate-50/70 transition-colors space-y-2 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-slate-900 text-sm">
                    {fact.metric}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 uppercase">
                    {fact.category}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-500 font-medium">
                    {fact.period}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
                    {fact.rawValue}
                  </span>
                  <button
                    onClick={() => onViewDocumentPage(fact.documentId, fact.pageNumber)}
                    className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium text-slate-600 hover:text-indigo-600 bg-white border border-slate-200 hover:bg-indigo-50/50 transition-colors"
                  >
                    <FileText className="w-3 h-3 text-slate-400" />
                    <span>Page {fact.pageNumber}</span>
                  </button>
                </div>
              </div>

              <p className="text-slate-600 text-xs leading-relaxed">
                {fact.statement}
              </p>

              {/* Exact Evidence quote */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 text-[11px] text-slate-600 italic">
                <span className="font-semibold not-italic text-slate-400 mr-1.5">Evidence:</span>
                "{fact.evidenceText}"
              </div>

              {/* Source Details Footer */}
              <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-1">
                <div className="flex flex-wrap items-center space-x-2">
                  <span>Source: <strong>{fact.documentName}</strong></span>
                  {fact.context.basis && (
                    <>
                      <span>•</span>
                      <span>Basis: {fact.context.basis}</span>
                    </>
                  )}
                  {fact.context.scope && (
                    <>
                      <span>•</span>
                      <span>Scope: {fact.context.scope}</span>
                    </>
                  )}
                  {fact.confidence !== undefined && (
                    <>
                      <span>•</span>
                      <span>Confidence: {(fact.confidence * 100).toFixed(0)}%</span>
                    </>
                  )}
                </div>
                {fact.normalized.baseValue !== null && (
                  <span className="font-mono text-slate-500">
                    Base: {fact.normalized.baseValue.toLocaleString()} {fact.normalized.unit}
                  </span>
                )}
              </div>

              {fact.normalized.normalizationSteps && fact.normalized.normalizationSteps.length > 0 && (
                <div className="pt-1 text-[10px] text-slate-400 font-mono flex flex-wrap items-center gap-1.5 border-t border-slate-100">
                  <span className="font-semibold text-slate-500">Normalization trace:</span>
                  {fact.normalized.normalizationSteps.map((step, sIdx) => (
                    <span key={sIdx} className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                      {step}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
