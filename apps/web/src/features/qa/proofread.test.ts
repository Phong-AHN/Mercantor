import { describe, expect, it, vi } from 'vitest';
import type { PageDocument } from '@relay/storefront';
import { pageTextForProofreading, parseProofreadResponse, proofreadPage } from './proofread';

const PAGE =
  'Page copy: Free shipping on all orders. You will recieve your order in 3 days. Their is no minimum.';

const doc: PageDocument = {
  url: 'https://shop.example.com/',
  httpStatus: 200,
  title: 'Linen shirts',
  metaDescription: 'Breathable linen.',
  h1: ['Linen shirts'],
  text: 'Free shipping on all orders. You will recieve your order in 3 days. Their is no minimum.',
  images: [],
  links: [],
  consoleErrors: [],
  failedRequests: [],
};

describe('parseProofreadResponse', () => {
  it('keeps real, on-page mistakes and builds a reviewable finding', () => {
    const findings = parseProofreadResponse(
      {
        issues: [
          {
            kind: 'spelling',
            text: 'recieve',
            suggestion: 'receive',
            explanation: 'Common misspelling.',
            confidence: 97,
          },
          {
            kind: 'grammar',
            text: 'Their is',
            suggestion: 'There is',
            explanation: 'Wrong word.',
            confidence: 90,
          },
        ],
      },
      PAGE,
    );
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      category: 'SPELLING',
      severity: 'MEDIUM',
      detector: 'ai.spelling',
      source: 'AI',
      confidence: 97,
      suggestion: 'receive',
      evidenceContext: { text: 'recieve', suggestion: 'receive' },
    });
    expect(findings[0]!.evidenceText).toContain('You will recieve your order');
    expect(findings[1]).toMatchObject({
      category: 'GRAMMAR',
      severity: 'LOW',
      detector: 'ai.grammar',
    });
  });

  it('drops anything that is not actually on the page', () => {
    expect(
      parseProofreadResponse(
        {
          issues: [
            {
              kind: 'spelling',
              text: 'adress',
              suggestion: 'address',
              explanation: '',
              confidence: 99,
            },
          ],
        },
        PAGE,
      ),
    ).toEqual([]);
  });

  it('drops low-confidence, no-op, duplicate and malformed suggestions', () => {
    const findings = parseProofreadResponse(
      {
        issues: [
          {
            kind: 'spelling',
            text: 'recieve',
            suggestion: 'receive',
            explanation: '',
            confidence: 40,
          },
          {
            kind: 'spelling',
            text: 'orders',
            suggestion: 'orders',
            explanation: '',
            confidence: 99,
          },
          {
            kind: 'spelling',
            text: 'recieve',
            suggestion: 'receive',
            explanation: '',
            confidence: 95,
          },
          {
            kind: 'spelling',
            text: 'recieve',
            suggestion: 'receive',
            explanation: '',
            confidence: 96,
          },
          { kind: 'style', text: 'Free', suggestion: 'FREE', explanation: '', confidence: 99 },
          'nonsense',
        ],
      },
      PAGE,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.confidence).toBe(95);
  });

  it('survives an answer with no issues list at all', () => {
    expect(parseProofreadResponse(null, PAGE)).toEqual([]);
    expect(parseProofreadResponse({ something: 'else' }, PAGE)).toEqual([]);
  });
});

describe('proofreadPage', () => {
  it('does nothing and says why when no key is configured', async () => {
    const fetchImpl = vi.fn();
    const result = await proofreadPage(doc, { apiKey: '', fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.skipped).toMatch(/no Gemini API key/);
  });

  it('sends the key in a header, never the URL, and parses the JSON answer', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        issues: [
                          {
                            kind: 'spelling',
                            text: 'recieve',
                            suggestion: 'receive',
                            explanation: 'x',
                            confidence: 98,
                          },
                        ],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const result = await proofreadPage(doc, {
      apiKey: 'test-key',
      model: 'gemini-test',
      fetchImpl,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/models/gemini-test:generateContent');
    expect(url).not.toContain('test-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    expect(result.findings.map((finding) => finding.suggestion)).toEqual(['receive']);
  });

  it('reports a rejected key without throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 403 }));
    const result = await proofreadPage(doc, { apiKey: 'bad', fetchImpl });
    expect(result.findings).toEqual([]);
    expect(result.skipped).toMatch(/rejected/);
  });

  it('reports an unreadable answer without throwing', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }),
          { status: 200 },
        ),
    );
    const result = await proofreadPage(doc, { apiKey: 'k', fetchImpl });
    expect(result.skipped).toMatch(/unreadable/);
  });

  it('labels the parts of the page it sends', () => {
    const text = pageTextForProofreading(doc);
    expect(text).toContain('Title: Linen shirts');
    expect(text).toContain('Page copy: Free shipping');
  });
});
