/**
 * Energy System Constants
 * Decision D7: State-based UI + tap for gauge
 */

export const ENERGY_COSTS = {
  chat_lite: 1, // Haiku/4o-mini
  chat_standard: 5, // Sonnet/4o
  chat_premium: 10, // Opus/GPT-4.5
  image_recognition: 3,
  code_generation: 10,
} as const;

export const TIER_ENERGY = {
  free: { daily: 50, monthly: 1500 },
  plus: { daily: 500, monthly: 15000 },
  pro: { daily: 2000, monthly: 60000 },
  enterprise: { daily: Infinity, monthly: Infinity },
} as const;

export const MODEL_WEIGHTS = {
  lite: 0.2,
  standard: 1.0,
  premium: 5.0,
} as const;

export const ENERGY_THRESHOLDS = {
  full: 0.8, // >= 80%: energetic expression
  mid: 0.5, // >= 50%: normal
  low: 0.2, // >= 20%: tired expression (D7)
  depleted: 0, // 0%: exhausted, refill needed
} as const;
