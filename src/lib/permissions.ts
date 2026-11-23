/**
 * Permission catalogue. Permission KEYS are code capabilities (what the
 * software can do). Which administrators hold them is configured in the
 * database through roles (Admin → User Permissions), never hard-coded.
 */
export const PERMISSIONS = {
  "dashboard.view": { group: "General", description: "View the administrator overview" },
  "students.view": { group: "Students", description: "View students and applications" },
  "students.manage": { group: "Students", description: "Approve/reject applications, edit students, suspend accounts" },
  "students.promote": { group: "Students", description: "Run student promotion" },
  "teachers.view": { group: "Teachers", description: "View teachers and applications" },
  "teachers.manage": { group: "Teachers", description: "Approve/reject teachers, suspend accounts" },
  "teachers.assign": { group: "Teachers", description: "Assign subjects, classes and class teachers" },
  "parents.view": { group: "Parents", description: "View parents and relationships" },
  "parents.manage": { group: "Parents", description: "Verify/revoke parent-child relationships" },
  "academics.configure": { group: "Academics", description: "Sessions, terms, classes, sectors, subjects, offerings" },
  "registration.manage": { group: "Academics", description: "Manage subject registration windows and approvals" },
  "grading.configure": { group: "Results", description: "Grading systems and score allocation" },
  "results.review": { group: "Results", description: "Review, return and approve score submissions" },
  "results.publish": { group: "Results", description: "Publish results and generate report cards" },
  "results.amend": { group: "Results", description: "Amend published results (audited)" },
  "reportcards.configure": { group: "Results", description: "Configure report card templates" },
  "attendance.view": { group: "Attendance", description: "View school attendance" },
  "attendance.manage": { group: "Attendance", description: "Resolve attendance corrections, configure attendance" },
  "timetable.manage": { group: "Operations", description: "Create and publish timetables" },
  "announcements.manage": { group: "Communication", description: "Create and publish announcements" },
  "notifications.manage": { group: "Communication", description: "Send targeted messages, monitor email delivery" },
  "finance.view": { group: "Finance", description: "View fees, payments and financial reports" },
  "finance.configure": { group: "Finance", description: "Configure fees and bank details" },
  "finance.verify": { group: "Finance", description: "Verify, approve and reject payments" },
  "finance.adjust": { group: "Finance", description: "Record waivers, refunds and adjustments" },
  "reports.view": { group: "Reports", description: "Generate and export administrative reports" },
  "users.permissions": { group: "System", description: "Manage administrators, roles and permissions" },
  "audit.view": { group: "System", description: "View audit logs" },
  "settings.manage": { group: "System", description: "School information, branding, policies, maintenance mode" },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

/** Default administrator roles created by the bootstrap. Fully editable afterwards. */
export const DEFAULT_ADMIN_ROLES: { key: string; name: string; description: string; permissions: PermissionKey[] }[] = [
  { key: "super_admin", name: "Super Administrator", description: "Full control of the platform", permissions: ALL_PERMISSIONS },
  {
    key: "school_admin",
    name: "School Administrator",
    description: "Day-to-day school administration",
    permissions: ALL_PERMISSIONS.filter((p) => !["users.permissions", "results.amend", "finance.adjust"].includes(p)),
  },
  {
    key: "academic_officer",
    name: "Academic Officer",
    description: "Academic structure, registration, attendance and timetables",
    permissions: [
      "dashboard.view", "students.view", "teachers.view", "teachers.assign", "academics.configure", "registration.manage",
      "attendance.view", "attendance.manage", "timetable.manage", "results.review", "reports.view", "announcements.manage",
    ],
  },
  {
    key: "finance_officer",
    name: "Finance Officer",
    description: "Fees and payment verification",
    permissions: ["dashboard.view", "students.view", "finance.view", "finance.configure", "finance.verify", "reports.view"],
  },
  {
    key: "results_officer",
    name: "Results Officer",
    description: "Result review, publication and report cards",
    permissions: [
      "dashboard.view", "students.view", "results.review", "results.publish", "grading.configure", "reportcards.configure", "reports.view",
    ],
  },
];

/** Portal roles granted (by approval) to non-admin accounts. */
export const PORTAL_ROLES = {
  STUDENT: { key: "student", name: "Student" },
  TEACHER: { key: "teacher", name: "Teacher" },
  PARENT: { key: "parent", name: "Parent / Guardian" },
} as const;
