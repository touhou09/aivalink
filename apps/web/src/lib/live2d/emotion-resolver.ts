export interface EmotionMotionMap {
  [emotion: string]: {
    motion: string;
    expression?: string;
    intensity?: number;
  };
}

const DEFAULT_EMOTION_MAP: EmotionMotionMap = {
  happy: { motion: "TapBody", expression: "smile", intensity: 1.0 },
  sad: { motion: "Idle", expression: "sad", intensity: 0.8 },
  angry: { motion: "Shake", expression: "angry", intensity: 1.0 },
  surprised: { motion: "Flick", expression: "surprised", intensity: 1.0 },
  neutral: { motion: "Idle", expression: "default", intensity: 0.5 },
  thinking: { motion: "Idle", expression: "thinking", intensity: 0.6 },
  embarrassed: { motion: "TapBody", expression: "embarrassed", intensity: 0.7 },
  excited: { motion: "Flick", expression: "smile", intensity: 1.0 },
  tired: { motion: "Idle", expression: "sad", intensity: 0.4 },
};

export function resolveEmotionMotion(
  emotion: string,
  customMap?: EmotionMotionMap
): { motion: string; expression: string; intensity: number } {
  const map = customMap || DEFAULT_EMOTION_MAP;
  const entry = map[emotion] || map.neutral || DEFAULT_EMOTION_MAP.neutral;
  return {
    motion: entry.motion,
    expression: entry.expression || "default",
    intensity: entry.intensity || 0.5,
  };
}
