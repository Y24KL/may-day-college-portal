"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { run, type ActionState } from "@/lib/action";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import { createSession, destroyCurrentSession, clientInfo, revokeAllSessions } from "@/lib/auth/session";
import { getCurrentUser, homeFor } from "@/lib/auth/current-user";
import { hashToken, randomOtp, randomToken } from "@/lib/auth/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { getSettingsFresh } from "@/lib/settings";
import { enqueueEmail } from "@/lib/email/outbox";
import { kickEmailWorker } from "@/lib/email/worker";
import { makeReference } from "@/lib/counters";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { redirect } from "next/navigation";
import type { Tx } from "@/lib/db";

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);

async function limit(bucket: string, max: number, windowMs: number) {
  const { ip } = await clientInfo();
  const r = rateLimit(`${bucket}:${ip}`, max, windowMs);
  if (!r.ok) throw new Error(`Too many attempts. Please wait ${Math.ceil(r.retryAfterSec / 60)} minute(s) and try again.`);
}

async function checkPassword(pw: string, confirm: string, mail: string) {
  const s = await getSettingsFresh();
  if (pw !== confirm) throw new Error("Passwords do not match.");
  const problems = passwordProblems(pw, s.passwordMinLength, mail);
  if (problems.length) throw new Error(problems.join(" "));
  return s;
}

async function sendOtp(userId: string, to: string, tx: Tx = db) {
  const code = randomOtp();
  await tx.emailVerification.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
  await tx.emailVerification.create({ data: { userId, codeHash: hashToken(`${userId}:${code}`), expiresAt: new Date(Date.now() + 15 * 60_000) } });
  await enqueueEmail(
    {
      to,
      userId,
      subject: "Your May Day College verification code",
      template: "verify-email",
      priority: "CRITICAL",
      content: { heading: "Verify your email address", paragraphs: ["Use this code to verify your email address. It expires in 15 minutes."], code, footnote: "If you did not create an account, you can ignore this email." },
    },
    tx,
  );
}

async function ensureUnique(mail: string) {
  if (await db.user.findUnique({ where: { email: mail } })) throw new Error("An account with this email already exists. Sign in, or use “Forgot password”.");
}

export async function registerStudent(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await limit("register", 60, 60 * 60_000);
    const d = z.object({ email, guardianEmail: email, password: z.string(), confirm: z.string() }).parse(Object.fromEntries(fd));
    if (d.email === d.guardianEmail) throw new Error("The parent/guardian email must be different from the student's email.");
    const s = await checkPassword(d.password, d.confirm, d.email);
    if (!s.studentRegistrationOpen) throw new Error("Student registration is currently closed.");
    await ensureUnique(d.email);
    const passwordHash = await hashPassword(d.password);
    const user = await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email: d.email, passwordHash, accountType: "STUDENT", studentApplication: { create: { reference: makeReference("STU"), guardianEmail: d.guardianEmail } } },
      });
      await sendOtp(u.id, u.email, tx);
      await audit({ actorId: u.id, action: "register.student", entityType: "User", entityId: u.id }, tx);
      return u;
    });
    await createSession(user.id, 24);
    await kickEmailWorker();
    return { ok: true, redirect: "/verify-email" };
  });
}

export async function registerTeacher(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await limit("register", 60, 60 * 60_000);
    const d = z.object({ fullName: z.string().trim().min(3, "Enter your full name.").max(120), email, password: z.string(), confirm: z.string() }).parse(Object.fromEntries(fd));
    const s = await checkPassword(d.password, d.confirm, d.email);
    if (!s.teacherRegistrationOpen) throw new Error("Teacher registration is currently closed.");
    await ensureUnique(d.email);
    const passwordHash = await hashPassword(d.password);
    const user = await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email: d.email, passwordHash, accountType: "TEACHER", teacherApplication: { create: { reference: makeReference("TCH"), fullName: d.fullName } } },
      });
      await sendOtp(u.id, u.email, tx);
      await audit({ actorId: u.id, action: "register.teacher", entityType: "User", entityId: u.id }, tx);
      return u;
    });
    await createSession(user.id, 24);
    await kickEmailWorker();
    return { ok: true, redirect: "/verify-email" };
  });
}

