/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ExtractedFact,
  FactRelationship,
  RelationshipType,
  DimensionComparison,
  ExplanationDetails,
} from '../types.ts';
import {
  canonicalizeEntity,
  computeMetricTokenSimilarity,
  classifyMetricConcept,
  type MetricConceptClassification,
} from './deterministic-normalizer.ts';

/**
 * Stage A: Candidate Generation
 * Filters cross-document pairs using broad entity and measurement nature signals.
 */
export function generateCandidatePair(factA: ExtractedFact, factB: ExtractedFact): boolean {
  // 1. Must be strictly cross-document
  if (!factA || !factB || factA.documentId === factB.documentId) {
    return false;
  }

  // 2. Entity compatibility: must match or represent the primary corporate entity
  const cEntityA = canonicalizeEntity(factA.entity);
  const cEntityB = canonicalizeEntity(factB.entity);
  if (
    cEntityA !== cEntityB &&
    cEntityA !== 'primary_entity' &&
    cEntityB !== 'primary_entity'
  ) {
    return false;
  }

  // 3. Measurement Nature compatibility:
  // Currency amounts cannot pair with percentages/ratios or counts.
  const unitTypeA = factA.normalized.unitType;
  const unitTypeB = factB.normalized.unitType;
  if (unitTypeA && unitTypeB && unitTypeA !== unitTypeB) {
    return false;
  }

  return true;
}

/**
 * Stage B: Semantic Compatibility Validation
 * Verifies that the two facts actually describe the exact same underlying concept
 * BEFORE any contextual or numerical comparison is performed.
 */
export interface SemanticCompatibilityResult {
  isCompatible: boolean;
  confidence: number;
  conceptCategory: string;
  conceptLabel: string;
  disqualificationReason?: string;
  isAdjustedDivergence: boolean;
  conceptA: MetricConceptClassification;
  conceptB: MetricConceptClassification;
}

export function validateSemanticCompatibility(
  factA: ExtractedFact,
  factB: ExtractedFact
): SemanticCompatibilityResult {
  const conceptA = classifyMetricConcept(factA.metric, factA.evidenceText, factA.context);
  const conceptB = classifyMetricConcept(factB.metric, factB.evidenceText, factB.context);

  // 1. Concept Family Gate: Fundamentally distinct accounting/operational categories must never match
  // (e.g. Revenue vs Total Income, Revenue vs Profit, PAT vs EBITDA, Contingent Liabilities vs Net Profit, Assets vs Liabilities)
  if (conceptA.conceptFamily !== conceptB.conceptFamily) {
    return {
      isCompatible: false,
      confidence: 0,
      conceptCategory: `${conceptA.conceptFamily} vs ${conceptB.conceptFamily}`,
      conceptLabel: `${conceptA.conceptLabel} vs ${conceptB.conceptLabel}`,
      disqualificationReason: `Fundamentally distinct financial/operational concepts: "${conceptA.conceptLabel}" (${conceptA.conceptFamily}) vs "${conceptB.conceptLabel}" (${conceptB.conceptFamily}).`,
      isAdjustedDivergence: false,
      conceptA,
      conceptB,
    };
  }

  // 2. Percentage/Ratio vs Absolute monetary/numeric amount
  if (conceptA.isPercentageOrRatio !== conceptB.isPercentageOrRatio) {
    return {
      isCompatible: false,
      confidence: 0,
      conceptCategory: conceptA.conceptFamily,
      conceptLabel: conceptA.conceptLabel,
      disqualificationReason: 'Percentage/margin ratio cannot be paired with absolute monetary or numerical values.',
      isAdjustedDivergence: false,
      conceptA,
      conceptB,
    };
  }

  // 3. Growth rate vs Base level metric
  if (conceptA.isGrowthMetric !== conceptB.isGrowthMetric) {
    return {
      isCompatible: false,
      confidence: 0,
      conceptCategory: conceptA.conceptFamily,
      conceptLabel: conceptA.conceptLabel,
      disqualificationReason: 'Growth rate cannot be paired with baseline level metric.',
      isAdjustedDivergence: false,
      conceptA,
      conceptB,
    };
  }

  // 4. Per-share metric vs Aggregate total
  if (conceptA.isPerShare !== conceptB.isPerShare) {
    return {
      isCompatible: false,
      confidence: 0,
      conceptCategory: conceptA.conceptFamily,
      conceptLabel: conceptA.conceptLabel,
      disqualificationReason: 'Per-share metric cannot be paired with aggregate financial totals.',
      isAdjustedDivergence: false,
      conceptA,
      conceptB,
    };
  }

  // 5. Contingent commitment vs Recognized statement figure
  if (conceptA.isContingent !== conceptB.isContingent) {
    return {
      isCompatible: false,
      confidence: 0,
      conceptCategory: conceptA.conceptFamily,
      conceptLabel: conceptA.conceptLabel,
      disqualificationReason: 'Contingent off-balance-sheet commitment cannot be paired with recognized figures.',
      isAdjustedDivergence: false,
      conceptA,
      conceptB,
    };
  }

  // 6. Sub-segment scope disparity
  if (conceptA.isSegment && conceptB.isSegment) {
    if (
      conceptA.segmentName &&
      conceptB.segmentName &&
      conceptA.segmentName.toLowerCase() !== conceptB.segmentName.toLowerCase()
    ) {
      return {
        isCompatible: false,
        confidence: 0,
        conceptCategory: conceptA.conceptFamily,
        conceptLabel: conceptA.conceptLabel,
        disqualificationReason: `Different operating segments: "${conceptA.segmentName}" vs "${conceptB.segmentName}".`,
        isAdjustedDivergence: false,
        conceptA,
        conceptB,
      };
    }
  }

  // 7. Generic Unclassified Domain Metrics: require strong semantic token similarity
  if (conceptA.conceptFamily.startsWith('domain_') || conceptA.conceptFamily.startsWith('generic_')) {
    const tokenSim = computeMetricTokenSimilarity(factA.metric, factB.metric);
    const cMetricA = factA.normalized.canonicalMetric;
    const cMetricB = factB.normalized.canonicalMetric;
    if (tokenSim < 0.75 && cMetricA !== cMetricB) {
      return {
        isCompatible: false,
        confidence: 0,
        conceptCategory: conceptA.conceptFamily,
        conceptLabel: conceptA.conceptLabel,
        disqualificationReason: `Unclassified domain metrics lack sufficient semantic token similarity (${(tokenSim * 100).toFixed(0)}%).`,
        isAdjustedDivergence: false,
        conceptA,
        conceptB,
      };
    }
  }

  const isAdjustedDivergence = conceptA.isAdjusted !== conceptB.isAdjusted;

  return {
    isCompatible: true,
    confidence: 0.95,
    conceptCategory: conceptA.conceptFamily,
    conceptLabel: conceptA.conceptLabel,
    isAdjustedDivergence,
    conceptA,
    conceptB,
  };
}

