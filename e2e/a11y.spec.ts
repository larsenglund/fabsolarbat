import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/**
 * Automated accessibility scan (axe-core) of every view, both themes.
 * Serious/critical violations fail the build; minor ones are reported only.
 */

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    serious.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test(`landing and upload pages have no serious a11y violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await expectNoSeriousViolations(page);

    await page.getByRole("button", { name: "Upload your data" }).click();
    await expect(page.getByRole("heading", { name: "Use your own data" })).toBeVisible();
    await expectNoSeriousViolations(page);
  });
}

test("analysis view has no serious a11y violations", async ({ page }) => {
  await page.goto("/?d=sample");
  const hero = page.getByLabel("Headline results");
  await expect(hero.getByText(/kr\/yr/).first()).toBeVisible({ timeout: 90_000 });
  await expectNoSeriousViolations(page);
});
