/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  HelpCircle,
  FileText,
  Quote,
  ArrowRightLeft,
  Percent,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Scale,
  Calendar,
  Layers,
  FileCheck,
} from 'lucide-react';
import { FactRelationship, RelationshipType } from '../types.ts';

interface RelationshipCardProps {
  relationship: FactRelationship;
  onViewDocumentPage: (documentId: string, pageNumber: number) => void;
}

const statusConfig: Record<
  RelationshipType,
  {
    icon: React.ComponentType<{ className?: string }>;
    bgBadge: string;
    border: string;
    textColor: string;
    cardBorder: string;
    accentBg: string;
  }
> = {
  CORROBORATED: {
    icon: CheckCircle2,
    bgBadge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    border: 'border-emerald-200',
    textColor: 'text-emerald-700',
    cardBorder: 'hover:border-emerald-300',
    accentBg: 'bg-emerald-50/40',
  },
  CONTRADICTED: {
    icon: AlertTriangle,
    bgBadge: 'bg-rose-100 text-rose-800 border-rose-200',
    border: 'border-rose-200',
    textColor: 'text-rose-700',
    cardBorder: 'border-rose-300 ring-1 ring-rose-200/50',
    accentBg: 'bg-rose-50/40',
  },
  'RECONCILED BY CONTEXT': {
    icon: Sparkles,
    bgBadge: 'bg-amber-100 text-amber-800 border-amber-200',
    border: 'border-amber-200',
    textColor: 'text-amber-700',
    cardBorder: 'border-amber-300 ring-1 ring-amber-200/50',
    accentBg: 'bg-amber-50/40',
  },
  UNCERTAIN: {
    icon: HelpCircle,
    bgBadge: 'bg-slate-100 text-slate-800 border-slate-200',
    border: 'border-slate-200',
    textColor: 'text-slate-700',
    cardBorder: 'hover:border-slate-300',
    accentBg: 'bg-slate-50/40',
  },
};

