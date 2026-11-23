import { test, expect } from "@playwright/test";
import { login } from "./helpers";

for (const [who, email, path] of [["student", "student@demo.maydaycollege.test", "/student"], ["parent", "parent@demo.maydaycollege.test", "/parent"], ["admin", "admin@demo.maydaycollege.test", "/admin"]] as const) {
  test(`${who} dashboard works on a phone without horizontal scrolling`, async ({ page }) => {
    await login(page, email);
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });
}
