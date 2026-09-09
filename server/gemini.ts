/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from '@google/genai';
import { DocumentPage, ExtractedFact, FactCategory } from '../src/types.ts';
import { normalizeFact, extractFactContext } from '../src/lib/deterministic-normalizer.ts';
import { extractFactsDeterministically } from './fallback-extractor.ts';

let aiClient: GoogleGenAI | null = null;
const exhaustedModels = new Set<string>();

function getAiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY is not set. Will use deterministic extraction.');
      return null;
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

interface RawGeminiFact {
  pageNumber: number;
  entity: string;
  metric: string;
  category: string;
  rawValue: string;
  evidenceText: string;
  statement: string;
  period: string;
  basis?: string;
  scope?: string;
  notes?: string;
}

/**
 * Checks whether an error is a permanent/daily quota exhaustion on a model.
 */
function isQuotaExhaustionError(err: any): boolean {
  const msg = (err?.message || '').toLowerCase();
  const stringified = JSON.stringify(err || {}).toLowerCase();
  return (
    err?.status === 429 ||
    err?.code === 429 ||
    msg.includes('429') ||
    msg.includes('quota exceeded') ||
    msg.includes('resource_exhausted') ||
    msg.includes('generaterequestsperday') ||
    msg.includes('free_tier_requests') ||
    stringified.includes('generaterequestsperdayperprojectpermodel') ||
    stringified.includes('freetier')
  );
}

/**
 * Executes content generation with automatic model fallback and quota intelligence.
 * Prioritizes gemini-3.1-flash-lite (high throughput, active quota).
 */