/**
 * Stage C: Context Comparison
 * Evaluates contextual dimensions across period, scope, accounting basis, operations, audit status, etc.
 * Crucially: RECONCILED BY CONTEXT requires explicit contextual evidence explaining divergence.
 */
export interface ComparabilityEvaluation {
  isDirectlyComparable: boolean;
  dimensions: DimensionComparison[];
  reconcilingFactors: string[];
  incomparabilityReasons: string[];
  missingContextReasons: string[];
}

export function evaluateComparability(
  factA: ExtractedFact,
  factB: ExtractedFact,
  semanticResult: SemanticCompatibilityResult
): ComparabilityEvaluation {
  const dimensions: DimensionComparison[] = [];
  const reconcilingFactors: string[] = [];
  const incomparabilityReasons: string[] = [];
  const missingContextReasons: string[] = [];

  const ctxA = factA.context || {};
  const ctxB = factB.context || {};
  const normA = factA.normalized;
  const normB = factB.normalized;
  const perA = normA.normalizedPeriod;
  const perB = normB.normalizedPeriod;

  // 1. Metric Definition Dimension (Validated in Stage B)
  dimensions.push({
    dimension: 'metric',
    label: 'Metric Definition',
    factA: factA.metric,
    factB: factB.metric,
    isCompatible: true,
    notes: `Semantically compatible concept: ${semanticResult.conceptLabel}.`,
  });

  // 2. Unit & Currency Dimension
  const unitTypeA = normA.unitType;
  const unitTypeB = normB.unitType;
  const currA = normA.currency;
  const currB = normB.currency;

  if (unitTypeA !== unitTypeB) {
    const note = `Incompatible unit types: ${unitTypeA} ("${factA.rawValue}") vs ${unitTypeB} ("${factB.rawValue}"). A monetary amount cannot be directly compared to a percentage or ratio.`;
    dimensions.push({
      dimension: 'unit_type',
      label: 'Unit Type & Dimension',
      factA: `${unitTypeA} (${factA.unit})`,
      factB: `${unitTypeB} (${factB.unit})`,
      isCompatible: false,
      notes: note,
    });
    incomparabilityReasons.push(`Unit type mismatch (${unitTypeA} vs ${unitTypeB})`);
  } else if (unitTypeA === 'currency') {
    if (currA && currB && currA !== currB) {
      const note = `Currency divergence: Stated in ${currA} vs ${currB}. Direct variance cannot be calculated without an explicit foreign exchange conversion rate.`;
      dimensions.push({
        dimension: 'currency',
        label: 'Currency',
        factA: currA,
        factB: currB,
        isCompatible: false,
        notes: note,
      });
      missingContextReasons.push(`Different reporting currencies (${currA} vs ${currB}) without foreign exchange conversion rate`);
      incomparabilityReasons.push(`Different reporting currencies (${currA} vs ${currB})`);
    } else {
      dimensions.push({
        dimension: 'currency',
        label: 'Currency',
        factA: currA || factA.unit,
        factB: currB || factB.unit,
        isCompatible: true,
        notes: `Identical currency (${currA || factA.unit}) with base values mathematically scaled.`,
      });
    }
  } else {
    const isUnitCompatible = normA.unit === normB.unit;
    dimensions.push({
      dimension: 'unit',
      label: 'Measurement Unit',
      factA: factA.unit,
      factB: factB.unit,
      isCompatible: isUnitCompatible,
      notes: isUnitCompatible ? 'Identical measurement unit.' : `Different units: ${factA.unit} vs ${factB.unit}.`,
    });
    if (!isUnitCompatible) {
      incomparabilityReasons.push(`Measurement unit divergence (${factA.unit} vs ${factB.unit})`);
    }
  }

  // 3. Reporting Period Dimension
  const perTypeA = perA.type;
  const perTypeB = perB.type;
  const isPeriodExact = perA.key === perB.key && perA.key !== 'unspecified';

  if (isPeriodExact) {
    dimensions.push({
      dimension: 'period',
      label: 'Reporting Period',
      factA: perA.label,
      factB: perB.label,
      isCompatible: true,
      notes: `Identical reporting timeframe (${perA.label}).`,
    });
  } else {
    // Case A: Unspecified period in one or both sources
    if (perA.key === 'unspecified' || perB.key === 'unspecified') {
      dimensions.push({
        dimension: 'period',
        label: 'Reporting Period',
        factA: perA.label,
        factB: perB.label,
        isCompatible: false,
        notes: 'One or both documents do not explicitly disclose a standardized reporting period.',
      });
      missingContextReasons.push('Reporting period is unspecified in one or both sources');
      incomparabilityReasons.push('Unspecified reporting period');
    }
    // Case B: Periodic interim fraction vs Cumulative full-year total for the SAME fiscal year
    // CRITICAL: Legitimate contextual reconciliation explaining why values differ!
    else if (
      (perA.fiscalYear && perB.fiscalYear && perA.fiscalYear === perB.fiscalYear) &&
      (
        (perTypeA === 'quarter' && perTypeB === 'full_year') ||
        (perTypeA === 'full_year' && perTypeB === 'quarter') ||
        (perTypeA === 'half_year' && perTypeB === 'full_year') ||
        (perTypeA === 'full_year' && perTypeB === 'half_year') ||
        (perTypeA === 'nine_months' && perTypeB === 'full_year') ||
        (perTypeA === 'full_year' && perTypeB === 'nine_months')
      )
    ) {
      const qFact = perTypeA === 'full_year' ? factB : factA;
      const fyFact = perTypeA === 'full_year' ? factA : factB;
      const note = `Periodic vs Cumulative Structure: ${qFact.documentName} reports interim periodic results (${qFact.normalized.normalizedPeriod.label}) whereas ${fyFact.documentName} reports full-year cumulative results (${fyFact.normalized.normalizedPeriod.label}) for FY${perA.fiscalYear}. Interim figures represent a periodic fraction of the annual total.`;
      dimensions.push({
        dimension: 'period',
        label: 'Reporting Period',
        factA: perA.label,
        factB: perB.label,
        isCompatible: false,
        notes: note,
      });
      reconcilingFactors.push(`Period structure: Interim periodic result (${qFact.normalized.normalizedPeriod.label}) vs Full-year cumulative total (${fyFact.normalized.normalizedPeriod.label}) for FY${perA.fiscalYear}`);
      incomparabilityReasons.push('Interim periodic result vs Full-year annual cumulative total');
    }
    // Case C: Different fiscal years (e.g. FY2021 vs FY2024) without comparative restatement
    // These are separate timeframes; comparability cannot be established.
    else if (perA.fiscalYear && perB.fiscalYear && perA.fiscalYear !== perB.fiscalYear) {
      const note = `Different Fiscal Years: FY${perA.fiscalYear} vs FY${perB.fiscalYear}. No comparative restatement disclosed between these disparate fiscal years.`;
      dimensions.push({
        dimension: 'period',
        label: 'Reporting Period',
        factA: perA.label,
        factB: perB.label,
        isCompatible: false,
        notes: note,
      });
      incomparabilityReasons.push(`Different fiscal years: FY${perA.fiscalYear} vs FY${perB.fiscalYear}`);
    }
    // Case D: Different quarters within the same year
    else if (perA.quarter && perB.quarter && perA.quarter !== perB.quarter) {
      const note = `Different Quarters: Q${perA.quarter} vs Q${perB.quarter} for year ${perA.fiscalYear || perA.year}.`;
      dimensions.push({
        dimension: 'period',
        label: 'Reporting Period',
        factA: perA.label,
        factB: perB.label,
        isCompatible: false,
        notes: note,
      });
      incomparabilityReasons.push(`Different reporting quarters (Q${perA.quarter} vs Q${perB.quarter})`);
    } else {
      const note = `Timeframe Disparity: ${perA.label} vs ${perB.label}.`;
      dimensions.push({
        dimension: 'period',
        label: 'Reporting Period',
        factA: perA.label,
        factB: perB.label,
        isCompatible: false,
        notes: note,
      });
      incomparabilityReasons.push('Reporting timeframe disparity');
    }
  }

  // 4. Scope Dimension (Consolidated vs Standalone vs Segment)
  const scopeA = (ctxA.scope || factA.scope || 'Consolidated').toLowerCase();
  const scopeB = (ctxB.scope || factB.scope || 'Consolidated').toLowerCase();
  const isConsolidatedA = scopeA.includes('consolidated') || scopeA.includes('group');
  const isConsolidatedB = scopeB.includes('consolidated') || scopeB.includes('group');
  const isStandaloneA = scopeA.includes('standalone') || scopeA.includes('parent');
  const isStandaloneB = scopeB.includes('standalone') || scopeB.includes('parent');
  const isSegmentA = scopeA.includes('segment') || scopeA.includes('division') || Boolean(ctxA.scopeDetail) || semanticResult.conceptA.isSegment;
  const isSegmentB = scopeB.includes('segment') || scopeB.includes('division') || Boolean(ctxB.scopeDetail) || semanticResult.conceptB.isSegment;

  if ((isConsolidatedA && isStandaloneB) || (isStandaloneA && isConsolidatedB)) {
    const note = 'Consolidated vs Standalone Scope: Consolidated financial statements aggregate all global subsidiaries, whereas Standalone statements reflect only the parent legal entity.';
    dimensions.push({
      dimension: 'scope',
      label: 'Reporting Scope',
      factA: isConsolidatedA ? 'Consolidated' : 'Standalone',
      factB: isConsolidatedB ? 'Consolidated' : 'Standalone',
      isCompatible: false,
      notes: note,
    });
    reconcilingFactors.push('Consolidated group perimeter vs Standalone parent entity perimeter');
    incomparabilityReasons.push('Consolidated vs Standalone scope divergence');
  } else if (isSegmentA !== isSegmentB) {
    const segName = ctxA.scopeDetail || ctxB.scopeDetail || semanticResult.conceptA.segmentName || semanticResult.conceptB.segmentName || 'Division / Segment';
    const note = `Segment vs Enterprise Scope: One source reports for a specific operating division ("${segName}"), while the other reports enterprise-wide.`;
    dimensions.push({
      dimension: 'scope',
      label: 'Reporting Scope',
      factA: isSegmentA ? `Segment (${segName})` : 'Enterprise Total',
      factB: isSegmentB ? `Segment (${segName})` : 'Enterprise Total',
      isCompatible: false,
      notes: note,
    });
    reconcilingFactors.push(`Enterprise-wide total vs Operating segment scope (${segName})`);
    incomparabilityReasons.push('Segment vs Enterprise total scope');
  } else {
    dimensions.push({
      dimension: 'scope',
      label: 'Reporting Scope',
      factA: ctxA.scope || factA.scope || 'Consolidated',
      factB: ctxB.scope || factB.scope || 'Consolidated',
      isCompatible: true,
      notes: 'Equivalent reporting scope across sources.',
    });
  }

  // 5. Accounting / Reporting Basis Dimension (GAAP vs Non-GAAP, Adjusted vs Reported)
  const basisA = (ctxA.basis || 'Standard').toLowerCase();
  const basisB = (ctxB.basis || 'Standard').toLowerCase();
  const isNonGaapA = basisA.includes('non-gaap') || basisA.includes('adjusted') || basisA.includes('adj') || semanticResult.conceptA.isAdjusted;
  const isNonGaapB = basisB.includes('non-gaap') || basisB.includes('adjusted') || basisB.includes('adj') || semanticResult.conceptB.isAdjusted;
  const isCcA = basisA.includes('constant currency') || basisA.includes('fx-neutral');
  const isCcB = basisB.includes('constant currency') || basisB.includes('fx-neutral');

  if (isNonGaapA !== isNonGaapB) {
    const nonGaapDoc = isNonGaapA ? factA.documentName : factB.documentName;
    const gaapDoc = isNonGaapA ? factB.documentName : factA.documentName;
    const note = `Accounting Basis Divergence: ${nonGaapDoc} presents Non-GAAP / Adjusted figures, while ${gaapDoc} presents audited GAAP / As-Reported figures.`;
    dimensions.push({
      dimension: 'basis',
      label: 'Accounting Basis',
      factA: isNonGaapA ? 'Non-GAAP / Adjusted' : 'GAAP / Reported',
      factB: isNonGaapB ? 'Non-GAAP / Adjusted' : 'GAAP / Reported',
      isCompatible: false,
      notes: note,
    });
    reconcilingFactors.push('Accounting reporting basis: Non-GAAP adjusted vs GAAP reported statutory figures');
    incomparabilityReasons.push('GAAP vs Non-GAAP accounting basis divergence');
  } else if (isCcA !== isCcB) {
    const note = 'Measurement Basis Divergence: One figure is measured in Constant Currency (FX-neutral), while the other reflects as-reported exchange fluctuations.';
    dimensions.push({
      dimension: 'basis',
      label: 'Currency Basis',
      factA: isCcA ? 'Constant Currency' : 'Reported FX',
      factB: isCcB ? 'Constant Currency' : 'Reported FX',
      isCompatible: false,
      notes: note,
    });
    reconcilingFactors.push('Measurement currency basis: Constant Currency (FX-neutral) vs As-Reported exchange rates');
    incomparabilityReasons.push('Constant Currency vs Reported FX');
  } else {
    dimensions.push({
      dimension: 'basis',
      label: 'Accounting Basis',
      factA: ctxA.basis || 'Reported / Standard',
      factB: ctxB.basis || 'Reported / Standard',
      isCompatible: true,
      notes: 'Equivalent accounting and reporting basis.',
    });
  }

  // 6. Operations Dimension (Continuing vs Discontinued Operations)
  const opsA = (ctxA.operations || 'Total').toLowerCase();
  const opsB = (ctxB.operations || 'Total').toLowerCase();
  if (opsA !== opsB && (opsA.includes('continuing') || opsB.includes('continuing'))) {
    const note = 'Operations Scope: One document isolates Continuing Operations while the other reflects Total / Discontinued Operations.';
    dimensions.push({
      dimension: 'operations',
      label: 'Operations Status',
      factA: ctxA.operations || 'Total',
      factB: ctxB.operations || 'Total',
      isCompatible: false,
      notes: note,
    });
    reconcilingFactors.push('Operations scope: Continuing operations vs Total operations (including discontinued)');
    incomparabilityReasons.push('Continuing vs Discontinued operations');
  } else {
    dimensions.push({
      dimension: 'operations',
      label: 'Operations Status',
      factA: ctxA.operations || 'Total',
      factB: ctxB.operations || 'Total',
      isCompatible: true,
      notes: 'Consistent operational perimeter.',
    });
  }

  // 7. Audit & Restatement Status
  const auditA = ctxA.auditStatus || 'Reported';
  const auditB = ctxB.auditStatus || 'Reported';
  if (auditA.toLowerCase().includes('restated') !== auditB.toLowerCase().includes('restated')) {
    const note = 'Revision Status: One document reflects a retrospective restatement or revision.';
    dimensions.push({
      dimension: 'audit_status',
      label: 'Audit & Revision Status',
      factA: auditA,
      factB: auditB,
      isCompatible: false,
      notes: note,
    });
    reconcilingFactors.push('Filing revision: Restated comparative filing vs Originally reported filing');
    incomparabilityReasons.push('Original reported vs Subsequent restated figure');
  }

  // 8. Geography Dimension
  if (ctxA.geography && ctxB.geography && ctxA.geography !== ctxB.geography) {
    const note = `Geographic Region Divergence: ${ctxA.geography} vs ${ctxB.geography}.`;
    dimensions.push({
      dimension: 'geography',
      label: 'Geographic Region',
      factA: ctxA.geography,
      factB: ctxB.geography,
      isCompatible: false,
      notes: note,
    });
    reconcilingFactors.push(`Geographic perimeter divergence: ${ctxA.geography} vs ${ctxB.geography}`);
    incomparabilityReasons.push('Geographic region disparity');
  }

  // 9. Forecast / Guidance vs Historical Actual
  if (
    ctxA.isEstimateOrTarget !== undefined &&
    ctxB.isEstimateOrTarget !== undefined &&
    ctxA.isEstimateOrTarget !== ctxB.isEstimateOrTarget
  ) {
    const note = 'Forecast vs Historical Actual: One figure is forward-looking guidance / target while the other is historical actual.';
    dimensions.push({
      dimension: 'nature',
      label: 'Result Nature',
      factA: ctxA.isEstimateOrTarget ? 'Guidance / Forecast' : 'Historical Actual',
      factB: ctxB.isEstimateOrTarget ? 'Guidance / Forecast' : 'Historical Actual',
      isCompatible: false,
      notes: note,
    });
    reconcilingFactors.push('Result nature: Forward-looking guidance/forecast vs Historical actual result');
    incomparabilityReasons.push('Guidance vs Actual mismatch');
  }

  // 10. Gross vs Net
  if (
    ctxA.isGrossOrNet &&
    ctxB.isGrossOrNet &&
    ctxA.isGrossOrNet !== 'unspecified' &&
    ctxB.isGrossOrNet !== 'unspecified' &&
    ctxA.isGrossOrNet !== ctxB.isGrossOrNet
  ) {
    const note = `Gross vs Net Measurement: Figures are stated on ${ctxA.isGrossOrNet} vs ${ctxB.isGrossOrNet} basis.`;
    dimensions.push({
      dimension: 'gross_net',
      label: 'Gross vs Net Basis',
      factA: ctxA.isGrossOrNet,
      factB: ctxB.isGrossOrNet,
      isCompatible: false,
      notes: note,
    });
    reconcilingFactors.push(`Measurement basis: ${ctxA.isGrossOrNet} vs ${ctxB.isGrossOrNet}`);
    incomparabilityReasons.push('Gross vs Net disparity');
  }

  // Direct comparability requires:
  // - Metric concept matches
  // - Reporting periods align
  // - Units and currencies match
  // - Scope and basis match
  // - Zero reconciling factors or missing context
  const isDirectlyComparable =
    reconcilingFactors.length === 0 &&
    incomparabilityReasons.length === 0 &&
    missingContextReasons.length === 0 &&
    normA.baseValue !== null &&
    normB.baseValue !== null;

  return {
    isDirectlyComparable,
    dimensions,
    reconcilingFactors,
    incomparabilityReasons,
    missingContextReasons,
  };
}

