/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CheckCircle2, AlertTriangle, Sparkles, HelpCircle, Filter } from 'lucide-react';
import { RelationshipType } from '../types.ts';

interface SummaryMetricsProps {
  summary: {
    totalDocuments: number;
    totalFacts: number;
    corroboratedCount: number;
    contradictedCount: number;
    reconciledCount: number;
    uncertainCount: number;
  };
  activeFilter: RelationshipType | 'ALL';
  onSelectFilter: (filter: RelationshipType | 'ALL') => void;
}

export const SummaryMetrics: React.FC<SummaryMetricsProps> = ({
  summary,
  activeFilter,
  onSelectFilter,
}) => {
  const totalRels =
    summary.corroboratedCount +
    summary.contradictedCount +
    summary.reconciledCount +
    summary.uncertainCount;

  const cards = [
    {
      type: 'CORROBORATED' as RelationshipType,
      title: 'Corroborated',
      count: summary.corroboratedCount,
      icon: CheckCircle2,
      description: 'Identical claims confirmed across sources within 1.5% variance',
      color: 'emerald',
      bgColor: 'bg-emerald-50/70',
      activeBg: 'bg-emerald-100/90 ring-2 ring-emerald-500',
      textColor: 'text-emerald-700',
      borderColor: 'border-emerald-200',
      badgeBg: 'bg-emerald-100 text-emerald-800',
    },
    {
      type: 'CONTRADICTED' as RelationshipType,
      title: 'Contradicted',
      count: summary.contradictedCount,
      icon: AlertTriangle,
      description: 'Conflicting values for identical metric & period without reconciling context',
      color: 'rose',
      bgColor: 'bg-rose-50/70',
      activeBg: 'bg-rose-100/90 ring-2 ring-rose-500',
      textColor: 'text-rose-700',
      borderColor: 'border-rose-200',
      badgeBg: 'bg-rose-100 text-rose-800',
    },
    {
      type: 'RECONCILED BY CONTEXT' as RelationshipType,
      title: 'Reconciled by Context',
      count: summary.reconciledCount,
      icon: Sparkles,
      description: 'Divergent figures explained by GAAP vs Non-GAAP, constant currency, or scope',
      color: 'amber',
      bgColor: 'bg-amber-50/70',
      activeBg: 'bg-amber-100/90 ring-2 ring-amber-500',
      textColor: 'text-amber-700',
      borderColor: 'border-amber-200',
      badgeBg: 'bg-amber-100 text-amber-800',
    },
    {
      type: 'UNCERTAIN' as RelationshipType,
      title: 'Uncertain / Ambiguous',
      count: summary.uncertainCount,
      icon: HelpCircle,
      description: 'Non-numeric or period-divergent claims lacking sufficient baseline equivalence',
      color: 'slate',
      bgColor: 'bg-slate-50/70',
      activeBg: 'bg-slate-200/90 ring-2 ring-slate-500',
      textColor: 'text-slate-700',
      borderColor: 'border-slate-200',
      badgeBg: 'bg-slate-200 text-slate-800',
    },
  ];

  return (
    <div id="summary-metrics-container" className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Cross-Document Verification Results
          </h3>
          <p className="text-xs text-slate-500">
            {totalRels} verified relationships generated across {summary.totalDocuments} documents
          </p>
        </div>

        {activeFilter !== 'ALL' && (
          <button
            onClick={() => onSelectFilter('ALL')}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <Filter className="w-3 h-3 text-slate-400" />
            <span>Show All ({totalRels})</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => {
          const Icon = c.icon;
          const isActive = activeFilter === c.type;
          const pct = totalRels > 0 ? Math.round((c.count / totalRels) * 100) : 0;

          return (
            <div
              key={c.type}
              id={`metric-card-${c.type.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => onSelectFilter(isActive ? 'ALL' : c.type)}
              className={`border rounded-2xl p-4 transition-all cursor-pointer shadow-2xs hover:shadow-xs ${
                c.borderColor
              } ${isActive ? c.activeBg : c.bgColor} hover:brightness-[0.98]`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-xl bg-white/80 shadow-2xs ${c.textColor}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.badgeBg}`}>
                  {pct}%
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex items-baseline space-x-2">
                  <span className="text-2xl font-black tracking-tight text-slate-900">
                    {c.count}
                  </span>
                  <span className={`text-xs font-bold uppercase tracking-wide ${c.textColor}`}>
                    {c.title}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                  {c.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
