import { test, expect } from "@playwright/test";

const AUTH_TOKEN = "mock-test-token";
const AUTH_USER = { id: "user-1", email: "test@example.com", username: "testuser" };
const CHARACTER_ID = "char-test-123";

/** Inject auth state into localStorage before page loads */
async function injectAuth(page: import("@playwright/test").Page) {
  await page.addInitScript(({ token, user }) => {
    const state = { state: { token, user, isAuthenticated: true }, version: 0 };
    localStorage.setItem("auth-storage", JSON.stringify(state));
  }, { token: AUTH_TOKEN, user: AUTH_USER });
}

/** Mock the WebSocket used by useGatewayChat */
async function mockWebSocket(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    // Replace global WebSocket with a lightweight mock
    class MockWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      readyState = MockWebSocket.OPEN;
      url: string;
      onopen: ((ev: Event) => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onclose: ((ev: CloseEvent) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;

      private _sentMessages: string[] = [];

      constructor(url: string) {
        super();
        this.url = url;
        // Fire onopen asynchronously so the component can set the handler first
        setTimeout(() => {
          const ev = new Event("open");
          this.dispatchEvent(ev);
          if (this.onopen) this.onopen(ev);

          // Send initial state message
          const stateMsg = new MessageEvent("message", {
            data: JSON.stringify({
              type: "state",
              emotion: "neutral",
              trust_level: "stranger",
              conversation_count: 0,
              energy: { current: 100, max: 100 },
            }),
          });
          this.dispatchEvent(stateMsg);
          if (this.onmessage) this.onmessage(stateMsg);
        }, 50);
      }

      send(data: string) {
        this._sentMessages.push(data);
        // Echo back a mock assistant response
        setTimeout(() => {
          const parsed = JSON.parse(data);
          if (parsed.type === "chat" || parsed.content) {
            const replyMsg = new MessageEvent("message", {
              data: JSON.stringify({
                type: "message",
                role: "assistant",
                content: "Mock reply from character",
                emotion: "happy",
                id: `msg-${Date.now()}`,
                timestamp: new Date().toISOString(),
              }),
            });
            this.dispatchEvent(replyMsg);
            if (this.onmessage) this.onmessage(replyMsg);
          }
        }, 100);
      }

      close() {
        this.readyState = MockWebSocket.CLOSED;
        const ev = new CloseEvent("close", { code: 1000, reason: "test" });
        this.dispatchEvent(ev);
        if (this.onclose) this.onclose(ev);
      }

      get sentMessages() {
        return this._sentMessages;
      }
    }

    (window as unknown as Record<string, unknown>).WebSocket = MockWebSocket;
  });
}

test.describe("ChatPage - Navigation and layout", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
    await mockWebSocket(page);
  });

  test("should load chat page for a character", async ({ page }) => {
    await page.goto(`/chat/${CHARACTER_ID}`);
    // Header shows the character id
    await expect(page.locator(`text=${CHARACTER_ID}`).first()).toBeVisible({ timeout: 8000 });
  });

  test("should show connection status indicator", async ({ page }) => {
    await page.goto(`/chat/${CHARACTER_ID}`);
    // Connection dot and text rendered in header
    await expect(page.locator("text=연결됨").or(page.locator("text=연결 중..."))).toBeVisible({ timeout: 8000 });
  });

  test("should show message input area", async ({ page }) => {
    await page.goto(`/chat/${CHARACTER_ID}`);
    await expect(page.locator('input[placeholder="메시지를 입력하세요..."]').or(
      page.locator('input[placeholder="연결 중..."]')
    )).toBeVisible({ timeout: 8000 });
  });

  test("should show send button", async ({ page }) => {
    await page.goto(`/chat/${CHARACTER_ID}`);
    await expect(page.locator('button[aria-label="Send message"]')).toBeVisible({ timeout: 8000 });
  });
});

test.describe("ChatPage - Sending messages", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
    await mockWebSocket(page);
  });

  test("should send a message on button click", async ({ page }) => {
    await page.goto(`/chat/${CHARACTER_ID}`);

    // Wait for connection
    await expect(page.locator("text=연결됨")).toBeVisible({ timeout: 8000 });

    const input = page.locator('input[placeholder="메시지를 입력하세요..."]');
    await input.fill("Hello, character!");
    await page.click('button[aria-label="Send message"]');

    // User message bubble should appear
    await expect(page.locator("text=Hello, character!")).toBeVisible({ timeout: 5000 });
    // Input should be cleared
    await expect(input).toHaveValue("");
  });

  test("should send message on Enter key press", async ({ page }) => {
    await page.goto(`/chat/${CHARACTER_ID}`);
    await expect(page.locator("text=연결됨")).toBeVisible({ timeout: 8000 });

    const input = page.locator('input[placeholder="메시지를 입력하세요..."]');
    await input.fill("Enter key message");
    await input.press("Enter");

    await expect(page.locator("text=Enter key message")).toBeVisible({ timeout: 5000 });
  });

  test("should receive mock assistant reply", async ({ page }) => {
    await page.goto(`/chat/${CHARACTER_ID}`);
    await expect(page.locator("text=연결됨")).toBeVisible({ timeout: 8000 });

    const input = page.locator('input[placeholder="메시지를 입력하세요..."]');
    await input.fill("Test message");
    await input.press("Enter");

    // Mock WS sends back "Mock reply from character"
    await expect(page.locator("text=Mock reply from character")).toBeVisible({ timeout: 5000 });
  });

  test("should not send empty messages", async ({ page }) => {
    await page.goto(`/chat/${CHARACTER_ID}`);
    await expect(page.locator("text=연결됨")).toBeVisible({ timeout: 8000 });

    const sendBtn = page.locator('button[aria-label="Send message"]');
    // Button should be disabled when input is empty
    await expect(sendBtn).toBeDisabled();
  });
});

test.describe("ChatPage - Unauthenticated access", () => {
  test("should redirect to login when not authenticated", async ({ page }) => {
    await page.goto(`/chat/${CHARACTER_ID}`);
    await expect(page).toHaveURL(/\/login/);
  });
});
