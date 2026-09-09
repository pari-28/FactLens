/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  NormalizedFactData,
  NormalizedPeriod,
  FactContext,
  PeriodType,
} from '../types.ts';

/**
 * Deterministic currency mappings supporting global fiat and symbols
 */
const CURRENCY_MAP: Record<string, string> = {
  '$': 'USD',
  'usd': 'USD',
  'dollar': 'USD',
  'dollars': 'USD',
  '€': 'EUR',
  'eur': 'EUR',
  'euro': 'EUR',
  'euros': 'EUR',
  '£': 'GBP',
  'gbp': 'GBP',
  'pound': 'GBP',
  'pounds': 'GBP',
  '¥': 'JPY',
  'jpy': 'JPY',
  'yen': 'JPY',
  '₹': 'INR',
  'inr': 'INR',
  'rupee': 'INR',
  'rupees': 'INR',
  'rs': 'INR',
  'rs.': 'INR',
  'a$': 'AUD',
  'aud': 'AUD',
  'c$': 'CAD',
  'cad': 'CAD',
  'chf': 'CHF',
  'sgd': 'SGD',
  's$': 'SGD',
  'cny': 'CNY',
  'rmb': 'CNY',
};

/**
 * Scale multipliers covering both Indian (Lakh, Crore) and Western (Thousand, Million, Billion, Trillion) numbering systems
 */
const SCALE_MAP: Record<string, number> = {
  'trillion': 1e12,
  'trillions': 1e12,
  'tn': 1e12,
  'billion': 1e9,
  'billions': 1e9,
  'bn': 1e9,
  'b': 1e9,
  'crore': 1e7,
  'crores': 1e7,
  'cr': 1e7,
  'cr.': 1e7,
  'million': 1e6,
  'millions': 1e6,
  'mn': 1e6,
  'm': 1e6,
  'lakh': 1e5,
  'lakhs': 1e5,
  'lac': 1e5,
  'lacs': 1e5,
  'thousand': 1e3,
  'thousands': 1e3,
  'k': 1e3,
};

/**
 * Parse raw value string into deterministic numeric value, unit, currency, scale, and base value
 * Retains step-by-step mathematical trace for full auditability.
 */
