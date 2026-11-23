# Security

## Controls implemented

| Area | Implementation |
| --- | --- |
| Authentication | bcrypt (cost 12) passwords; configurable length + complexity, common-password and email-name checks; 6-digit email OTP (hashed, 15-min expiry, 5 attempts); single-use 1-hour reset links (hashed); timing-equalised login; account lockout after N failures; generic error messages |
| Sessions | 256-bit random opaque tokens stored as HMAC-SHA256 hashes; `HttpOnly`, `Secure`, `SameSite=Lax` cookie; server-side expiry; revocation on suspension, password change/reset, role removal; "sign out other devices" |
| Authorisation | Role and permission data are read from the database on every request (`getCurrentUser`); pages, server actions and API routes each enforce it. Choosing a role at registration grants nothing — student/teacher roles are only granted by an administrator approval transaction |
| Data scoping | Students: own records only. Teachers: students registered for their *active* assignments or in their class-teacher class. Parents: VERIFIED relationships only (`?child=` values outside that set are ignored). Admin access per permission |
| Approval gating | Pending/rejected/information-required users get no student/teacher role; protected pages redirect to the status page and actions throw |
| Results | Teachers cannot approve or publish; published sheets are locked; amendments need a separate permission, a reason, and are fully audited |
| Payments | Receipts never change balances; approval requires explicit confirmation and runs in a serializable transaction with a conditional status claim (no double posting); duplicate bank references flagged and blocked at DB level for approved submissions |
| Files | Private bucket; content-sniffed types (PDF/JPEG/PNG), per-purpose size limits, images re-encoded (EXIF stripped); every download re-authorised and served via 5-minute signed URLs; academic documents limited to results permissions |
| Input | zod validation on every action; Prisma parameterised queries (no string SQL with user input); React escaping; email templates escape all content; CSV/Excel exports neutralise formula injection |
| CSRF | Next.js server actions (POST + Origin check); cookies `SameSite=Lax` |
| Headers | `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, permissions policy, HSTS (`next.config.ts`) |
| Rate limiting | Login (per account and per IP), registration, OTP, reset, setup, payment submissions, link requests, public verification page |
| Errors | Only deliberate domain messages reach users; unexpected errors are logged server-side and shown generically |
| Audit | Append-only `AuditLog` with actor, IP, entity and details; sensitive operations flagged |
| Secrets | Environment variables only (`.env*` git-ignored); `render.yaml` holds no values; CI uses throwaway credentials |
| Setup | First Super Administrator only via `SETUP_TOKEN` (constant-time compared) or a shell script; disabled once one exists |
| Public verification | Shows masked name and document facts only |

The in-memory rate limiter assumes a single instance (true on the Render free plan). Move it to Postgres/Redis before scaling horizontally.

## Tracked dependency advisories

`npm audit --omit=dev` (Nov 2026) reports advisories whose fixes require **major-version upgrades**. The CI "Dependency security" job is set to fail on high-severity advisories, so it currently **fails** until these are resolved or the school/developer explicitly decides how to gate them:

| Package | Severity | Exposure | Resolution path |
| --- | --- | --- | --- |
| `prisma`, `@prisma/config`, `effect`, `deepmerge-ts` | high | Prisma CLI tooling used at build/migrate time, not request handling | Upgrade to Prisma 7 (driver adapters, `prisma.config.ts`) |
| `postcss` (bundled by Next) | high | build-time CSS processing | Upgrade to Next 16 |
| `next` | moderate | framework | Upgrade to Next 16 |
| `exceljs` → `uuid` | moderate | admin-only exports | Monitor / replace exceljs if no fix |

Already resolved by upgrading: `sharp` (processes uploaded images) → 0.35.5, `zod` (validates all input) → 4.6.7.

## Reporting

Report suspected vulnerabilities privately to the school's ICT administrator and the developer; do not open public issues containing personal data.
