import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function HomeRedirect() {
  const u = await getCurrentUser();
  redirect(u ? homeFor(u) : "/login");
}
