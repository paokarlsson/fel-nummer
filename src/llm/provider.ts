export interface LlmRequest {
  system: string;
  prompt: string;
  model: string;
  maxTokens: number;
  /** JSON Schema för svaret (strukturerad output). */
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
  /** Bara för mock-leverantören: vem som svarar och i vilken situation. */
  meta?: { charId: string; situation: string };
}

export interface LlmResponse {
  text: string;
  usage?: { input: number; output: number };
}

export type LlmErrorKind = 'auth' | 'rate' | 'network' | 'refusal' | 'other';

export class LlmError extends Error {
  constructor(public kind: LlmErrorKind, message: string) {
    super(message);
  }
}

export interface LlmProvider {
  id: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
  validateKey(key: string): Promise<boolean>;
}