export const RelationshipCard: React.FC<RelationshipCardProps> = ({
  relationship,
  onViewDocumentPage,
}) => {
  const [showDimensions, setShowDimensions] = useState(false);
  const config = statusConfig[relationship.type];
  const Icon = config.icon;
  const { primaryFact, secondaryFact, explanation } = relationship;

  const formatBaseValue = (val: number | null, unit: string, currency?: string) => {
    if (val === null || isNaN(val)) return 'N/A';
    const currPrefix = currency ? `${currency} ` : '';
    if (unit === 'percent') return `${val.toLocaleString()}%`;
    return `${currPrefix}${val.toLocaleString()} (${unit})`;
  };

  return (
    <div
      id={`relationship-card-${relationship.id}`}
      className={`bg-white rounded-2xl border border-slate-200 shadow-2xs transition-all overflow-hidden ${config.cardBorder}`}
    >
      {/* Card Header: Entity, Metric, Period, Classification Badge */}
      <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {relationship.entity}
            </span>
            <span className="text-slate-300">•</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-200/70 text-slate-700">
              {relationship.periodKey}
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-[11px] text-slate-400 font-mono">
              Confidence: {Math.round(relationship.confidence * 100)}%
            </span>
          </div>
          <h4 className="text-base font-bold text-slate-900 tracking-tight">
            {relationship.metric}
          </h4>
        </div>

        {/* Classification Badge */}
        <div className="flex items-center space-x-2">
          <span
            className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-2xs ${config.bgBadge}`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{relationship.type}</span>
          </span>
        </div>
      </div>

      {/* Rationale & Explanation Section */}
      <div className={`p-4 sm:p-5 border-b border-slate-100 ${config.accentBg} space-y-3`}>
        <div className="flex items-start space-x-3">
          <div className="p-1.5 rounded-lg bg-white border border-slate-200/70 text-slate-600 shrink-0 mt-0.5">
            <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="space-y-1 text-xs flex-1">
            <p className="font-semibold text-slate-900 leading-relaxed">
              {explanation.summary}
            </p>
            <p className="text-slate-600 leading-relaxed">
              {explanation.deterministicReason}
            </p>
          </div>
        </div>

        {/* Comparability & Variance Status Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {/* Direct Comparability Pill */}
          <span
            className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium border ${
              explanation.isDirectlyComparable
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            <Scale className="w-3 h-3" />
            <span>
              {explanation.isDirectlyComparable
                ? 'Directly Comparable'
                : 'Contextual Divergence Detected'}
            </span>
          </span>

          {/* Variance Display */}
          {explanation.variancePercent !== undefined ? (
            <span
              className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium border ${
                explanation.variancePercent <= 1.0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              <Percent className="w-3 h-3" />
              <span>{explanation.variancePercent.toFixed(2)}% variance</span>
            </span>
          ) : (
            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
              <Percent className="w-3 h-3 text-slate-400" />
              <span>{explanation.varianceText || 'N/A — facts are not directly comparable'}</span>
            </span>
          )}

          {/* Context Factor Pills */}
          {explanation.contextualDivergence &&
            explanation.contextualDivergence.map((div, i) => (
              <span
                key={i}
                className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 text-indigo-800 border border-indigo-200 max-w-full truncate"
                title={div}
              >
                <Sparkles className="w-3 h-3 text-indigo-600 shrink-0" />
                <span className="truncate">{div}</span>
              </span>
            ))}

          {/* Toggle Dimensions Breakdown Button */}
          {explanation.dimensions && explanation.dimensions.length > 0 && (
            <button
              onClick={() => setShowDimensions(!showDimensions)}
              className="ml-auto inline-flex items-center space-x-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md transition-colors"
            >
              <span>{showDimensions ? 'Hide Dimensions' : 'Audit Dimensions'}</span>
              {showDimensions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>

        {/* Collapsible Comparability Dimensions & Mathematical Derivation Audit */}
        {showDimensions && (
          <div className="mt-3 pt-3 border-t border-slate-200/70 space-y-3">
            {explanation.dimensions && explanation.dimensions.length > 0 && (
              <div>
                <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center space-x-1">
                  <FileCheck className="w-3.5 h-3.5 text-slate-400" />
                  <span>Multi-Dimensional Comparability Audit</span>
                </h5>
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden divide-y divide-slate-100 text-xs">
                  <div className="grid grid-cols-12 bg-slate-50 p-2 font-semibold text-slate-600 text-[11px]">
                    <div className="col-span-3">Dimension</div>
                    <div className="col-span-3">Doc 1: {primaryFact.documentName.slice(0, 20)}...</div>
                    <div className="col-span-3">Doc 2: {secondaryFact.documentName.slice(0, 20)}...</div>
                    <div className="col-span-3 text-right">Compatibility & Audit Note</div>
                  </div>
                  {explanation.dimensions.map((dim, idx) => (
                    <div key={idx} className="grid grid-cols-12 p-2 items-center hover:bg-slate-50/50">
                      <div className="col-span-3 font-medium text-slate-800 flex items-center space-x-1.5">
                        {dim.isCompatible ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <X className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        )}
                        <span>{dim.label}</span>
                      </div>
                      <div className="col-span-3 text-slate-600 truncate pr-2 font-mono text-[11px]">
                        {dim.factA}
                      </div>
                      <div className="col-span-3 text-slate-600 truncate pr-2 font-mono text-[11px]">
                        {dim.factB}
                      </div>
                      <div className="col-span-3 text-right text-[11px] text-slate-500 truncate" title={dim.notes}>
                        {dim.notes}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mathematical Derivation and Conversion Trace */}
            {explanation.conversionSteps && explanation.conversionSteps.length > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-1.5 text-xs">
                <h6 className="text-[11px] font-bold text-slate-700 flex items-center space-x-1.5">
                  <Scale className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Mathematical Normalization & Variance Calculation Steps:</span>
                </h6>
                <div className="space-y-1 pl-5 list-decimal text-slate-600 font-mono text-[11px]">
                  {explanation.conversionSteps.map((step, sIdx) => (
                    <div key={sIdx} className="flex items-start space-x-2">
                      <span className="text-slate-400 font-semibold">{sIdx + 1}.</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Side-by-Side Source Evidence Comparison */}
      <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Source Document 1 */}
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            {/* Header: File + Page Badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 truncate text-slate-700">
                <FileText className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="text-xs font-semibold truncate" title={primaryFact.documentName}>
                  {primaryFact.documentName}
                </span>
              </div>
              <button
                onClick={() => onViewDocumentPage(primaryFact.documentId, primaryFact.pageNumber)}
                className="shrink-0 px-2 py-0.5 text-[11px] font-medium bg-white text-indigo-600 hover:text-indigo-700 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors"
              >
                Page {primaryFact.pageNumber}
              </button>
            </div>

            {/* Structured Metric Metadata */}
            <div className="bg-white border border-slate-200/80 rounded-lg p-3 space-y-1.5 shadow-2xs">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-400">Stated Raw Value:</span>
                <span className="text-sm font-bold text-slate-900">{primaryFact.rawValue}</span>
              </div>
              <div className="flex items-baseline justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                <span>Normalized Base:</span>
                <span className="font-mono text-slate-700 font-semibold">
                  {formatBaseValue(primaryFact.normalized.baseValue, primaryFact.normalized.unit, primaryFact.normalized.currency)}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-[11px] text-slate-500">
                <span className="flex items-center space-x-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>Period & Type:</span>
                </span>
                <span className="font-medium text-slate-700">
                  {primaryFact.normalized.normalizedPeriod.label} ({primaryFact.normalized.normalizedPeriod.type})
                </span>
              </div>
              <div className="flex items-baseline justify-between text-[11px] text-slate-500">
                <span className="flex items-center space-x-1">
                  <Layers className="w-3 h-3 text-slate-400" />
                  <span>Scope & Basis:</span>
                </span>
                <span className="font-medium text-slate-700">
                  {primaryFact.context.scope || primaryFact.scope || 'Consolidated'}
                  {primaryFact.context.basis ? ` • ${primaryFact.context.basis}` : ''}
                </span>
              </div>
              {primaryFact.normalized.normalizationSteps && primaryFact.normalized.normalizationSteps.length > 0 && (
                <div className="pt-1.5 border-t border-slate-100 text-[10px] text-slate-400 font-mono space-y-0.5">
                  <span className="font-semibold text-slate-500">Parse trace: </span>
                  {primaryFact.normalized.normalizationSteps.map((st, i) => (
                    <span key={i} className="inline-block mr-2 text-slate-500">• {st}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Verbatim Quote Evidence */}
          <div className="space-y-1 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
              <Quote className="w-3 h-3 text-slate-400" />
              <span>Grounded Evidence Quote</span>
            </span>
            <blockquote className="text-xs text-slate-700 italic bg-amber-50/50 p-2.5 rounded-lg border-l-2 border-amber-400 leading-relaxed">
              "{primaryFact.evidenceText}"
            </blockquote>
          </div>
        </div>

        {/* Source Document 2 */}
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            {/* Header: File + Page Badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 truncate text-slate-700">
                <FileText className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span className="text-xs font-semibold truncate" title={secondaryFact.documentName}>
                  {secondaryFact.documentName}
                </span>
              </div>
              <button
                onClick={() => onViewDocumentPage(secondaryFact.documentId, secondaryFact.pageNumber)}
                className="shrink-0 px-2 py-0.5 text-[11px] font-medium bg-white text-purple-600 hover:text-purple-700 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors"
              >
                Page {secondaryFact.pageNumber}
              </button>
            </div>

            {/* Structured Metric Metadata */}
            <div className="bg-white border border-slate-200/80 rounded-lg p-3 space-y-1.5 shadow-2xs">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-400">Stated Raw Value:</span>
                <span className="text-sm font-bold text-slate-900">{secondaryFact.rawValue}</span>
              </div>
              <div className="flex items-baseline justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                <span>Normalized Base:</span>
                <span className="font-mono text-slate-700 font-semibold">
                  {formatBaseValue(secondaryFact.normalized.baseValue, secondaryFact.normalized.unit, secondaryFact.normalized.currency)}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-[11px] text-slate-500">
                <span className="flex items-center space-x-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>Period & Type:</span>
                </span>
                <span className="font-medium text-slate-700">
                  {secondaryFact.normalized.normalizedPeriod.label} ({secondaryFact.normalized.normalizedPeriod.type})
                </span>
              </div>
              <div className="flex items-baseline justify-between text-[11px] text-slate-500">
                <span className="flex items-center space-x-1">
                  <Layers className="w-3 h-3 text-slate-400" />
                  <span>Scope & Basis:</span>
                </span>
                <span className="font-medium text-slate-700">
                  {secondaryFact.context.scope || secondaryFact.scope || 'Consolidated'}
                  {secondaryFact.context.basis ? ` • ${secondaryFact.context.basis}` : ''}
                </span>
              </div>
              {secondaryFact.normalized.normalizationSteps && secondaryFact.normalized.normalizationSteps.length > 0 && (
                <div className="pt-1.5 border-t border-slate-100 text-[10px] text-slate-400 font-mono space-y-0.5">
                  <span className="font-semibold text-slate-500">Parse trace: </span>
                  {secondaryFact.normalized.normalizationSteps.map((st, i) => (
                    <span key={i} className="inline-block mr-2 text-slate-500">• {st}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Verbatim Quote Evidence */}
          <div className="space-y-1 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
              <Quote className="w-3 h-3 text-slate-400" />
              <span>Grounded Evidence Quote</span>
            </span>
            <blockquote className="text-xs text-slate-700 italic bg-purple-50/40 p-2.5 rounded-lg border-l-2 border-purple-400 leading-relaxed">
              "{secondaryFact.evidenceText}"
            </blockquote>
          </div>
        </div>
      </div>
    </div>
  );
};
