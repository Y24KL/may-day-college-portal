import type { PermissionKey } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: string; permission?: PermissionKey | PermissionKey[] };

export const STUDENT_NAV: NavItem[] = [
  { href: "/student", label: "Overview", icon: "home" },
  { href: "/student/profile", label: "My Profile", icon: "user" },
  { href: "/student/registration", label: "Subject Registration", icon: "clipboard" },
  { href: "/student/subjects", label: "My Subjects", icon: "book" },
  { href: "/student/results", label: "Academic Results", icon: "award" },
  { href: "/student/performance", label: "Academic Performance", icon: "chart" },
  { href: "/student/report-cards", label: "Report Cards", icon: "file" },
  { href: "/student/attendance", label: "Attendance", icon: "check" },
  { href: "/student/timetable", label: "Class Timetable", icon: "calendar" },
  { href: "/student/fees", label: "School Fees", icon: "wallet" },
  { href: "/student/payments", label: "Payment History", icon: "receipt" },
  { href: "/notices", label: "Notice Board", icon: "megaphone" },
  { href: "/notifications", label: "Notifications", icon: "bell" },
  { href: "/help", label: "Help & Support", icon: "help" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export const TEACHER_NAV: NavItem[] = [
  { href: "/teacher", label: "Overview", icon: "home" },
  { href: "/teacher/profile", label: "My Profile", icon: "user" },
  { href: "/teacher/subjects", label: "My Subjects", icon: "book" },
  { href: "/teacher/classes", label: "My Classes", icon: "layers" },
  { href: "/teacher/students", label: "Student Directory", icon: "users" },
  { href: "/teacher/attendance", label: "Attendance Management", icon: "check" },
  { href: "/teacher/scores", label: "Score Management", icon: "edit" },
  { href: "/teacher/timetable", label: "My Timetable", icon: "calendar" },
  { href: "/teacher/analytics", label: "Academic Analytics", icon: "chart" },
  { href: "/notices", label: "Notice Board", icon: "megaphone" },
  { href: "/notifications", label: "Notifications", icon: "bell" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export const PARENT_NAV: NavItem[] = [
  { href: "/parent", label: "Overview", icon: "home" },
  { href: "/parent/children", label: "My Children", icon: "users" },
  { href: "/parent/results", label: "Academic Results", icon: "award" },
  { href: "/parent/report-cards", label: "Report Cards", icon: "file" },
  { href: "/parent/performance", label: "Academic Performance", icon: "chart" },
  { href: "/parent/attendance", label: "Attendance", icon: "check" },
  { href: "/parent/timetable", label: "Class Timetable", icon: "calendar" },
  { href: "/parent/fees", label: "School Fees", icon: "wallet" },
  { href: "/parent/payments", label: "Payment History", icon: "receipt" },
  { href: "/notices", label: "Notice Board", icon: "megaphone" },
  { href: "/notifications", label: "Notifications", icon: "bell" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "home", permission: "dashboard.view" },
  { href: "/admin/students", label: "Student Management", icon: "graduation", permission: "students.view" },
  { href: "/admin/teachers", label: "Teacher Management", icon: "briefcase", permission: "teachers.view" },
  { href: "/admin/parents", label: "Parent Management", icon: "users", permission: "parents.view" },
  { href: "/admin/classes", label: "Class Management", icon: "layers", permission: "academics.configure" },
  { href: "/admin/subjects", label: "Subject Management", icon: "book", permission: "academics.configure" },
  { href: "/admin/registration", label: "Subject Registration", icon: "clipboard", permission: "registration.manage" },
  { href: "/admin/sessions", label: "Academic Sessions", icon: "calendar", permission: "academics.configure" },
  { href: "/admin/grading", label: "Grading", icon: "sliders", permission: "grading.configure" },
  { href: "/admin/results", label: "Results Management", icon: "award", permission: ["results.review", "results.publish"] },
  { href: "/admin/report-cards", label: "Report Card Management", icon: "file", permission: ["results.publish", "reportcards.configure"] },
  { href: "/admin/attendance", label: "Attendance Management", icon: "check", permission: "attendance.view" },
  { href: "/admin/timetables", label: "Timetable Management", icon: "clock", permission: "timetable.manage" },
  { href: "/admin/payments", label: "Payment Verification", icon: "receipt", permission: ["finance.verify", "finance.view"] },
  { href: "/admin/fees", label: "Fees & Bank Details", icon: "wallet", permission: "finance.configure" },
  { href: "/admin/finance", label: "Financial Reports", icon: "trending", permission: "finance.view" },
  { href: "/admin/analytics", label: "Academic Analytics", icon: "chart", permission: "reports.view" },
  { href: "/admin/reports", label: "Reports & Exports", icon: "download", permission: "reports.view" },
  { href: "/admin/announcements", label: "Announcements", icon: "megaphone", permission: "announcements.manage" },
  { href: "/notices", label: "Notice Board", icon: "pin" },
  { href: "/admin/messages", label: "Notification Management", icon: "send", permission: "notifications.manage" },
  { href: "/admin/email", label: "Email Management", icon: "mail", permission: "notifications.manage" },
  { href: "/admin/permissions", label: "User Permissions", icon: "shield", permission: "users.permissions" },
  { href: "/admin/audit", label: "Audit Logs", icon: "history", permission: "audit.view" },
  { href: "/admin/settings", label: "System Settings", icon: "settings", permission: "settings.manage" },
];

export function filterNav(items: NavItem[], perms: Set<string>) {
  return items.filter((i) => !i.permission || (Array.isArray(i.permission) ? i.permission.some((p) => perms.has(p)) : perms.has(i.permission)));
}
