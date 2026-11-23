import Link from "next/link";
import { Card, EmptyState } from "@/components/ui";

export function NoChildren() {
  return <Card><EmptyState title="No linked children yet" description="Accept the invitation sent to your email, or request a link for the school to verify." action={<Link className="btn-primary" href="/parent/children">Link a child</Link>} /></Card>;
}
