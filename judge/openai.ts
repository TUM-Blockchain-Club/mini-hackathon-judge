import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { db, InputError } from '../lib/db';

export const judgeModelId = 'gpt-6-luna';
const budgetMicros = 33_000_000;
const maxInputTokens = 922_000;
const tokenCount = z.number().int().nonnegative();
const requestSchema = z.object({
  model: z.literal(judgeModelId),
  max_output_tokens: tokenCount.min(1).max(128_000),
  service_tier: z.literal('default'),
  store: z.literal(false),
  stream: z.literal(false).optional(),
  tools: z.array(z.object({ type: z.literal('function') })).optional(),
});
const usageSchema = z.object({
  input_tokens: tokenCount,
  output_tokens: tokenCount,
});

// USD millionths. Use the highest listed cache-write rate for every input token
// and include the long-context premium. This intentionally overcounts discounts.
function costCeiling(input: number, output: number) {
  return input > 272_000
    ? Math.ceil((input * 2 + output * 3) / 4)
    : Math.ceil((input + output * 2) / 4);
}

async function reserve(runId: string | null, ceiling: number) {
  return db().begin(async (tx) => {
    // Separate SQL statements give each waiter a fresh snapshot after it acquires the lock.
    await tx`SELECT singleton FROM event_settings WHERE singleton FOR UPDATE`;
    const [row] =
      await tx`INSERT INTO judge_token_charges(run_id, ceiling_micros)
      SELECT ${runId}, ${ceiling} WHERE ${ceiling}::bigint +
        (SELECT coalesce(sum(coalesce(settled_micros, ceiling_micros)), 0) FROM judge_token_charges) <= ${budgetMicros}
      RETURNING id`;
    if (!row)
      throw new InputError(
        'The remaining $33 event token budget cannot cover another request. Review the saved evidence.',
        409,
      );
    return String(row.id);
  });
}

async function settle(id: string, amount: number) {
  await db()`UPDATE judge_token_charges SET settled_micros=${amount}
    WHERE id=${id} AND settled_micros IS NULL`;
}

export const judgeProviderOptions = {
  openai: { store: false, serviceTier: 'default', reasoningEffort: 'low' },
} as const;

export function openaiModel(model: string, runId: string | null = null) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey?.startsWith('sk-'))
    throw new InputError(
      'Set GEMINI_API_KEY to your OpenAI project API key in Vercel Production and redeploy before judging.',
      503,
    );
  if (model !== judgeModelId)
    throw new InputError(
      'This frozen model has no OpenAI event budget rate. Review this run manually.',
      409,
    );
  return createOpenAI({
    apiKey,
    baseURL: 'https://api.openai.com/v1',
    fetch: async (url, init) => {
      // Meter each outbound request, including SDK retries and later tool steps.
      if (
        String(url) !== 'https://api.openai.com/v1/responses' ||
        init?.method !== 'POST' ||
        typeof init.body !== 'string'
      )
        throw new InputError('Unsupported judge API request.', 503);
      const request = requestSchema.parse(JSON.parse(init.body));
      const ceiling = costCeiling(maxInputTokens, request.max_output_tokens);
      const id = await reserve(runId, ceiling);
      const response = await fetch(url, { ...init, redirect: 'error' });
      if ([400, 401, 403, 404, 429].includes(response.status)) {
        await settle(id, 0);
      } else if (response.ok) {
        // A timeout or an unreadable/missing usage report keeps the full reservation.
        const body = await response
          .clone()
          .json()
          .catch(() => null);
        const usage = usageSchema.safeParse(body?.usage);
        if (
          usage.success &&
          usage.data.input_tokens <= maxInputTokens &&
          usage.data.output_tokens <= request.max_output_tokens
        )
          await settle(
            id,
            costCeiling(usage.data.input_tokens, usage.data.output_tokens),
          );
      }
      return response;
    },
  }).responses(model);
}
