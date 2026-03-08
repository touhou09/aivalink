import { test, expect } from "@playwright/test";

const AUTH_TOKEN = "mock-test-token";
const AUTH_USER = { id: "user-1", email: "test@example.com", username: "testuser" };
const PERSONA_ID = "persona-test-123";

async function injectAuth(page: import("@playwright/test").Page) {
  await page.addInitScript(({ token, user }) => {
    const state = { state: { token, user, isAuthenticated: true }, version: 0 };
    localStorage.setItem("auth-storage", JSON.stringify(state));
  }, { token: AUTH_TOKEN, user: AUTH_USER });
}

async function mockInstanceApis(page: import("@playwright/test").Page, startShouldFail = false) {
  // POST /api/v1/instances/:personaId/start
  await page.route(`/api/v1/instances/${PERSONA_ID}/start`, (route) => {
    if (startShouldFail) {
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Failed to start instance" }),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          instance_id: "inst-1",
          websocket_url: `/ws/vtuber/${PERSONA_ID}`,
          status: "running",
        }),
      });
    }
  });

  // DELETE /api/v1/instances/:personaId/stop
  await page.route(`/api/v1/instances/${PERSONA_ID}/stop`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "stopped" }),
    });
  });
}

async function mockVtuberWebSocket(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    class MockVTuberWS extends EventTarget {
      static OPEN = 1;
      static CLOSED = 3;

      readyState = MockVTuberWS.OPEN;
      url: string;
      onopen: ((ev: Event) => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onclose: ((ev: CloseEvent) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;

      constructor(url: string) {
        super();
        this.url = url;
        setTimeout(() => {
          const ev = new Event("open");
          this.dispatchEvent(ev);
          if (this.onopen) this.onopen(ev);
        }, 50);
      }

      send(_data: string) { /* no-op */ }

      close() {
        this.readyState = MockVTuberWS.CLOSED;
        const ev = new CloseEvent("close", { code: 1000 });
        this.dispatchEvent(ev);
        if (this.onclose) this.onclose(ev);
      }
    }

    (window as unknown as Record<string, unknown>).WebSocket = MockVTuberWS;
  });
}

test.describe("VTuberPlayPage - Initial UI (stopped state)", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
    await mockInstanceApis(page);
  });

  test("should show stopped status badge", async ({ page }) => {
    await page.goto(`/play/${PERSONA_ID}`);
    await expect(page.locator("text=stopped")).toBeVisible({ timeout: 8000 });
  });

  test("should show Start VTuber button", async ({ page }) => {
    await page.goto(`/play/${PERSONA_ID}`);
    await expect(page.locator('button:has-text("Start VTuber")')).toBeVisible({ timeout: 8000 });
  });

  test("should show Back navigation button", async ({ page }) => {
    await page.goto(`/play/${PERSONA_ID}`);
    await expect(page.locator('button:has-text("← Back")')).toBeVisible({ timeout: 8000 });
  });

  test("should show VTuber not started placeholder", async ({ page }) => {
    await page.goto(`/play/${PERSONA_ID}`);
    await expect(page.locator("text=VTuber not started")).toBeVisible({ timeout: 8000 });
  });

  test("should have mic button disabled when stopped", async ({ page }) => {
    await page.goto(`/play/${PERSONA_ID}`);
    await expect(page.locator('button[aria-label="Start listening"]')).toBeDisabled({ timeout: 8000 });
  });

  test("should have camera button disabled when stopped", async ({ page }) => {
    await page.goto(`/play/${PERSONA_ID}`);
    await expect(page.locator('button[aria-label="Open camera"]')).toBeDisabled({ timeout: 8000 });
  });

  test("should have text input disabled when stopped", async ({ page }) => {
    await page.goto(`/play/${PERSONA_ID}`);
    await expect(page.locator('input[placeholder="Type a message..."]')).toBeDisabled({ timeout: 8000 });
  });

  test("should not show history button when stopped", async ({ page }) => {
    await page.goto(`/play/${PERSONA_ID}`);
    await expect(page.locator('button[aria-label="Open chat history"]')).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe("VTuberPlayPage - Start instance", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
    await mockInstanceApis(page);
    await mockVtuberWebSocket(page);
  });

  test("should transition to starting state on Start VTuber click", async ({ page }) => {
    await page.goto(`/play/${PERSONA_ID}`);
    await expect(page.locator('button:has-text("Start VTuber")')).toBeVisible({ timeout: 8000 });

    await page.click('button:has-text("Start VTuber")');

    // Should briefly show "starting"
    await expect(page.locator("text=starting").or(page.locator("text=running"))).toBeVisible({ timeout: 5000 });
  });

  test("should show Stop button after start", async ({ page }) => {
    await page.goto(`/play/${PERSONA_ID}`);
    await page.click('button:has-text("Start VTuber")');

    await expect(page.locator('button:has-text("Stop")')).toBeVisible({ timeout: 10000 });
  });

  test("should show success toast after start", async ({ page }) => {
    await page.goto(`/play/${PERSONA_ID}`);
    await page.click('button:has-text("Start VTuber")');

    await expect(page.locator("text=VTuber Started")).toBeVisible({ timeout: 10000 });
  });
});

test.describe("VTuberPlayPage - Stop instance", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
    await mockInstanceApis(page);
    await mockVtuberWebSocket(page);
  });

  test("should return to stopped state on Stop click", async ({ page }) => {
    await page.goto(`/play/${PERSONA_ID}`);

    // Start first
    await page.click('button:has-text("Start VTuber")');
    await expect(page.locator('button:has-text("Stop")')).toBeVisible({ timeout: 10000 });

    // Then stop
    await page.click('button:has-text("Stop")');
    await expect(page.locator("text=stopped")).toBeVisible({ timeout: 8000 });
    await expect(page.locator('button:has-text("Start VTuber")')).toBeVisible();
  });
});

test.describe("VTuberPlayPage - Start failure", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
    await mockInstanceApis(page, true /* startShouldFail */);
  });

  test("should show error toast when start fails", async ({ page }) => {
    await page.goto(`/play/${PERSONA_ID}`);
    await page.click('button:has-text("Start VTuber")');

    await expect(page.locator("text=Error").first()).toBeVisible({ timeout: 8000 });
    // Should revert to error or stopped badge
    await expect(page.locator("text=error").or(page.locator("text=stopped"))).toBeVisible({ timeout: 5000 });
  });
});

test.describe("VTuberPlayPage - Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
    await mockInstanceApis(page);
  });

  test("should navigate back to dashboard on Back click", async ({ page }) => {
    await page.goto(`/play/${PERSONA_ID}`);
    await page.click('button:has-text("← Back")');
    await expect(page).toHaveURL("/", { timeout: 8000 });
  });
});

test.describe("VTuberPlayPage - Unauthenticated access", () => {
  test("should redirect to login when not authenticated", async ({ page }) => {
    await page.goto(`/play/${PERSONA_ID}`);
    await expect(page).toHaveURL(/\/login/);
  });
});
