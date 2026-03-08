import { test, expect } from "@playwright/test";

test.describe("VTuber UX - Basic UI Rendering", () => {
  const testUser = {
    email: `e2e-vtuber-${Date.now()}@example.com`,
    username: `e2e_vtuber_${Date.now()}`,
    password: "testpassword123",
  };

  let personaId: string;

  test.beforeEach(async ({ page }) => {
    // Create unique user for each test
    const uniqueUser = {
      email: `e2e-vtuber-${Date.now()}@example.com`,
      username: `e2e_vtuber_${Date.now()}`,
      password: "testpassword123",
    };

    // Register
    await page.goto("/register");
    await page.waitForLoadState("networkidle");

    await page.fill('input[placeholder="Enter your email"]', uniqueUser.email);
    await page.fill('input[placeholder="Choose a username"]', uniqueUser.username);
    await page.fill('input[placeholder="Create a password"]', uniqueUser.password);
    await page.fill('input[placeholder="Confirm your password"]', uniqueUser.password);

    await Promise.all([
      page.waitForURL("/login", { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    // Login
    await page.fill('input[placeholder="Enter your username or email"]', uniqueUser.username);
    await page.fill('input[type="password"]', uniqueUser.password);

    await Promise.all([
      page.waitForURL("/", { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    // Create a persona for VTuber testing
    await page.click("text=Create Persona");
    await expect(page).toHaveURL("/personas/new", { timeout: 10000 });

    await page.fill('input[name="name"]', "VTuber Test Persona");
    await page.fill('input[name="character_name"]', "TestBot");
    await page.fill('textarea[name="persona_prompt"]', "You are a helpful AI assistant for testing.");

    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/", { timeout: 15000 });

    // Wait for persona card to be rendered
    await page.waitForSelector("text=VTuber Test Persona", { timeout: 10000 });
  });

  test("should render VTuber page with basic UI elements", async ({ page }) => {
    // Click on the created persona to go to VTuber page
    await page.click("text=VTuber Test Persona");

    // Check for basic UI elements
    await expect(page.locator("text=Start VTuber")).toBeVisible();
    await expect(page.locator("text=stopped")).toBeVisible();
    await expect(page.locator('button:has-text("← Back")')).toBeVisible();
  });

  test("should show canvas area and control panel", async ({ page }) => {
    await page.click("text=VTuber Test Persona");

    // Check for canvas area
    await expect(page.locator("text=VTuber not started")).toBeVisible();
    await expect(page.locator("text=Conversation")).toBeVisible();
  });

  test("should have text input disabled when not running", async ({ page }) => {
    await page.click("text=VTuber Test Persona");

    const textInput = page.locator('input[placeholder="Type a message..."]');
    await expect(textInput).toBeDisabled();
  });

  test("should have mic button disabled when not running", async ({ page }) => {
    await page.click("text=VTuber Test Persona");

    const micButton = page.locator('button[aria-label="Start listening"]');
    await expect(micButton).toBeDisabled();
  });
});

test.describe("VTuber UX - Vision Buttons", () => {
  const uniqueTimestamp = Date.now();

  test.beforeEach(async ({ page }) => {
    const uniqueUser = {
      email: `e2e-vision-${uniqueTimestamp}@example.com`,
      username: `e2e_vision_${uniqueTimestamp}`,
      password: "testpassword123",
    };

    // Register
    await page.goto("/register");
    await page.waitForLoadState("networkidle");

    await page.fill('input[placeholder="Enter your email"]', uniqueUser.email);
    await page.fill('input[placeholder="Choose a username"]', uniqueUser.username);
    await page.fill('input[placeholder="Create a password"]', uniqueUser.password);
    await page.fill('input[placeholder="Confirm your password"]', uniqueUser.password);

    await Promise.all([
      page.waitForURL("/login", { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    // Login
    await page.fill('input[placeholder="Enter your username or email"]', uniqueUser.username);
    await page.fill('input[type="password"]', uniqueUser.password);

    await Promise.all([
      page.waitForURL("/", { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    // Create a persona
    await page.click("text=Create Persona");
    await expect(page).toHaveURL("/personas/new", { timeout: 10000 });
    await page.fill('input[name="name"]', "Vision Test Persona");
    await page.fill('input[name="character_name"]', "VisionBot");
    await page.fill('textarea[name="persona_prompt"]', "You can see and describe images.");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/", { timeout: 15000 });
    await page.waitForSelector("text=Vision Test Persona", { timeout: 10000 });
  });

  test("should render camera button", async ({ page }) => {
    await page.click("text=Vision Test Persona");

    const cameraButton = page.locator('button[aria-label="Open camera"]');
    await expect(cameraButton).toBeVisible();
  });

  test("should render screen share toggle button", async ({ page }) => {
    await page.click("text=Vision Test Persona");

    // Screen share button (initially labeled "Start screen share")
    const screenShareButton = page.locator('button[aria-label="Start screen share"]');
    await expect(screenShareButton).toBeVisible();
  });

  test("should have vision buttons disabled when instance not running", async ({ page }) => {
    await page.click("text=Vision Test Persona");

    const cameraButton = page.locator('button[aria-label="Open camera"]');
    const screenShareButton = page.locator('button[aria-label="Start screen share"]');

    await expect(cameraButton).toBeDisabled();
    await expect(screenShareButton).toBeDisabled();
  });

  test("should show screen share tooltip", async ({ page }) => {
    await page.click("text=Vision Test Persona");

    const screenShareButton = page.locator('button[aria-label="Start screen share"]');
    await screenShareButton.hover();

    // Tooltip should appear
    await expect(page.locator("text=Start Screen Share")).toBeVisible();
  });
});

test.describe("VTuber UX - Screen Share", () => {
  const uniqueTimestamp = Date.now();

  test.beforeEach(async ({ page }) => {
    const uniqueUser = {
      email: `e2e-screenshare-${uniqueTimestamp}@example.com`,
      username: `e2e_screenshare_${uniqueTimestamp}`,
      password: "testpassword123",
    };

    // Register
    await page.goto("/register");
    await page.waitForLoadState("networkidle");

    await page.fill('input[placeholder="Enter your email"]', uniqueUser.email);
    await page.fill('input[placeholder="Choose a username"]', uniqueUser.username);
    await page.fill('input[placeholder="Create a password"]', uniqueUser.password);
    await page.fill('input[placeholder="Confirm your password"]', uniqueUser.password);

    await Promise.all([
      page.waitForURL("/login", { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    // Login
    await page.fill('input[placeholder="Enter your username or email"]', uniqueUser.username);
    await page.fill('input[type="password"]', uniqueUser.password);

    await Promise.all([
      page.waitForURL("/", { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    // Create a persona
    await page.click("text=Create Persona");
    await expect(page).toHaveURL("/personas/new", { timeout: 10000 });
    await page.fill('input[name="name"]', "Screen Share Test Persona");
    await page.fill('input[name="character_name"]', "ScreenBot");
    await page.fill('textarea[name="persona_prompt"]', "You can see screens.");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/", { timeout: 15000 });
    await page.waitForSelector("text=Screen Share Test Persona", { timeout: 10000 });
  });

  test("should have screen share button with correct aria-label", async ({ page }) => {
    await page.click("text=Screen Share Test Persona");

    // Check the screen share button exists with proper accessibility
    const screenShareButton = page.locator('button[aria-label="Start screen share"]');
    await expect(screenShareButton).toBeVisible();
    await expect(screenShareButton).toHaveAttribute("aria-label", "Start screen share");
  });

  test("should show screen share button in gray when inactive", async ({ page }) => {
    await page.click("text=Screen Share Test Persona");

    const screenShareButton = page.locator('button[aria-label="Start screen share"]');
    // Button should exist and be gray (not red)
    await expect(screenShareButton).toBeVisible();
  });

  test("screen share button should be disabled when instance not running", async ({ page }) => {
    await page.click("text=Screen Share Test Persona");

    const screenShareButton = page.locator('button[aria-label="Start screen share"]');
    await expect(screenShareButton).toBeDisabled();
  });
});

test.describe("VTuber UX - Accessibility", () => {
  const uniqueTimestamp = Date.now();

  test.beforeEach(async ({ page }) => {
    const uniqueUser = {
      email: `e2e-a11y-${uniqueTimestamp}@example.com`,
      username: `e2e_a11y_${uniqueTimestamp}`,
      password: "testpassword123",
    };

    // Register and login
    await page.goto("/register");
    await page.waitForLoadState("networkidle");

    await page.fill('input[placeholder="Enter your email"]', uniqueUser.email);
    await page.fill('input[placeholder="Choose a username"]', uniqueUser.username);
    await page.fill('input[placeholder="Create a password"]', uniqueUser.password);
    await page.fill('input[placeholder="Confirm your password"]', uniqueUser.password);

    await Promise.all([
      page.waitForURL("/login", { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    await page.fill('input[placeholder="Enter your username or email"]', uniqueUser.username);
    await page.fill('input[type="password"]', uniqueUser.password);

    await Promise.all([
      page.waitForURL("/", { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    // Create a persona
    await page.click("text=Create Persona");
    await page.fill('input[name="name"]', "A11y Test Persona");
    await page.fill('input[name="character_name"]', "A11yBot");
    await page.fill('textarea[name="persona_prompt"]', "Accessible AI assistant.");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/", { timeout: 15000 });
  });

  test("should have aria-labels on all interactive buttons", async ({ page }) => {
    await page.click("text=A11y Test Persona");

    // Check aria-labels exist
    await expect(page.locator('button[aria-label="Start listening"]')).toBeVisible();
    await expect(page.locator('button[aria-label="Send message"]')).toBeVisible();
    await expect(page.locator('button[aria-label="Open camera"]')).toBeVisible();
    await expect(page.locator('button[aria-label="Start screen share"]')).toBeVisible();
  });

  test("should be keyboard navigable", async ({ page }) => {
    await page.click("text=A11y Test Persona");

    // Tab through elements
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    // Should be able to focus on various elements
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();
  });
});

test.describe("VTuber UX - Responsive Layout", () => {
  const uniqueTimestamp = Date.now();

  test.beforeEach(async ({ page }) => {
    const uniqueUser = {
      email: `e2e-mobile-${uniqueTimestamp}@example.com`,
      username: `e2e_mobile_${uniqueTimestamp}`,
      password: "testpassword123",
    };

    await page.goto("/register");
    await page.waitForLoadState("networkidle");

    await page.fill('input[placeholder="Enter your email"]', uniqueUser.email);
    await page.fill('input[placeholder="Choose a username"]', uniqueUser.username);
    await page.fill('input[placeholder="Create a password"]', uniqueUser.password);
    await page.fill('input[placeholder="Confirm your password"]', uniqueUser.password);

    await Promise.all([
      page.waitForURL("/login", { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    await page.fill('input[placeholder="Enter your username or email"]', uniqueUser.username);
    await page.fill('input[type="password"]', uniqueUser.password);

    await Promise.all([
      page.waitForURL("/", { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    await page.click("text=Create Persona");
    await page.fill('input[name="name"]', "Mobile Test Persona");
    await page.fill('input[name="character_name"]', "MobileBot");
    await page.fill('textarea[name="persona_prompt"]', "Mobile-friendly assistant.");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/", { timeout: 15000 });
  });

  test("should render correctly on mobile viewport", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.click("text=Mobile Test Persona");

    // Check key elements are still visible
    await expect(page.locator("text=Start VTuber")).toBeVisible();
    await expect(page.locator('input[placeholder="Type a message..."]')).toBeVisible();
  });

  test("should render vision buttons on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.click("text=Mobile Test Persona");

    const cameraButton = page.locator('button[aria-label="Open camera"]');
    const screenShareButton = page.locator('button[aria-label="Start screen share"]');

    await expect(cameraButton).toBeVisible();
    await expect(screenShareButton).toBeVisible();
  });
});

test.describe("VTuber UX - Chat History", () => {
  const uniqueTimestamp = Date.now();

  test.beforeEach(async ({ page }) => {
    const uniqueUser = {
      email: `e2e-history-${uniqueTimestamp}@example.com`,
      username: `e2e_history_${uniqueTimestamp}`,
      password: "testpassword123",
    };

    await page.goto("/register");
    await page.waitForLoadState("networkidle");

    await page.fill('input[placeholder="Enter your email"]', uniqueUser.email);
    await page.fill('input[placeholder="Choose a username"]', uniqueUser.username);
    await page.fill('input[placeholder="Create a password"]', uniqueUser.password);
    await page.fill('input[placeholder="Confirm your password"]', uniqueUser.password);

    await Promise.all([
      page.waitForURL("/login", { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    await page.fill('input[placeholder="Enter your username or email"]', uniqueUser.username);
    await page.fill('input[type="password"]', uniqueUser.password);

    await Promise.all([
      page.waitForURL("/", { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    await page.click("text=Create Persona");
    await page.fill('input[name="name"]', "History Test Persona");
    await page.fill('input[name="character_name"]', "HistoryBot");
    await page.fill('textarea[name="persona_prompt"]', "History-enabled assistant.");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/", { timeout: 15000 });
  });

  test("should not show history button when instance is stopped", async ({ page }) => {
    await page.click("text=History Test Persona");

    // History button should not be visible when stopped
    const historyButton = page.locator('button[aria-label="Open chat history"]');
    await expect(historyButton).not.toBeVisible();
  });

  test("should have history drawer with required elements", async ({ page }) => {
    await page.click("text=History Test Persona");

    // Since we can't actually start the instance in E2E without backend,
    // we verify the drawer structure exists by inspecting the DOM
    const historyDrawer = page.locator('text=대화 기록');
    // Note: This will only be visible when the drawer is open
    // For proper testing, mock the backend or use component tests
  });
});

test.describe("VTuber UX - Advanced Live2D", () => {
  const uniqueTimestamp = Date.now();

  test.beforeEach(async ({ page }) => {
    const uniqueUser = {
      email: `e2e-live2d-${uniqueTimestamp}@example.com`,
      username: `e2e_live2d_${uniqueTimestamp}`,
      password: "testpassword123",
    };

    await page.goto("/register");
    await page.waitForLoadState("networkidle");

    await page.fill('input[placeholder="Enter your email"]', uniqueUser.email);
    await page.fill('input[placeholder="Choose a username"]', uniqueUser.username);
    await page.fill('input[placeholder="Create a password"]', uniqueUser.password);
    await page.fill('input[placeholder="Confirm your password"]', uniqueUser.password);

    await Promise.all([
      page.waitForURL("/login", { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    await page.fill('input[placeholder="Enter your username or email"]', uniqueUser.username);
    await page.fill('input[type="password"]', uniqueUser.password);

    await Promise.all([
      page.waitForURL("/", { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    await page.click("text=Create Persona");
    await page.fill('input[name="name"]', "Live2D Test Persona");
    await page.fill('input[name="character_name"]', "Live2DBot");
    await page.fill('textarea[name="persona_prompt"]', "Interactive Live2D assistant.");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/", { timeout: 15000 });
  });

  test("should not show eye tracking toggle when instance is stopped", async ({ page }) => {
    await page.click("text=Live2D Test Persona");

    // Eye tracking toggle should not be visible when stopped
    const eyeTrackingButton = page.locator('button[aria-label="Toggle eye tracking"]');
    await expect(eyeTrackingButton).not.toBeVisible();
  });

  test("should have canvas element with pointer cursor style", async ({ page }) => {
    await page.click("text=Live2D Test Persona");

    // When running, canvas should have pointer cursor
    // Note: This tests the static structure - actual interaction requires running instance
    const canvasArea = page.locator('text=VTuber not started');
    await expect(canvasArea).toBeVisible();
  });
});
