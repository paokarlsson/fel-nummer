import Anthropic from '@anthropic-ai/sdk';
import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse } from './provider';

export const MODELS = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (snabb, billig)', input: 0.1, output: 0.5 },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (bättre repliker)', input: 2, output: 10 },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (bäst, dyrast)', input: 4, output: 20 },
] as const;

export const DEFAULT_MODEL = 'claude-haiku-5-5';

/** Uppskattad kostnad i USD. */
export function estimateCost(model: string, input: number, output: number): number {
  const m = MODELS.find((x) => x.id === model) ?? MODELS[0];
  return (input * m.input + output * m.output) / 1_000_000;
}

function client(apiKey: string) {
  // Nyckeln går bara till api.anthropic.com. Spelaren använder sin egen nyckel.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0, timeout: 60_000 });
}

function toLlmError(e: unknown): LlmError {
  if (e instanceof LlmError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new LlmError('auth', 'API-nyckeln godtogs inte.');
  }
  if (e instanceof Anthropic.RateLimitError) return new LlmError('rate', 'För många anrop just nu.');
  if (e instanceof Anthropic.InternalServerError) return new LlmError('rate', 'Tjänsten är överbelastad.');
  if (e instanceof Anthropic.APIConnectionError) return new LlmError('network', 'Inget nätverk.');
  if (e instanceof Anthropic.APIError) return new LlmError('other', e.message);
  return new LlmError('other', e instanceof Error ? e.message : String(e));
}

export class AnthropicProvider implements LlmProvider {
  id = 'anthropic';
  private structured = true;

  constructor(private apiKey: string) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    try {
      return await this.call(req, this.structured);
    } catch (e) {
      // Om strukturerad output inte stöds av modellen: försök igen utan.
      if (this.structured && e instanceof Anthropic.BadRequestError && /output_config|format|schema/i.test(e.message)) {
        this.structured = false;
        try {
          return await this.call(req, false);
        } catch (e2) {
          throw toLlmError(e2);
        }
      }
      throw toLlmError(e);
    }
  }

  private async call(req: LlmRequest, structured: boolean): Promise<LlmResponse> {
    const res = await client(this.apiKey).messages.create(
      {
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
        output_config: {
          effort: 'low',
          ...(structured && req.schema ? { format: { type: 'json_schema' as const, schema: req.schema } } : {}),
        },
      },
      { signal: req.signal },
    );
    if (res.stop_reason === 'refusal') throw new LlmError('refusal', 'Modellen avböjde.');
    const text = res.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    return { text, usage: { input: res.usage.input_tokens, output: res.usage.output_tokens } };
  }

  async validateKey(key: string): Promise<boolean> {
    try {
      await client(key).messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Svara bara: ok' }],
        output_config: { effort: 'low' },
      });
      return true;
    } catch (e) {
      const err = toLlmError(e);
      if (err.kind === 'auth') return false;
      throw err;
    }
  }
}
