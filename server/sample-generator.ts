/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Builds a valid binary PDF buffer from an array of pages (each page is an array of text lines).
 * Uses PDF hex string literals (<...>) for 100% pristine preservation of symbols like $, %, quotes, etc.
 */
export function buildPdfBuffer(pageContents: string[][]): Buffer {
  const objects: string[] = [];
  const offsets: number[] = [];

  function addObj(content: string): number {
    objects.push(content);
    return objects.length;
  }

  // Object 1: Catalog
  addObj('<</Type/Catalog/Pages 2 0 R>>');
  // Object 2: Pages (placeholder)
  addObj('');
  // Object 3: Font
  addObj('<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>');

  const pageObjIds: number[] = [];

  for (let p = 0; p < pageContents.length; p++) {
    const lines = pageContents[p];
    let streamBody = 'BT\n/F1 11 Tf\n50 740 Td\n16 TL\n';

    for (let l = 0; l < lines.length; l++) {
      const line = lines[l];
      // Convert line text to hex string
      const hex = Buffer.from(line, 'latin1').toString('hex');
      if (l === 0) {
        // Title line slightly larger leading
        streamBody += `<${hex}> Tj T*\n`;
      } else {
        streamBody += `<${hex}> Tj T*\n`;
      }
    }
    streamBody += 'ET\n';

    const contentId = addObj(
      `<</Length ${Buffer.byteLength(streamBody, 'utf-8')}>>\nstream\n${streamBody}endstream`
    );

    const pageId = addObj(
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 3 0 R>>>>/Contents ${contentId} 0 R>>`
    );
    pageObjIds.push(pageId);
  }

  // Update Pages Object (2 0 obj)
  objects[1] = `<</Type/Pages/Kids[${pageObjIds.map(id => `${id} 0 R`).join(' ')}]/Count ${pageObjIds.length}>>`;

  let pdfText = '%PDF-1.4\n';
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdfText, 'utf-8'));
    pdfText += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdfText, 'utf-8');
  pdfText += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdfText += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdfText += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdfText, 'utf-8');
}

export interface SampleDataset {
  id: string;
  name: string;
  description: string;
  documents: {
    filename: string;
    buffer: Buffer;
  }[];
}

/**
 * Prepares built-in real PDF datasets for 1-click evaluation
 */
export function getSampleDatasets(): SampleDataset[] {
  // Dataset 1: Financial Earnings vs 10-K
  const pressReleaseLines: string[][] = [
    // Page 1
    [
      'ACME CLOUD TECHNOLOGIES INC. - PRESS RELEASE - FOURTH QUARTER & FISCAL YEAR 2024',
      'FOR IMMEDIATE RELEASE: January 28, 2025',
      'Acme Cloud Technologies Reports Record Fourth Quarter and Full Year 2024 Financial Results',
      '',
      'SAN FRANCISCO - Acme Cloud Technologies Inc. announced financial results for its fourth quarter and fiscal year ended December 31, 2024.',
      'Fourth Quarter 2024 Highlights:',
      '- Total Revenue reached $14.25 billion for Q4 2024, representing an increase of 14% year-over-year.',
      '- Non-GAAP Operating Income was $4.10 billion for Q4 2024, compared to $3.45 billion in Q4 2023.',
      '- Non-GAAP Operating Margin was 28.5% in the fourth quarter.',
      '- Non-GAAP Diluted Earnings Per Share (EPS) was $1.85 for Q4 2024, compared to $1.50 in Q4 2023.',
      '',
      'Full Year 2024 Financial Highlights:',
      '- Full Year 2024 Total Revenue was $52.80 billion, up 16% compared to $45.50 billion in fiscal 2023.',
      '- Non-GAAP Operating Income for the full year 2024 totaled $15.05 billion.',
      '- Operating Cash Flow for FY 2024 reached $14.80 billion.',
    ],
    // Page 2
    [
      'ACME CLOUD TECHNOLOGIES INC. - PRESS RELEASE (PAGE 2)',
      'Operational and Segment Performance:',
      '- Cloud Platform Segment Revenue contributed $18.60 billion for the full year 2024, expanding 24% YoY.',
      '- Free Cash Flow for full year 2024 was $11.40 billion, demonstrating disciplined cash conversion.',
      '- Research and Development (R&D) Expense for FY 2024 stood at $8.20 billion as the company accelerated AI infrastructure investments.',
      '- Global Workforce: The company estimated total headcount at approximately 42,500 employees worldwide as of December 31, 2024.',
      '- Committed Cloud Backlog: Management announced a record committed cloud customer backlog of $24.5 billion as of year-end.',
      '',
      'Non-GAAP Financial Measures Note:',
      'Non-GAAP operating income and EPS exclude stock-based compensation expense, restructuring costs, and acquisition-related amortization.',
      'A reconciliation of GAAP to Non-GAAP results is included in the company annual SEC filings.',
    ],
  ];

  const form10kLines: string[][] = [
    // Page 1
    [
      'UNITED STATES SECURITIES AND EXCHANGE COMMISSION - WASHINGTON, D.C. 20549',
      'FORM 10-K ANNUAL REPORT PURSUANT TO SECTION 13 OF THE SECURITIES EXCHANGE ACT OF 1934',
      'For the fiscal year ended December 31, 2024 - Commission File Number: 001-38910',
      'ACME CLOUD TECHNOLOGIES INC. (Exact name of registrant as specified in its charter)',
      '',
      'ITEM 7. MANAGEMENT DISCUSSION AND ANALYSIS OF FINANCIAL CONDITION AND RESULTS OF OPERATIONS',
      'Selected Audited Consolidated Financial Data (in millions, except per share amounts):',
      '',
      'Consolidated Statements of Operations for the Fiscal Year Ended December 31, 2024:',
      '- Total Consolidated Revenue: $52,800 million ($52.80 billion) for FY 2024.',
      '- Total Cost of Revenues: $18,480 million.',
      '- Gross Profit: $34,320 million for full year 2024.',
      '- GAAP Operating Margin for fiscal 2024 was 24.8% on a consolidated basis.',
      '- Net Income: $10,850 million for the year ended December 31, 2024.',
    ],
    // Page 2
    [
      'ACME CLOUD TECHNOLOGIES INC. - FORM 10-K ANNUAL REPORT (PAGE 2)',
      'Quarterly Financial Information (Unaudited, in millions):',
      'Three Months Ended December 31, 2024 (Fourth Quarter 2024):',
      '- Total Revenue for Q4 2024 was $14,250 million ($14.25 billion).',
      '- GAAP Operating Income was $3,650 million ($3.65 billion) for Q4 2024.',
      '- GAAP Diluted Earnings Per Share was $1.52 for the fourth quarter ended December 31, 2024.',
      '',
      'Reconciliation of GAAP to Non-GAAP Operating Results:',
      'GAAP Operating Income of $3,650 million for Q4 2024 is reconciled to Non-GAAP Operating Income of $4,100 million by adjusting for:',
      '1. Share-based compensation expense of $320 million.',
      '2. Facility restructuring and severance charges of $130 million.',
      'Total reconciliation adjustment between GAAP and Non-GAAP Operating Income is $450 million for Q4 2024.',
      '',
      'Cash Flows for Year Ended December 31, 2024:',
      '- Net cash provided by operating activities (Operating Cash Flow) was $14,800 million ($14.80 billion).',
      '- Capital expenditures were $3,400 million.',
      '- Free Cash Flow (Operating cash flow less capex) was $11,400 million ($11.40 billion) for FY 2024.',
    ],
    // Page 3
    [
      'ACME CLOUD TECHNOLOGIES INC. - FORM 10-K ANNUAL REPORT (PAGE 3)',
      'ITEM 1. BUSINESS - SEGMENT AND HUMAN CAPITAL DISCLOSURES',
      '',
      'Segment Reporting:',
      '- Cloud Platform Division Revenue was $18,600 million ($18.60 billion) for the year ended December 31, 2024.',
      '- Enterprise Software Division Revenue was $22,400 million for FY 2024.',
      '- Consumer Cloud Services Revenue was $11,800 million for FY 2024.',
      '',
      'Research and Development Audited Summary:',
      '- Consolidated Research and Development (R&D) Expense for FY 2024 was audited at $7,650 million ($7.65 billion).',
      '',
      'Human Capital Resources - Audited Headcount:',
      'As of December 31, 2024, Acme Cloud Technologies employed 40,850 full-time equivalent employees globally.',
      'This reflects audited year-end payroll records across all regional operating entities.',
      '',
      'Contractual Backlog and Obligations:',
      'Remaining performance obligations representing future contracted revenue commitments totaled $21,800 million to be recognized over 36 months.',
    ],
  ];

  return [
    {
      id: 'acme_financial_pair',
      name: 'Corporate Earnings Release vs SEC Form 10-K',
      description: 'Acme Cloud Technologies Q4 & FY2024 Press Release (2 pages) vs SEC 10-K Annual Report (3 pages). Contains corroborated metrics ($14.25B Q4 revenue, $52.80B FY revenue), reconciled GAAP vs Non-GAAP operating income ($3.65B vs $4.10B), and direct headcount contradiction (42,500 vs 40,850).',
      documents: [
        {
          filename: 'Acme_Q4_FY2024_Earnings_Release.pdf',
          buffer: buildPdfBuffer(pressReleaseLines),
        },
        {
          filename: 'Acme_2024_Form_10K_Annual_Report.pdf',
          buffer: buildPdfBuffer(form10kLines),
        },
      ],
    },
  ];
}
