import { expect, test } from "@playwright/test";

test("landing page renders with title, heading and reference stats", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/fabsolarbat/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("home battery");

  // Stat tiles exercise the formatting helpers end-to-end.
  await expect(page.getByText("8 334 kr/yr")).toBeVisible();
  await expect(page.getByText("21,3 %")).toBeVisible();

  await expect(page.getByRole("link", { name: "GitHub ↗" })).toBeVisible();
});
