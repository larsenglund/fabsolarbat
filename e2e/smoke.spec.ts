import { expect, test } from "@playwright/test";

test("landing page renders with title, heading and reference stats", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Batterikollen/);
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

  // The dataset chip returns to the landing page, where other data can be
  // chosen; re-entering the sample keeps the loaded dataset.
  await page.getByRole("button", { name: /switch data/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("home battery");
  await page.getByRole("button", { name: "Explore sample data" }).click();
  await expect(hero.getByText(/kr\/yr/).first()).toBeVisible({ timeout: 90_000 });
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
  await page.getByRole("button", { name: "Separate energy + price files" }).click();

  await page.locator("#energy-file").setInputFiles("data/hourly_production_and_consumption.csv");
  await page.locator("#price-file").setInputFiles("data/hourly_power_price.csv");
  await expect(page.getByText("Checked \u2713")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/36[0-9] days/)).toBeVisible();

  await page.getByRole("button", { name: "Analyze this dataset" }).click();
  const hero = page.getByLabel("Headline results");
  await expect(hero.getByText(/kr\/yr/).first()).toBeVisible({ timeout: 90_000 });
});

test("shared link opens the sample analysis with the scenario applied", async ({ page }) => {
  // d=sample opens straight into analysis; mdl=sell applies sell-at-spot.
  await page.goto("/?d=sample&mdl=sell");
  await expect(page.getByText(/Sell-at-spot model/)).toBeVisible();
  const hero = page.getByLabel("Headline results");
  await expect(hero.getByText(/3 016 kr\/yr/)).toBeVisible({ timeout: 90_000 });

  // The address bar tracks the scenario: reverting the model drops its key.
  await page.getByLabel("Excess solar", { exact: true }).selectOption("no-sell");
  await expect(hero.getByText(/3 967 kr\/yr/)).toBeVisible({ timeout: 90_000 });
  expect(page.url()).not.toContain("mdl=");
  expect(page.url()).toContain("d=sample");
  await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();
});

test("baseline pin shows deltas as parameters change", async ({ page }) => {
  await page.goto("/?d=sample");
  const hero = page.getByLabel("Headline results");
  await expect(hero.getByText(/3 967 kr\/yr/)).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Pin baseline" }).click();
  await expect(page.getByRole("button", { name: /Baseline pinned/ })).toBeVisible();

  // Switching to sell-at-spot shrinks the battery's value vs the pinned run.
  await page.getByLabel("Excess solar", { exact: true }).selectOption("sell-at-spot");
  await expect(hero.getByText(/3 016 kr\/yr/)).toBeVisible({ timeout: 90_000 });
  await expect(hero.getByText(/vs baseline/).first()).toBeVisible();

  await page.getByRole("button", { name: /Baseline pinned/ }).click();
  await expect(hero.getByText(/vs baseline/)).toHaveCount(0);
});

test("remove my data clears the persisted dataset", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Upload your data" }).click();
  await page.locator("#merged-file").setInputFiles("data/merged_hourly_data.csv");
  await expect(page.getByText("Checked ✓")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Analyze this dataset" }).click();
  const hero = page.getByLabel("Headline results");
  await expect(hero.getByText(/kr\/yr/).first()).toBeVisible({ timeout: 90_000 });

  // Persistence: after a reload the landing offers to continue.
  await page.reload();
  await expect(page.getByRole("button", { name: /Continue with your data/ })).toBeVisible();

  // Removing clears IndexedDB — the offer disappears and the store is empty.
  await page.getByRole("button", { name: "Upload your data" }).click();
  await page.getByRole("button", { name: "Remove my data" }).click();
  // The stored-data panel disappears only after the IndexedDB delete resolves.
  await expect(page.getByRole("button", { name: "Remove my data" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Upload your data" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue with your data/ })).toHaveCount(0);
  const keys = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("keyval-store");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("keyval")) {
            resolve([]);
            return;
          }
          const get = db.transaction("keyval").objectStore("keyval").getAllKeys();
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => resolve(["getAllKeys failed"]);
        };
        req.onerror = () => resolve(["open failed"]);
      }),
  );
  expect(keys).toEqual([]);
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
