import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { login, db } from "./helpers";

test("student submits a receipt; bursar verifies; student downloads the confirmation", async ({ page }) => {
  const ref = `E2E-${Date.now()}`;
  const receipt = path.join(__dirname, "fixtures", "receipt.pdf");
  fs.mkdirSync(path.dirname(receipt), { recursive: true });
  fs.writeFileSync(receipt, "%PDF-1.4\n%%EOF");
  await login(page, "student2@demo.maydaycollege.test");
  await page.goto("/student/fees");
  await expect(page.getByText("0123456789")).toBeVisible();
  await page.fill("#amount", "50000");
  await page.fill("#paymentDate", "2026-10-01");
  await page.fill("#bankReference", ref);
  await page.setInputFiles("#receipt", receipt);
  await page.getByRole("button", { name: "Submit for verification" }).click();
  await expect(page).toHaveURL(/\/student\/payments/, { timeout: 20_000 });
  await expect(page.getByText("Awaiting bursary verification").first()).toBeVisible();

  await login(page, "bursar@demo.maydaycollege.test");
  await page.goto(`/admin/payments?q=${ref}`);
  await page.getByRole("link", { name: "Verify" }).click();
  await page.getByRole("button", { name: "Approve payment" }).click();
  // HTML validation blocks approval until funds are confirmed
  await expect(page).toHaveURL(/\/admin\/payments\/.+/);
  expect(await db.payment.count({ where: { transactionReference: ref } })).toBe(0);
  await page.getByLabel(/I have confirmed these funds/).check();
  await page.getByRole("button", { name: "Approve payment" }).click();
  await expect(page.getByText(/Payment verified/)).toBeVisible({ timeout: 20_000 });
  expect(await db.payment.count({ where: { transactionReference: ref } })).toBe(1);

  await login(page, "student2@demo.maydaycollege.test");
  await page.goto("/student/payments");
  const pdf = await page.request.get((await page.getByRole("link", { name: /Confirmation/ }).first().getAttribute("href"))!);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
});
