import Anthropic from '@anthropic-ai/sdk';
import { env, requireEnv } from '@/lib/env';

// Anthropic client + structured-output helpers shared by every module. Feature
// slices build the system prompt (with cache_control on the static + per-user
// blocks) and a JSON tool schema, then call runToolCall() to get structured
// output — no fragile text parsing.
//
// Requests adapt to the configured model (ANTHROPIC_MODEL), so the app runs on
// both older and current Claude models without code changes:
//   • `temperature` is sent only to models that accept sampling parameters
//     (4.6 generation and older); newer models reject it with a 400.
//   • Forcing the tool call (tool_choice: tool) is used only on models that do
//     not think by default. The 5-generation models think by default, and
//     forced tool use conflicts with thinking (Opus 5.5 / Fable 5.1 reject it
//     outright) — there we ask for the tool via instructions and retry once.
//   • Thinking models get extra max_tokens headroom, because reasoning tokens
//     count against the same budget as the answer.

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

export interface ModelCaps {
  /** Accepts temperature / top_p / top_k. */
  sampling: boolean;
  /** Accepts tool_choice { type: 'tool' } without conflicting with thinking. */
  forcedToolChoice: boolean;
  /** Thinks by default, so needs max_tokens headroom for reasoning. */
  thinksByDefault: boolean;
}

// Models up to the 4.6 generation (and all Haiku / Claude 3): sampling + forced tools.
const LEGACY = /^claude-(?:3|haiku-4|(?:sonnet|opus)-4(?:-[0-6])?(?:-\d{8})?$)/;
// Opus 4.7 / 4.8: no sampling params, but thinking is off unless requested.
const NO_DEFAULT_THINKING = /^claude-opus-4-[78](?:$|-)/;

/**
 * What a model accepts. Unknown / future model ids get the modern profile
 * (no sampling, no forced tool, thinking headroom), which is the safe default.
 */
export function modelCaps(model: string): ModelCaps {
  if (LEGACY.test(model)) return { sampling: true, forcedToolChoice: true, thinksByDefault: false };
  if (NO_DEFAULT_THINKING.test(model)) return { sampling: false, forcedToolChoice: true, thinksByDefault: false };
  return { sampling: false, forcedToolChoice: false, thinksByDefault: true };
}

/**
 * Extra output budget for reasoning on thinking models. Kept so that the total
 * stays ≤ 20,000 — non-streaming requests much above that risk HTTP timeouts.
 */
const THINKING_HEADROOM = 12_000;
const MAX_NON_STREAMING_TOKENS = 20_000;

function outputBudget(requested: number, caps: ModelCaps): number {
  return caps.thinksByDefault ? Math.min(requested + THINKING_HEADROOM, MAX_NON_STREAMING_TOKENS) : requested;
}

/** Optional effort (ANTHROPIC_EFFORT=low|medium|high|xhigh|max), for models that support it. */
function effortParam(caps: ModelCaps): Record<string, unknown> {
  return env.anthropicEffort && !caps.sampling ? { output_config: { effort: env.anthropicEffort } } : {};
}

/** System prompt: a plain string, or text blocks (to attach cache_control). */
export type SystemPrompt = string | Anthropic.TextBlockParam[];

export interface ToolCallParams {
  system: SystemPrompt;
  messages: Anthropic.MessageParam[];
  tool: Anthropic.Tool;
  maxTokens?: number;
  /** Used only on models that accept sampling parameters (see modelCaps). */
  temperature?: number;
}

/** Append text after the (cached) system prompt without disturbing its prefix. */
function withInstruction(system: SystemPrompt, instruction: string): SystemPrompt {
  return typeof system === 'string'
    ? `${system}\n\n${instruction}`
    : [...system, { type: 'text', text: instruction }];
}

type CreateBody = Parameters<Anthropic['messages']['create']>[0];

function createMessage(body: Record<string, unknown>): Promise<Anthropic.Message> {
  // Cast: newer request fields (output_config) postdate this SDK's types; the
  // API accepts them. Non-streaming, so the result is always a Message.
  return anthropic().messages.create(body as unknown as CreateBody) as Promise<Anthropic.Message>;
}