export async function registerParent(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await limit("register", 60, 60 * 60_000);
    const d = z
      .object({ fullName: z.string().trim().min(3, "Enter your full name.").max(120), email, phone: z.string().trim().min(7, "Enter a valid phone number.").max(30), password: z.string(), confirm: z.string(), invite: z.string().optional() })
      .parse(Object.fromEntries(fd));
    const s = await checkPassword(d.password, d.confirm, d.email);
    if (!s.parentRegistrationOpen) throw new Error("Parent registration is currently closed.");
    await ensureUnique(d.email);
    const passwordHash = await hashPassword(d.password);
    const user = await db.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { email: d.email, passwordHash, accountType: "PARENT", parent: { create: { fullName: d.fullName, phone: d.phone } } } });
      await sendOtp(u.id, u.email, tx);
      await audit({ actorId: u.id, action: "register.parent", entityType: "User", entityId: u.id }, tx);
      return u;
    });
    await createSession(user.id, 24);
    await kickEmailWorker();
    return { ok: true, redirect: d.invite ? `/verify-email?next=${encodeURIComponent(`/parent/invitation?token=${d.invite}`)}` : "/verify-email" };
  });
}

export async function verifyEmail(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const u = await getCurrentUser();
    if (!u) throw new Error("Your session has expired. Please sign in again.");
    await limit(`verify:${u.id}`, 10, 15 * 60_000);
    const code = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.").parse(fd.get("code"));
    const next = String(fd.get("next") || "");
    const v = await db.emailVerification.findFirst({ where: { userId: u.id, usedAt: null }, orderBy: { createdAt: "desc" } });
    if (!v || v.expiresAt < new Date()) throw new Error("This code has expired. Request a new code.");
    if (v.attempts >= 5) throw new Error("Too many incorrect attempts. Request a new code.");
    if (v.codeHash !== hashToken(`${u.id}:${code}`)) {
      await db.emailVerification.update({ where: { id: v.id }, data: { attempts: { increment: 1 } } });
      throw new Error("That code is incorrect.");
    }
    await db.$transaction(async (tx) => {
      await tx.emailVerification.update({ where: { id: v.id }, data: { usedAt: new Date() } });
      await tx.user.update({ where: { id: u.id }, data: { emailVerifiedAt: new Date() } });
      if (u.accountType === "PARENT") {
        // Parents need no approval for their own account; access to children
        // still requires a VERIFIED relationship per child.
        const role = await tx.role.findUniqueOrThrow({ where: { key: "parent" } });
        await tx.userRole.upsert({ where: { userId_roleId: { userId: u.id, roleId: role.id } }, create: { userId: u.id, roleId: role.id }, update: {} });
      }
      await audit({ actorId: u.id, action: "email.verified", entityType: "User", entityId: u.id }, tx);
    });
    const dest = next.startsWith("/") && !next.startsWith("//") ? next : u.accountType === "PARENT" ? "/parent" : "/application";
    return { ok: true, message: "Email verified.", redirect: dest };
  });
}

export async function resendVerification(_: ActionState): Promise<ActionState> {
  return run(async () => {
    const u = await getCurrentUser();
    if (!u) throw new Error("Please sign in again.");
    if (u.emailVerified) return { ok: true, message: "Your email is already verified." };
    const r = rateLimit(`resend:${u.id}`, 3, 15 * 60_000);
    if (!r.ok) throw new Error("Please wait a few minutes before requesting another code.");
    await sendOtp(u.id, u.email);
    await kickEmailWorker();
    return { ok: true, message: "A new code has been sent." };
  });
}

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    // Per-IP ceiling is generous because a whole school lab may share one
    // public IP; per-account+IP limiting and account lockout stop brute force.
    await limit("login", 300, 15 * 60_000);
    const d = z.object({ email, password: z.string().min(1, "Enter your password."), next: z.string().optional() }).parse(Object.fromEntries(fd));
    await limit(`login:${d.email}`, 10, 15 * 60_000);
    const s = await getSettingsFresh();
    const generic = "Incorrect email or password.";
    const user = await db.user.findUnique({ where: { email: d.email } });
    if (!user) {
      await verifyPassword(d.password, "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5e2Q7m0x0yJ8Hn6m9wYqX0Gm0U5n2pW").catch(() => false); // equalise timing
      throw new Error(generic);
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new Error("This account is temporarily locked after repeated failed sign-ins. Try again later or reset your password.");
    const ok = await verifyPassword(d.password, user.passwordHash);
    if (!ok) {
      const fails = user.failedLoginCount + 1;
      await db.user.update({
        where: { id: user.id },
        data: fails >= s.maxFailedLogins ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + s.lockoutMinutes * 60_000) } : { failedLoginCount: fails },
      });
      if (fails >= s.maxFailedLogins) await audit({ actorId: user.id, action: "auth.locked", entityType: "User", entityId: user.id, sensitive: true });
      throw new Error(generic);
    }
    if (user.status === "SUSPENDED") throw new Error("This account has been suspended. Please contact the school administration.");
    if (user.status === "DEACTIVATED") throw new Error("This account has been deactivated.");
    await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await createSession(user.id, s.sessionLifetimeHours);
    const { ip } = await clientInfo();
    await audit({ actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id, ip });
    const next = d.next && d.next.startsWith("/") && !d.next.startsWith("//") ? d.next : null;
    return { ok: true, redirect: next ?? "/home" };
  });
}

