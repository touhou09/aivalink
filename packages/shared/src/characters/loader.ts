import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import yaml from 'js-yaml';

export const VALID_EMOTIONS = [
  'happy',
  'sad',
  'angry',
  'surprised',
  'neutral',
  'thinking',
  'embarrassed',
  'excited',
  'tired',
] as const;

const TRUST_LEVEL_ORDER = ['stranger', 'acquaintance', 'friend', 'close_friend'] as const;

type Emotion = (typeof VALID_EMOTIONS)[number];
type TrustLevel = (typeof TRUST_LEVEL_ORDER)[number];

export interface CharacterYamlConfig {
  id: string;
  name: string;
  name_en: string;
  version: number;
  persona: {
    age: number;
    personality: string;
    speaking_style: string;
    background: string;
    interests: string[];
    quirks: string[];
  };
  system_prompt: string;
  emotions: {
    default: Emotion;
    transitions: Record<Emotion, string>;
  };
  trust_levels: Record<TrustLevel, { unlock_at: number; boundaries: string }>;
}

function assertRequiredString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required field: ${fieldName}`);
  }
}

function assertRequiredNumber(value: unknown, fieldName: string): asserts value is number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Missing required field: ${fieldName}`);
  }
}

export function validateCharacterConfig(config: unknown): CharacterYamlConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('Invalid character config: expected object');
  }

  const c = config as Record<string, unknown>;

  assertRequiredString(c.id, 'id');
  assertRequiredString(c.name, 'name');
  assertRequiredString(c.name_en, 'name_en');
  assertRequiredNumber(c.version, 'version');
  assertRequiredString(c.system_prompt, 'system_prompt');

  const persona = c.persona as Record<string, unknown> | undefined;
  if (!persona) {
    throw new Error('Missing required field: persona');
  }
  assertRequiredNumber(persona.age, 'persona.age');
  assertRequiredString(persona.personality, 'persona.personality');
  assertRequiredString(persona.speaking_style, 'persona.speaking_style');
  assertRequiredString(persona.background, 'persona.background');

  if (!Array.isArray(persona.interests)) {
    throw new Error('Missing required field: persona.interests');
  }
  if (!Array.isArray(persona.quirks)) {
    throw new Error('Missing required field: persona.quirks');
  }

  const emotions = c.emotions as Record<string, unknown> | undefined;
  if (!emotions) {
    throw new Error('Missing required field: emotions');
  }

  const defaultEmotion = emotions.default;
  if (typeof defaultEmotion !== 'string' || !VALID_EMOTIONS.includes(defaultEmotion as Emotion)) {
    throw new Error(`Invalid emotion value: ${String(defaultEmotion)}`);
  }

  const transitions = emotions.transitions as Record<string, unknown> | undefined;
  if (!transitions || typeof transitions !== 'object') {
    throw new Error('Missing required field: emotions.transitions');
  }

  for (const [emotion, entry] of Object.entries(transitions)) {
    if (!VALID_EMOTIONS.includes(emotion as Emotion)) {
      throw new Error(`Invalid emotion value: ${emotion}`);
    }

    if (typeof entry !== 'string') {
      throw new Error(`Missing required field: emotions.transitions.${emotion}`);
    }
  }

  const trustLevels = c.trust_levels as Record<string, unknown> | undefined;
  if (!trustLevels || typeof trustLevels !== 'object') {
    throw new Error('Missing required field: trust_levels');
  }

  const unlocks: number[] = [];
  for (const level of TRUST_LEVEL_ORDER) {
    const levelObj = trustLevels[level] as Record<string, unknown> | undefined;
    if (!levelObj || typeof levelObj !== 'object') {
      throw new Error(`Missing required field: trust_levels.${level}`);
    }

    assertRequiredNumber(levelObj.unlock_at, `trust_levels.${level}.unlock_at`);
    assertRequiredString(levelObj.boundaries, `trust_levels.${level}.boundaries`);
    unlocks.push(levelObj.unlock_at as number);
  }

  for (let i = 1; i < unlocks.length; i += 1) {
    if (unlocks[i] < unlocks[i - 1]) {
      throw new Error('Invalid trust_levels order: unlock_at must be non-decreasing by level');
    }
  }

  return c as unknown as CharacterYamlConfig;
}

export async function loadCharacterConfig(filePath: string): Promise<CharacterYamlConfig> {
  const absolute = resolve(filePath);
  const raw = await readFile(absolute, 'utf8');
  const parsed = yaml.load(raw);
  return validateCharacterConfig(parsed);
}
