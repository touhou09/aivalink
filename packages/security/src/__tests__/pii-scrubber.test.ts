import { describe, it, expect, beforeEach } from "vitest";
import { PiiScrubber } from "../pii-scrubber";
import type { ScrubResult, PiiType } from "../pii-scrubber";

describe("PiiScrubber", () => {
  let scrubber: PiiScrubber;

  beforeEach(() => {
    scrubber = new PiiScrubber();
  });

  // ─── AC: 010-1234-5678 → [전화번호] 변환 ──────────────────────────
  describe("phone_kr", () => {
    it("masks 010-1234-5678 with dashes", () => {
      const result = scrubber.scrub("제 번호는 010-1234-5678 입니다");
      expect(result.text).toBe("제 번호는 [전화번호] 입니다");
      expect(result.detected).toContain("phone_kr");
    });

    it("masks 01012345678 without dashes", () => {
      const result = scrubber.scrub("01012345678로 연락주세요");
      expect(result.text).toBe("[전화번호]로 연락주세요");
    });

    it("masks 010-123-4567 (3-digit middle)", () => {
      const result = scrubber.scrub("연락처: 010-123-4567");
      expect(result.text).toBe("연락처: [전화번호]");
    });

    it("masks other carrier prefixes (011, 016, 017, 018, 019)", () => {
      const prefixes = ["011", "016", "017", "018", "019"];
      for (const prefix of prefixes) {
        const result = scrubber.scrub(`${prefix}-1234-5678`);
        expect(result.text).toBe("[전화번호]");
        expect(result.detected).toContain("phone_kr");
      }
    });

    it("masks multiple phone numbers in one string", () => {
      const result = scrubber.scrub("010-1111-2222 그리고 010-3333-4444");
      expect(result.text).toBe("[전화번호] 그리고 [전화번호]");
      expect(result.detected).toEqual(["phone_kr"]);
    });
  });

  // ─── AC: test@email.com → [이메일] 변환 ────────────────────────────
  describe("email", () => {
    it("masks test@email.com", () => {
      const result = scrubber.scrub("이메일은 test@email.com 입니다");
      expect(result.text).toBe("이메일은 [이메일] 입니다");
      expect(result.detected).toContain("email");
    });

    it("masks complex email addresses", () => {
      const result = scrubber.scrub("user.name+tag@sub.domain.co.kr");
      expect(result.text).toBe("[이메일]");
    });

    it("masks multiple emails", () => {
      const result = scrubber.scrub("a@b.com 그리고 c@d.com");
      expect(result.text).toBe("[이메일] 그리고 [이메일]");
      expect(result.detected).toEqual(["email"]);
    });

    it("masks email followed by punctuation", () => {
      const result = scrubber.scrub("문의: test@email.com.");
      expect(result.text).toBe("문의: [이메일].");
      expect(result.detected).toContain("email");
    });

    it("preserves @ in non-email context", () => {
      const result = scrubber.scrub("트위터 @username 멘션");
      expect(result.text).toBe("트위터 @username 멘션");
      expect(result.detected).not.toContain("email");
    });
  });

  // ─── AC: 주민번호 패턴 탐지 + 마스킹 ──────────────────────────────
  describe("rrn (주민등록번호)", () => {
    it("masks RRN with dash (900101-1234567)", () => {
      const result = scrubber.scrub("주민번호 900101-1234567 입니다");
      expect(result.text).toBe("주민번호 [주민번호] 입니다");
      expect(result.detected).toContain("rrn");
    });

    it("masks RRN without dash (9001011234567)", () => {
      const result = scrubber.scrub("9001011234567");
      expect(result.text).toBe("[주민번호]");
    });

    it("masks gender codes 1 through 4", () => {
      for (const gender of ["1", "2", "3", "4"]) {
        const result = scrubber.scrub(`900101-${gender}234567`);
        expect(result.text).toBe("[주민번호]");
        expect(result.detected).toContain("rrn");
      }
    });

    it("does not match invalid gender digit (5-9, 0)", () => {
      const result = scrubber.scrub("900101-5234567");
      expect(result.text).toBe("900101-5234567");
      expect(result.detected).not.toContain("rrn");
    });
  });

  // ─── AC: 카드번호 패턴 탐지 + 마스킹 ──────────────────────────────
  describe("card (카드번호)", () => {
    it("masks card number with dashes (1234-5678-9012-3456)", () => {
      const result = scrubber.scrub("카드번호: 1234-5678-9012-3456");
      expect(result.text).toBe("카드번호: [카드번호]");
      expect(result.detected).toContain("card");
    });

    it("masks card number with spaces (1234 5678 9012 3456)", () => {
      const result = scrubber.scrub("1234 5678 9012 3456");
      expect(result.text).toBe("[카드번호]");
    });

    it("masks card number without separators (1234567890123456)", () => {
      const result = scrubber.scrub("1234567890123456");
      expect(result.text).toBe("[카드번호]");
    });

    it("masks multiple card numbers", () => {
      const result = scrubber.scrub("카드1: 1234-5678-9012-3456 카드2: 9876-5432-1098-7654");
      expect(result.text).toBe("카드1: [카드번호] 카드2: [카드번호]");
      expect(result.detected).toEqual(["card"]);
    });
  });

  // ─── AC: 정상 텍스트는 변환 없이 통과 ─────────────────────────────
  describe("clean text passthrough", () => {
    it("returns unchanged text when no PII found", () => {
      const input = "안녕하세요! 오늘 날씨가 좋네요.";
      const result = scrubber.scrub(input);
      expect(result.text).toBe(input);
      expect(result.detected).toEqual([]);
    });

    it("handles empty string", () => {
      const result = scrubber.scrub("");
      expect(result.text).toBe("");
      expect(result.detected).toEqual([]);
    });

    it("handles normal numbers that are not PII", () => {
      const result = scrubber.scrub("가격은 15000원 입니다");
      expect(result.text).toBe("가격은 15000원 입니다");
      expect(result.detected).toEqual([]);
    });

    it("handles text with special characters", () => {
      const input = "!@#$%^&*() 테스트 문장입니다~";
      const result = scrubber.scrub(input);
      expect(result.text).toBe(input);
      expect(result.detected).toEqual([]);
    });
  });

  // ─── AC: detected 배열에 탐지된 패턴 타입 포함 ────────────────────
  describe("detected array", () => {
    it("contains all PII types found in input", () => {
      const result = scrubber.scrub(
        "연락처 010-1234-5678 이메일 test@a.com 주민번호 900101-1234567 카드 1234-5678-9012-3456",
      );
      expect(result.detected).toContain("phone_kr");
      expect(result.detected).toContain("email");
      expect(result.detected).toContain("rrn");
      expect(result.detected).toContain("card");
      expect(result.detected).toHaveLength(4);
    });

    it("does not duplicate types for multiple matches of the same kind", () => {
      const result = scrubber.scrub("010-1111-2222 그리고 010-3333-4444");
      const phoneCount = result.detected.filter((d) => d === "phone_kr").length;
      expect(phoneCount).toBe(1);
    });

    it("returns detected types in pattern order (phone, email, rrn, card)", () => {
      const result = scrubber.scrub(
        "1234-5678-9012-3456 test@a.com 010-1234-5678 900101-1234567",
      );
      expect(result.detected).toEqual(["phone_kr", "email", "rrn", "card"]);
    });
  });

  // ─── Regression: lastIndex bug with repeated calls ────────────────
  describe("repeated calls (lastIndex regression)", () => {
    it("produces consistent results on consecutive calls with the same input", () => {
      const input = "010-1234-5678 test@a.com";
      for (let i = 0; i < 5; i++) {
        const result = scrubber.scrub(input);
        expect(result.text).toBe("[전화번호] [이메일]");
        expect(result.detected).toEqual(["phone_kr", "email"]);
      }
    });

    it("works correctly across multiple PiiScrubber instances", () => {
      const a = new PiiScrubber();
      const b = new PiiScrubber();
      const input = "010-9999-8888";

      expect(a.scrub(input).text).toBe("[전화번호]");
      expect(b.scrub(input).text).toBe("[전화번호]");
      expect(a.scrub(input).text).toBe("[전화번호]");
    });
  });

  // ─── Type safety ──────────────────────────────────────────────────
  describe("type safety", () => {
    it("ScrubResult has correct shape", () => {
      const result: ScrubResult = scrubber.scrub("hello");
      expect(result).toHaveProperty("text");
      expect(result).toHaveProperty("detected");
      expect(typeof result.text).toBe("string");
      expect(Array.isArray(result.detected)).toBe(true);
    });

    it("detected elements are valid PiiType values", () => {
      const validTypes: readonly PiiType[] = ["phone_kr", "email", "rrn", "card"];
      const result = scrubber.scrub(
        "010-1234-5678 test@a.com 900101-1234567 1234-5678-9012-3456",
      );
      for (const d of result.detected) {
        expect(validTypes).toContain(d);
      }
    });
  });
});
