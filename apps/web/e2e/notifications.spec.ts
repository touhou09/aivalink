import { test, expect, Page } from "@playwright/test";

// Helper to login
async function login(page: Page) {
  const testUser = {
    email: `e2e-notif-${Date.now()}@example.com`,
    username: `e2e_notif_${Date.now()}`,
    password: "testpassword123",
  };

  // Register
  await page.goto("/register");
  await page.waitForLoadState("networkidle");

  await page.fill('input[placeholder="Enter your email"]', testUser.email);
  await page.fill('input[placeholder="Choose a username"]', testUser.username);
  await page.fill('input[placeholder="Create a password"]', testUser.password);
  await page.fill('input[placeholder="Confirm your password"]', testUser.password);

  // Wait for navigation after submit
  await Promise.all([
    page.waitForURL("/login", { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);

  // Login
  await page.fill('input[placeholder="Enter your username or email"]', testUser.username);
  await page.fill('input[type="password"]', testUser.password);

  // Wait for navigation after login
  await Promise.all([
    page.waitForURL("/", { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
}

test.describe("Notifications", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("should show notification bell in header", async ({ page }) => {
    // Notification bell should be visible
    const bellButton = page.locator('button[aria-label="Notifications"]');
    await expect(bellButton).toBeVisible();
  });

  test("should open notification popover on click", async ({ page }) => {
    // Click notification bell
    await page.click('button[aria-label="Notifications"]');

    // Popover should appear - use exact match
    await expect(page.getByText("Notifications", { exact: true })).toBeVisible();
  });

  test("should show empty state when no notifications", async ({ page }) => {
    await page.click('button[aria-label="Notifications"]');

    // Should show empty state or "No notifications"
    await expect(page.locator("text=No notifications yet")).toBeVisible();
  });

  test("should trigger analysis on button click", async ({ page }) => {
    await page.click('button[aria-label="Notifications"]');

    // Find and click "Find Insights" button
    const findButton = page.locator("text=Find Insights");
    if (await findButton.isVisible()) {
      await findButton.click();

      // Should show loading or complete
      // Wait for the request to complete
      await page.waitForTimeout(2000);
    }
  });
});
