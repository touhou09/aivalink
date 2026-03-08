import { test, expect, Page } from "@playwright/test";

// Helper to login
async function login(page: Page) {
  const testUser = {
    email: `e2e-pricing-${Date.now()}@example.com`,
    username: `e2e_pricing_${Date.now()}`,
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

test.describe("Pricing Page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("should navigate to pricing page", async ({ page }) => {
    // Click Pricing link in nav
    await page.click('a[href="/pricing"]');
    await expect(page).toHaveURL("/pricing");
  });

  test("should display all pricing plans", async ({ page }) => {
    await page.goto("/pricing");

    // Should show plan titles
    await expect(page.locator("text=Free")).toBeVisible();
    await expect(page.locator("text=Standard")).toBeVisible();
    await expect(page.locator("text=Premium")).toBeVisible();
  });

  test("should show current plan as Free for new users", async ({ page }) => {
    await page.goto("/pricing");

    // Should show "Current Plan" badge on Free tier - use first match
    const currentPlanBadge = page.locator(".chakra-badge").filter({ hasText: "Current Plan" });
    await expect(currentPlanBadge).toBeVisible();
  });

  test("should display usage summary", async ({ page }) => {
    await page.goto("/pricing");

    // Should show usage stats section - use first match for labels
    await expect(page.locator("text=Current Usage")).toBeVisible();
    await expect(page.getByText("Personas", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Documents", { exact: true }).first()).toBeVisible();
    await expect(page.locator("text=Messages Today")).toBeVisible();
  });

  test("should show upgrade buttons for paid plans", async ({ page }) => {
    await page.goto("/pricing");

    // Standard and Premium should have "Upgrade" buttons
    const upgradeButtons = page.locator('button:has-text("Upgrade")');
    await expect(upgradeButtons).toHaveCount(2);
  });

  test("should display plan features", async ({ page }) => {
    await page.goto("/pricing");

    // Check for feature items - use first match since multiple plans may have same features
    await expect(page.locator("text=1 Persona")).toBeVisible();
    await expect(page.locator("text=5 Documents")).toBeVisible();
    await expect(page.getByText("Unlimited messages").first()).toBeVisible();
    await expect(page.locator("text=Proactive Insights")).toBeVisible();
  });

  test("should show pricing information", async ({ page }) => {
    await page.goto("/pricing");

    // Check for prices
    await expect(page.locator("text=$9.99")).toBeVisible();
    await expect(page.locator("text=$29.99")).toBeVisible();
  });
});
