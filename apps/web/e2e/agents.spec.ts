import { test, expect } from "@playwright/test";

const AUTH_TOKEN = "mock-test-token";
const AUTH_USER = { id: "user-1", email: "test@example.com", username: "testuser" };

const MOCK_AGENTS = [
  {
    id: "agent-1",
    name: "My Test Agent",
    description: "A test agent",
    agent_type: "assistant",
    llm_provider: "openai",
    llm_model: "gpt-4o-mini",
    system_prompt: "You are helpful.",
    tools: [],
    status: "active",
    is_public: false,
    config: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

async function injectAuth(page: import("@playwright/test").Page) {
  await page.addInitScript(({ token, user }) => {
    const state = { state: { token, user, isAuthenticated: true }, version: 0 };
    localStorage.setItem("auth-storage", JSON.stringify(state));
  }, { token: AUTH_TOKEN, user: AUTH_USER });
}

async function mockAgentsApi(page: import("@playwright/test").Page) {
  let agents = [...MOCK_AGENTS];

  // GET /api/v1/agents
  await page.route("/api/v1/agents", async (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(agents),
      });
    } else if (route.request().method() === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}");
      const newAgent = {
        id: `agent-${Date.now()}`,
        description: null,
        tools: [],
        system_prompt: null,
        status: "active",
        is_public: false,
        config: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...body,
      };
      agents = [newAgent, ...agents];
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(newAgent),
      });
    }
  });

  // PUT/DELETE /api/v1/agents/:id
  await page.route(/\/api\/v1\/agents\/[^/]+$/, async (route) => {
    const method = route.request().method();
    const url = route.request().url();
    const id = url.split("/").pop()!;

    if (method === "PUT") {
      const body = JSON.parse(route.request().postData() ?? "{}");
      const idx = agents.findIndex((a) => a.id === id);
      if (idx !== -1) {
        agents[idx] = { ...agents[idx], ...body, updated_at: new Date().toISOString() };
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(agents[idx]),
        });
      } else {
        route.fulfill({ status: 404, body: JSON.stringify({ detail: "Not found" }) });
      }
    } else if (method === "DELETE") {
      agents = agents.filter((a) => a.id !== id);
      route.fulfill({ status: 204, body: "" });
    }
  });
}

test.describe("AgentsPage - Layout", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
    await mockAgentsApi(page);
  });

  test("should show agents heading and create button", async ({ page }) => {
    await page.goto("/agents");
    await expect(page.locator("text=Agents").first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('button:has-text("Create Agent")').first()).toBeVisible();
  });

  test("should list existing agents", async ({ page }) => {
    await page.goto("/agents");
    await expect(page.locator("text=My Test Agent")).toBeVisible({ timeout: 8000 });
  });

  test("should show agent type and model info", async ({ page }) => {
    await page.goto("/agents");
    await expect(page.locator("text=assistant")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=openai / gpt-4o-mini")).toBeVisible();
  });
});

test.describe("AgentsPage - Create agent", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
    await mockAgentsApi(page);
  });

  test("should open create modal on button click", async ({ page }) => {
    await page.goto("/agents");
    await page.click('button:has-text("Create Agent")');
    await expect(page.locator("text=Create Agent").nth(1)).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[placeholder="My Agent"]')).toBeVisible();
  });

  test("should create a new agent and show it in the list", async ({ page }) => {
    await page.goto("/agents");
    await page.click('button:has-text("Create Agent")');

    await page.fill('input[placeholder="My Agent"]', "Brand New Agent");
    await page.click('button:has-text("Create Agent"):not([aria-label])');

    // Modal should close and new agent should appear
    await expect(page.locator("text=Brand New Agent")).toBeVisible({ timeout: 8000 });
  });

  test("should show success toast after creating agent", async ({ page }) => {
    await page.goto("/agents");
    await page.click('button:has-text("Create Agent")');
    await page.fill('input[placeholder="My Agent"]', "Toast Agent");

    // Click the modal's Create Agent button (inside ModalFooter)
    await page.locator('[role="dialog"]').locator('button:has-text("Create Agent")').click();

    await expect(page.locator("text=Agent created")).toBeVisible({ timeout: 8000 });
  });

  test("should close modal on Cancel", async ({ page }) => {
    await page.goto("/agents");
    await page.click('button:has-text("Create Agent")');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    await page.click('button:has-text("Cancel")');
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe("AgentsPage - Edit agent", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
    await mockAgentsApi(page);
  });

  test("should open edit modal with pre-filled values", async ({ page }) => {
    await page.goto("/agents");
    await expect(page.locator("text=My Test Agent")).toBeVisible({ timeout: 8000 });

    await page.click('button[aria-label="Edit agent"]');
    await expect(page.locator("text=Edit Agent")).toBeVisible({ timeout: 5000 });

    // Name field should be pre-filled
    await expect(page.locator('input[placeholder="My Agent"]')).toHaveValue("My Test Agent");
  });

  test("should save edited agent name", async ({ page }) => {
    await page.goto("/agents");
    await expect(page.locator("text=My Test Agent")).toBeVisible({ timeout: 8000 });

    await page.click('button[aria-label="Edit agent"]');
    const nameInput = page.locator('input[placeholder="My Agent"]');
    await nameInput.clear();
    await nameInput.fill("Updated Agent Name");

    await page.locator('[role="dialog"]').locator('button:has-text("Save Changes")').click();

    await expect(page.locator("text=Agent updated")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=Updated Agent Name")).toBeVisible();
  });
});

test.describe("AgentsPage - Delete agent", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
    await mockAgentsApi(page);
  });

  test("should show delete confirmation modal", async ({ page }) => {
    await page.goto("/agents");
    await expect(page.locator("text=My Test Agent")).toBeVisible({ timeout: 8000 });

    await page.click('button[aria-label="Delete agent"]');
    await expect(page.locator("text=Delete Agent")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Are you sure you want to delete this agent?")).toBeVisible();
  });

  test("should delete agent and remove from list", async ({ page }) => {
    await page.goto("/agents");
    await expect(page.locator("text=My Test Agent")).toBeVisible({ timeout: 8000 });

    await page.click('button[aria-label="Delete agent"]');
    await page.locator('[role="dialog"]').locator('button:has-text("Delete")').click();

    await expect(page.locator("text=Agent deleted")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=My Test Agent")).not.toBeVisible({ timeout: 5000 });
  });

  test("should cancel delete when Cancel is clicked", async ({ page }) => {
    await page.goto("/agents");
    await expect(page.locator("text=My Test Agent")).toBeVisible({ timeout: 8000 });

    await page.click('button[aria-label="Delete agent"]');
    await page.click('button:has-text("Cancel")');

    // Agent should still be in list
    await expect(page.locator("text=My Test Agent")).toBeVisible({ timeout: 5000 });
  });
});

test.describe("AgentsPage - Unauthenticated access", () => {
  test("should redirect to login when not authenticated", async ({ page }) => {
    await page.goto("/agents");
    await expect(page).toHaveURL(/\/login/);
  });
});
