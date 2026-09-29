import type { PageDocument } from '@relay/storefront';

/**
 * Spelling and grammar on a storefront page, by Google Gemini.
 *
 * The model proposes; this module decides what survives. A suggestion is kept
 * only when the text it flags appears word for word in the page (a model can
 * "quote" text that is not there), when it actually changes something, and
 * when the model is reasonably sure. Everything kept is filed as an AI
 * finding with status NEW - a person reviews it before a client ever sees it.
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const MAX_PAGE_CHARS = 15_000;
const MIN_CONFIDENCE = 60;
const MAX_FINDINGS = 25;
const TIMEOUT_MS = 25_000;

export interface ProofreadFinding {
  category: 'SPELLING' | 'GRAMMAR';
  severity: 'LOW' | 'MEDIUM';
  detector: string;
  title: string;
  /** The erroneous text plus a little surrounding copy, as it reads on the page. */
  evidenceText: string;
  evidenceContext: { text: string; suggestion: string; explanation: string };
  suggestion: string;
  recommendation: string;
  confidence: number;
  source: 'AI';
}

export const PROOFREAD_SYSTEM = [
  'You proofread the customer-facing copy of an English-language online store.',
  'Report only real spelling mistakes and clear grammar errors.',
  'Do NOT report: brand, product, collection or place names; SKUs, codes, prices, sizes, URLs, emails;',
  'deliberate stylisation or marketing voice; British vs American spelling differences;',
  'capitalisation of headings or buttons; missing punctuation at the end of short labels.',
  'For each problem return the exact erroneous text as it appears (copy it character for character,',
  'keep it short: the word or the few words that are wrong), the corrected text, a one-sentence',
  'explanation, and your confidence from 0 to 100. If the copy is not English, or has no real',
  'mistakes, return an empty list.',
].join(' ');

/** What the model reads: the page's visible copy, labelled, and capped in length. */
export function pageTextForProofreading(doc: PageDocument): string {
  const parts = [
    doc.title ? `Title: ${doc.title}` : null,
    doc.metaDescription ? `Meta description: ${doc.metaDescription}` : null,
    doc.h1.length > 0 ? `Heading: ${doc.h1.join(' | ')}` : null,
    doc.text ? `Page copy: ${doc.text}` : null,
  ].filter(Boolean);
  return parts.join('\n').slice(0, MAX_PAGE_CHARS);
}

export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    issues: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', enum: ['spelling', 'grammar'] },
          text: { type: 'STRING' },
          suggestion: { type: 'STRING' },
          explanation: { type: 'STRING' },
          confidence: { type: 'INTEGER' },
        },
        required: ['kind', 'text', 'suggestion', 'explanation', 'confidence'],
      },
    },
  },
  required: ['issues'],
} as const;

function excerpt(haystack: string, needle: string, padding = 60): string {
  const index = haystack.indexOf(needle);
  if (index < 0) return needle;
  const start = Math.max(0, index - padding);
  const end = Math.min(haystack.length, index + needle.length + padding);
  return `${start > 0 ? '…' : ''}${haystack.slice(start, end).trim()}${end < haystack.length ? '…' : ''}`;
}

/**
 * Turn the model's JSON into findings, keeping only what can be checked
 * against the page. Pure, so the rules are unit-tested without a network.
 */
export function parseProofreadResponse(raw: unknown, pageText: string): ProofreadFinding[] {
  const issues =
    raw && typeof raw === 'object' && Array.isArray((raw as { issues?: unknown }).issues)
      ? ((raw as { issues: unknown[] }).issues as Array<Record<string, unknown>>)
      : [];

  const seen = new Set<string>();
  const findings: ProofreadFinding[] = [];
  for (const issue of issues) {
    const kind =
      issue.kind === 'grammar' ? 'GRAMMAR' : issue.kind === 'spelling' ? 'SPELLING' : null;
    const text = typeof issue.text === 'string' ? issue.text.trim() : '';
    const suggestion = typeof issue.suggestion === 'string' ? issue.suggestion.trim() : '';
    const explanation = typeof issue.explanation === 'string' ? issue.explanation.trim() : '';
    const confidence =
      typeof issue.confidence === 'number'
        ? Math.round(Math.max(0, Math.min(100, issue.confidence)))
        : 0;

    if (!kind || !text || !suggestion) continue;
    if (text.length > 160 || text === suggestion) continue;
    if (confidence < MIN_CONFIDENCE) continue;
    // The check that makes this trustworthy: the flagged text must be on the page.
    if (!pageText.includes(text)) continue;
    const key = `${kind}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const short = text.length > 60 ? `${text.slice(0, 57)}…` : text;
    findings.push({
      category: kind,
      severity: kind === 'SPELLING' ? 'MEDIUM' : 'LOW',
      detector: kind === 'SPELLING' ? 'ai.spelling' : 'ai.grammar',
      title:
        kind === 'SPELLING'
          ? `Possible spelling mistake: "${short}"`
          : `Possible grammar issue: "${short}"`,
      evidenceText: excerpt(pageText, text).slice(0, 2000),
      evidenceContext: { text, suggestion, explanation },
      suggestion,
      recommendation: `Change "${short}" to "${suggestion}".${explanation ? ` ${explanation}` : ''}`,
      confidence,
      source: 'AI',
    });
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}

export interface ProofreadResult {
  findings: ProofreadFinding[];
  /** Why the check did not run or did not finish; shown to the person who pressed Check. */
  skipped?: string;
}

/**
 * Ask Gemini to proofread one page. Never throws: a failure here must not
 * lose the automated findings the same check already produced.
 */
export async function proofreadPage(
  doc: PageDocument,
  options: { apiKey: string | undefined; model?: string | undefined; fetchImpl?: typeof fetch },
): Promise<ProofreadResult> {
  if (!options.apiKey) return { findings: [], skipped: 'no Gemini API key is configured' };
  const pageText = pageTextForProofreading(doc);
  if (pageText.trim().length < 40) return { findings: [] };

  const model = options.model?.trim() || DEFAULT_GEMINI_MODEL;
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const response = await doFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'content-type': 'application/json',
          // A header, not ?key= - keys in URLs end up in logs.
          'x-goog-api-key': options.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: PROOFREAD_SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: pageText }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    );
    if (!response.ok) {
      return {
        findings: [],
        skipped:
          response.status === 400 || response.status === 403
            ? 'Gemini rejected the request (check the API key and model name)'
            : response.status === 429
              ? 'Gemini rate limit reached - try again shortly'
              : `Gemini returned ${response.status}`,
      };
    }
    const body = (await response.json()) as {
      promptFeedback?: { blockReason?: string };
      candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
    };
    if (body.promptFeedback?.blockReason) {
      return {
        findings: [],
        skipped: `Gemini declined the page (${body.promptFeedback.blockReason})`,
      };
    }
    const text =
      body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { findings: [], skipped: 'Gemini returned an unreadable answer' };
    }
    return { findings: parseProofreadResponse(parsed, pageText) };
  } catch (error) {
    return {
      findings: [],
      skipped:
        error instanceof Error && error.name === 'TimeoutError'
          ? 'Gemini did not answer in time'
          : 'Gemini could not be reached',
    };
  }
}
