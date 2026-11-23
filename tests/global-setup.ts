import { execSync } from "node:child_process";

/** Apply migrations to the disposable test database before integration tests. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url } });
}
