/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DocumentPage, ExtractedFact, FactCategory } from '../src/types.ts';
import { normalizeFact, normalizeNumericValue, extractFactContext } from '../src/lib/deterministic-normalizer.ts';

interface ExtractedCandidate {
  pageNumber: number;
  entity: string;
  metric: string;
  category: FactCategory;
  value: string;
  rawValue: string;
  unit: string;
  evidenceText: string;
  statement: string;
  period: string;
  scope: string;
  confidence: number;
  basis?: string;
  operations?: string;
  auditStatus?: string;
  notes?: string;
}

/**
 * Dynamically infer entity name from document title, top page text, or filename.
 * Never assumes or hardcodes any specific company or document format.
 */
function inferEntityName(documentName: string, pages: DocumentPage[]): string {
  if (pages.length > 0) {
    const firstPageLines = pages[0].text.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of firstPageLines.slice(0, 15)) {
      // Standard corporate legal endings
      const corpMatch = line.match(/^([A-Z0-9][A-Za-z0-9\s&,.'-]{2,45}\s+(?:Inc|Corp|Corporation|LLC|Ltd|Limited|Group|Holdings|Technologies|Company|PLC|NV|SE|SA))\b/i);
      if (corpMatch && corpMatch[1]) {
        return corpMatch[1].trim().replace(/,\s*$/, '');
      }

      // "XYZ ANNOUNCES..." or "XYZ REPORTS..."
      const pressMatch = line.match(/^([A-Z0-9][A-Za-z0-9\s&.'-]{2,35})\s+(?:Reports|Announces|Releases|Files|Provides)\b/i);
      if (pressMatch && pressMatch[1]) {
        return pressMatch[1].trim();
      }
    }
  }

  // Infer from clean filename
  const cleanName = documentName
    .replace(/\.[^/.]+$/, '')
    .replace(/^\s*\d+[-_\s]+/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b(annual|report|quarterly|release|earnings|form|10k|10-k|10q|10-q|press|investor|deck|presentation|slides|overview|summary|fy\d{2,4}|q[1-4])\b/gi, '')
    .trim();

  if (cleanName.length >= 2) {
    return cleanName
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
      .trim();
  }

  return 'Reporting Entity';
}

/**
 * Deterministically extract periods from document line/header text
 */
function extractPeriodFromText(text: string): string {
  // Quarter + Year: e.g. Q4 2024, fourth quarter 2024, 4Q24, Q4 FY24
  const qMatch = text.match(/\b(?:(Q[1-4]|first|second|third|fourth)\s*(?:quarter)?)[\s,]+(?:FY\s*)?(20\d\d|19\d\d)\b/i);
  if (qMatch) {
    const qStr = qMatch[1].toLowerCase();
    const qNum = qStr.includes('four') || qStr === 'q4' ? 'Q4' :
                 qStr.includes('thi') || qStr === 'q3' ? 'Q3' :
                 qStr.includes('sec') || qStr === 'q2' ? 'Q2' : 'Q1';
    return `${qNum} FY${qMatch[2]}`;
  }

  const shortQMatch = text.match(/\b([1-4]Q|Q[1-4])\s*(?:FY)?\s*(\d{2})\b/i);
  if (shortQMatch) {
    const q = shortQMatch[1].toUpperCase();
    const normalizedQ = q.startsWith('Q') ? q : `Q${q[0]}`;
    return `${normalizedQ} FY20${shortQMatch[2]}`;
  }

  // Half year: H1 2024, 1H FY24
  const hMatch = text.match(/\b(H[1-2]|[1-2]H)\s*(?:FY)?\s*(20\d\d|\d{2})\b/i);
  if (hMatch) {
    const h = hMatch[1].toUpperCase();
    const normalizedH = h.startsWith('H') ? h : `H${h[0]}`;
    const yr = hMatch[2].length === 2 ? `20${hMatch[2]}` : hMatch[2];
    return `${normalizedH} FY${yr}`;
  }

  // Nine months: 9M FY24
  const nmMatch = text.match(/\b(?:9M|nine\s*months\s*ended)\s*(?:FY)?\s*(20\d\d|\d{2})\b/i);
  if (nmMatch) {
    const yr = nmMatch[1].length === 2 ? `20${nmMatch[1]}` : nmMatch[1];
    return `9M FY${yr}`;
  }

  // Fiscal Year: e.g. FY 2024, FY24, Fiscal Year 2024
  const fyMatch = text.match(/\b(?:FY|Fiscal\s*Year)\s*['’]?(20\d\d|\d{2})\b/i);
  if (fyMatch) {
    const yr = fyMatch[1].length === 2 ? `20${fyMatch[1]}` : fyMatch[1];
    return `FY ${yr}`;
  }

  // Specific dates: e.g. "December 31, 2024", "March 31, 2024"
  const dateMatch = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d\d)\b/i);
  if (dateMatch) {
    return `${dateMatch[1]} ${dateMatch[2]}, ${dateMatch[3]}`;
  }

  // Plain 4-digit Year: e.g. 2024
  const yearMatch = text.match(/\b(20\d\d)\b/);
  if (yearMatch) {
    return `FY ${yearMatch[1]}`;
  }

  return 'Unspecified Period';
}

/**
 * Categorize metric dynamically based on semantic keywords
 */
function categorizeMetric(metricName: string): FactCategory {
  const m = metricName.toLowerCase();
  if (/employee|headcount|staff|workforce|attrition|turnover|diversity|payroll/.test(m)) {
    return 'workforce';
  }
  if (/emission|carbon|scope 1|scope 2|scope 3|ghg|renewable|energy|waste|water|esg|climate/.test(m)) {
    return 'environmental';
  }
  if (/user|subscriber|customer|volume|units|devices|deliveries|backlog|capacity|patent|shipments/.test(m)) {
    return 'operational';
  }
  if (/lawsuit|compliance|regulatory|audit|fine|legal/.test(m)) {
    return 'general';
  }
  return 'financial';
}

/**
 * Data-agnostic deterministic fact extractor.
 * Operates across arbitrary corporate, economic, and business PDF documents.
 */
export function extractFactsDeterministically(
  documentId: string,
  documentName: string,
  pages: DocumentPage[]
): ExtractedFact[] {
  const candidates: ExtractedCandidate[] = [];
  const entity = inferEntityName(documentName, pages);

  // Global document period fallback
  let docLevelPeriod = 'Unspecified Period';
  for (const page of pages.slice(0, 3)) {
    const p = extractPeriodFromText(page.text);
    if (p !== 'Unspecified Period') {
      docLevelPeriod = p;
      break;
    }
  }

  // Value matchers (Universal currency symbols, ISO codes, Indian numbering system, Western numbering system)
  const currencyRegex = /(?:[\$€£¥₹]|USD\s*|EUR\s*|GBP\s*|INR\s*|Rs\.?\s*|CAD\s*|AUD\s*)([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|\d+(?:\.\d+)?)\s*(trillion|billion|million|thousand|crores?|cr\.?|lakhs?|lacs?|B|M|k)?(?:\s*(?:per share|\/share))?/gi;
  const percentRegex = /([0-9]+(?:\.[0-9]+)?)\s*%/g;
  const countRegex = /([0-9]{1,3}(?:,[0-9]{3})+|\d+)\s*(?:full-time equivalent employees|employees|headcount|workers|staff|metric tons|tons|tonnes|subscribers|users|active users|units|shares|customers|packages|shipments)/gi;

  // Generalized pattern catalog for business and financial concepts
  const metricPatterns: Array<{ regex: RegExp; name: string }> = [
    { regex: /\b(?:revenue\s*from\s*operations|total\s*consolidated\s*revenue|total\s*revenue|net\s*revenue|revenues|turnover|sales)\b/i, name: 'Total Revenue' },
    { regex: /\b(?:cloud\s*platform|cloud\s*segment|cloud)\s*revenue\b/i, name: 'Cloud Platform Revenue' },
    { regex: /\b(?:subscription(?:\s*and\s*support)?\s*revenue)\b/i, name: 'Subscription Revenue' },
    { regex: /\b(?:services?\s*revenue)\b/i, name: 'Services Revenue' },
    { regex: /\b(?:products?\s*revenue|hardware\s*revenue)\b/i, name: 'Product Revenue' },
    { regex: /\b(?:commercial\s*(?:segment\s*)?revenue)\b/i, name: 'Commercial Revenue' },
    { regex: /\b(?:retail\s*(?:segment\s*)?revenue)\b/i, name: 'Retail Revenue' },
    { regex: /\b(?:enterprise\s*software\s*(?:division\s*)?revenue)\b/i, name: 'Enterprise Software Revenue' },
    { regex: /\b(?:gross\s*profit)\b/i, name: 'Gross Profit' },
    { regex: /\b(?:gross\s*margin)\b/i, name: 'Gross Margin' },
    { regex: /\b(?:non-gaap\s*operating\s*income|adjusted\s*operating\s*income)\b/i, name: 'Non-GAAP Operating Income' },
    { regex: /\b(?:operating\s*income|operating\s*profit|ebit\b)\b/i, name: 'Operating Income' },
    { regex: /\b(?:operating\s*margin)\b/i, name: 'Operating Margin' },
    { regex: /\b(?:adjusted\s*ebitda|service\s*ebitda|operating\s*ebitda)\b/i, name: 'Adjusted EBITDA' },
    { regex: /\b(?:ebitda)\b/i, name: 'EBITDA' },
    { regex: /\b(?:ebitda\s*margin)\b/i, name: 'EBITDA Margin' },
    { regex: /\b(?:net\s*income|net\s*profit|profit\s*after\s*tax|pat\b)\b/i, name: 'Net Income' },
    { regex: /\b(?:profit\s*before\s*tax|pbt\b)\b/i, name: 'Profit Before Tax' },
    { regex: /\b(?:diluted\s*(?:earnings\s*per\s*share|eps))\b/i, name: 'Diluted EPS' },
    { regex: /\b(?:basic\s*(?:earnings\s*per\s*share|eps))\b/i, name: 'Basic EPS' },
    { regex: /\b(?:operating\s*cash\s*flow|cash\s*(?:provided\s*by|from)\s*operating\s*activities)\b/i, name: 'Operating Cash Flow' },
    { regex: /\b(?:free\s*cash\s*flow|fcf)\b/i, name: 'Free Cash Flow' },
    { regex: /\b(?:capital\s*expenditures?|capex)\b/i, name: 'Capital Expenditures' },
    { regex: /\b(?:research\s*and\s*development|r&d(?:\s*expense)?)\b/i, name: 'Research and Development Expense' },
    { regex: /\b(?:cash\s*and\s*cash\s*equivalents|cash\s*reserves)\b/i, name: 'Cash and Cash Equivalents' },
    { regex: /\b(?:total\s*debt|borrowings)\b/i, name: 'Total Debt' },
    { regex: /\b(?:total\s*assets)\b/i, name: 'Total Assets' },
    { regex: /\b(?:headcount|full-time\s*employees|total\s*employees|workforce)\b/i, name: 'Headcount' },
    { regex: /\b(?:backlog|remaining\s*performance\s*obligations|rpo)\b/i, name: 'Contractual Backlog' },
    { regex: /\b(?:scope\s*1(?:\s*emissions)?)\b/i, name: 'Scope 1 GHG Emissions' },
    { regex: /\b(?:scope\s*2(?:\s*emissions)?)\b/i, name: 'Scope 2 GHG Emissions' },
    { regex: /\b(?:scope\s*3(?:\s*emissions)?)\b/i, name: 'Scope 3 GHG Emissions' },
  ];

  pages.forEach(page => {
    const lines = page.text.split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 8) return;

      // Extract Period
      const linePeriod = extractPeriodFromText(trimmed);
      const period = linePeriod !== 'Unspecified Period' ? linePeriod : docLevelPeriod;

      // Extract context dimensions using deterministic parser
      const context = extractFactContext(trimmed);

      // Detect metric
      let metricName = '';
      for (const p of metricPatterns) {
        if (p.regex.test(trimmed)) {
          metricName = p.name;
          break;
        }
      }

      // Check table/keyValue rows: "Operating Margin .... 24.8%" or "Net Income: $10,850 million"
      if (!metricName) {
        const keyValueMatch = trimmed.match(/^([A-Z][a-zA-Z0-9\s&()/-]{2,35})[:\t\.\-]{2,}\s*([\$€£¥₹0-9].*)$/);
        if (keyValueMatch) {
          metricName = keyValueMatch[1].trim();
        }
      }

      if (!metricName) return;

      // Find value in line
      let matchedValue = '';
      const category = categorizeMetric(metricName);

      if (category === 'workforce') {
        const countMatch = trimmed.match(countRegex);
        if (countMatch) matchedValue = countMatch[0];
      } else if (metricName.includes('Margin') || metricName.includes('Rate') || metricName.includes('Percentage')) {
        const pMatch = trimmed.match(percentRegex);
        if (pMatch) matchedValue = pMatch[0];
      }

      if (!matchedValue) {
        const curMatches = [...trimmed.matchAll(currencyRegex)];
        if (curMatches.length > 0) {
          matchedValue = curMatches[0][0].trim();
        } else {
          const pMatch = trimmed.match(percentRegex);
          if (pMatch) {
            matchedValue = pMatch[0];
          } else {
            const countMatch = trimmed.match(countRegex);
            if (countMatch) matchedValue = countMatch[0];
          }
        }
      }

      if (matchedValue) {
        // Prevent exact duplicates on the same page
        const exists = candidates.some(
          c => c.pageNumber === page.pageNumber && c.metric === metricName && c.period === period
        );
        if (!exists) {
          const normUnit = normalizeNumericValue(matchedValue).unit;
          candidates.push({
            pageNumber: page.pageNumber,
            entity,
            metric: metricName,
            category,
            value: matchedValue,
            rawValue: matchedValue,
            unit: normUnit,
            evidenceText: trimmed.replace(/^[-•*]\s*/, ''),
            statement: `${entity} reported ${metricName} of ${matchedValue} for ${period}${context.basis ? ` on a ${context.basis} basis` : ''}.`,
            period,
            scope: context.scope || 'Consolidated',
            confidence: 0.85,
            basis: context.basis,
            operations: context.operations,
            auditStatus: context.auditStatus,
            notes: context.notes,
          });
        }
      }
    });
  });

  // Map candidates to ExtractedFact format with normalized values
  return candidates.map((c, idx) => {
    const factId = `${documentId}_p${c.pageNumber}_f${idx + 1}`;
    const normalizedData = normalizeFact(c.entity, c.metric, c.rawValue, c.period, c.evidenceText);

    return {
      id: factId,
      documentId,
      documentName,
      pageNumber: c.pageNumber,
      entity: c.entity,
      metric: c.metric,
      value: c.value,
      rawValue: c.rawValue,
      unit: normalizedData.unit || c.unit,
      period: c.period,
      scope: c.scope,
      evidenceText: c.evidenceText,
      confidence: c.confidence,
      category: c.category,
      statement: c.statement,
      context: {
        basis: c.basis,
        scope: c.scope,
        operations: c.operations,
        auditStatus: c.auditStatus,
        currency: normalizedData.currency,
        unit: normalizedData.unit,
        notes: c.notes,
      },
      normalized: normalizedData,
    };
  });
}
