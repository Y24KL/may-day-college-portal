"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Home, User, ClipboardList, BookOpen, Award, BarChart3, FileText, CheckSquare, CalendarDays, Wallet, Receipt, Megaphone, Bell, HelpCircle,
  Settings, Layers, Users, Pencil, GraduationCap, Briefcase, SlidersHorizontal, Clock, TrendingUp, Download, Send, Mail, Shield, History,
  Menu, X, LogOut, Pin, Search,
} from "lucide-react";
import type { NavItem } from "./nav";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Home> = {
  home: Home, user: User, clipboard: ClipboardList, book: BookOpen, award: Award, chart: BarChart3, file: FileText, check: CheckSquare,
  calendar: CalendarDays, wallet: Wallet, receipt: Receipt, megaphone: Megaphone, bell: Bell, help: HelpCircle, settings: Settings,
  layers: Layers, users: Users, edit: Pencil, graduation: GraduationCap, briefcase: Briefcase, sliders: SlidersHorizontal, clock: Clock,
  trending: TrendingUp, download: Download, send: Send, mail: Mail, shield: Shield, history: History, pin: Pin,
};

export function PortalShell({ nav, portalLabel, userName, userMeta, unread, logoUrl, schoolName, children, searchAction, logoutAction }: {
  nav: NavItem[]; portalLabel: string; userName: string; userMeta?: string; unread: number; logoUrl?: string | null; schoolName: string; children: ReactNode; searchAction?: string; logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const root = nav[0]?.href;
  const isActive = (href: string) => (href === root ? pathname === href : pathname === href || pathname.startsWith(href + "/"));

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link href={root ?? "/"} className="mb-6 flex items-center gap-3 px-2" onClick={() => setOpen(false)}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-10 w-10 rounded-xl bg-white object-contain p-1" />
        ) : (
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-gold to-amber-500 font-display text-lg font-bold text-navy">M</div>
        )}
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-bold text-white">{schoolName}</p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-gold">{portalLabel}</p>
        </div>
      </Link>
      <nav className="-mx-1 flex-1 space-y-0.5 overflow-y-auto px-1 pb-4" aria-label={`${portalLabel} navigation`}>
        {nav.map((item) => {
          const Icon = ICONS[item.icon] ?? Home;
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href} className="nav-link relative" data-active={active} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)}>
              {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-white/10" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
              <Icon className="relative h-4 w-4 shrink-0" aria-hidden />
              <span className="relative truncate">{item.label}</span>
              {item.href === "/notifications" && unread > 0 && <span className="relative ml-auto rounded-full bg-gold px-1.5 text-[10px] font-bold text-navy">{unread}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-xl bg-white/5 p-3">
        <p className="truncate text-sm font-semibold text-white">{userName}</p>
        {userMeta && <p className="truncate text-xs text-white/60">{userMeta}</p>}
        <form action={logoutAction} className="mt-2">
          <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"><LogOut className="h-3.5 w-3.5" /> Sign out</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-72">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 p-4 lg:block">
        <div className="glass-dark h-full p-4">{sidebar}</div>
      </aside>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <motion.aside className="absolute inset-y-0 left-0 w-[86%] max-w-xs p-3" initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} transition={{ type: "spring", stiffness: 380, damping: 36 }}>
              <div className="glass-dark relative h-full p-4">
                <button className="absolute right-3 top-3 rounded-lg p-1.5 text-white/80 hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
                {sidebar}
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
      <header className="sticky top-0 z-20 px-3 pt-3 sm:px-6">
        <div className="glass flex items-center gap-3 px-3 py-2.5 sm:px-4">
          <button className="btn-ghost btn-sm lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          {searchAction ? (
            <form action={searchAction} method="get" className="relative hidden flex-1 sm:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input name="q" placeholder="Search students, teachers, parents, payments…" className="input max-w-md border-transparent bg-white/60 pl-9" aria-label="Global search" />
            </form>
          ) : (
            <p className="flex-1 truncate text-sm font-semibold text-navy">{portalLabel}</p>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Link href="/notifications" className="btn-ghost btn-sm relative" aria-label={`Notifications (${unread} unread)`}>
              <Bell className="h-5 w-5" />
              {unread > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-gold ring-2 ring-white" />}
            </Link>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-navy">{userName}</p>
              {userMeta && <p className="text-xs text-muted">{userMeta}</p>}
            </div>
          </div>
        </div>
      </header>
      <motion.main key={pathname} className={cn("mx-auto max-w-7xl px-3 pb-16 pt-6 sm:px-6")} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
        {children}
      </motion.main>
    </div>
  );
}