function checkStop(res: Anthropic.Message, tool: string, budget: number): void {
  const stop = res.stop_reason as string | null;
  // A response cut off at max_tokens carries an incomplete tool input. Never
  // hand that to callers as if it were a full result — fail loudly so the route
  // returns an error instead of saving half a post or script.
  if (stop === 'max_tokens') throw new ClaudeTruncatedError(tool, budget);
  if (stop === 'refusal') throw new ClaudeRefusalError(tool);
}

const findToolUse = (res: Anthropic.Message) =>
  res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

/**
 * Run a single-tool message and return the model's tool input cast to T.
 * Throws ClaudeTruncatedError / ClaudeRefusalError, or a plain Error if the
 * model never calls the tool.
 */
export async function runToolCall<T>(params: ToolCallParams, model: string = MODEL): Promise<T> {
  const caps = modelCaps(model);
  const budget = outputBudget(params.maxTokens ?? 2048, caps);
  const name = params.tool.name;

  const base: Record<string, unknown> = {
    model,
    max_tokens: budget,
    tools: [params.tool],
    ...(caps.sampling ? { temperature: params.temperature ?? 0.7 } : {}),
    ...effortParam(caps),
  };

  if (caps.forcedToolChoice) {
    const res = await createMessage({
      ...base,
      system: params.system,
      tool_choice: { type: 'tool', name },
      messages: params.messages,
    });
    checkStop(res, name, budget);
    const block = findToolUse(res);
    if (!block) throw new Error('Claude returned no tool_use block');
    return block.input as T;
  }

  // Thinking models: ask for the tool instead of forcing it.
  const system = withInstruction(
    params.system,
    `Give your answer by calling the \`${name}\` tool exactly once. Do not answer in plain text.`,
  );
  const first = await createMessage({ ...base, system, tool_choice: { type: 'auto' }, messages: params.messages });
  checkStop(first, name, budget);
  const block = findToolUse(first);
  if (block) return block.input as T;

  // One nudge if the model replied in text. The assistant turn is echoed back
  // unchanged (thinking blocks included), as the API requires.
  const retry = await createMessage({
    ...base,
    system,
    tool_choice: { type: 'auto' },
    messages: [
      ...params.messages,
      { role: 'assistant', content: first.content },
      { role: 'user', content: `Call the \`${name}\` tool now with your answer.` },
    ],
  });
  checkStop(retry, name, budget);
  const second = findToolUse(retry);
  if (!second) throw new Error('Claude returned no tool_use block');
  return second.input as T;
}

export interface TextCallParams {
  system: SystemPrompt;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  /** Used only on models that accept sampling parameters (see modelCaps). */
  temperature?: number;
}

/** Plain-text completion with the same model adaptation as runToolCall. Returns '' if no text. */
export async function runText(params: TextCallParams, model: string = MODEL): Promise<string> {
  const caps = modelCaps(model);
  const budget = outputBudget(params.maxTokens ?? 1024, caps);
  const res = await createMessage({
    model,
    max_tokens: budget,
    system: params.system,
    messages: params.messages,
    ...(caps.sampling && params.temperature !== undefined ? { temperature: params.temperature } : {}),
    ...effortParam(caps),
  });
  checkStop(res, 'text', budget);
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  return text?.text.trim() ?? '';
}

/** The model hit max_tokens before finishing; the output is incomplete. */
export class ClaudeTruncatedError extends Error {
  constructor(tool: string, maxTokens: number) {
    super(`Claude output for "${tool}" was cut off at max_tokens=${maxTokens}`);
    this.name = 'ClaudeTruncatedError';
  }
}

/** The model declined the request (stop_reason "refusal"). */
export class ClaudeRefusalError extends Error {
  constructor(tool: string) {
    super(`Claude declined the "${tool}" request`);
    this.name = 'ClaudeRefusalError';
  }
}

/**
 * Helper to mark a system text block as cache-eligible (ephemeral prompt cache).
 * Cast keeps `cache_control` on the wire even on SDK versions whose TextBlockParam
 * type predates GA caching — the API accepts and honours the field.
 */
export function cached(text: string): Anthropic.TextBlockParam {
  return { type: 'text', text, cache_control: { type: 'ephemeral' } } as Anthropic.TextBlockParam;
}
