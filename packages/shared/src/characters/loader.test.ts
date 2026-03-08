import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadCharacterConfig, validateCharacterConfig } from './loader';

describe('character yaml loader', () => {
  it('loads characters/kiara.yaml successfully', async () => {
    const config = await loadCharacterConfig(join(process.cwd(), '../../characters/kiara.yaml'));

    expect(config.id).toBe('kiara');
    expect(config.name).toBe('키아라');
    expect(config.emotions.default).toBe('neutral');
  });

  it('throws when required fields are missing', () => {
    expect(() =>
      validateCharacterConfig({
        name: 'Kiara',
      }),
    ).toThrow(/Missing required field: id/);
  });

  it('rejects invalid emotion value', () => {
    expect(() =>
      validateCharacterConfig({
        id: 'x',
        name: 'x',
        name_en: 'x',
        version: 1,
        persona: {
          age: 20,
          personality: 'p',
          speaking_style: 's',
          background: 'b',
          interests: [],
          quirks: [],
        },
        system_prompt: 'sp',
        emotions: {
          default: 'rage',
          transitions: {
            happy: 'h',
            sad: 's',
            angry: 'a',
            surprised: 'su',
            neutral: 'n',
            thinking: 't',
            embarrassed: 'e',
            excited: 'ex',
            tired: 'ti',
          },
        },
        trust_levels: {
          stranger: { unlock_at: 0, boundaries: 'b' },
          acquaintance: { unlock_at: 10, boundaries: 'b' },
          friend: { unlock_at: 50, boundaries: 'b' },
          close_friend: { unlock_at: 100, boundaries: 'b' },
        },
      }),
    ).toThrow(/Invalid emotion value/);
  });

  it('validates trust_levels order', () => {
    expect(() =>
      validateCharacterConfig({
        id: 'x',
        name: 'x',
        name_en: 'x',
        version: 1,
        persona: {
          age: 20,
          personality: 'p',
          speaking_style: 's',
          background: 'b',
          interests: [],
          quirks: [],
        },
        system_prompt: 'sp',
        emotions: {
          default: 'neutral',
          transitions: {
            happy: 'h',
            sad: 's',
            angry: 'a',
            surprised: 'su',
            neutral: 'n',
            thinking: 't',
            embarrassed: 'e',
            excited: 'ex',
            tired: 'ti',
          },
        },
        trust_levels: {
          stranger: { unlock_at: 0, boundaries: 'b' },
          acquaintance: { unlock_at: 10, boundaries: 'b' },
          friend: { unlock_at: 5, boundaries: 'b' },
          close_friend: { unlock_at: 100, boundaries: 'b' },
        },
      }),
    ).toThrow(/Invalid trust_levels order/);
  });
});
