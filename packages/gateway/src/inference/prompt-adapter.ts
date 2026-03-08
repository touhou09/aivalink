/**
 * Prompt Format Adapters
 * Converts between internal message format and provider-specific formats.
 * Claude expects system prompt separate from messages; OpenAI uses system role in messages array.
 */

export interface ClaudePrompt {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface OpenAIPrompt {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}

type InternalMessage = { role: string; content: string };

/**
 * Convert internal messages + system prompt to Claude API format.
 * Extracts any inline "system" messages and merges them with the personaPrompt.
 */
export function toClaudePrompt(
  messages: InternalMessage[],
  systemPrompt: string,
): ClaudePrompt {
  const systemParts: string[] = [systemPrompt];
  const filtered: ClaudePrompt["messages"] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemParts.push(msg.content);
    } else {
      filtered.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }
  }

  return {
    system: systemParts.filter(Boolean).join("\n\n"),
    messages: filtered,
  };
}

/**
 * Convert internal messages + system prompt to OpenAI API format.
 * Prepends systemPrompt as a "system" role message.
 */
export function toOpenAIPrompt(
  messages: InternalMessage[],
  systemPrompt: string,
): OpenAIPrompt {
  const result: OpenAIPrompt["messages"] = [];

  if (systemPrompt) {
    result.push({ role: "system", content: systemPrompt });
  }

  for (const msg of messages) {
    result.push({
      role: msg.role as "system" | "user" | "assistant",
      content: msg.content,
    });
  }

  return { messages: result };
}
