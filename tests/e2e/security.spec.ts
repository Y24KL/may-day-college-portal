import { test, expect } from "@playwright/test";
import { login, db } from "./helpers";

test("students cannot reach administrator pages or exports", async ({ page }) => {
  await login(page, "student@demo.maydaycollege.test");
  await page.goto("/admin/payments");
  await expect(page).toHaveURL(/\/student$/);
  const r = await page.request.get("/api/reports/students?format=csv");
  expect(r.status()).toBe(403);
});

test("a parent cannot open an unlinked child's records by changing the URL", async ({ page }) => {
  const other = await db.student.findFirstOrThrow({ where: { user: { email: "student2@demo.maydaycollege.test" } } });
  await login(page, "parent.unlinked@demo.maydaycollege.test");
  await page.goto(`/parent/results?child=${other.id}`);
  await expect(page.getByText("No linked children yet")).toBeVisible();
  await expect(page.getByText(other.fullName)).toHaveCount(0);
});

test("an unassigned teacher sees no students and cannot open a student profile", async ({ page }) => {
  const s = await db.student.findFirstOrThrow({ where: { user: { email: "student@demo.maydaycollege.test" } } });
  await login(page, "teacher.unassigned@demo.maydaycollege.test");
  await expect(page.getByText("No assignments yet")).toBeVisible();
  const res = await page.goto(`/teacher/students/${s.id}`);
  expect(res?.status()).toBe(404);
});

test("private files are not reachable without authorisation", async ({ page, request }) => {
  const card = await db.reportCard.findFirstOrThrow({ where: { status: "ACTIVE", student: { user: { email: "student@demo.maydaycollege.test" } } } });
  expect((await request.get(`/api/files/${card.fileId}`)).status()).toBe(404); // anonymous
  await login(page, "student2@demo.maydaycollege.test");
  expect((await page.request.get(`/api/files/${card.fileId}`)).status()).toBe(404); // another student
  await login(page, "student@demo.maydaycollege.test");
  const own = await page.request.get(`/api/files/${card.fileId}`, { maxRedirects: 0 });
  expect([200, 302]).toContain(own.status());
});

test("report card QR verification confirms authenticity with minimal data", async ({ page }) => {
  const v = await db.documentVerification.findFirstOrThrow({ where: { reportCard: { status: "ACTIVE" } }, include: { reportCard: { include: { student: true } } } });
  await page.goto(`/verify/${v.code}`);
  await expect(page.getByRole("heading", { name: "Document verified" })).toBeVisible();
  await expect(page.getByText(v.reportCard!.student.fullName)).toHaveCount(0); // full name not exposed
  await page.goto("/verify/forged-code-123");
  await expect(page.getByRole("heading", { name: "Not verified" })).toBeVisible();
});

test("health endpoint reports readiness without secrets", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(j.database).toBe("up");
  expect(JSON.stringify(j)).not.toMatch(/postgres|password|secret/i);
});
