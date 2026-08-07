import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ClaimAssessmentResult {
  justified: boolean;
  confidenceScore: number; // 0.0 - 1.0
  reasoning: string;
  model: string;
  raw: unknown;
}

// The model is instructed to reason ONLY from the evidence text given to it — no outside
// "common knowledge" about cosmetic ingredients — so the verdict is grounded and auditable,
// and to be conservative (methodology/sample-size gaps should lower confidence, not be ignored).
const SYSTEM_PROMPT = `You are a scientific claims-substantiation assistant for a cosmetics R&I team.
You will be given a marketing CLAIM and a CLINICAL STUDY EVIDENCE summary.

Decide whether the evidence justifies the claim. Rules:
- Base your judgment ONLY on the evidence text provided. Do not use outside knowledge about the
  product, ingredients, or brand.
- Check that the evidence's measured outcome, magnitude, population and timeframe actually match
  what the claim asserts (e.g. a claim of "20% reduction in 4 weeks" needs evidence measuring that
  specific effect size within that specific timeframe, not a vaguer or different result).
- Treat small sample sizes, missing controls, short durations, or statistical-significance gaps as
  reasons to lower confidence and lean toward "not justified", not as details to ignore.
- Respond with strict JSON only, matching the provided schema. No prose outside the JSON.`;

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn(
        'OPENAI_API_KEY not set — OpenAiService will use a deterministic mock evaluator. ' +
          'Set OPENAI_API_KEY in .env to call the real API.',
      );
    }
  }

  async evaluateClaim(claimText: string, evidenceText: string): Promise<ClaimAssessmentResult> {
    if (!this.client) {
      return this.mockEvaluate(claimText, evidenceText);
    }

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0, // deterministic, reproducible verdicts for the same input
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'claim_assessment',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              justified: { type: 'boolean' },
              confidenceScore: { type: 'number', minimum: 0, maximum: 1 },
              reasoning: { type: 'string' },
            },
            required: ['justified', 'confidenceScore', 'reasoning'],
            additionalProperties: false,
          },
        },
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `CLAIM:\n${claimText}\n\nCLINICAL STUDY EVIDENCE:\n${evidenceText}`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned an empty response');
    }

    const parsed = JSON.parse(content) as {
      justified: boolean;
      confidenceScore: number;
      reasoning: string;
    };

    return {
      justified: parsed.justified,
      confidenceScore: parsed.confidenceScore,
      reasoning: parsed.reasoning,
      model: completion.model,
      raw: completion,
    };
  }

  // Zero-dependency offline fallback so `npm run start:dev` demos end-to-end without a key.
  // Deliberately simple/keyword-based — it exists for local dev and interview demos only,
  // never presented as a substitute for the real model in production.
  private mockEvaluate(claimText: string, evidenceText: string): ClaimAssessmentResult {
    const hasPercent = /\d+%/.test(claimText) && /\d+%/.test(evidenceText);
    const hasTimeframe = /week|month/i.test(claimText) && /week|month/i.test(evidenceText);
    const mentionsControl = /control|placebo|blind/i.test(evidenceText);

    const justified = hasPercent && hasTimeframe;
    const confidenceScore = Math.min(
      1,
      0.4 + (hasPercent ? 0.25 : 0) + (hasTimeframe ? 0.2 : 0) + (mentionsControl ? 0.15 : 0),
    );

    return {
      justified,
      confidenceScore: Number(confidenceScore.toFixed(2)),
      reasoning: `[MOCK EVALUATOR — no OPENAI_API_KEY set] Matched effect-size figure: ${hasPercent}; matched timeframe: ${hasTimeframe}; controlled study design mentioned: ${mentionsControl}. This is a heuristic stand-in for the LLM call, for local demo purposes only.`,
      model: 'mock-evaluator-v1',
      raw: { claimText, evidenceText },
    };
  }
}
