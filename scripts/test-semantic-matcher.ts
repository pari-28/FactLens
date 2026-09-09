import { compareFactPair } from '../src/lib/deterministic-matcher.ts';
import { normalizeFact } from '../src/lib/deterministic-normalizer.ts';
import type { ExtractedFact } from '../src/types.ts';

function makeMockFact(partial: Partial<ExtractedFact>): ExtractedFact {
  const norm = normalizeFact(
    partial.entity || 'Acme Corp',
    partial.metric || '',
    partial.rawValue || partial.value || '',
    partial.period || 'FY 2024',
    partial.evidenceText || '',
    partial.context
  );

  return {
    id: partial.id || `fact_${Math.random().toString(36).slice(2, 8)}`,
    documentId: partial.documentId || 'doc_1',
    documentName: partial.documentName || 'Document 1',
    pageNumber: partial.pageNumber || 1,
    entity: partial.entity || 'Acme Corp',
    metric: partial.metric || '',
    value: partial.value || '',
    rawValue: partial.rawValue || partial.value || '',
    unit: partial.unit || 'INR',
    period: partial.period || 'FY 2024',
    scope: partial.scope || 'Consolidated',
    evidenceText: partial.evidenceText || '',
    confidence: partial.confidence || 0.95,
    category: partial.category || 'financial',
    statement: partial.statement || '',
    context: partial.context || {},
    normalized: norm,
  };
}

console.log('--- TEST 1: Total Income vs PAT Profitability ---');
const factTotalIncome = makeMockFact({
  id: 'fact_ti_1',
  documentId: 'doc_1',
  documentName: 'Annual Report FY24.pdf',
  metric: 'Total Income',
  value: '₹49,114.06 million',
  rawValue: 'Total income 49,114.06',
  unit: 'INR',
  period: 'FY 2024',
  evidenceText: 'Total income 49,114.06 million for the year ended March 31, 2024',
});

const factPAT = makeMockFact({
  id: 'fact_pat_1',
  documentId: 'doc_2',
  documentName: 'Shareholder Letter.pdf',
  metric: 'PAT profitability',
  value: '₹117 million',
  rawValue: '₹117 million',
  unit: 'INR',
  period: 'FY 2024',
  evidenceText: 'led to our first PAT profitability of ₹117 million',
});

const rel1 = compareFactPair(factTotalIncome, factPAT);
console.log('Result for Total Income vs PAT:', rel1 ? `${rel1.type} (${rel1.metric})` : 'NULL (Disqualified, as required)');
if (rel1 !== null) {
  console.error('FAIL: Total Income and PAT should NOT have a relationship!');
  process.exit(1);
} else {
  console.log('PASS: Total Income and PAT correctly rejected.');
}

console.log('\n--- TEST 2: Contingent Liabilities vs PAT ---');
const factContingent = makeMockFact({
  id: 'fact_cont_1',
  documentId: 'doc_1',
  documentName: 'Annual Report FY24.pdf',
  metric: 'Contingent Liabilities - Income Tax',
  value: '₹344.92 million',
  rawValue: '(a) Income tax 344.92',
  unit: 'INR',
  period: 'FY 2024',
  evidenceText: 'Contingent liabilities: (a) Income tax 344.92 million',
});

const rel2 = compareFactPair(factContingent, factPAT);
console.log('Result for Contingent Liabilities vs PAT:', rel2 ? `${rel2.type}` : 'NULL (Disqualified, as required)');
if (rel2 !== null) {
  console.error('FAIL: Contingent Liabilities and PAT should NOT have a relationship!');
  process.exit(1);
} else {
  console.log('PASS: Contingent Liabilities and PAT correctly rejected.');
}

console.log('\n--- TEST 3: Corroborated Same Metric & Period ---');
const factRevDoc1 = makeMockFact({
  id: 'fact_rev_1',
  documentId: 'doc_1',
  documentName: 'Filing A.pdf',
  metric: 'Revenue from Operations',
  value: '₹47,779 million',
  rawValue: 'Revenue from operations 47,779',
  unit: 'INR',
  period: 'FY 2024',
  evidenceText: 'Revenue from operations reached ₹47,779 million',
});

const factRevDoc2 = makeMockFact({
  id: 'fact_rev_2',
  documentId: 'doc_2',
  documentName: 'Filing B.pdf',
  metric: 'Operating Revenue',
  value: '₹47,779 million',
  rawValue: '47,779 million',
  unit: 'INR',
  period: 'FY 2024',
  evidenceText: 'Operating revenue of ₹47,779 million reported',
});

const rel3 = compareFactPair(factRevDoc1, factRevDoc2);
console.log('Result for Revenue A vs Revenue B:', rel3 ? `${rel3.type} (variance: ${rel3.explanation.varianceText})` : 'NULL');
if (!rel3 || rel3.type !== 'CORROBORATED') {
  console.error('FAIL: Expected CORROBORATED');
  process.exit(1);
} else {
  console.log('PASS: Corroborated validated.');
}

console.log('\n--- TEST 4: Contradicted Conflicting Figures ---');
const factRevConflict = makeMockFact({
  id: 'fact_rev_3',
  documentId: 'doc_2',
  documentName: 'Filing B.pdf',
  metric: 'Operating Revenue',
  value: '₹55,000 million',
  rawValue: '55,000 million',
  unit: 'INR',
  period: 'FY 2024',
  evidenceText: 'Operating revenue of ₹55,000 million reported',
});

const rel4 = compareFactPair(factRevDoc1, factRevConflict);
console.log('Result for Conflicting Revenue:', rel4 ? `${rel4.type} (variance: ${rel4.explanation.varianceText})` : 'NULL');
if (!rel4 || rel4.type !== 'CONTRADICTED') {
  console.error('FAIL: Expected CONTRADICTED');
  process.exit(1);
} else {
  console.log('PASS: Contradicted validated.');
}

console.log('\n--- TEST 5: Reconciled by Context (Interim Q4 vs Annual) ---');
const factRevQ4 = makeMockFact({
  id: 'fact_rev_q4',
  documentId: 'doc_3',
  documentName: 'Q4 Release.pdf',
  metric: 'Revenue from Operations',
  value: '₹12,500 million',
  rawValue: '12,500 million',
  unit: 'INR',
  period: 'Q4 FY 2024',
  evidenceText: 'Q4 revenue from operations was ₹12,500 million',
});

const rel5 = compareFactPair(factRevQ4, factRevDoc1);
console.log('Result for Q4 vs FY24:', rel5 ? `${rel5.type} (reason: ${rel5.explanation.varianceText})` : 'NULL');
if (!rel5 || rel5.type !== 'RECONCILED BY CONTEXT') {
  console.error('FAIL: Expected RECONCILED BY CONTEXT');
  process.exit(1);
} else {
  console.log('PASS: Reconciled by context validated.');
}

console.log('\nALL SEMANTIC MATCHER TESTS PASSED PERFECTLY!');
