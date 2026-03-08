/**
 * PII Scrubber - Client-side pre-screening
 * Decision D10: Defense-in-Depth (Client → Gateway → AI Service)
 * Layer 1: Pattern-based scrubbing before sending to LLM
 */

export type PiiType = "phone_kr" | "email" | "rrn" | "card";

interface PiiPattern {
  readonly name: PiiType;
  readonly regex: RegExp;
  readonly replacement: string;
}

const PATTERNS: readonly PiiPattern[] = [
  {
    name: "phone_kr",
    regex: /(?<!\d)01[016789]-?\d{3,4}-?\d{4}(?!\d)/g,
    replacement: "[전화번호]",
  },
  {
    name: "email",
    regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    replacement: "[이메일]",
  },
  {
    name: "rrn",
    regex: /(?<!\d)\d{6}-?[1-4]\d{6}(?!\d)/g,
    replacement: "[주민번호]",
  },
  {
    name: "card",
    regex: /(?<!\d)\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}(?!\d)/g,
    replacement: "[카드번호]",
  },
] as const;

export interface ScrubResult {
  readonly text: string;
  readonly detected: readonly PiiType[];
}

export class PiiScrubber {
  scrub(input: string): ScrubResult {
    let text = input;
    const detected: PiiType[] = [];

    for (const pattern of PATTERNS) {
      // Avoid regex.test() + regex.replace() with /g flag — test() advances
      // lastIndex on the shared RegExp, causing intermittent missed matches.
      const replaced = text.replace(pattern.regex, pattern.replacement);
      if (replaced !== text) {
        detected.push(pattern.name);
        text = replaced;
      }
    }

    return { text, detected };
  }
}
