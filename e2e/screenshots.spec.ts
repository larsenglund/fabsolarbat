import { test } from "@playwright/test";

// Not a test — a screenshot capture utility run explicitly via
//   npx playwright test screenshots.setup --grep @screenshots
test("capture README screenshots @screenshots", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 860 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "docs/screenshots/landing.png" });

  await page.goto("/?d=sample");
  await page
    .getByLabel("Headline results")
    .getByText(/kr\/yr/)
    .first()
    .waitFor({ timeout: 90_000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "docs/screenshots/analysis.png" });
});
