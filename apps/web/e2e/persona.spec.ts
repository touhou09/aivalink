import { test, expect } from "@playwright/test";

test.describe("Persona Management", () => {
  const testUser = {
    email: `e2e-persona-${Date.now()}@example.com`,
    username: `e2e_persona_${Date.now()}`,
    password: "testpassword123",
  };

  test.beforeEach(async ({ page }) => {
    // Create unique user for each test
    const uniqueUser = {
      email: `e2e-persona-${Date.now()}@example.com`,
      username: `e2e_persona_${Date.now()}`,
      password: "testpassword123",
    };

    // Register
    await page.goto("/register");
    await page.waitForLoadState("networkidle");

    await page.fill('input[placeholder="Enter your email"]', uniqueUser.email);
    await page.fill('input[placeholder="Choose a username"]', uniqueUser.username);
    await page.fill('input[placeholder="Create a password"]', uniqueUser.password);
    await page.fill('input[placeholder="Confirm your password"]', uniqueUser.password);

    // Wait for navigation after submit
    await Promise.all([
      page.waitForURL("/login", { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    // Login
    await page.fill('input[placeholder="Enter your username or email"]', uniqueUser.username);
    await page.fill('input[type="password"]', uniqueUser.password);

    // Wait for navigation after login
    await Promise.all([
      page.waitForURL("/", { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);
  });

  test("should create a new persona", async ({ page }) => {
    await page.click("text=Create Persona");
    await expect(page).toHaveURL("/personas/new");

    // Fill in persona details
    await page.fill('input[name="name"]', "Test AI Persona");
    await page.fill('input[name="character_name"]', "Aria");
    await page.fill('textarea[name="persona_prompt"]', "You are a helpful AI assistant.");

    await page.click('button[type="submit"]');

    // Should redirect to dashboard and show the new persona
    await expect(page).toHaveURL("/");
    await expect(page.locator("text=Test AI Persona")).toBeVisible();
  });

  test("should show empty state when no personas", async ({ page }) => {
    await expect(page.locator("text=No personas yet")).toBeVisible();
  });
});
