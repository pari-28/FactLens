/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Copy, Check, Download, FileText } from 'lucide-react';
import { AnalysisResponse } from '../types.ts';

interface AuditExportModalProps {
  data: AnalysisResponse;
  onClose: () => void;
}

export const AuditExportModal: React.FC<AuditExportModalProps> = ({ data, onClose }) => {
  const [format, setFormat] = useState<'markdown' | 'json'>('markdown');
  const [copied, setCopied] = useState(false);

  // Generate complete, explainable Markdown audit trail report
  const generateMarkdown = () => {
    const lines: string[] = [];
    lines.push(`# FactLens Comprehensive Fact Audit & Reconciliation Report`);
    lines.push(`Generated: ${new Date().toUTCString()}`);
    lines.push(`\n## 1. Executive Summary & Verification Metrics`);
    lines.push(`- **Total Documents in Scope:** ${data.summary.totalDocuments}`);
    lines.push(`- **Total Grounded Facts Extracted:** ${data.summary.totalFacts}`);
    lines.push(`- **Corroborated Relationships (Verified):** ${data.summary.corroboratedCount}`);
    lines.push(`- **Contradicted Relationships (Genuine Conflicts):** ${data.summary.contradictedCount}`);
    lines.push(`- **Reconciled by Context (Divergence Disclosed):** ${data.summary.reconciledCount}`);
    lines.push(`- **Uncertain Relationships (Insufficient Context):** ${data.summary.uncertainCount}`);

    lines.push(`\n## 2. In-Scope Document Catalog`);
    const allFacts = data.facts || [];
    (data.documents || []).forEach((d, idx) => {
      const docFactsCount = allFacts.filter(f => f.documentId === d.id).length;
      lines.push(`${idx + 1}. **${d.filename}**`);
      lines.push(`   - Pages: ${d.totalPages}`);
      lines.push(`   - Document ID: \`${d.id}\``);
      lines.push(`   - Extracted Facts: ${docFactsCount}`);
    });

    lines.push(`\n## 3. Multi-Document Cross-Verification & Deterministic Audit Trail`);
    (data.relationships || []).forEach((r, idx) => {
      lines.push(`\n### Relationship #${idx + 1}: [${r.type}] ${r.metric}`);
      lines.push(`- **Entity:** ${r.entity}`);
      lines.push(`- **Comparative Period:** ${r.periodKey}`);
      lines.push(`- **Deterministic Classification:** ${r.type}`);
      lines.push(`- **Confidence Score:** ${Math.round(r.confidence * 100)}%`);
      lines.push(`- **Directly Comparable:** ${r.explanation?.isDirectlyComparable ? 'YES' : 'NO (Contextually Reconciled / Divergent)'}`);
      lines.push(`- **Variance:** ${r.explanation?.variancePercent !== undefined ? `${r.explanation.variancePercent.toFixed(2)}%` : r.explanation?.varianceText || 'N/A — facts are not directly comparable'}`);
      lines.push(`- **Classification Summary:** ${r.explanation?.summary || 'N/A'}`);
      lines.push(`- **Full Audit Rationale:** ${r.explanation?.deterministicReason || 'N/A'}`);

      if (r.explanation?.reconcilingFactors && r.explanation.reconcilingFactors.length > 0) {
        lines.push(`\n#### Reconciling Factors:`);
        r.explanation.reconcilingFactors.forEach(f => lines.push(`- ${f}`));
      }

      if (r.explanation?.dimensions && r.explanation.dimensions.length > 0) {
        lines.push(`\n#### Multi-Dimensional Comparability Evaluation:`);
        const srcAName = r.primaryFact?.documentName ? `${r.primaryFact.documentName.slice(0, 15)}...` : 'Source A';
        const srcBName = r.secondaryFact?.documentName ? `${r.secondaryFact.documentName.slice(0, 15)}...` : 'Source B';
        lines.push(`| Dimension | Source A (${srcAName}) | Source B (${srcBName}) | Compatible? | Notes |`);
        lines.push(`| :--- | :--- | :--- | :---: | :--- |`);
        r.explanation.dimensions.forEach(dim => {
          lines.push(`| ${dim.label} | ${dim.factA} | ${dim.factB} | ${dim.isCompatible ? '✅' : '⚠️'} | ${dim.notes || ''} |`);
        });
      }

      lines.push(`\n#### Source A Evidence:`);
      lines.push(`- **Document:** ${r.primaryFact?.documentName || 'Unknown'} (Page ${r.primaryFact?.pageNumber ?? 1})`);
      lines.push(`- **Original Statement:** ${r.primaryFact?.statement || 'N/A'}`);
      lines.push(`- **Parsed Metric:** ${r.primaryFact?.metric || 'N/A'}`);
      lines.push(`- **Stated Raw Value:** ${r.primaryFact?.rawValue || 'N/A'}`);
      lines.push(`- **Normalized Base Value:** ${r.primaryFact?.normalized?.baseValue?.toLocaleString() ?? 'N/A'} (Currency: ${r.primaryFact?.normalized?.currency || 'N/A'}, Unit: ${r.primaryFact?.normalized?.unit || 'N/A'})`);
      lines.push(`- **Period:** ${r.primaryFact?.normalized?.normalizedPeriod?.label || 'N/A'} (${r.primaryFact?.normalized?.normalizedPeriod?.type || 'N/A'})`);
      lines.push(`- **Scope:** ${r.primaryFact?.context?.scope || r.primaryFact?.scope || 'Consolidated'}`);
      lines.push(`- **Accounting / Reporting Basis:** ${r.primaryFact?.context?.basis || 'Reported / Standard'}`);
      lines.push(`- **Verbatim Grounded Citation:** "${r.primaryFact?.evidenceText || ''}"`);

      lines.push(`\n#### Source B Evidence:`);
      lines.push(`- **Document:** ${r.secondaryFact?.documentName || 'Unknown'} (Page ${r.secondaryFact?.pageNumber ?? 1})`);
      lines.push(`- **Original Statement:** ${r.secondaryFact?.statement || 'N/A'}`);
      lines.push(`- **Parsed Metric:** ${r.secondaryFact?.metric || 'N/A'}`);
      lines.push(`- **Stated Raw Value:** ${r.secondaryFact?.rawValue || 'N/A'}`);
      lines.push(`- **Normalized Base Value:** ${r.secondaryFact?.normalized?.baseValue?.toLocaleString() ?? 'N/A'} (Currency: ${r.secondaryFact?.normalized?.currency || 'N/A'}, Unit: ${r.secondaryFact?.normalized?.unit || 'N/A'})`);
      lines.push(`- **Period:** ${r.secondaryFact?.normalized?.normalizedPeriod?.label || 'N/A'} (${r.secondaryFact?.normalized?.normalizedPeriod?.type || 'N/A'})`);
      lines.push(`- **Scope:** ${r.secondaryFact?.context?.scope || r.secondaryFact?.scope || 'Consolidated'}`);
      lines.push(`- **Accounting / Reporting Basis:** ${r.secondaryFact?.context?.basis || 'Reported / Standard'}`);
      lines.push(`- **Verbatim Grounded Citation:** "${r.secondaryFact?.evidenceText || ''}"`);
      lines.push(`\n---`);
    });

    return lines.join('\n');
  };

  const reportText =
    format === 'markdown' ? generateMarkdown() : JSON.stringify(data, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const ext = format === 'markdown' ? 'md' : 'json';
    const mime = format === 'markdown' ? 'text/markdown' : 'application/json';
    const blob = new Blob([reportText], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `factlens-audit-trail.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      id="audit-export-modal"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
    >
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Export Complete Verification Audit Trail
              </h3>
              <p className="text-xs text-slate-500">
                Multi-dimensional comparability evaluations with verbatim evidence quotes
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

        {/* Format Toggle Bar */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setFormat('markdown')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                format === 'markdown'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Markdown (.md)
            </button>
            <button
              onClick={() => setFormat('json')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                format === 'json'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Raw JSON (.json)
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy</span>
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download File</span>
            </button>
          </div>
        </div>

        {/* Report Preview */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 bg-slate-900 text-slate-200 font-mono text-xs leading-relaxed select-text">
          <pre className="whitespace-pre-wrap">{reportText}</pre>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-medium hover:bg-slate-900 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
