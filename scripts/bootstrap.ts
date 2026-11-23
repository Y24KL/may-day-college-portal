import { bootstrapSystem } from "../src/lib/bootstrap";
import { db } from "../src/lib/db";

bootstrapSystem()
  .then(() => console.log("✔ System bootstrap complete (permissions, roles, settings)."))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
