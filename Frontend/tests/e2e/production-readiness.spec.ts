import { test, expect, type BrowserContext } from "@playwright/test";

let loginState: Awaited<ReturnType<BrowserContext["storageState"]>>;
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:3105/login");
  await page.getByLabel("Email", { exact: false }).fill("admin@doxa.local");
  await page.getByLabel("Password", { exact: true }).fill("DoxaDemo123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page.waitForLoadState("networkidle");
  loginState = await page.context().storageState();
  await page.close();
});
test.beforeEach(async ({ context, page }) => {
  await context.addCookies(loginState.cookies);
  await page.addInitScript((origins) => {
    for (const origin of origins)
      if (origin.origin === location.origin)
        for (const item of origin.localStorage)
          localStorage.setItem(item.name, item.value);
  }, loginState.origins);
});

test("real browser creates a lead with separate auth/CRM identities", async ({
  page,
}) => {
  await page.goto("/leads");
  await page.getByRole("button", { name: "New Lead", exact: true }).click();
  await page
    .getByLabel("Full Name", { exact: true })
    .fill("Browser QA " + Date.now());
  await page
    .getByLabel("Email", { exact: true })
    .fill(`browser-${Date.now()}@example.test`);
  await page.getByLabel("Phone", { exact: true }).fill("+251911111111");
  await page.getByLabel("Company", { exact: true }).fill("Local QA");
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/leads/") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Create Lead|Save Lead/ }).click();
  expect((await saved).status()).toBe(201);
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("keyboard search requires activation and mobile navigation dismisses", async ({
  page,
}) => {
  await page.goto("/leads");
  const search = page.getByRole("button", { name: /Search.*Ctrl|Search.*K/ });
  await search.focus();
  await expect(page.getByRole("dialog")).toBeHidden();
  await search.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});

test("CSV preview respects quoted commas and short-height dialog bounds", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto("/leads");
  await page.getByRole("button", { name: /Import/ }).click();
  const csv =
    "full_name,email,phone,company,source\n" +
    Array.from(
      { length: 5 },
      (_, i) =>
        `"Person, ${i}",person${i}@example.test,+251900000000,"Company, Ltd",website`,
    ).join("\n");
  await page.locator('input[type="file"]').setInputFiles({
    name: "quoted.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(
    page.getByRole("cell", { name: "Company, Ltd", exact: true }).first(),
  ).toBeVisible();
  const box = await page.getByRole("dialog").boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(600);
  await page.locator('input[type="file"]').setInputFiles({
    name: "invalid.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("bad"),
  });
  await expect(page.getByRole("button", { name: /Import CSV/ })).toBeDisabled();
});

test("desktop and mobile route smoke with visual evidence", async ({
  page,
}) => {
  test.setTimeout(180_000);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/dashboard",
      "/leads",
      "/contacts",
      "/accounts",
      "/deals",
      "/tasks",
      "/activities",
      "/campaigns",
      "/projects",
      "/reports",
      "/settings/workspace",
      "/settings/archive",
      "/profile",
    ]) {
      await page.goto(path);
      await expect(page.locator("h1").last()).toBeVisible();
      await expect(
        page.getByText("Something went wrong", { exact: true }),
      ).toBeHidden();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: `test-results/${width}${path.replaceAll("/", "-")}.png`,
        fullPage: true,
      });
    }
  }
});

test("dirty forms require a deliberate discard", async ({ page }) => {
  await page.goto("/leads");
  await page.getByRole("button", { name: "New Lead", exact: true }).click();
  await page
    .getByLabel("Full Name", { exact: true })
    .fill("Unsaved local draft");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Full Name", { exact: true })).toHaveValue(
    "Unsaved local draft",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("lead search survives reload through the URL", async ({ page }) => {
  await page.goto("/leads");
  await page.getByLabel("Search leads", { exact: true }).fill("Browser QA");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("search"))
    .toBe("Browser QA");
  await page.reload();
  await expect(page.getByLabel("Search leads", { exact: true })).toHaveValue(
    "Browser QA",
  );
});

test("forecast failure is visible instead of a false zero", async ({
  page,
}) => {
  await page.route("**/api/v1/deals/forecast?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Local injected outage" }),
    }),
  );
  await page.goto("/deals");
  await expect(
    page.getByText("Forecast unavailable.", { exact: false }),
  ).toBeVisible({ timeout: 15000 });
});

test("shared reports reopen readable fields within the signed-in user's scope", async ({
  page,
}) => {
  const view = {
    entity: "deals",
    filters: [],
    groupBy: "",
    selectedFields: ["title", "owner_name", "account_name"],
    sortBy: "title",
    sortDir: "asc",
    dateField: "created_at",
    dateFrom: "",
    dateTo: "",
  };
  await page.goto(
    "/reports?currency=USD&reports-view=" +
      encodeURIComponent(JSON.stringify(view)),
  );
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/api/v1/reports/custom") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Run Report", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(
    page.getByRole("columnheader", { name: /Owner name/i }),
  ).toBeVisible();
});
