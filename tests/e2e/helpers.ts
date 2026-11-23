import { expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

export const PW = "DemoPass2026!";
export const db = new PrismaClient();

export async function login(page: Page, email: string, password = PW) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

export async function otpFor(email: string) {
  for (let i = 0; i < 20; i++) {
    const m = await db.notificationDelivery.findFirst({ where: { toEmail: email, template: "verify-email" }, orderBy: { createdAt: "desc" } });
    const code = /Code: (\d{6})/.exec(m?.text ?? "")?.[1];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("No OTP found");
}