async function generateWithRetry(
  ai: GoogleGenAI,
  prompt: string,
  systemInstruction: string,
  schema: any
): Promise<string> {
  // gemini-3.1-flash-lite has active free tier quota in this environment; gemini-3.8-flash as secondary
  const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
  const availableModels = candidateModels.filter(m => !exhaustedModels.has(m));

  if (availableModels.length === 0) {
    throw new Error('All available Gemini models have exhausted their free tier quota for this session.');
  }

  let lastError: any = null;

  for (const model of availableModels) {
    // If marked exhausted while in loop, skip
    if (exhaustedModels.has(model)) continue;

    try {
      const timeoutMs = 12000;
      const callPromise = ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      });

      const timerPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Gemini API call timed out after ${timeoutMs}ms`)), timeoutMs);
      });

      const response = await Promise.race([callPromise, timerPromise]);
      return response.text || '[]';
    } catch (err: any) {
      lastError = err;

      if (isQuotaExhaustionError(err)) {
        console.warn(
          `[FactLens] Model "${model}" hit quota limit (RESOURCE_EXHAUSTED). Marking exhausted for this session.`
        );
        exhaustedModels.add(model);
        continue;
      }

      console.warn(`[FactLens] Model "${model}" call failed: ${err?.message || 'Unknown error'}. Trying next model or fallback.`);
    }
  }

  throw lastError || new Error('All Gemini model requests failed.');
}

export interface ExtractionResult {
  facts: ExtractedFact[];
  mode: 'gemini' | 'deterministic-fallback';
  notice?: string;
}

/**
 * Extract semantic and numerical facts from document pages.
 * Tries Gemini first; automatically and seamlessly falls back to high-accuracy
 * deterministic extraction if Gemini quota is exceeded or unavailable.
 */
export async function extractFactsFromDocument(
  documentId: string,
  documentName: string,
  pages: DocumentPage[]
): Promise<ExtractionResult> {
  const ai = getAiClient();

  if (!ai) {
    const facts = extractFactsDeterministically(documentId, documentName, pages);
    return {
      facts,
      mode: 'deterministic-fallback',
      notice: 'Extracted using deterministic rule-based parser (API key unconfigured).',
    };
  }

  // If both models are known to be exhausted, fall back immediately without network delay
  if (exhaustedModels.has('gemini-3.1-flash-lite') && exhaustedModels.has('gemini-3.8-flash')) {
    console.log(`[FactLens] All Gemini free tier models exhausted. Using deterministic fallback for "${documentName}".`);
    const facts = extractFactsDeterministically(documentId, documentName, pages);
    return {
      facts,
      mode: 'deterministic-fallback',
      notice: 'Processed using deterministic extraction (Gemini free tier quota exhausted).',
    };
  }

  // For fact extraction, prioritize pages containing numerical or factual metrics
  let selectedPages = pages;
  if (pages.length > 15) {
    const hasDataRegex = /(?:[\$€£¥₹%]|revenue|income|profit|ebitda|margin|debt|assets|capex|growth|cr|crore|lakh|sales|earnings|cash|headcount|\d{2,})/i;
    const prioritized = pages.filter(p => hasDataRegex.test(p.text));
    selectedPages = prioritized.length >= 3 ? prioritized.slice(0, 15) : pages.slice(0, 15);
  }

  // Combine page texts with clear delimiter (max 2500 chars per page to ensure fast generation)
  const pageSections = selectedPages
    .map(p => `--- PAGE ${p.pageNumber} ---\n${p.text.slice(0, 2500)}`)
    .join('\n\n');

  const systemInstruction = `You are an expert financial and factual intelligence analyst for a Fact Knowledge Layer system.
Your task is to analyze the provided multi-page document and extract high-precision numerical and factual claims.

RULES:
1. Every extracted fact MUST accurately cite the exact page number where it appears.
2. Every extracted fact MUST include the verbatim evidence text quote (evidenceText) from that page.
3. Identify numerical metrics (e.g. Revenue, Operating Income, Net Income, Margins, Headcount, Segment Results, Cash Flow, Capex, Scope Emissions) as well as concrete categorical milestones.
4. Distinguish between reporting frameworks (e.g. GAAP vs Non-GAAP, Constant Currency vs Reported FX, Diluted vs Basic).
5. Extract the explicit reporting period (e.g. "Q4 2024", "FY 2024", "As of Dec 31, 2024").
6. Do NOT fabricate or estimate any facts; only extract what is grounded in the text.`;

  const prompt = `Extract all salient numerical and factual metrics from the following document (${documentName}):\n\n${pageSections}`;

  const schema = {
    type: Type.ARRAY,
    description: 'Array of extracted factual statements with source evidence and page citations',
    items: {
      type: Type.OBJECT,
      properties: {
        pageNumber: {
          type: Type.INTEGER,
          description: 'The exact page number (1-indexed) where this fact is stated',
        },
        entity: {
          type: Type.STRING,
          description: 'Company, organization, or primary entity the fact pertains to',
        },
        metric: {
          type: Type.STRING,
          description: 'Normalized metric name (e.g., Total Revenue, Net Income, Operating Margin, Headcount)',
        },
        category: {
          type: Type.STRING,
          description: 'financial, operational, workforce, environmental, strategic, or general',
        },
        rawValue: {
          type: Type.STRING,
          description: 'The raw text value as written, e.g. "$14.25 billion", "40,850 employees", "28.5%"',
        },
        evidenceText: {
          type: Type.STRING,
          description: 'Exact verbatim excerpt/sentence from the page serving as source evidence',
        },
        statement: {
          type: Type.STRING,
          description: 'Clear, readable declarative summary of the fact',
        },
        period: {
          type: Type.STRING,
          description: 'Reporting period or date, e.g. "Q4 2024", "Full Year 2024", "December 31, 2024"',
        },
        basis: {
          type: Type.STRING,
          description: 'GAAP, Non-GAAP, Adjusted, Constant Currency, etc. if applicable',
        },
        scope: {
          type: Type.STRING,
          description: 'Global, North America, Cloud division, Consolidated, etc.',
        },
        notes: {
          type: Type.STRING,
          description: 'Additional contextual notes or reconciling items if mentioned',
        },
      },
      required: [
        'pageNumber',
        'entity',
        'metric',
        'category',
        'rawValue',
        'evidenceText',
        'statement',
        'period',
      ],
    },
  };

  try {
    const responseText = await generateWithRetry(ai, prompt, systemInstruction, schema);
    let rawFacts: RawGeminiFact[] = [];
    try {
      rawFacts = JSON.parse(responseText.trim());
    } catch (parseErr) {
      console.error('Failed to parse Gemini JSON output:', responseText, parseErr);
      rawFacts = [];
    }

    if (!Array.isArray(rawFacts) || rawFacts.length === 0) {
      console.warn(`[FactLens] Gemini returned 0 facts for "${documentName}". Activating deterministic fallback.`);
      const fallbackFacts = extractFactsDeterministically(documentId, documentName, pages);
      return {
        facts: fallbackFacts,
        mode: 'deterministic-fallback',
        notice: 'Extracted using deterministic engine after empty model response.',
      };
    }

    // Deterministically normalize each extracted fact
    const extractedFacts: ExtractedFact[] = rawFacts.map((rf, idx) => {
      const factId = `${documentId}_p${rf.pageNumber}_f${idx + 1}`;
      const pageNum = Math.max(1, Math.min(rf.pageNumber || 1, pages.length || 1));
      const statedValue = rf.rawValue || '';
      const scope = rf.scope || 'Consolidated';

      // Extract multi-dimensional context from evidence and model signals
      const context = extractFactContext(
        rf.evidenceText || '',
        {
          basis: rf.basis || undefined,
          scope,
          notes: rf.notes || undefined,
        },
        rf.metric
      );

      const normalizedData = normalizeFact(
        rf.entity,
        rf.metric,
        statedValue,
        rf.period || 'Unspecified',
        rf.evidenceText || '',
        context
      );

      const category: FactCategory = [
        'financial',
        'operational',
        'workforce',
        'environmental',
        'strategic',
        'general',
      ].includes(rf.category?.toLowerCase())
        ? (rf.category.toLowerCase() as FactCategory)
        : 'general';

      return {
        id: factId,
        documentId,
        documentName,
        pageNumber: pageNum,
        entity: rf.entity || 'General',
        metric: rf.metric || 'Metric',
        value: statedValue,
        rawValue: statedValue,
        unit: normalizedData.unit,
        period: rf.period || 'Unspecified',
        scope: context.scope || scope,
        evidenceText: rf.evidenceText || '',
        confidence: 0.95,
        category,
        statement: rf.statement || `${rf.metric}: ${statedValue}`,
        context: {
          ...context,
          currency: normalizedData.currency,
          unit: normalizedData.unit,
        },
        normalized: normalizedData,
      };
    });

    return {
      facts: extractedFacts,
      mode: 'gemini',
    };
  } catch (extractionErr: any) {
    console.log(
      `[FactLens] Transitioning to deterministic extraction for "${documentName}". (${extractionErr?.message || 'Gemini unavailable'})`
    );
    const fallbackFacts = extractFactsDeterministically(documentId, documentName, pages);
    return {
      facts: fallbackFacts,
      mode: 'deterministic-fallback',
      notice:
        'Deterministic Extraction Active: Processed using deterministic pattern analysis because the Gemini free-tier quota was unavailable.',
    };
  }
}
