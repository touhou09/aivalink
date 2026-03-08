import { test, expect } from "@playwright/test";

// Helpers to set up mocked auth state via localStorage (authStore uses zustand/persist under "auth-storage")
const AUTH_TOKEN = "mock-test-token";
const AUTH_USER = { id: "user-1", email: "test@example.com", username: "testuser" };

async function mockAuthApis(page: import("@playwright/test").Page) {
  // POST /api/v1/auth/login -> token
  await page.route("/api/v1/auth/login", (route) => {
    const body = route.request().postData() ?? "";
    if (body.includes("wrongpassword") || body.includes("invalid")) {
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Invalid credentials" }),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: AUTH_TOKEN, token_type: "bearer" }),
      });
    }
  });

  // GET /api/v1/auth/me -> user
  await page.route("/api/v1/auth/me", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(AUTH_USER),
    });
  });
}

async function mockRegisterApi(page: import("@playwright/test").Page, fail = false) {
  await page.route("/api/v1/auth/register", (route) => {
    if (fail) {
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Username already exists" }),
      });
    } else {
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "user-1", email: "test@example.com", username: "testuser" }),
      });
    }
  });
}

/** Inject auth state directly into localStorage so PrivateRoute passes */
async function injectAuth(page: import("@playwright/test").Page) {
  await page.addInitScript(({ token, user }) => {
    const state = { state: { token, user, isAuthenticated: true }, version: 0 };
    localStorage.setItem("auth-storage", JSON.stringify(state));
  }, { token: AUTH_TOKEN, user: AUTH_USER });
}

test.describe("Auth - Login flow", () => {
  test("should redirect unauthenticated users to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("should display the login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[placeholder="Enter your username or email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("should login successfully and redirect to dashboard", async ({ page }) => {
    await mockAuthApis(page);

    await page.goto("/login");
    await page.fill('input[placeholder="Enter your username or email"]', "testuser");
    await page.fill('input[type="password"]', "correctpassword");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL("/", { timeout: 10000 });
  });

  test("should show error toast on invalid credentials", async ({ page }) => {
    await mockAuthApis(page);

    await page.goto("/login");
    await page.fill('input[placeholder="Enter your username or email"]', "invalid");
    await page.fill('input[type="password"]', "wrongpassword");
    await page.click('button[type="submit"]');

    await expect(page.locator("text=Login failed")).toBeVisible({ timeout: 8000 });
  });
});

test.describe("Auth - Token persistence", () => {
  test("should persist auth state across page reload", async ({ page }) => {
    await mockAuthApis(page);
    await injectAuth(page);

    await page.goto("/");
    // Should stay on dashboard, not redirect to login
    await expect(page).toHaveURL("/");
  });

  test("should redirect to login after logout", async ({ page }) => {
    await mockAuthApis(page);
    await injectAuth(page);

    await page.goto("/");

    // Trigger logout by clearing localStorage and reloading
    await page.evaluate(() => localStorage.removeItem("auth-storage"));
    await page.reload();

    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Auth - Register flow", () => {
  test("should display the register form", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator('input[placeholder="Enter your email"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Choose a username"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Create a password"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Confirm your password"]')).toBeVisible();
  });

  test("should register and redirect to /login", async ({ page }) => {
    await mockRegisterApi(page);

    await page.goto("/register");
    await page.fill('input[placeholder="Enter your email"]', "new@example.com");
    await page.fill('input[placeholder="Choose a username"]', "newuser");
    await page.fill('input[placeholder="Create a password"]', "password123");
    await page.fill('input[placeholder="Confirm your password"]', "password123");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL("/login", { timeout: 10000 });
  });

  test("should have link to login page", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator('a[href="/login"]')).toBeVisible();
  });
});
