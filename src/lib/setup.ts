import { db } from "@/lib/db";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { bootstrapSystem } from "@/lib/bootstrap";
import { audit } from "@/lib/audit";

export async function superAdminExists() {
  return (await db.userRole.count({ where: { role: { key: "super_admin" } } })) > 0;
}

/** Create the first Super Administrator. Only possible while none exists. */
export async function createInitialSuperAdmin(input: { email: string; password: string; fullName: string }) {
  await bootstrapSystem();
  const email = input.email.trim().toLowerCase();
  const problems = passwordProblems(input.password, 12, email);
  if (problems.length) throw new Error(problems.join(" "));
  return db.$transaction(async (tx) => {
    const count = await tx.userRole.count({ where: { role: { key: "super_admin" } } });
    if (count > 0) throw new Error("A Super Administrator already exists. Setup is disabled.");
    if (await tx.user.findUnique({ where: { email } })) throw new Error("An account with this email already exists.");
    const role = await tx.role.findUniqueOrThrow({ where: { key: "super_admin" } });
    const user = await tx.user.create({
      data: {
        email,
        passwordHash: await hashPassword(input.password),
        accountType: "ADMIN",
        emailVerifiedAt: new Date(),
        adminProfile: { create: { fullName: input.fullName.trim(), title: "Super Administrator" } },
        roles: { create: { roleId: role.id } },
      },
    });
    await audit({ actorId: user.id, action: "setup.super_admin_created", entityType: "User", entityId: user.id, sensitive: true }, tx);
    return user;
  });
}
