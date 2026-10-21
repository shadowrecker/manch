import Anthropic from '@anthropic-ai/sdk';
import { env, requireEnv } from '@/lib/env';

// Anthropic client + a tool-forced call helper. Feature slices build the
// system prompt (with cache_control on the static + per-user blocks) and a JSON
// tool schema, then call runToolCall() to get validated structured output —
// no fragile text parsing. PRD §8.1 / §9.

let _client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: requireEnv(env.anthropicApiKey, 'ANTHROPIC_API_KEY'),
      maxRetries: 3,
    });
  }
  return _client;
}

export const MODEL = env.anthropicModel;

/** System prompt: a plain string, or text blocks (to attach cache_control). */
export type SystemPrompt = string | Anthropic.TextBlockParam[];

export interface ToolCallParams {
  system: SystemPrompt;
  messages: Anthropic.MessageParam[];
  tool: Anthropic.Tool;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Run a single-tool, tool-forced message and return the model's tool input
 * cast to T. Throws if the model fails to emit a tool_use block.
 */
export async function runToolCall<T>(params: ToolCallParams): Promise<T> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: params.maxTokens ?? 2048,
    temperature: params.temperature ?? 0.7,
    system: params.system,
    tools: [params.tool],
    tool_choice: { type: 'tool', name: params.tool.name },
    messages: params.messages,
  });
  const block = res.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );
  if (!block) throw new Error('Claude returned no tool_use block');
  return block.input as T;
}

/**
 * Helper to mark a system text block as cache-eligible (ephemeral prompt cache).
 * Cast keeps `cache_control` on the wire even on SDK versions whose TextBlockParam
 * type predates GA caching — the API accepts and honours the field.
 */
export function cached(text: string): Anthropic.TextBlockParam {
  return { type: 'text', text, cache_control: { type: 'ephemeral' } } as Anthropic.TextBlockParam;
}