/**
 * Stage D: Numerical Comparison & Relationship Classification
 * Evaluates the 4 required categories:
 * - CORROBORATED: same concept, comparable context, normalized values equal or within tolerance
 * - CONTRADICTED: same concept, matching period/scope/basis, values materially conflict
 * - RECONCILED BY CONTEXT: same concept, real contextual difference explicitly explains divergence
 * - UNCERTAIN: preferred over false certainty when baseline parameters or aligned timeframes are missing
 */
export function compareFactPair(factA: ExtractedFact, factB: ExtractedFact): FactRelationship | null {
  // Stage A: Candidate Generation Gate
  if (!generateCandidatePair(factA, factB)) {
    return null;
  }

  // Stage B: Semantic Compatibility Validation Gate
  // If facts represent different concepts, DO NOT generate a relationship!
  const semanticResult = validateSemanticCompatibility(factA, factB);
  if (!semanticResult.isCompatible) {
    return null;
  }

  // Stage C: Context Comparison
  const comp = evaluateComparability(factA, factB, semanticResult);

  const valA = factA.normalized.baseValue;
  const valB = factB.normalized.baseValue;
  const hasBothNumeric = valA !== null && valB !== null && !isNaN(valA) && !isNaN(valB);

  let type: RelationshipType = 'UNCERTAIN';
  let confidence = 0.8;
  let summary = '';
  let deterministicReason = '';
  let comparabilitySummary = '';
  let varianceText = '';
  let variancePercent: number | undefined;
  let difference: number | undefined;
  let conversionSteps: string[] = [];

  const periodLabel =
    factA.normalized.normalizedPeriod.key === factB.normalized.normalizedPeriod.key
      ? factA.normalized.normalizedPeriod.label
      : `${factA.normalized.normalizedPeriod.label} vs ${factB.normalized.normalizedPeriod.label}`;

  // CASE 1: Facts are DIRECTLY COMPARABLE
  if (comp.isDirectlyComparable && hasBothNumeric) {
    comparabilitySummary = `Directly comparable across concept (${semanticResult.conceptLabel}), timeframe (${factA.normalized.normalizedPeriod.label}), unit (${factA.normalized.unit}), basis, and scope.`;
    difference = Math.abs(valA - valB);
    const maxVal = Math.max(Math.abs(valA), Math.abs(valB));
    variancePercent = maxVal > 0 ? (difference / maxVal) * 100 : 0;
    variancePercent = Math.round(variancePercent * 100) / 100;

    // Reporting tolerance: 1.0% tolerance accounts for standard financial publication rounding
    const isWithinTolerance = variancePercent <= 1.0;

    conversionSteps = [
      `${factA.documentName} (p. ${factA.pageNumber}): "${factA.rawValue}" -> Base: ${valA.toLocaleString()} ${factA.normalized.unit}`,
      `${factB.documentName} (p. ${factB.pageNumber}): "${factB.rawValue}" -> Base: ${valB.toLocaleString()} ${factB.normalized.unit}`,
      `Absolute delta: |${valA.toLocaleString()} - ${valB.toLocaleString()}| = ${difference.toLocaleString()} ${factA.normalized.unit}`,
      `Percentage variance: (${difference.toLocaleString()} / ${maxVal.toLocaleString()}) * 100 = ${variancePercent.toFixed(2)}%`,
      isWithinTolerance
        ? `Variance (${variancePercent.toFixed(2)}%) is within standard filing rounding tolerance (<= 1.0%). Confirmed Corroborated.`
        : `Variance (${variancePercent.toFixed(2)}%) exceeds reporting tolerance (> 1.0%) with no reconciling context disclosed. Flagged as Contradicted.`
    ];

    if (isWithinTolerance) {
      type = 'CORROBORATED';
      confidence = 0.98;
      varianceText = `${variancePercent.toFixed(2)}%`;
      summary = `Corroborated: ${semanticResult.conceptLabel} for ${factA.normalized.normalizedPeriod.label} is confirmed across both documents within ${variancePercent.toFixed(2)}% variance.`;
      deterministicReason = `Both documents report on identical concept (${semanticResult.conceptLabel}), period (${factA.normalized.normalizedPeriod.label}), unit, accounting basis, and scope. ${factA.documentName} states ${factA.rawValue} (base: ${valA.toLocaleString()}) on page ${factA.pageNumber}, and ${factB.documentName} states ${factB.rawValue} (base: ${valB.toLocaleString()}) on page ${factB.pageNumber}. Absolute difference is ${difference.toLocaleString()} (${variancePercent.toFixed(2)}% variance), confirmed corroborated within verified reporting tolerance (<= 1.0%).`;
    } else {
      // Genuine contradiction: Same concept, same period, same unit, same scope, same basis, but materially conflicting figures without reconciling disclosures!
      type = 'CONTRADICTED';
      confidence = 0.95;
      varianceText = `${variancePercent.toFixed(2)}%`;
      summary = `Contradicted: Material conflict of ${variancePercent.toFixed(2)}% for ${semanticResult.conceptLabel} (${factA.normalized.normalizedPeriod.label}) without reconciling disclosures.`;
      deterministicReason = `Material conflict of ${variancePercent.toFixed(2)}% detected for ${semanticResult.conceptLabel} (${factA.normalized.normalizedPeriod.label}). Both documents reference identical metric concept, period, unit, scope, and reporting basis, but state materially conflicting figures without reconciling disclosures: ${factA.rawValue} in ${factA.documentName} vs ${factB.rawValue} in ${factB.documentName}.`;
    }
  }
  // CASE 2: Legitimate Contextual Difference Established (RECONCILED BY CONTEXT)
  // Must satisfy: Same underlying concept, but source documents explicitly establish a contextual dimension that explains why values differ.
  else if (comp.reconcilingFactors.length > 0) {
    type = 'RECONCILED BY CONTEXT';
    confidence = 0.92;
    const primaryReason = comp.reconcilingFactors[0];
    comparabilitySummary = `Facts describe the same underlying concept (${semanticResult.conceptLabel}), but are not directly comparable for numeric equality. Discrepancy is accounted for by disclosed reporting context: ${comp.reconcilingFactors.join('; ')}.`;
    varianceText = `N/A — facts are not directly comparable: ${primaryReason}`;
    variancePercent = undefined; // Strictly undefined when facts are not comparable!
    difference = undefined;

    conversionSteps = [
      `${factA.documentName}: "${factA.rawValue}" (Period: ${factA.normalized.normalizedPeriod.label}, Scope: ${factA.scope}, Basis: ${factA.context?.basis || 'Reported'})`,
      `${factB.documentName}: "${factB.rawValue}" (Period: ${factB.normalized.normalizedPeriod.label}, Scope: ${factB.scope}, Basis: ${factB.context?.basis || 'Reported'})`,
      `Direct numeric variance withheld: Divergence is accounted for by reporting context (${comp.reconcilingFactors.join('; ')}).`
    ];

    summary = `Reconciled by Context: Divergence between ${factA.rawValue} and ${factB.rawValue} for ${semanticResult.conceptLabel} is explained by contextual reporting differences.`;
    deterministicReason = `Deterministic reconciliation applied: Both source documents describe the same underlying concept (${semanticResult.conceptLabel}), but values are not directly comparable due to legitimate contextual reporting differences: ${comp.reconcilingFactors.join('; ')}. Stated values: ${factA.documentName} reports ${factA.rawValue} (${factA.normalized.normalizedPeriod.label}), while ${factB.documentName} reports ${factB.rawValue} (${factB.normalized.normalizedPeriod.label}).`;
  }
  // CASE 3: Qualitative statements (non-numeric)
  else if (
    !hasBothNumeric &&
    factA.normalized.normalizedPeriod.key === factB.normalized.normalizedPeriod.key &&
    factA.normalized.normalizedPeriod.key !== 'unspecified'
  ) {
    const textA = factA.statement.toLowerCase();
    const textB = factB.statement.toLowerCase();

    const negWords = ['terminated', 'canceled', 'declined', 'failed', 'rejected', 'delayed', 'suspended', 'decreased'];
    const posWords = ['completed', 'approved', 'surpassed', 'finalized', 'increased', 'achieved', 'expanded'];

    const hasNegA = negWords.some(w => textA.includes(w));
    const hasNegB = negWords.some(w => textB.includes(w));
    const hasPosA = posWords.some(w => textA.includes(w));
    const hasPosB = posWords.some(w => textB.includes(w));

    if ((hasNegA && hasPosB) || (hasPosA && hasNegB)) {
      type = 'CONTRADICTED';
      confidence = 0.88;
      varianceText = 'N/A — qualitative assertions';
      comparabilitySummary = 'Directly conflicting qualitative assertions for identical period and scope.';
      summary = `Contradicted: Mutually exclusive qualitative assertions regarding ${semanticResult.conceptLabel}.`;
      deterministicReason = `Source documents state contradictory operational sentiment/outcomes for the same concept (${semanticResult.conceptLabel}) and timeframe (${factA.normalized.normalizedPeriod.label}).`;
      conversionSteps = [
        `${factA.documentName}: "${factA.statement}"`,
        `${factB.documentName}: "${factB.statement}"`,
        'Qualitative conflict detected in assertions for the same period.'
      ];
    } else {
      type = 'CORROBORATED';
      confidence = 0.84;
      varianceText = 'N/A — qualitative assertions';
      comparabilitySummary = 'Consistent qualitative assertions for identical period.';
      summary = `Corroborated: Qualitative assertions regarding ${semanticResult.conceptLabel} align in scope and intent.`;
      deterministicReason = `Both documents state mutually consistent factual assertions regarding ${semanticResult.conceptLabel} for ${factA.normalized.normalizedPeriod.label}.`;
      conversionSteps = [
        `${factA.documentName}: "${factA.statement}"`,
        `${factB.documentName}: "${factB.statement}"`,
        'Qualitative assertions align in scope and factual intent.'
      ];
    }
  }
  // CASE 4: Missing context or Disparate Timeframes (UNCERTAIN)
  // Preferred over false certainty
  else {
    type = 'UNCERTAIN';
    confidence = 0.65;
    const missingDetail =
      comp.missingContextReasons.length > 0
        ? comp.missingContextReasons.join('; ')
        : comp.incomparabilityReasons.length > 0
        ? comp.incomparabilityReasons.join('; ')
        : 'Missing aligned reporting period, explicit unit baseline, or definition mapping';

    comparabilitySummary = `Comparability cannot be established: ${missingDetail}.`;
    varianceText = `N/A — comparability cannot be established: ${missingDetail}`;
    variancePercent = undefined;
    difference = undefined;

    conversionSteps = [
      `${factA.documentName}: "${factA.rawValue}" (Period: ${factA.normalized.normalizedPeriod.label})`,
      `${factB.documentName}: "${factB.rawValue}" (Period: ${factB.normalized.normalizedPeriod.label})`,
      `Baseline parameters insufficient for deterministic comparison: ${missingDetail}.`
    ];

    summary = `Uncertain: Facts share metric concept (${semanticResult.conceptLabel}), but lack sufficient baseline parameters or aligned timeframes for deterministic comparison.`;
    deterministicReason = `Comparability could not be validated. Specific missing parameters or time discrepancies: ${missingDetail}. Stated: "${factA.rawValue}" in ${factA.documentName} vs "${factB.rawValue}" in ${factB.documentName}.`;
  }

  const relationshipId = `rel_${factA.id}_${factB.id}`;

  const explanation: ExplanationDetails = {
    summary,
    deterministicReason,
    isDirectlyComparable: comp.isDirectlyComparable,
    comparabilitySummary,
    varianceText,
    variancePercent,
    difference,
    conversionSteps,
    contextualDivergence: comp.reconcilingFactors,
    reconcilingFactors: comp.reconcilingFactors,
    dimensions: comp.dimensions,
  };

  return {
    id: relationshipId,
    type,
    entity: factA.entity,
    metric: semanticResult.conceptLabel,
    periodKey: periodLabel,
    factAId: factA.id,
    factBId: factB.id,
    primaryFact: factA,
    secondaryFact: factB,
    confidence,
    explanation,
  };
}

