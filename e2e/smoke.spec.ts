import { expect, test } from "@playwright/test";

test("landing page renders with title, heading and reference stats", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/fabsolarbat/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("home battery");

  // Stat tiles exercise the formatting helpers end-to-end.
  await expect(page.getByText("3 967 kr/yr")).toBeVisible();
  await expect(page.getByText("15,8 %")).toBeVisible();

  await expect(page.getByRole("link", { name: "GitHub ↗" })).toBeVisible();
});

test("sample analysis runs end-to-end in the browser (wasm worker)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore sample data" }).click();

  // The worker fetches the HiGHS wasm and simulates the full year: the hero
  // tile must eventually show the golden-pinned headline savings.
  const hero = page.getByLabel("Headline results");
  await expect(hero.getByText(/3\u00a0967\u00a0kr\/yr/)).toBeVisible({ timeout: 90_000 });

  await expect(page.getByRole("heading", { name: "Savings per month" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hourly explorer" })).toBeVisible();

  // Clicking in the explorer opens the day drill-down with the hourly table.
  await page.locator(".u-over").click({ position: { x: 200, y: 100 } });
  await expect(page.getByRole("region", { name: "Day detail" })).toBeVisible();
  // 13:00 appears twice — the 35 h window spans two calendar days.
  await expect(page.getByRole("cell", { name: "13:00" }).first()).toBeVisible();

  // Switching to sell-at-spot re-runs with export revenue priced in: the
  // battery is worth less (golden-pinned 3 016 kr/yr).
  await page.getByLabel("Excess solar", { exact: true }).selectOption("sell-at-spot");
  await expect(hero.getByText(/3\u00a0016\u00a0kr\/yr/)).toBeVisible({ timeout: 90_000 });
});

test("how-it-works page and parameter help", async ({ page }) => {
  await page.goto("/");

  // Info page from the header, and back.
  await page.getByRole("button", { name: "How it works" }).click();
  await expect(page.getByRole("heading", { name: "How the calculations work" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How the optimizer thinks" })).toBeVisible();
  await page.getByRole("button", { name: "\u2190 Back" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("home battery");

  // Parameter help expands on the question mark.
  await page.getByRole("button", { name: "Explore sample data" }).click();
  await page.getByRole("button", { name: "Explain Usable capacity" }).click();
  await expect(page.getByText(/spec sheets often quote/)).toBeVisible();
});

test("upload: merged file reproduces the sample results exactly", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Upload your data" }).click();
  await expect(page.getByRole("heading", { name: "Use your own data" })).toBeVisible();
  // The format contract is visible before any file is chosen.
  await expect(
    page.getByText("datetime,excess_solar_kwh,consumption_kwh,price_sek_per_kwh").first(),
  ).toBeVisible();

  await page.locator("#merged-file").setInputFiles("data/merged_hourly_data.csv");
  await expect(page.getByText("Checked \u2713")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Analyze this dataset" }).click();

  // Same data + same defaults => the golden-pinned headline.
  const hero = page.getByLabel("Headline results");
  await expect(hero.getByText(/3\u00a0967\u00a0kr\/yr/)).toBeVisible({ timeout: 90_000 });
});

test("upload: separate energy + price fixtures merge and analyze", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Upload your data" }).click();
  await page.getByRole("radio", { name: "Separate energy + price files" }).click();

  await page.locator("#energy-file").setInputFiles("data/hourly_production_and_consumption.csv");
  await page.locator("#price-file").setInputFiles("data/hourly_power_price.csv");
  await expect(page.getByText("Checked \u2713")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/36[0-9] days/)).toBeVisible();

  await page.getByRole("button", { name: "Analyze this dataset" }).click();
  const hero = page.getByLabel("Headline results");
  await expect(hero.getByText(/kr\/yr/).first()).toBeVisible({ timeout: 90_000 });
});

test("upload: a malformed file gets a readable error", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Upload your data" }).click();
  await page.locator("#merged-file").setInputFiles({
    name: "junk.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("this is,not,valid\n1,2,3\n"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyze this dataset" })).toBeDisabled();
});
