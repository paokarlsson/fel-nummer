import type { CaseFile } from '../engine/types';
import type { Rng } from '../engine/rng';
import type { LlmProvider, LlmRequest, LlmResponse } from './provider';

/**
 * Låtsassvar för demoläget och testerna. Personerna svarar med sina manusrader
 * (mockLines) i tur och ordning. Ingen nyckel och inget nätverk behövs.
 */
export class MockProvider implements LlmProvider {
  id = 'mock';
  private cursor: Record<string, number> = {};
  public calls = 0;

  constructor(private c: CaseFile, private rng: Rng = Math.random) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.calls++;
    const id = req.meta?.charId ?? '';
    const situation = req.meta?.situation ?? 'reply';
    const ch = this.c.characters.find((x) => x.id === id);
    const lines = ch?.mockLines?.length ? ch.mockLines : ['ok', 'hm', 'vem är det här?'];
    // I grupper och vid initiativ avstår man ibland, precis som en riktig agent.
    const abstain = situation !== 'reply' && this.rng() < 0.4;
    let text: string | null = null;
    if (!abstain) {
      const i = this.cursor[id] ?? 0;
      this.cursor[id] = i + 1;
      text = lines[i % lines.length];
    }
    const stress = Math.round(this.rng() * 2) - 1;
    return { text: JSON.stringify({ text, kanal: 'samma', stress, radera: false, forstar: false }), usage: { input: 0, output: 0 } };
  }

  async validateKey(): Promise<boolean> {
    return true;
  }
}
