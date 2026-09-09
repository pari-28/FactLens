/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type RelationshipType =
  | 'CORROBORATED'
  | 'CONTRADICTED'
  | 'RECONCILED BY CONTEXT'
  | 'UNCERTAIN';

export type FactCategory =
  | 'financial'
  | 'operational'
  | 'workforce'
  | 'environmental'
  | 'strategic'
  | 'general';

export type PeriodType =
  | 'quarter'
  | 'half_year'
  | 'nine_months'
  | 'full_year'
  | 'point_in_time'
  | 'trailing_twelve_months'
  | 'unspecified';

export interface DocumentPage {
  pageNumber: number;
  text: string;
}

export interface DocumentMetadata {
  id: string;
  filename: string;
  totalPages: number;
  fileSize: number;
  uploadDate: string;
  pages: DocumentPage[];
}

export interface FactContext {
  basis?: string;              // "GAAP", "Non-GAAP", "Adjusted", "Ind AS", "IFRS", "Constant Currency", "Statutory"
  scope?: string;              // "Consolidated", "Standalone", "Segment", "Geographic", "Division"
  scopeDetail?: string;        // "Cloud Platform Division", "North America", etc.
  accountingStandard?: string; // "US GAAP", "Ind AS", "IFRS"
  operations?: string;         // "Continuing", "Discontinued", "Total"
  auditStatus?: string;        // "Audited", "Unaudited", "Restated", "Preliminary", "Provisional"
  geography?: string;          // "Global", "North America", "APAC", "EMEA", "Domestic"
  qualifiers?: string[];       // Qualitative modifiers, e.g. ["Net of tax", "Annualized", "Pro forma"]
  isEstimateOrTarget?: boolean;// true if forecast/guidance/target rather than historical actual
  isGrossOrNet?: 'gross' | 'net' | 'unspecified';
  metricDefinition?: string;   // Definition notes or formula details
  currency?: string;           // "INR", "USD", "EUR", "GBP", etc.
  unit?: string;               // "INR", "USD", "percent", "count", etc.
  notes?: string;
}

export interface NormalizedPeriod {
  year?: number;
  quarter?: number;            // 1, 2, 3, 4
  half?: number;               // 1, 2
  month?: number;
  day?: number;
  fiscalYear?: number;
  periodStart?: string;
  periodEnd?: string;
  type: PeriodType;
  key: string;                 // Canonical string: e.g. "FY2024-Q4", "FY2024-ANNUAL", "2024-12-31"
  label: string;               // Display label: e.g. "Q4 FY2024", "Full Year 2024", "As of Dec 31, 2024"
}

export interface NormalizedFactData {
  numericValue: number | null;
  unit: string;                // "USD", "INR", "EUR", "GBP", "count", "percent", "ratio", "metric_tons", "text"
  currency?: string;           // ISO code if monetary
  unitType: 'currency' | 'percentage' | 'count' | 'mass' | 'energy' | 'ratio' | 'text';
  scale: number;               // Multiplier applied: 1e7 for Crore, 1e6 for Million, 1e5 for Lakh, 1e9 for Billion, etc.
  baseValue: number | null;    // numericValue * scale in base units
  normalizedPeriod: NormalizedPeriod;
  canonicalMetric: string;     // Canonical cluster identifier
  standardKey: string;         // entity::canonicalMetric::periodKey
  normalizationSteps?: string[];// Explicit step-by-step mathematical trace
}

export interface ExtractedFact {
  id: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  entity: string;
  metric: string;
  value: string;               // Stated value string, e.g. "₹2,076 Cr", "$14.25 billion"
  rawValue: string;            // Verbatim value string
  unit: string;                // e.g. "INR", "USD", "percent", "count"
  period: string;              // e.g. "Q4 FY24", "FY 2024", "December 31, 2024"
  scope: string;               // e.g. "Consolidated", "Standalone", "Segment"
  evidenceText: string;        // Exact verbatim quote from source document page
  confidence: number;          // Extraction confidence (0.0 to 1.0)
  category: FactCategory;
  statement: string;
  context: FactContext;
  normalized: NormalizedFactData;
}

export interface DimensionComparison {
  dimension: string;
  label: string;
  factA: string;
  factB: string;
  isCompatible: boolean;
  notes?: string;
}

export interface ExplanationDetails {
  summary: string;
  deterministicReason: string;
  isDirectlyComparable: boolean;
  comparabilitySummary: string;
  varianceText: string;        // e.g. "0.00%", "2.45%", or "N/A — facts are not directly comparable: [reason]"
  variancePercent?: number;    // Present ONLY when isDirectlyComparable is true!
  difference?: number;         // Absolute difference between base values when comparable
  conversionSteps?: string[];  // Step-by-step mathematical trace of value conversion and variance calculation
  contextualDivergence?: string[];
  reconcilingFactors?: string[];
  dimensions?: DimensionComparison[];
}

export interface FactRelationship {
  id: string;
  type: RelationshipType;
  entity: string;
  metric: string;
  periodKey: string;
  factAId: string;
  factBId: string;
  primaryFact: ExtractedFact;
  secondaryFact: ExtractedFact;
  confidence: number;
  explanation: ExplanationDetails;
}

export interface AnalysisSummary {
  totalDocuments: number;
  totalFacts: number;
  corroboratedCount: number;
  contradictedCount: number;
  reconciledCount: number;
  uncertainCount: number;
}

export type ProcessingStage =
  | 'idle'
  | 'Uploading'
  | 'Extracting text'
  | 'Extracting facts'
  | 'Normalizing'
  | 'Comparing'
  | 'Complete';

export interface AnalysisResponse {
  documents: DocumentMetadata[];
  facts: ExtractedFact[];
  relationships: FactRelationship[];
  summary: AnalysisSummary;
  extractionMode?: 'gemini' | 'deterministic-fallback';
  extractionNotice?: string;
  isDeveloperTestData?: boolean;
}