/**
 * Stage A-D Pipeline Orchestration:
 * Evaluates all cross-document candidate pairs, runs semantic validation, context evaluation,
 * and numerical comparison, guaranteeing that only valid relationships referencing known facts are generated.
 */
export function buildCrossDocumentRelationships(facts: ExtractedFact[]): FactRelationship[] {
  const relationships: FactRelationship[] = [];
  const seenPairs = new Set<string>();

  // Ensure only valid facts with non-empty IDs are evaluated
  const validFacts = facts.filter(f => f && f.id && f.documentId);
  const validFactIds = new Set(validFacts.map(f => f.id));

  for (let i = 0; i < validFacts.length; i++) {
    for (let j = i + 1; j < validFacts.length; j++) {
      const factA = validFacts[i];
      const factB = validFacts[j];

      // Stage A: Candidate Generation Filter
      if (!generateCandidatePair(factA, factB)) continue;

      const pairKey = [factA.id, factB.id].sort().join(':::');
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      // Stages B, C, D
      const rel = compareFactPair(factA, factB);
      if (rel) {
        // Enforce catalog membership validation (Instruction 14)
        if (validFactIds.has(rel.factAId) && validFactIds.has(rel.factBId)) {
          relationships.push(rel);
        }
      }
    }
  }

  // Priority sorting: Contradicted first, then Reconciled by Context, then Corroborated, then Uncertain
  const priorityOrder: Record<RelationshipType, number> = {
    'CONTRADICTED': 1,
    'RECONCILED BY CONTEXT': 2,
    'CORROBORATED': 3,
    'UNCERTAIN': 4,
  };

  return relationships.sort((a, b) => priorityOrder[a.type] - priorityOrder[b.type]);
}