export async function logout() {
  await destroyCurrentSession();
  redirect("/login");
}

export async function requestPasswordReset(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await limit("reset", 5, 60 * 60_000);
    const mail = email.parse(fd.get("email"));
    const user = await db.user.findUnique({ where: { email: mail } });
    if (user && user.status === "ACTIVE") {
      const token = randomToken(32);
      await db.$transaction(async (tx) => {
        await tx.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
        await tx.passwordReset.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60_000) } });
        await enqueueEmail(
          {
            to: user.email,
            userId: user.id,
            subject: "Reset your May Day College portal password",
            template: "password-reset",
            priority: "CRITICAL",
            content: { heading: "Password reset request", paragraphs: ["We received a request to reset your password. This link expires in 1 hour and can be used once."], cta: { label: "Choose a new password", url: `${env.appBaseUrl}/reset-password?token=${token}` }, footnote: "If you did not request this, you can safely ignore this email — your password will not change." },
          },
          tx,
        );
      });
      await kickEmailWorker();
    }
    return { ok: true, message: "If an account exists for that email, a reset link has been sent." };
  });
}

export async function resetPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await limit("reset-confirm", 10, 60 * 60_000);
    const d = z.object({ token: z.string().min(20), password: z.string(), confirm: z.string() }).parse(Object.fromEntries(fd));
    const pr = await db.passwordReset.findUnique({ where: { tokenHash: hashToken(d.token) }, include: { user: true } });
    if (!pr || pr.usedAt || pr.expiresAt < new Date()) throw new Error("This reset link is invalid or has expired. Request a new one.");
    await checkPassword(d.password, d.confirm, pr.user.email);
    await db.$transaction(async (tx) => {
      await tx.passwordReset.update({ where: { id: pr.id }, data: { usedAt: new Date() } });
      // Resetting via emailed link also proves control of the email address.
      await tx.user.update({ where: { id: pr.userId }, data: { passwordHash: await hashPassword(d.password), failedLoginCount: 0, lockedUntil: null, emailVerifiedAt: pr.user.emailVerifiedAt ?? new Date() } });
      await audit({ actorId: pr.userId, action: "auth.password_reset", entityType: "User", entityId: pr.userId, sensitive: true }, tx);
    });
    await revokeAllSessions(pr.userId);
    return { ok: true, message: "Password updated. Please sign in.", redirect: "/login" };
  });
}

export async function changePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const u = await getCurrentUser();
    if (!u) throw new Error("Please sign in.");
    const d = z.object({ current: z.string(), password: z.string(), confirm: z.string() }).parse(Object.fromEntries(fd));
    const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!(await verifyPassword(d.current, user.passwordHash))) throw new Error("Your current password is incorrect.");
    await checkPassword(d.password, d.confirm, user.email);
    await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(d.password) } });
    await revokeAllSessions(u.id, u.sessionTokenHash);
    await audit({ actorId: u.id, action: "auth.password_changed", entityType: "User", entityId: u.id, sensitive: true });
    return { ok: true, message: "Password changed. Other devices have been signed out." };
  });
}

export async function signOutOtherSessions(_: ActionState): Promise<ActionState> {
  return run(async () => {
    const u = await getCurrentUser();
    if (!u) throw new Error("Please sign in.");
    await revokeAllSessions(u.id, u.sessionTokenHash);
    return { ok: true, message: "Signed out of all other devices." };
  });
}

export async function goHome() {
  const u = await getCurrentUser();
  redirect(u ? homeFor(u) : "/login");
}
