import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { login, otpFor, db } from "./helpers";

const stamp = Date.now();
const email = `e2e.student.${stamp}@example.test`;
const pw = "E2eStrong2026";

test.describe.serial("student self-registration → admin approval → subject registration", () => {
  test("student registers, verifies email and submits the onboarding form", async ({ page }) => {
    await page.goto("/register/student");
    await page.fill("#email", email);
    await page.fill("#guardianEmail", `e2e.parent.${stamp}@example.test`);
    await page.fill("#password", pw);
    await page.fill("#confirm", pw);
    await page.getByRole("button", { name: /Create account/ }).click();
    await expect(page).toHaveURL(/verify-email/);
    await page.fill("#code", await otpFor(email));
    await page.getByRole("button", { name: "Verify email" }).click();
    await expect(page).toHaveURL(/\/application/);
    await page.getByRole("link", { name: "Continue registration" }).click();
    // Step 1
    await page.fill("#fullName", "E2E Tester Student");
    await page.fill("#dateOfBirth", "2011-03-03");
    await page.selectOption("#gender", "MALE");
    await page.fill("#address", "12 Allen Avenue, Ikeja, Lagos");
    const photo = path.join(__dirname, "fixtures", "photo.png");
    await page.setInputFiles("#photo", photo);
    await page.getByRole("button", { name: "Continue" }).click();
    // Step 2
    await page.fill("#guardianName", "E2E Parent");
    await page.fill("#guardianPhone", "08033333333");
    await page.getByRole("button", { name: "Continue" }).click();
    // Step 3
    await page.selectOption("#classId", { label: "SSS1 Commercial" });
    await page.selectOption("#sessionId", { label: "2026/2027" });
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page.getByText("Pending approval").first()).toBeVisible({ timeout: 20_000 });
    // Protected portal stays locked
    await page.goto("/student/results");
    await expect(page).toHaveURL(/\/application/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/application/);
  });

  test("administrator reviews and approves the application", async ({ page }) => {
    await login(page, "admin@demo.maydaycollege.test");
    await page.goto("/admin/students/applications");
    await page.getByRole("row", { name: /E2E Tester Student/ }).getByRole("link", { name: "Review" }).click();
    await expect(page.getByRole("heading", { name: "E2E Tester Student" })).toBeVisible();
    await page.getByRole("button", { name: /Approve & issue student ID/ }).click();
    await expect(page).toHaveURL(/\/admin\/students\/[a-z0-9]+$/, { timeout: 20_000 });
    await expect(page.getByText(/MDC\/\d{2}\/\d{4}/).first()).toBeVisible();
  });

  test("approved student registers subjects through the UI", async ({ page }) => {
    await login(page, email, pw);
    await expect(page).toHaveURL(/\/student/);
    await page.goto("/student/registration");
    await page.getByRole("button", { name: /Commerce/ }).click();
    await page.getByRole("button", { name: "Review registration" }).click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Submit registration" }).click();
    await expect(page).toHaveURL(/\/student\/subjects/, { timeout: 20_000 });
    await expect(page.getByText("Financial Accounting")).toBeVisible();
    const s = await db.student.findFirstOrThrow({ where: { user: { email } }, include: { subjectRegistrations: { include: { items: true } } } });
    expect(s.subjectRegistrations[0].items.length).toBe(4);
  });
});

test.beforeAll(() => {
  const dir = path.join(__dirname, "fixtures");
  fs.mkdirSync(dir, { recursive: true });
  // 1×1 PNG
  fs.writeFileSync(path.join(dir, "photo.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
});