export function normalizeNumericValue(
  rawValue: string,
  contextEvidence: string = '',
  existingContext?: FactContext
): {
  numericValue: number | null;
  unit: string;
  currency?: string;
  unitType: 'currency' | 'percentage' | 'count' | 'mass' | 'energy' | 'ratio' | 'text';
  scale: number;
  baseValue: number | null;
  normalizationSteps: string[];
} {
  const normalizationSteps: string[] = [];

  if (!rawValue || typeof rawValue !== 'string') {
    return {
      numericValue: null,
      unit: 'text',
      unitType: 'text',
      scale: 1,
      baseValue: null,
      normalizationSteps: ['Value is empty or non-string; treated as qualitative text.'],
    };
  }

  const clean = rawValue.trim();
  const lower = clean.toLowerCase();
  normalizationSteps.push(`Raw input: "${clean}"`);

  // 1. Detect Currency from raw value
  let currency: string | undefined;
  for (const [symbol, code] of Object.entries(CURRENCY_MAP)) {
    if (symbol.length === 1) {
      if (clean.includes(symbol)) {
        currency = code;
        normalizationSteps.push(`Currency detected: ${code} (symbol: "${symbol}")`);
        break;
      }
    } else {
      const regex = new RegExp(`\\b${symbol}\\b`, 'i');
      if (regex.test(clean)) {
        currency = code;
        normalizationSteps.push(`Currency detected: ${code} (token: "${symbol}")`);
        break;
      }
    }
  }

  // Fallback currency detection from existingContext or contextEvidence
  if (!currency && existingContext?.currency) {
    currency = existingContext.currency;
    normalizationSteps.push(`Currency derived from context: ${currency}`);
  }
  if (!currency && existingContext?.unit && CURRENCY_MAP[existingContext.unit.toLowerCase()]) {
    currency = CURRENCY_MAP[existingContext.unit.toLowerCase()];
    normalizationSteps.push(`Currency derived from context unit: ${currency}`);
  }
  if (!currency && contextEvidence) {
    for (const [symbol, code] of Object.entries(CURRENCY_MAP)) {
      if (symbol.length === 1) {
        if (contextEvidence.includes(symbol)) {
          currency = code;
          normalizationSteps.push(`Currency detected from source evidence: ${code} (symbol: "${symbol}")`);
          break;
        }
      } else {
        const regex = new RegExp(`\\b${symbol}\\b`, 'i');
        if (regex.test(contextEvidence)) {
          currency = code;
          normalizationSteps.push(`Currency detected from source evidence: ${code} (token: "${symbol}")`);
          break;
        }
      }
    }
  }

  // 2. Detect Unit / Measure Type
  const isPercent = clean.includes('%') || lower.includes('percent') || lower.includes('pct') || (contextEvidence && /%\b|percent\b/i.test(contextEvidence));
  const isBasisPoints = lower.includes('bps') || lower.includes('basis points');

  let unit = 'text';
  let unitType: 'currency' | 'percentage' | 'count' | 'mass' | 'energy' | 'ratio' | 'text' = 'text';

  if (currency) {
    unit = currency;
    unitType = 'currency';
  } else if (isPercent) {
    unit = 'percent';
    unitType = 'percentage';
    normalizationSteps.push('Measurement type: Percentage (%)');
  } else if (isBasisPoints) {
    unit = 'basis_points';
    unitType = 'percentage';
    normalizationSteps.push('Measurement type: Basis Points (bps, 100 bps = 1.0%)');
  } else if (/\b(employees|headcount|staff|workers|people|users|subscribers|customers|shares|units|vehicles|devices|shipments|parcels|packages|patients|beds|flights|passengers)\b/i.test(`${clean} ${contextEvidence}`)) {
    unit = 'count';
    unitType = 'count';
    normalizationSteps.push('Measurement type: Discrete Count / Volume');
  } else if (/\b(tons|tonnes|metric tons|mt|co2e|kg|lbs|pounds)\b/i.test(`${clean} ${contextEvidence}`)) {
    unit = 'metric_tons';
    unitType = 'mass';
    normalizationSteps.push('Measurement type: Mass / Environmental Weight');
  } else if (/\b(mwh|gwh|kwh|megawatt|gigawatt|watt|btu|joules)\b/i.test(`${clean} ${contextEvidence}`)) {
    unit = 'energy';
    unitType = 'energy';
    normalizationSteps.push('Measurement type: Power / Energy');
  } else if (/\b(ratio|x|times)\b/i.test(clean)) {
    unit = 'ratio';
    unitType = 'ratio';
    normalizationSteps.push('Measurement type: Multiple / Ratio');
  }

  // 3. Detect Scale Multiplier (Indian and Western numbering systems)
  let scale = 1;
  let detectedScaleTerm: string | undefined;
  for (const [term, mult] of Object.entries(SCALE_MAP)) {
    const scaleRegex = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${term}\\b`, 'i');
    const directRegex = new RegExp(`\\b${term}\\b`, 'i');
    if (scaleRegex.test(clean) || directRegex.test(clean)) {
      scale = mult;
      detectedScaleTerm = term;
      normalizationSteps.push(`Scale detected: "${term}" -> Multiplier: ${scale.toLocaleString()}x`);
      break;
    }
  }

  // Fallback scale from contextEvidence or existingContext if not found in raw value
  if (scale === 1 && (unitType === 'currency' || currency)) {
    const combinedContext = `${contextEvidence} ${existingContext?.unit || ''}`;
    for (const [term, mult] of Object.entries(SCALE_MAP)) {
      const directRegex = new RegExp(`\\b${term}\\b`, 'i');
      if (directRegex.test(combinedContext)) {
        scale = mult;
        detectedScaleTerm = term;
        normalizationSteps.push(`Scale detected from evidence context: "${term}" -> Multiplier: ${scale.toLocaleString()}x`);
        break;
      }
    }
  }

  // 4. Accounting Negatives: (12.5) or ($12.5M) or -12.5
  const isParentheticalNegative = /^\s*\(.*?\)\s*$/.test(clean);
  const isMinusNegative = clean.includes('-') && !clean.includes(' - ');

  // Extract primary numeric portion (supports 1,234.56 or 1234.56)
  const numMatch = clean.match(/[-+]?\$?€?£?¥?₹?\s*\(?(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\)?/);

  if (!numMatch) {
    normalizationSteps.push('No parseable numeric digits found; retained as non-numeric categorical statement.');
    return {
      numericValue: null,
      unit,
      currency,
      unitType,
      scale,
      baseValue: null,
      normalizationSteps,
    };
  }

  const rawNumStr = numMatch[1].replace(/,/g, '');
  let val = parseFloat(rawNumStr);

  if (isNaN(val)) {
    normalizationSteps.push(`Extracted token "${rawNumStr}" could not be parsed to IEEE-754 float.`);
    return {
      numericValue: null,
      unit,
      currency,
      unitType,
      scale,
      baseValue: null,
      normalizationSteps,
    };
  }

  if (isParentheticalNegative || isMinusNegative) {
    val = -Math.abs(val);
    normalizationSteps.push(`Negative sign recognized (accounting parentheses or minus prefix): -${Math.abs(val)}`);
  }

  if (isBasisPoints) {
    // 100 bps = 1%
    const baseVal = val * 0.01;
    normalizationSteps.push(`Converted ${val} bps to ${baseVal}% (${val} * 0.01)`);
    return {
      numericValue: val,
      unit: 'percent',
      unitType: 'percentage',
      scale: 0.01,
      baseValue: baseVal,
      normalizationSteps,
    };
  }

  const baseVal = val * scale;
  if (scale !== 1) {
    normalizationSteps.push(`Base value computed: ${val.toLocaleString()} * ${scale.toLocaleString()} = ${baseVal.toLocaleString()} ${unit}`);
  } else {
    normalizationSteps.push(`Base value: ${baseVal.toLocaleString()} ${unit}`);
  }

  return {
    numericValue: val,
    unit,
    currency,
    unitType,
    scale,
    baseValue: baseVal,
    normalizationSteps,
  };
}

/**
 * Deterministically normalize reporting period string into structured object
 * Distinguishes quarter, half-year, nine-month, full-year, point-in-time, and trailing-twelve-months.
 */
export function normalizePeriod(periodStr: string): NormalizedPeriod {
  if (!periodStr || typeof periodStr !== 'string') {
    return { type: 'unspecified', key: 'unspecified', label: 'Unspecified Period' };
  }

  const clean = periodStr.trim();
  const lower = clean.toLowerCase();

  // Extract 4-digit year (e.g. 2024, 2023)
  const yearMatch = clean.match(/\b(20\d\d|19\d\d)\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  // Extract 2-digit fiscal year (e.g. FY24, 4Q24, FY2024)
  let fiscalYear: number | undefined = year;
  const fyMatch = clean.match(/\bfy\s*(\d{2,4})\b/i);
  if (fyMatch) {
    const rawFy = parseInt(fyMatch[1], 10);
    fiscalYear = rawFy < 100 ? 2000 + rawFy : rawFy;
  } else if (!year) {
    const shortMatch = clean.match(/\b(?:q[1-4]|4q|3q|2q|1q|h[1-2]|1h|2h)(\d{2})\b/i);
    if (shortMatch) {
      const parsed = parseInt(shortMatch[1], 10);
      if (parsed >= 10 && parsed <= 50) {
        fiscalYear = 2000 + parsed;
      }
    }
  }

  const effectiveYear = fiscalYear || year;

  // Check Quarter (Q1, Q2, Q3, Q4, 1Q, 2Q, 3Q, 4Q, three months ended...)
  let quarter: number | undefined;
  if (/\b(q1|1q|first quarter)\b/i.test(clean)) quarter = 1;
  else if (/\b(q2|2q|second quarter)\b/i.test(clean)) quarter = 2;
  else if (/\b(q3|3q|third quarter)\b/i.test(clean)) quarter = 3;
  else if (/\b(q4|4q|fourth quarter)\b/i.test(clean)) quarter = 4;
  else if (lower.includes('three months ended march 31') || lower.includes('quarter ended march 31')) quarter = 1;
  else if (lower.includes('three months ended june 30') || lower.includes('quarter ended june 30')) quarter = 2;
  else if (lower.includes('three months ended september 30') || lower.includes('quarter ended september 30')) quarter = 3;
  else if (lower.includes('three months ended december 31') || lower.includes('quarter ended december 31')) quarter = 4;

  if (quarter && effectiveYear) {
    return {
      year: effectiveYear,
      quarter,
      fiscalYear: effectiveYear,
      type: 'quarter',
      key: `FY${effectiveYear}-Q${quarter}`,
      label: `Q${quarter} FY${effectiveYear}`,
    };
  }

  // Check Half-Year (H1, H2, 1H, 2H, six months ended)
  let half: number | undefined;
  if (/\b(h1|1h|first half)\b/i.test(clean)) half = 1;
  else if (/\b(h2|2h|second half)\b/i.test(clean)) half = 2;
  else if (lower.includes('six months ended')) half = 1;

  if (half && effectiveYear) {
    return {
      year: effectiveYear,
      half,
      fiscalYear: effectiveYear,
      type: 'half_year',
      key: `FY${effectiveYear}-H${half}`,
      label: `H${half} FY${effectiveYear}`,
    };
  }

  // Check Nine-Months (9M, nine months ended)
  if (/\b(9m|nine months ended)\b/i.test(clean) && effectiveYear) {
    return {
      year: effectiveYear,
      fiscalYear: effectiveYear,
      type: 'nine_months',
      key: `FY${effectiveYear}-9M`,
      label: `9M FY${effectiveYear}`,
    };
  }

  // Check Trailing Twelve Months (TTM, LTM)
  if (/\b(ttm|ltm|trailing twelve months|trailing 12 months)\b/i.test(clean)) {
    return {
      year: effectiveYear,
      fiscalYear: effectiveYear,
      type: 'trailing_twelve_months',
      key: effectiveYear ? `TTM-${effectiveYear}` : 'TTM',
      label: effectiveYear ? `TTM ${effectiveYear}` : 'TTM',
    };
  }

  // Check Full Year / Annual
  if (/\b(fy|full year|fiscal year|annual|twelve months ended|year ended)\b/i.test(clean) && effectiveYear) {
    return {
      year: effectiveYear,
      fiscalYear: effectiveYear,
      type: 'full_year',
      key: `FY${effectiveYear}-ANNUAL`,
      label: `Full Year FY${effectiveYear}`,
    };
  }

  // Check Point-in-time specific date (ISO or Month Day, Year)
  const isoMatch = clean.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return {
      year: parseInt(isoMatch[1], 10),
      month: parseInt(isoMatch[2], 10),
      day: parseInt(isoMatch[3], 10),
      type: 'point_in_time',
      key: `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`,
      label: `As of ${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`,
    };
  }

  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  for (let m = 0; m < months.length; m++) {
    const monthName = months[m];
    if (lower.includes(monthName) && effectiveYear) {
      const dayMatch = clean.match(new RegExp(`${monthName}\\s+(\\d{1,2})`, 'i'));
      const day = dayMatch ? parseInt(dayMatch[1], 10) : undefined;
      const monthNum = String(m + 1).padStart(2, '0');
      const dayNum = day ? String(day).padStart(2, '0') : '01';
      const formattedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      return {
        year: effectiveYear,
        month: m + 1,
        day,
        type: 'point_in_time',
        key: `${effectiveYear}-${monthNum}-${dayNum}`,
        label: `As of ${formattedMonth} ${day || 1}, ${effectiveYear}`,
      };
    }
  }

  // Fallback: If year found, default to full year for that year
  if (effectiveYear) {
    return {
      year: effectiveYear,
      fiscalYear: effectiveYear,
      type: 'full_year',
      key: `FY${effectiveYear}-ANNUAL`,
      label: `FY${effectiveYear}`,
    };
  }

  return {
    type: 'unspecified',
    key: clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) || 'unspecified',
    label: clean.slice(0, 40) || 'Unspecified Period',
  };
}

/**
 * Extract context dimensions from evidence text and metadata
 */
export function extractFactContext(
  evidenceText: string,
  existingContext?: FactContext,
  metricName?: string
): FactContext {
  const combined = `${evidenceText} ${metricName || ''} ${existingContext?.notes || ''}`.toLowerCase();
  const res: FactContext = { ...existingContext };

  // 1. Accounting Basis
  if (!res.basis) {
    if (/\b(non-gaap|non gaap|adjusted|adj\.?|core|underlying)\b/.test(combined)) {
      res.basis = 'Non-GAAP';
    } else if (/\bind[\s-]as\b/.test(combined)) {
      res.basis = 'Ind AS';
    } else if (/\bifrs\b/.test(combined)) {
      res.basis = 'IFRS';
    } else if (/\b(gaap|as reported|reported|statutory)\b/.test(combined)) {
      res.basis = 'GAAP';
    } else if (/\b(constant currency|fx[\s-]neutral|currency neutral)\b/.test(combined)) {
      res.basis = 'Constant Currency';
    } else if (/\bpro[\s-]forma\b/.test(combined)) {
      res.basis = 'Pro Forma';
    }
  }

  // 2. Scope & Segment Identification (Generic, no hardcoded domains)
  if (!res.scope) {
    if (/\b(consolidated|group|enterprise-wide|company-wide)\b/.test(combined)) {
      res.scope = 'Consolidated';
    } else if (/\b(standalone|parent|solo|unconsolidated)\b/.test(combined)) {
      res.scope = 'Standalone';
    } else if (/\b(segment|division|business unit|subsidiary)\b/.test(combined)) {
      res.scope = 'Segment';
    }
  }

  // Extract dynamic segment name if present (e.g. "Software Division", "Commercial Segment")
  if (!res.scopeDetail) {
    const segmentMatch = combined.match(/\b([a-z0-9\s&]{3,25})\s+(?:segment|division|business unit)\b/);
    if (segmentMatch && segmentMatch[1]) {
      const cleanSeg = segmentMatch[1].trim();
      if (!['each', 'every', 'operating', 'reportable', 'the', 'our', 'this'].includes(cleanSeg)) {
        res.scopeDetail = cleanSeg.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
    }
  }

  // 3. Operations Status
  if (!res.operations) {
    if (/\b(continuing operations|continuing)\b/.test(combined)) {
      res.operations = 'Continuing';
    } else if (/\b(discontinued operations|discontinued)\b/.test(combined)) {
      res.operations = 'Discontinued';
    } else {
      res.operations = 'Total';
    }
  }

  // 4. Audit Status
  if (!res.auditStatus) {
    if (/\b(audited)\b/.test(combined) && !/\bunaudited\b/.test(combined)) {
      res.auditStatus = 'Audited';
    } else if (/\b(unaudited|provisional|preliminary|unreviewed)\b/.test(combined)) {
      res.auditStatus = 'Unaudited';
    } else if (/\b(restated|reclassified|revised|retrospective)\b/.test(combined)) {
      res.auditStatus = 'Restated';
    }
  }

  // 5. Geographic Region
  if (!res.geography) {
    if (/\b(north america|united states|us|usa|canada)\b/.test(combined)) {
      res.geography = 'North America';
    } else if (/\b(europe|emea|united kingdom|uk|germany|france)\b/.test(combined)) {
      res.geography = 'EMEA / Europe';
    } else if (/\b(asia-pacific|asia pacific|apac|china|india|japan)\b/.test(combined)) {
      res.geography = 'APAC';
    } else if (/\b(latin america|latam|brazil|mexico)\b/.test(combined)) {
      res.geography = 'Latin America';
    } else if (/\b(international|overseas)\b/.test(combined)) {
      res.geography = 'International';
    } else if (/\b(domestic)\b/.test(combined)) {
      res.geography = 'Domestic';
    } else if (/\b(global|worldwide)\b/.test(combined)) {
      res.geography = 'Global';
    }
  }

  // 6. Forecast vs Actual
  if (res.isEstimateOrTarget === undefined) {
    res.isEstimateOrTarget = /\b(guidance|target|forecast|projected|outlook|budget|plan|estimate)\b/.test(combined);
  }

  // 7. Gross vs Net
  if (!res.isGrossOrNet) {
    if (/\bgross\b/.test(combined) && !/\bnet\b/.test(combined)) {
      res.isGrossOrNet = 'gross';
    } else if (/\bnet\b/.test(combined) && !/\bgross\b/.test(combined)) {
      res.isGrossOrNet = 'net';
    }
  }

  // 8. Collect meaningful contextual qualifiers
  const qualifiers: string[] = res.qualifiers ? [...res.qualifiers] : [];
  if (/\bnet of tax\b/.test(combined) && !qualifiers.includes('Net of tax')) qualifiers.push('Net of tax');
  if (/\bconstant (currency|fx)\b/.test(combined) && !qualifiers.includes('Constant FX')) qualifiers.push('Constant FX');
  if (/\bannualized\b/.test(combined) && !qualifiers.includes('Annualized')) qualifiers.push('Annualized');
  if (/\bpro forma\b/.test(combined) && !qualifiers.includes('Pro forma')) qualifiers.push('Pro forma');
  if (/\bdiluted\b/.test(combined) && !qualifiers.includes('Diluted')) qualifiers.push('Diluted');
  if (/\bbasic\b/.test(combined) && !qualifiers.includes('Basic')) qualifiers.push('Basic');
  if (/\bexcluding\s+[a-z\s]+\b/.test(combined)) {
    const exMatch = combined.match(/\b(excluding\s+[a-z\s]{3,20})\b/);
    if (exMatch && !qualifiers.includes(exMatch[1])) qualifiers.push(exMatch[1]);
  }
  if (qualifiers.length > 0) {
    res.qualifiers = qualifiers;
  }

  return res;
}

/**
 * Stopwords to exclude when extracting semantic concept tokens.
 * Retains fundamental financial descriptors (e.g. total, net, gross, operating, contingent, tax)
 * because stripping them causes false-positive collisions across distinct accounting concepts.
 */
const METRIC_STOPWORDS = new Set([
  'the', 'of', 'and', 'in', 'for', 'from', 'at', 'by', 'on', 'with', 'to',
  'a', 'an', 'as', 'our', 'their', 'its', 'is', 'was', 'were', 'has', 'have'
]);

/**
 * Extract clean, normalized semantic tokens representing the core concept of a metric
 */
export function getMetricSemanticTokens(metricName: string): string[] {
  if (!metricName) return [];
  return metricName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !METRIC_STOPWORDS.has(t));
}

/**
 * Computes Jaccard semantic token similarity between two metric names (0.0 to 1.0)
 */
export function computeMetricTokenSimilarity(metricA: string, metricB: string): number {
  const tokensA = new Set(getMetricSemanticTokens(metricA));
  const tokensB = new Set(getMetricSemanticTokens(metricB));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersectionCount = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersectionCount++;
  }

  const unionCount = tokensA.size + tokensB.size - intersectionCount;
  return unionCount > 0 ? intersectionCount / unionCount : 0;
}

/**
 * Structural classification of a metric's underlying semantic concept.
 * Enforces strict semantic category boundaries across accounting and operational domains.
 */
export interface MetricConceptClassification {
  conceptId: string;
  conceptFamily: string;
  conceptLabel: string;
  isPercentageOrRatio: boolean;
  isGrowthMetric: boolean;
  isPerShare: boolean;
  isContingent: boolean;
  isSegment: boolean;
  segmentName?: string;
  isAdjusted: boolean;
}

/**
 * Classifies any metric into its rigorous underlying semantic concept and family.
 * Strictly separates fundamentally distinct financial items (e.g. Revenue vs Total Income vs Profit vs EBITDA vs Contingent Liabilities).
 */
export function classifyMetricConcept(
  metricName: string,
  evidenceText = '',
  context?: FactContext
): MetricConceptClassification {
  const m = (metricName || '').toLowerCase().trim();
  const ev = (evidenceText || '').toLowerCase().trim();
  const combined = `${m} ${ev}`;

  const isPercentOrRatio =
    /\b(margin|ratio|percentage|pct|yield|rate)\b/.test(m) ||
    m.includes('%') ||
    context?.basis?.toLowerCase().includes('margin') ||
    false;

  const isGrowth =
    /\b(growth|growth rate|yoy|cagr|increase of|decrease of)\b/.test(m) ||
    (/\b(growth|yoy|cagr)\b/.test(ev) && isPercentOrRatio);

  const isPerShare = /\b(eps|earnings per share|per share|dps|dividend per share)\b/.test(m);

  const isAdjusted = /\b(adjusted|adj\.?|non-gaap|non gaap|core|underlying)\b/.test(combined);

  // 1. Contingent Liabilities & Off-Balance-Sheet Commitments
  // CRITICAL: Contingent liabilities (such as disputed tax claims or guarantees) are NEVER profits, revenues, or recognized expenses.
  if (/\b(contingent|contingency|pending litigation|disputed matter|bank guarantee)\b/.test(m)) {
    return {
      conceptId: 'contingent_liability',
      conceptFamily: 'contingency',
      conceptLabel: 'Contingent Liabilities',
      isPercentageOrRatio: false,
      isGrowthMetric: false,
      isPerShare: false,
      isContingent: true,
      isSegment: false,
      isAdjusted: false,
    };
  }

  // 2. Margins (Percentage Ratios)
  if (isPercentOrRatio && !isGrowth) {
    if (/\bgross margin\b/.test(m)) {
      return { conceptId: 'margin_gross', conceptFamily: 'margin', conceptLabel: 'Gross Margin (%)', isPercentageOrRatio: true, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted };
    }
    if (/\bebitda margin\b/.test(m)) {
      return { conceptId: 'margin_ebitda', conceptFamily: 'margin', conceptLabel: 'EBITDA Margin (%)', isPercentageOrRatio: true, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted };
    }
    if (/\b(operating margin|ebit margin)\b/.test(m)) {
      return { conceptId: 'margin_operating', conceptFamily: 'margin', conceptLabel: 'Operating Margin (%)', isPercentageOrRatio: true, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted };
    }
    if (/\b(net margin|profit margin|pat margin)\b/.test(m)) {
      return { conceptId: 'margin_net', conceptFamily: 'margin', conceptLabel: 'Net Profit Margin (%)', isPercentageOrRatio: true, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted };
    }
    return {
      conceptId: `ratio_${getMetricSemanticTokens(m).slice(0, 2).join('_')}`,
      conceptFamily: 'ratio',
      conceptLabel: metricName,
      isPercentageOrRatio: true,
      isGrowthMetric: false,
      isPerShare: false,
      isContingent: false,
      isSegment: false,
      isAdjusted,
    };
  }

  // 3. Growth Rates
  if (isGrowth) {
    return {
      conceptId: `growth_${getMetricSemanticTokens(m).slice(0, 2).join('_')}`,
      conceptFamily: 'growth_rate',
      conceptLabel: `Growth Rate: ${metricName}`,
      isPercentageOrRatio: true,
      isGrowthMetric: true,
      isPerShare: false,
      isContingent: false,
      isSegment: false,
      isAdjusted,
    };
  }

  // 4. Per Share Metrics
  if (isPerShare) {
    if (/\bdiluted\b/.test(m)) {
      return { conceptId: 'eps_diluted', conceptFamily: 'per_share', conceptLabel: 'Diluted EPS', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: true, isContingent: false, isSegment: false, isAdjusted };
    }
    return { conceptId: 'eps_basic', conceptFamily: 'per_share', conceptLabel: 'Basic EPS', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: true, isContingent: false, isSegment: false, isAdjusted };
  }

  // 5. Total Income (Distinct accounting concept from Top-line Revenue and PAT)
  // In Ind AS / IFRS / GAAP, "Total Income" = Revenue from operations + Other income.
  if (/\btotal income\b/.test(m)) {
    return {
      conceptId: 'total_income',
      conceptFamily: 'income_total',
      conceptLabel: 'Total Income',
      isPercentageOrRatio: false,
      isGrowthMetric: false,
      isPerShare: false,
      isContingent: false,
      isSegment: false,
      isAdjusted,
    };
  }

  // 6. Other / Non-Operating Income
  if (/\b(other income|non-operating income|finance income|investment income)\b/.test(m)) {
    return {
      conceptId: 'other_income',
      conceptFamily: 'income_other',
      conceptLabel: 'Other / Non-Operating Income',
      isPercentageOrRatio: false,
      isGrowthMetric: false,
      isPerShare: false,
      isContingent: false,
      isSegment: false,
      isAdjusted,
    };
  }

  // 7. Top-line Revenue / Turnover / Sales / Billings
  if (/\b(revenue|turnover|sales|topline|top-line|billings|gross merchandise value|gmv)\b/.test(m)) {
    const isSegment = /\b(segment|division|unit|express parcel|part truckload|supply chain)\b/.test(m) || Boolean(context?.scopeDetail);
    return {
      conceptId: isSegment ? 'revenue_segment' : 'revenue_total',
      conceptFamily: 'revenue',
      conceptLabel: isSegment ? 'Segment Revenue' : 'Total Revenue',
      isPercentageOrRatio: false,
      isGrowthMetric: false,
      isPerShare: false,
      isContingent: false,
      isSegment,
      segmentName: context?.scopeDetail,
      isAdjusted,
    };
  }

  // 8. Net Profit / PAT (Profit After Tax)
  // CRITICAL: Bottom-line net profit after all expenses, interest, and taxes.
  if (/\b(profit after tax|pat\b|net profit|net income|net earnings|bottomline|bottom line)\b/.test(m)) {
    return {
      conceptId: isAdjusted ? 'net_profit_adjusted' : 'net_profit',
      conceptFamily: 'profit_net',
      conceptLabel: 'Net Profit / PAT',
      isPercentageOrRatio: false,
      isGrowthMetric: false,
      isPerShare: false,
      isContingent: false,
      isSegment: false,
      isAdjusted,
    };
  }

  // 9. Profit Before Tax (PBT)
  if (/\b(profit before tax|pbt\b|earnings before tax|ebt\b)\b/.test(m)) {
    return {
      conceptId: 'profit_before_tax',
      conceptFamily: 'profit_pbt',
      conceptLabel: 'Profit Before Tax (PBT)',
      isPercentageOrRatio: false,
      isGrowthMetric: false,
      isPerShare: false,
      isContingent: false,
      isSegment: false,
      isAdjusted,
    };
  }

  // 10. EBITDA / Operating Cash Earnings
  if (/\bebitda\b/.test(m)) {
    return {
      conceptId: isAdjusted ? 'ebitda_adjusted' : 'ebitda',
      conceptFamily: 'profit_ebitda',
      conceptLabel: isAdjusted ? 'Adjusted EBITDA' : 'EBITDA',
      isPercentageOrRatio: false,
      isGrowthMetric: false,
      isPerShare: false,
      isContingent: false,
      isSegment: false,
      isAdjusted,
    };
  }

  // 11. Operating Profit / EBIT / Operating Income
  if (/\b(operating income|operating profit|ebit\b|operating earnings)\b/.test(m)) {
    return {
      conceptId: isAdjusted ? 'operating_profit_adjusted' : 'operating_profit',
      conceptFamily: 'profit_operating',
      conceptLabel: isAdjusted ? 'Adjusted Operating Profit' : 'Operating Profit / EBIT',
      isPercentageOrRatio: false,
      isGrowthMetric: false,
      isPerShare: false,
      isContingent: false,
      isSegment: false,
      isAdjusted,
    };
  }

  // 12. Gross Profit
  if (/\bgross profit\b/.test(m)) {
    return {
      conceptId: 'gross_profit',
      conceptFamily: 'profit_gross',
      conceptLabel: 'Gross Profit',
      isPercentageOrRatio: false,
      isGrowthMetric: false,
      isPerShare: false,
      isContingent: false,
      isSegment: false,
      isAdjusted,
    };
  }

  // 13. Operating Expenses & Specific Cost Categories
  if (/\b(research and development|r&d|research & development)\b/.test(m)) {
    return { conceptId: 'expense_rd', conceptFamily: 'expense_rd', conceptLabel: 'R&D Expense', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted };
  }
  if (/\b(selling, general|sg&a|general and administrative|administrative expense)\b/.test(m)) {
    return { conceptId: 'expense_sga', conceptFamily: 'expense_sga', conceptLabel: 'SG&A Expense', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted };
  }
  if (/\b(employee benefit|staff cost|personnel cost|payroll)\b/.test(m)) {
    return { conceptId: 'expense_personnel', conceptFamily: 'expense_personnel', conceptLabel: 'Employee Benefit Expense', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted };
  }
  if (/\b(depreciation and amortization|depreciation|amortization|d&a)\b/.test(m)) {
    return { conceptId: 'expense_da', conceptFamily: 'expense_da', conceptLabel: 'Depreciation & Amortization', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted };
  }
  if (/\b(finance cost|interest expense|borrowing cost)\b/.test(m)) {
    return { conceptId: 'expense_finance', conceptFamily: 'expense_finance', conceptLabel: 'Finance Costs / Interest', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted };
  }
  if (/\b(income tax expense|tax expense|current tax|tax provision)\b/.test(m)) {
    return { conceptId: 'expense_tax', conceptFamily: 'expense_tax', conceptLabel: 'Income Tax Expense', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted };
  }
  if (/\b(cost of goods sold|cost of sales|cogs|operating expenses|total expenses|total expenditure)\b/.test(m)) {
    return { conceptId: 'expense_total', conceptFamily: 'expense_total', conceptLabel: 'Total / Operating Expenses', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted };
  }

  // 14. Cash Flow
  if (/\b(free cash flow|fcf)\b/.test(m)) {
    return { conceptId: 'free_cash_flow', conceptFamily: 'cash_flow_fcf', conceptLabel: 'Free Cash Flow', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted };
  }
  if (/\b(operating cash flow|cash from operations|cash flow from operating)\b/.test(m)) {
    return { conceptId: 'operating_cash_flow', conceptFamily: 'cash_flow_operating', conceptLabel: 'Operating Cash Flow', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted };
  }
  if (/\b(investing cash flow|cash used in investing)\b/.test(m)) {
    return { conceptId: 'investing_cash_flow', conceptFamily: 'cash_flow_investing', conceptLabel: 'Investing Cash Flow', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted };
  }
  if (/\b(financing cash flow|cash used in financing)\b/.test(m)) {
    return { conceptId: 'financing_cash_flow', conceptFamily: 'cash_flow_financing', conceptLabel: 'Financing Cash Flow', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted };
  }
  if (/\b(capital expenditure|capital expenditures|capex)\b/.test(m)) {
    return { conceptId: 'capex', conceptFamily: 'capex', conceptLabel: 'Capital Expenditure (Capex)', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted };
  }
  if (/\b(cash and cash equivalents|cash balance|bank balance|cash reserves)\b/.test(m)) {
    return { conceptId: 'cash_equivalents', conceptFamily: 'cash_balance', conceptLabel: 'Cash & Cash Equivalents', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted };
  }

  // 15. Balance Sheet: Assets, Liabilities, Equity, Debt
  if (/\b(total assets)\b/.test(m)) {
    return { conceptId: 'total_assets', conceptFamily: 'assets_total', conceptLabel: 'Total Assets', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted: false };
  }
  if (/\b(current assets)\b/.test(m)) {
    return { conceptId: 'current_assets', conceptFamily: 'assets_current', conceptLabel: 'Current Assets', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted: false };
  }
  if (/\b(non-current assets|fixed assets|property, plant and equipment|pp&e)\b/.test(m)) {
    return { conceptId: 'fixed_assets', conceptFamily: 'assets_fixed', conceptLabel: 'Fixed / Non-Current Assets', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted: false };
  }
  if (/\b(total liabilities)\b/.test(m)) {
    return { conceptId: 'total_liabilities', conceptFamily: 'liabilities_total', conceptLabel: 'Total Liabilities', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted: false };
  }
  if (/\b(current liabilities)\b/.test(m)) {
    return { conceptId: 'current_liabilities', conceptFamily: 'liabilities_current', conceptLabel: 'Current Liabilities', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted: false };
  }
  if (/\b(net debt)\b/.test(m)) {
    return { conceptId: 'net_debt', conceptFamily: 'debt_net', conceptLabel: 'Net Debt', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted: false };
  }
  if (/\b(total debt|borrowings|long-term debt|short-term debt)\b/.test(m)) {
    return { conceptId: 'total_debt', conceptFamily: 'debt', conceptLabel: 'Total Debt / Borrowings', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted: false };
  }
  if (/\b(total equity|shareholders equity|net worth|book value)\b/.test(m)) {
    return { conceptId: 'total_equity', conceptFamily: 'equity', conceptLabel: 'Total Equity / Net Worth', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted: false };
  }

  // 16. Operational & Physical Metrics
  // Human Capital / Employees
  if (/\b(headcount|employee|employees|staff|workforce|full-time equivalent|fte)\b/.test(m)) {
    return { conceptId: 'workforce_headcount', conceptFamily: 'workforce', conceptLabel: 'Workforce / Headcount', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted: false };
  }
  // Customers & Users
  if (/\b(customer count|customers|subscribers|active users|active clients|clients count)\b/.test(m)) {
    return { conceptId: 'customers_count', conceptFamily: 'customers', conceptLabel: 'Customers / Users', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted: false };
  }
  // Physical Volume & Activity
  if (/\b(shipments|parcels|packages|orders delivered|orders handled|units sold|freight volume|tonnage)\b/.test(m)) {
    return { conceptId: 'volume_activity', conceptFamily: 'volume_activity', conceptLabel: 'Physical Volume / Units', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted: false };
  }
  // Infrastructure & Network
  if (/\b(pincodes|facilities|warehouses|fulfillment centers|hubs|service centers|network reach|sq ft|square feet|fleet size)\b/.test(m)) {
    return { conceptId: 'infrastructure', conceptFamily: 'infrastructure', conceptLabel: 'Network / Infrastructure', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted: false };
  }
  // Contractual Backlog / RPO
  if (/\b(backlog|remaining performance obligations|rpo|order book)\b/.test(m)) {
    return { conceptId: 'contractual_backlog', conceptFamily: 'backlog', conceptLabel: 'Contractual Backlog', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted: false };
  }

  // 17. ESG & Environmental
  if (/\bscope 1\b/.test(m)) return { conceptId: 'emissions_scope_1', conceptFamily: 'esg_emissions', conceptLabel: 'Scope 1 GHG Emissions', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted: false };
  if (/\bscope 2\b/.test(m)) return { conceptId: 'emissions_scope_2', conceptFamily: 'esg_emissions', conceptLabel: 'Scope 2 GHG Emissions', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted: false };
  if (/\bscope 3\b/.test(m)) return { conceptId: 'emissions_scope_3', conceptFamily: 'esg_emissions', conceptLabel: 'Scope 3 GHG Emissions', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted: false };
  if (/\b(renewable energy|clean energy)\b/.test(m)) return { conceptId: 'renewable_energy', conceptFamily: 'esg_energy', conceptLabel: 'Renewable Energy', isPercentageOrRatio: false, isGrowthMetric: false, isPerShare: false, isContingent: false, isSegment: false, isAdjusted: false };

  // 18. Generic Unclassified Domain Metric
  const tokens = getMetricSemanticTokens(m);
  const primaryRoot = tokens[0] || 'unclassified';
  const slug = tokens.slice(0, 4).join('_') || 'unspecified';

  return {
    conceptId: `generic_${slug}`,
    conceptFamily: `domain_${primaryRoot}`,
    conceptLabel: metricName,
    isPercentageOrRatio: false,
    isGrowthMetric: false,
    isPerShare: false,
    isContingent: false,
    isSegment: false,
    isAdjusted,
  };
}

/**
 * Standardize metric names to a canonical cluster key for matching,
 * without any hard-coded domain or company-specific concepts.
 */
export function canonicalizeMetric(metricName: string): string {
  if (!metricName) return 'unspecified';
  const classification = classifyMetricConcept(metricName);
  return classification.conceptId;
}

/**
 * Standardize entity name for comparison
 */
export function canonicalizeEntity(entityName: string): string {
  if (!entityName) return 'primary_entity';
  const clean = entityName
    .toLowerCase()
    .replace(/\b(inc|corp|corporation|co|ltd|limited|llc|plc|group|holdings|technologies|company)\b/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return clean.length >= 2 ? clean : 'primary_entity';
}

/**
 * Complete normalization helper
 */
export function normalizeFact(
  entity: string,
  metric: string,
  rawValue: string,
  period: string,
  evidenceText: string = '',
  existingContext?: FactContext
): NormalizedFactData {
  const numeric = normalizeNumericValue(rawValue, evidenceText, existingContext);
  const normalizedPeriod = normalizePeriod(period);
  const cEntity = canonicalizeEntity(entity);
  const cMetric = canonicalizeMetric(metric);

  const standardKey = `${cEntity}::${cMetric}::${normalizedPeriod.key}`;

  return {
    ...numeric,
    normalizedPeriod,
    canonicalMetric: cMetric,
    standardKey,
  };
}
