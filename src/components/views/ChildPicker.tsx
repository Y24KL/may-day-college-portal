import Link from "next/link";
import { cn } from "@/lib/utils";

export function ChildPicker({ items: children, selectedId, basePath }: { items: { id: string; fullName: string; currentClass?: { name: string } | null }[]; selectedId?: string; basePath: string }) {
  if (children.length <= 1) return null;
  return (
    <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Select child">
      {children.map((c) => (
        <Link key={c.id} href={`${basePath}?child=${c.id}`} role="tab" aria-selected={c.id === selectedId} className={cn(c.id === selectedId ? "btn-primary btn-sm" : "btn-secondary btn-sm")}>
          {c.fullName.split(" ").slice(-1)[0]} {c.currentClass && <span className="opacity-70">· {c.currentClass.name}</span>}
        </Link>
      ))}
    </div>
  );
}
