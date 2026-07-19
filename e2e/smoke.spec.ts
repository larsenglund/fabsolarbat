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
});
