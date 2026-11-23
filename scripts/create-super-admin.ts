/**
 * Protected deployment-time setup of the first Super Administrator.
 *   SUPER_ADMIN_EMAIL=... SUPER_ADMIN_NAME="..." SUPER_ADMIN_PASSWORD=... npm run setup:admin
 * Run from a trusted shell (e.g. Render Shell) with DATABASE_URL set.
 */
import { createInitialSuperAdmin } from "../src/lib/setup";
import { db } from "../src/lib/db";

const email = process.env.SUPER_ADMIN_EMAIL;
const fullName = process.env.SUPER_ADMIN_NAME;
const password = process.env.SUPER_ADMIN_PASSWORD;
if (!email || !fullName || !password) {
  console.error("Set SUPER_ADMIN_EMAIL, SUPER_ADMIN_NAME and SUPER_ADMIN_PASSWORD.");
  process.exit(1);
}
createInitialSuperAdmin({ email, fullName, password })
  .then((u) => console.log(`✔ Super Administrator created: ${u.email}`))
  .catch((e) => {
    console.error(`✖ ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
