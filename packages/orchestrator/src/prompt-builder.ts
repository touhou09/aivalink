/**
 * Builds an inference prompt from persona, memory context, and current message.
 */

import type { PersonaSnapshot, MemoryContext } from "@aivalink/shared";
import type { PromptMessage } from "./types";

/** Maximum number of recent conversation turns included in the prompt. */
export const MAX_RECENT_TURNS = 10;

const VALID_ROLES = new Set<PromptMessage["role"]>(["user", "assistant"]);

/** Sanitize a role string — returns the value if valid, otherwise "user". */
function sanitizeRole(role: string): PromptMessage["role"] {
  return VALID_ROLES.has(role as PromptMessage["role"])
    ? (role as PromptMessage["role"])
    : "user";
}

/**
 * Constructs a prompt message array for the inference layer.
 *
 * Order: system (persona + memory) → recent turns (last 10) → current user message.
 */
export function buildPrompt(
  persona: PersonaSnapshot,
  memoryContext: MemoryContext,
  currentMessage: string,
): PromptMessage[] {
  const messages: PromptMessage[] = [];

  // 1. System prompt from persona + dynamic MEMORY.md section
  const renderedMemory = memoryContext.renderedMemory.trim();
  const systemPrompt = renderedMemory.length > 0
    ? `${persona.personaPrompt}\n\n# MEMORY.md\n${renderedMemory}`
    : persona.personaPrompt;
  messages.push({ role: "system", content: systemPrompt });

  // 2. Recent conversation turns, truncated to last N
  const recentTurns = memoryContext.recentMessages.slice(-MAX_RECENT_TURNS);
  for (const turn of recentTurns) {
    messages.push({
      role: sanitizeRole(turn.role),
      content: turn.content,
    });
  }

  // 3. Current user message
  messages.push({ role: "user", content: currentMessage });

  return messages;
}
