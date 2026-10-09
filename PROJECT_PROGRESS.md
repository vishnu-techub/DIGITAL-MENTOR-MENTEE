# Project Progress

> SINGLE SOURCE OF TRUTH for all development progress, fixes, pending issues,
> decisions, and verification results.
> Read this file FIRST at the start of every task. Update it at the END of every task.
> No secrets, passwords, API keys, JWT secrets, or database credentials in this file.

Status legend: `PASS` | `PARTIAL` | `FAIL` | `PENDING`

> ## ⚠️ TEMPORARY LOCAL FILE STORAGE
>
> Temporary local file storage. Replace with a persistent database/storage implementation before production deployment.
>
> MongoDB and Mongoose have been removed from this project. There is no database server to
> install and no connection string to set. Records are JSON files in `backend/data/`; uploaded
> documents are files in `backend/storage/uploads/`. Data survives a normal process restart but
> **not** a redeploy, a rebuild or a change of host. Render's free plan has no persistent disk, so
> on that plan everything is lost on each cold start — attach a persistent disk and point
> `DATA_DIR` / `UPLOADS_DIR` at it before relying on this anywhere real.

---

## Current Status

- **Overall project status:** PASS — Backend and frontend both build clean. All 19 backend test
  suites green (see Verification). Full 6-state permission machine implemented and enforced
  server-side. Grammar & Spelling Assistant implemented and runtime-verified. Persistence layer is
  now local files. Mentoring Records now carry a required Discussion With (student / parent / both)
  and size-capped evidence photos (location/GPS tracking removed), including Saturday photos stored once and shared
  across participants. HOD department dashboard, mentoring analytics, student/faculty CRUD, mentor
  assignment and faculty notifications are implemented and verified against two seeded departments.
  The **HOD Dashboard analytics pass** (2026-10-07) re-verified every figure against stored,
  department-scoped rows: a reporting-month selector (`?month=YYYY-MM`, server-validated) drives the
  pie / mentor-wise / mentor-detail views, "Mentored" is the DISTINCT students with ≥1 record in the
  selected month (extra sessions never inflate coverage), Active Mentees and Active Students are
  reported, weekly progress runs a 4-week / 30-day window (overridable up to 26), and the 30-day
  report now carries a **Mentor-wise 30-day section** with per-mentor windowed rows and a
  `notCovered` register-number list. 33-assertion `test:hod` suite, all 14 suites green.
  The **college-wide Admin Overall Mentoring Dashboard** is implemented and verified against three
  seeded departments (two populated, one deliberately empty). **Admin HOD Management** (create /
  list / edit / deactivate HOD accounts, one active HOD per department, ADMIN-only) is implemented
  and verified with its own 22-assertion suite. **Faculty → HOD department notifications** are
  implemented and verified: a Faculty member notifies their own department HOD (server decides the
  department from the sender's Faculty record, never from the body), each active HOD **and** each
  active Admin gets one per-recipient read-state copy, the HOD marks it read / views details, and
  the Faculty "sent" list shows one row per send with a read receipt — 21-assertion suite.
  **Admin Mentoring Dashboard 404 — locked to ground truth with a new suite.** The browser had
  called `/api/admin/mentoring-overview/*` and `/api/admin/hods`; the real server mounts
  `/api/admin/overview/*` (registered in `src/index.ts` before `/api/admin`) and `/api/admin/hods`
  for HOD Management. No frontend source or freshly built bundle ever produces `mentoring-overview`
  as a URL (it is only an `AdminMentoringDashboard.tsx` `currentTab` key) — the 404s came from a
  stale deployed bundle — so the fix is a permanently verified route contract: new `test:admin-routes`
  asserts the exact URLs the Admin UI calls all return 200 with real data, the legacy prefix is
  refused 404 (no duplicate routes exist), the surface stays ADMIN-only (403/401), `/api/admin/hods`
  works, and the HOD-scoped `/api/hod/dashboard` is unchanged — 8/8 PASS.
  **Internal Assessment Marks** (2026-10-07) are implemented end-to-end: an admin-controlled
  mark-entry window (IA1 / 50, IA2 / 50, End Semester / 100) whose status is computed
  fail-closed server-side (INACTIVE / ACTIVE / EXPIRED), mentor entry inside the window, and an
  admin-approved correction-request flow with audit trail (the official row changes only on approval); the record-book PDF renders in three
  `?mode=` scopes (full dossier / internal assessment / mentor documents). Admin tab, mentor
  panel and student buttons are wired in. New `test:internal-marks` suite 97/97; 15 suites green.
  **Placement Monitoring, Achievement Points and the Achievement Leaderboard** (2026-10-08) are
  implemented end-to-end: a final-year placement lifecycle with a server-authoritative
  transition table (PLACED terminal; NOT_PLACED non-terminal; PLACED requires a company name),
  HOD summary/mentor-wise/student-wise views and a mentor single-student editor; an achievement
  ledger scored from a shared `ACHIEVEMENT_POINT_TABLE` where only verifier **Approved** rows
  credit points, duplicates are refused, Hackathon rows need a recorded result and `Other` rows
  carry 0; and a deterministic cross-role leaderboard (points DESC → verified count DESC →
  register number ASC) that ranks every active student in scope, including 0-point students.
  New `test:placement` + `test:leaderboard` suites, both 100% green; all 15 pre-existing suites
  re-run green; frontend build clean.
  The **Admin features pass** (2026-10-08) added the "Remove HOD" action (Admin HOD Management —
  deactivates, never deletes; account + records retained, audit preserved), **Faculty Department
  Reassignment** (`PATCH /api/admin/faculty/:facultyId/department`, ADMIN-only; updates both the
  Faculty and User rows so a re-login carries the new `departmentId` claim, moves the faculty across
  HOD scope without touching any ACTIVE MentorAssignment or historical counselling record, writes a
  `REASSIGN_FACULTY_DEPARTMENT` audit, returns previous/new department + `unchangedMentees`), and a
  **dedicated Student Documents viewer** (Admin → Student Documents opens `AdminStudentDocuments`
  — document list + authenticated PDF/image preview (blob URL, revoked on close), metadata panel,
  Download/Back — instead of redirecting to the Student Profile). New `test:faculty-dept-reassign`
  18/18; `test:hod-admin` re-run 22/22; 18 suites green; both builds clean.
  **Admin Bulk Upload** (2026-10-08) is implemented end-to-end: Admin-only `.xlsx` bulk import for
  Students and Faculty. Backend routes (`POST /api/admin/bulk-upload/students/validate`,
  `POST /api/admin/bulk-upload/students/import`, faculty equivalents, two template-download routes and
  an error-report route) are mounted on the existing `adminRouter`. A `multer` memory-storage guard
  rejects non-`.xlsx` MIME types and enforces a 10 MB limit before parsing. Validation reads columns
  via `exceljs`, cross-checks departments/batches against live data, detects in-file duplicates and
  already-existing records (by Register No / Employee ID), and returns a per-row preview with status
  (`VALID`, `INVALID`, `DUPLICATE`, `ALREADY_EXISTS`) and per-row error messages. Import calls the
  same creation code-path used by the manual forms so all existing validation, hashing, and audit
  logic is reused; existing records are **never** overwritten. A draggable, filterable, searchable
  `AdminBulkUpload.tsx` page (template download → drag-drop upload → validate & preview table →
  confirm modal → result summary + error-report download) is mounted in `AdminDashboard.tsx` and
  wired in `Sidebar.tsx`. Frontend TypeScript: **0 errors**. Backend TypeScript: **0 errors**.
  The **2026 cohesion UI/UX pass** (2026-10-09) redesigned the entire frontend in one language
  (navy/gold/slate), fixed the ~371 undefined CSS-variable declarations that silently invalidated
  the old stylesheet, rebuilt the shell (collapsible navy sidebar, topbar context, boot splash,
  two-column login), added shared `PageHeader` to every Admin/HOD/Faculty/Mentor/Student view with
  token-based colors, and refactored toasts to the design system. Presentation-only: APIs, RBAC,
  workflows, calculations, counselling's five categories, evidence/dossier tabs, leaderboard
  point table and role scopes are unchanged. Verified: frontend `tsc --noEmit` + `vite build`
  PASS; backend frontend-contract suites `test:bulk-upload` 23/23, `test:faculty-dept-reassign`
  18/18, `test:admin-routes` 8/8. A scoped **Sidebar Redesign** pass followed the same day:
  brand/logo portal header, regrouped role nav (MAIN / MANAGEMENT / ACADEMIC / MENTORING /
  PERFORMANCE-style), always-reachable expand control in the collapsed rail, 20px icons, and a
  tablet-aware drawer (backdrop, Escape, close-on-navigate). Sidebar-only presentation change —
  every item key/route/label preserved; `tsc --noEmit` + `vite build` PASS. A scoped **login
  banner removal** pass the same day deleted the "Institutional Portal Access • Role-Based
  Authentication" info banner from `LoginPage.tsx` (icon, background, border and its reserved
  spacing) so the sign-in form flows straight after the card header; every other login-page
  element (brand panel, logo, fields, toggle, Sign In, Download/Install, footer) is untouched
  and the generic `alert-info` style remains available. No auth/API/routing change.
- **Demo HOD accounts:** PASS (2026-10-09) — the five demo/verification HOD accounts (origin proven by
  name + audit trail, not by department) are now **permanently deleted** through the new Admin-only
  delete path (1 via the browser UI E2E, 4 via the API); the live store holds 8 genuine HOD accounts
  (all active), deleted usernames return 401, nothing reappears after a backend restart
  (byte-identical files), and genuine accounts (1 ADMIN / 8 HOD / 2 FACULTY / 1 STUDENT) plus the
  full 166-record audit history (now +5 `DELETE_HOD` entries, no secrets) are preserved.
- **Admin-only permanent HOD deletion:** PASS (2026-10-09) — new `DELETE /api/admin/hods/:hodId`
  (ADMIN-only, re-checked in the handler) permanently removes one HOD account and writes a preserved
  `DELETE_HOD` audit **before** the removal. Hard gates: validates id, refuses non-HOD roles (Admin /
  Faculty / Student are never touched), refuses active HODs (409 — deactivate first), enforces the
  one-active-HOD-per-department rule, refuses deletion while any dependent record references the
  account (full reference scan over every User-id-holding field; `AuditLog` deliberately excluded so
  history stays intact), and only ever deletes inactive demo HODs on an explicit, reviewed allowlist
  (`VERIFIED_DEMO_HOD_IDS` — never matched by username/department/name). No broad user-deletion
  function exists. Frontend: a "Delete HOD" action renders **only** on inactive verified-demo rows
  (the 8 active genuine HODs keep only View/Edit/Deactivate/Remove), behind a confirm modal that
  names the account and states the action "cannot be undone"; success/error feedback + list refresh;
  Add/View/Edit/Activate/Deactivate unchanged. New `test:hod-delete` suite 17/17.
- **Storage layer:** PASS — Mongoose shim over JSON files; no MongoDB dependency, no external
  service. Records survive a real process restart (verified across two separate processes).
- **Current deployment status:** PARTIAL — Vercel = PASS. Render = fix implemented and verified
  locally; awaiting redeploy to confirm on the live host. **Render is now higher risk than before**:
  the free plan's filesystem is ephemeral, so a redeploy discards all records and uploads.
- **Blocking issue:** None. The earlier Render `EPERM` crash remains fixed; the local-file store
  also removed the cause rather than papering over it.
- **Mentoring Evidence GPS/geotagging:** COMPLETELY REMOVED. Old GPS/geotag implementation is SUPERSEDED AND OBSOLETE. No location tracking of any kind remains in the mentoring evidence flow.

---

## Completed

### Admin-only permanent HOD deletion + live demo-account cleanup — PASS (2026-10-09)

**What it was:** the user asked for a supported way to permanently remove the verified demo HOD
accounts from the app and from the Admin HOD Management list — without touching the architecture (no
MongoDB), without endangering genuine accounts, and without losing any history.

**Backend — Admin-only delete route:**
- New `deleteHod` handler in `backend/src/modules/admin/admin-hod.controller.ts` + mounted as
  `DELETE /api/admin/hods/:hodId` in `admin.routes.ts` (authorized ADMIN at the router **and**
  re-checked in the handler; HOD/FACULTY/STUDENT → 403, anonymous → 401).
- **Hard gates (each returned as a clear 4xx, nothing ever partially deleted):** validates the
  `:hodId`; the target must be a real `role === 'HOD'` user (Admin / Faculty / Student are never
  touched, 403); an **active** HOD is refused (409 — the existing Deactivate path must be used
  first); the one-active-HOD-per-department rule is enforced (no slot can be left occupied or
  double-booked); deletion is refused while **any dependent record references the account** — a full
  reference scan over every User-id-holding field across notifications, mentor_assignments,
  system_settings, student_documents (uploaded/rejected), achievements (verified/created/updated),
  placements, academic/student edit requests, internal-marks surfaces and counselling/meeting
  `evidence.addedBy`; the `AuditLog` is deliberately **excluded** from the reference scan so
  historical logs can never block or die with the account.
- **Audit BEFORE removal:** a preserved `DELETE_HOD` audit record (actor admin id, `entityId` of the
  deleted user, details limited to `{username, fullName, departmentId, reason}` — no password/token/
  hash) is written, then the account is removed via the narrow `user.deleteOne()` (deletes only the
  fetched document; **no cascade**, no broad `deleteMany` anywhere).
- **Allowlist gate:** deletion is additionally restricted to inactive HOD accounts on an explicit,
  reviewed `VERIFIED_DEMO_HOD_IDS` allowlist exported from the controller — accounts are never matched
  by username/department/name, so a genuine account can never be deleted even by mistake. The 5
  verified demo ids are allowlisted; the 8 new active HODs are not (and are active anyway).
- **No broad deletion functions introduced:** `User.deleteOne/deleteMany` usage remains narrow and
  scoped exactly as before take-on.

**Frontend — Delete HOD action (Admin HOD Management):**
- `client.ts`: `AdminHodManagementRow` gains `is_verified_demo: 0 | 1`; new `api.admin.deleteHod(id)`.
- `AdminHodManagement.tsx`: a red **Delete HOD** action renders **only** on inactive verified-demo
  rows (`is_active === 0 && is_verified_demo === 1`) — the 8 active genuine HODs keep only
  View/Edit/Deactivate/Remove; both desktop table and mobile card views carry the action, behind a
  permanent-delete confirm modal that names the account/department and states the deletion "cannot be
  undone"; success/error toasts + list refresh. Add/View/Edit/Activate/Deactivate unchanged.

**Live cleanup (executed against `backend/` data, on a dedicated fresh instance on a spare port so
the user's `npm run dev` watcher on the stale 5050 server was never disturbed):**
1. Pre-cleanup snapshot of `backend/data` taken.
2. Fresh instance booted on 5052 against the live store: 13 HODs = 8 active genuine +
   5 inactive verified-demo (`is_verified_demo: 1`).
3. Browser UI E2E (headless Chromium, SPA rebuilt with a temporary `VITE_API_URL` override —
   the production `frontend/.env` points the built bundle **directly** at `localhost:5050`, the stale
   dev watcher, which is how the stale UI was being served; the override was needed so the browser
   exercised the new code, and the canonical dist was rebuilt afterwards): 14 `<tr>` (header+13),
   exactly **5 Delete HOD buttons, all on inactive verified-demo rows; 0 on the 8 active HODs**;
   modal shows "(Permanent)" + "cannot be undone" + names `hookrepro.hod`; confirm →
   `DELETE /api/admin/hods/6ac7411e5803a74d64b59194` → **200**; list refreshes 13 → 12 HODs,
   Delete buttons 5 → 4, toast shown, removed username gone; deleted-account login → 401; 0 page
   errors.
4. Remaining 4 demo HODs deleted via the API (200 each, `DELETE_HOD` audited each).
5. Final list: **8 HODs, all active, 0 verified-demo**; all 5 deleted usernames login → 401.
6. Audit: 166 pre-existing records all preserved (cross-check by action+entityId+createdAt,
   **0 missing**); **5 new `DELETE_HOD` entries**, details contain no secrets.
7. Restart verification: stopped and re-booted the backend twice — deleted HODs never reappear,
   HOD list stays 8/8/0, logins stay 401, and across a clean restart `audit_logs.json` is
   byte-identical while `users.json` differs only by the bootstrap's own admin `updatedAt` touch
   (a benign pre-existing startup behaviour — no account content changes).
8. Environment restored: canonical production `dist` rebuilt (bundle reverted to
   `index-CCHU7sU1.js`, `VITE_API_URL=5050` baked back in), dev 5050 watcher untouched, temporary
   5052 instance stopped, 4173 serve-dist proxy restored to its 5050 target.

**Verified / not claimed:** the earlier plan of serving the SPA through the 4173 proxy was based on a
wrong assumption — `frontend/.env` has `VITE_API_URL=http://localhost:5050`, so the built SPA calls
the backend directly and the proxy was never involved; the E2E was therefore run against dist rebuilt
with the override, exactly as recorded above. Backend `tsc --noEmit` clean; frontend `tsc` + `vite
build` clean. All suites green (see Verification table: `test:hod-delete` 17/17 is new;
`test:hod-admin` 22/22, `test:admin-routes` 8/8, `test:admin-auth` 13/13 re-run). No commit/push made.

### Admin Bulk Upload — UI redesign + Excel template overhaul — PASS

**Date:** 2026-10-09

**Scope:** enhancement of the existing Bulk Upload module only (no duplicate APIs, models, routes or
import logic): (A) rebuild the page as a polished Admin Portal module in the project's navy/gold
design system, (B) rebuild both Excel templates (25-column Student, model-supported Faculty,
Instructions + Reference Values sheets, marked sample rows, live drop-downs). No MongoDB, no
unrelated modules touched.

**Defects found and fixed (the module did not work before this pass):**
- **Route mismatch (6 routes):** `admin.routes.ts` served `/bulk-upload/template/students` while
  `client.ts` called `/bulk-upload/students/template` (and likewise for faculty template, both
  validate and both import routes) — every template download and every validate/import call 404'd.
  Backend routes were reordered to `/bulk-upload/<type>/<action>` to match the frontend and the
  documented contract.
- **Response-shape mismatch:** frontend expected `existingRows`, `errors[]`, a flat
  `{total, imported, …}` and uppercase `'IMPORTED'|'SKIPPED'|'FAILED'`; backend sends
  `existingRecords`, `reason`, a nested `{summary:{totalRows, imported, …}}` and
  `'Imported'|'Skipped'|'Failed'`. `client.ts` types + the page now mirror the backend exactly.
- **Dead Tailwind classes:** `AdminBulkUpload.tsx` was written entirely in Tailwind utilities but the
  project ships **no Tailwind**, so the page rendered unstyled — including
  `className="hidden"`, which meant the file input was permanently visible.
- **Sheet selection:** both validators read `workbook.worksheets[0]`, which is the *Instructions*
  sheet in the new templates. They now resolve the `Students` / `Faculty` sheet by name (falling
  back to the first non-instructions sheet, then sheet 0 for legacy files).
- **Blood-group parser:** `A+ve` / `AB-ve` (the exact values the template ships in its Reference
  Values sheet and sample row) were rejected — every otherwise-valid sample row came back INVALID.
  Found by the new test suite; `VE` suffix is now stripped before matching.
- **`gender` dropped:** the Student model has no `gender` field, but the old validator collected it
  and the importer wrote it. Removed rather than collected-and-discarded.

**Backend (`backend/src/modules/admin/bulk-upload.service.ts`):**
- `STUDENT_TEMPLATE_COLUMNS` — the exact 25 headers in the exact spec order across three sections
  (Basic / Personal & Family / Schooling & Admission). `FACULTY_TEMPLATE_COLUMNS` — the 6
  model-supported requested fields plus the pre-existing optional `Cabin Location` / `Username`.
  `FACULTY_UNSUPPORTED_FIELDS` — the 10 requested fields the Faculty/User models cannot store.
- Template generation now writes 3 sheets: **Instructions** (purpose, rules, mandatory fields,
  section map, sample-row rule, unsupported-fields disclosure), the data sheet (navy header row,
  one italic + tinted sample row, Excel list drop-downs on 7 controlled Student columns and
  Department for Faculty — 200 rows each, sourced from `'Reference Values'!$A$2…`), and
  **Reference Values** (live department codes/names + live batches + years/sections/residential/
  blood group/admission mode — never hard-coded lists).
- Parsers: `parseResidentialStatus`, `parseBloodGroup`, `parseAdmissionMode`, `parseMarkValue`
  (`450` or `450/500`), `parseContactNumber` (10-digit, `+91`/`0` tolerated), `parseIsoDate`
  (`YYYY-MM-DD`, `DD/MM/YYYY`, Date cells), `pickCol` alias lookup, `pickDataSheet`.
- **Sample-row safety:** any row whose Register No. / Employee ID starts with `SAMPLE` is always
  `INVALID` with an explanatory reason — the shipped sample rows can never be imported.
- Student validation extended to all 25 columns (mandatory set unchanged: Register No., Student
  Name, Department, Academic Batch) and `parsedData` now round-trips `residentialType`,
  `bloodGroup`, `address`, `parent{6}` and `school{7}`; `executeStudentImport` persists all of them.
  Faculty validation gained the `Email Address` header, the sample-row rule and a 10-digit mobile check.
- Safety preserved: `.xlsx` only, 10 MB, Admin-only, `VALID`/`INVALID`/`DUPLICATE`/`ALREADY_EXISTS`,
  existing records never overwritten (re-import creates 0 and leaves stored rows byte-identical).

**Frontend:**
- `AdminBulkUpload.tsx` rewritten on the project design system (`card`, `btn`, `badge`,
  `section-heading`, `notice` + new `bu-` classes — no Tailwind): page header with "Bulk Import
  Management" + subtitle + Admin-only chip; 🎓/👨‍🏫 selector cards (`role=radiogroup`,
  `aria-checked`); template download card; 4-step workflow indicator (Upload → Preview → Validate →
  Import, `aria-current="step"`, done/active states); keyboard-operable dropzone (`role=button`,
  `tabIndex`, Enter/Space, visually-hidden input via `style={{display:'none'}}`, drag states,
  10 MB/.xlsx client checks); 6 preview summary cards (Total/Valid/Invalid/Duplicate/Already
  Exists/Ready); status filter chips with counts + search; bordered preview table with per-status
  row accents and `scope="col"` headers; result banner + result cards + per-row result table;
  `[Download error report]` / `[Upload Another file]` actions; confirm modal with a
  summary list. All status/reason/summary fields match the backend contract.
- `client.ts` — `BulkPreviewRow` / `BulkSummary` / `BulkValidationResponse` /
  `BulkImportResultRow` / `BulkImportResponse` rewritten to the backend shapes (URLs unchanged, now
  aligned with the reordered routes).
- `styles/index.css` — one appended `bu-` block (~14 selectors, responsive at 720/640px,
  `:focus-visible` rings, WCAG-AA navy/gold/slate contrast).

**Verification:** new `test:bulk-upload` **23/23 PASS** (route alignment, template sheets/headers/
sample/dropdowns/live reference values, all four statuses incl. `SAMPLE… → INVALID`, 25-column
`parsedData`, import persistence + no-overwrite + no-sample-import, audit log, faculty flow,
error report, 403/401 RBAC, CSV/10 MB/corrupt/missing-file 400s, frontend source contracts).
Regressions: `test:admin-routes` 8/8, `test:hod-admin` 22/22. Backend `tsc --noEmit` clean;
frontend `tsc && vite build` clean (`bu-` selectors confirmed in the emitted CSS bundle).
No commit/push made.

### Complete Frontend UI/UX Redesign — 2026 Cohesion Pass — PASS (2026-10-09)

**Scope:** presentation-only, project-wide redesign of the KSRCE Digital Mentor-Mentee
Management System frontend as one cohesive product. No backend file, API route, RBAC rule,
workflow, calculation, import rule, role scope, counselling category, evidence/dossier tab or
leaderboard point was changed. No MongoDB, no Tailwind, no new dependency, no GPS/location UI
reintroduced.

**Root cause fixed first:** `frontend/src/styles/index.css` referenced ~371 undefined CSS
variables (`--primary-*`, `--slate-*`, `--gold-*`, `--success-*`, `--warning-*`, `--danger-*`,
`--info-*`), silently invalidating hundreds of declarations. Fixed in `:root` with a legacy-alias
block (no rule-by-rule edits); the only still-unresolved tokens carry fallbacks.

**Phase 1 - Design system:** appended the "KSRCE DIGITAL CAMPUS - 2026 COHESION LAYER"
(~330 lines) to `index.css`: global polish, deep-navy sidebar + gold accent, collapsible rail
(76px, localStorage `ksrce_sidebar_collapsed`), topbar context/role chip/icon buttons/notifications/
profile menu, `.page-header` + breadcrumbs, buttons (incl. `.btn-ghost` / `.btn-loading`), filter
chips with counts, form states, opt-in sticky tables (`.table-sticky`), modal polish, empty/error
state panels, toasts, `.app-boot` splash, two-column login, responsive rules and WCAG-AA focus
rings. Fixed 7 mojibake (U+FFFD) characters while rewording CSS (ASCII hyphens).

**Phase 2 - Shell:** rewrote `Sidebar.tsx` (data-driven `NAV_BY_ROLE`, all tab keys/labels/icons
preserved, section labels, collapse, tooltips, exported `getNavLabel`; fixed misplaced
`aria-current` expression); rewrote `Navbar.tsx` (`.topbar-*` classes, page context via
`pageLabel`, profile dropdown, notification polish, PWA install kept); updated `App.tsx` (navy
`.app-boot` loading screen, passes `pageLabel`); rewrote `LoginPage.tsx` (brand + form
two-column, login/validation/PWA behavior preserved).

**Phase 3-7 - Role pages + shared components:** new shared `PageHeader` component; `ToastContext`
refactored to `.toast-card` classes (with `.toast-icon` / `.toast-body` / `.toast-close` CSS).
Every role surface gained consistent `PageHeader` (eyebrow/title/subtitle/actions) and its inline
hex colors were normalized to design tokens where the value matched a token exactly:
- **Admin:** `AdminDashboard` (17 tabs), `AdminMentoringDashboard` (5 inner tabs),
  `AdminHodManagement`, `AdminInternalMarks`, `AdminStudentDocuments`, `AdminSchoolManagement`.
- **HOD:** `HodDashboard` (7 tabs + placement/leaderboard respected), `HodPlacementPanel`.
- **Faculty/Mentor:** `FacultyDashboard` (7 tabs), `MentorStudentProfileView` (9 dossier tabs),
  `MenteeProgressDashboard`, `InternalMarksMentorPanel`.
- **Student:** `StudentDashboard` (6 tabs), `CompleteProfileWizard`, `StudentProgressView`,
  `StudentDocumentsManager`.
Ad-hoc `h2` headers were replaced by `PageHeader` (single `<h1>` per view); existing action
buttons moved into `actions` with handlers/text preserved.

**Contract safety:** `Remove HOD` / `confirmRemoveHod` / `setHodStatus` intact and no
`api.admin.deleteHod`; `Preview unavailable` / `Back to Student Documents` / `fetchViewBlob` /
`getByStudent` intact and no `StudentDetailsView`; `AdminStudentDocuments` / `documentsStudent` /
`setDocumentsStudent` intact; client.ts URLs unchanged (no `mentoring-overview` prefix);
`index.css` still contains no `@tailwind`.

**Verification:** `frontend npx tsc --noEmit` PASS (repeated); `npx vite build` PASS (CSS
82.55 kB, 1659 modules). Backend contract suites that read frontend source all green:
`test:bulk-upload` 23/23, `test:faculty-dept-reassign` 18/18, `test:admin-routes` 8/8.
No commit/push made.

### Sidebar / Side Navigation Redesign (scoped pass) — PASS (2026-10-09)

**Scope:** sidebar-only UI pass. No routes, RBAC, auth, page logic, data fetching, or any
backend file changed. All item keys/labels/icons were reused unchanged; only the presentation
and group labels were reorganized.

- **Header / brand area:** the portal header now shows the KSRCE logo (`/ksrce-logo.png`,
  gold-ringed), "K.S.R. College of Engineering" and the "Digital Mentor–Mentee" product line,
  with ellipsis + `title` fallback so nothing overflows. The old role/dept text moved into the
  footer badges (which already carried role • dept), and the department context is still visible
  in each role's page headers.
- **Grouped navigation:** nav items regrouped under the requested vocabulary
  (MAIN / MANAGEMENT / ACADEMIC / MENTORING / PERFORMANCE / RECORDS / DATA / INSIGHTS &
  SYSTEM / TOOLS) per role — Admin, HOD, Faculty and Student each still show only their own
  existing items, in the same order.
- **Collapse/expand:** the desktop rail collapses to 76px; the expand control now stays
  reachable in the collapsed rail (stacked logo + chevron), fixing the previous dead-end where
  hiding the toggle made the collapsed state irreversible without clearing localStorage.
- **Icons:** navigation icons uniformly 20px (20–22px band), aligned with labels on all items.
- **Mobile/tablet drawer:** the drawer (fixed, translated off-canvas at ≤960px) keeps its
  backdrop, Escape-to-close, close-on-navigate and close-on-outside-click; the X close button
  and identity + Logout footer now also appear on tablet (769–960px), not just phones.
- **Active state:** rounded item, subtle gold left indicator, lighter navy fill, gold icon,
  white text; normal items are muted blue-gray on navy with a soft hover — no new gradients,
  no glassmorphism.

**Verification:** `npx tsc --noEmit` PASS; `npx vite build` PASS (CSS 83.11 kB). No browser
visual walkthrough performed. No commit/push made.

### Admin Bulk Upload — Students & Faculty — PASS

**Date:** 2026-10-08

**Scope:** Admin-only `.xlsx` bulk import for Students and Faculty. Existing records are
never overwritten (silent skip on matching Register No / Employee ID).

**Backend files created/modified:**
- `backend/src/modules/admin/bulk-upload.service.ts` — template generation (exceljs), per-row
  validation, duplicate detection, import via existing service layer.
- `backend/src/modules/admin/bulk-upload.controller.ts` — multer memoryStorage, 10 MB / .xlsx
  guard, validate/import/template/error-report handlers.
- `backend/src/modules/admin/admin.routes.ts` — bulk-upload router registered.

**Frontend files created/modified:**
- `frontend/src/api/client.ts` — `BulkUploadPreview`, `BulkUploadResult`, `BulkImportResultRow`
  types; `api.bulkUpload.*` methods.
- `frontend/src/pages/admin/AdminBulkUpload.tsx` — full 3-step UI (upload → preview → result).
- `frontend/src/pages/admin/AdminDashboard.tsx` — `AdminBulkUpload` tab mounted.
- `frontend/src/components/common/Sidebar.tsx` — `Bulk Upload` nav item for ADMIN role.

**Verification:**
- Frontend `tsc --noEmit`: **0 errors** (exit 0).
- Backend `tsc --noEmit`: **0 errors** (exit 0).
- Constraints preserved: `.xlsx` only (CSV rejected), no MongoDB, no overwrite, Admin-only.

---

### MongoDB → temporary local file storage — PASS

**What it was:** every model was a Mongoose schema, persistence ran through a MongoDB Atlas (or
local `mongod`) connection, six full-stack suites started an in-process `mongod` via
`mongodb-memory-server`, and uploaded documents lived in an import-time-created `backend/uploads/`.

**Decisions**
- Keep a **Mongoose-compatible shim** (`backend/src/services/localModel.ts`) instead of rewriting
  controllers. No controller, workflow, RBAC rule or API response changed shape. Swapping in a real
  database later means replacing one layer, not the application.
- Records are **one JSON file per collection**, written atomically (temp file + rename) through a
  single serialized write queue. IDs stay **24-character lowercase hex strings**, so every existing
  `isValid` check, seeded id and test assertion kept working.
- `sqlite3` stays a **devDependency**: `src/database/restore-all-details.ts` is a one-off legacy
  backup importer. It is not loaded by the server.
- Existing uploads were **moved**, not copied (69 files, no conflicts), and the legacy
  `backend/uploads/` directory was removed. The read fallback for it stays in code for hosts that
  still have it.

**Architecture**
- `backend/src/services/localStorage.service.ts` — atomic writes, `dataDir()`, id helpers,
  `LocalCollection`, `reloadAll()`. `DATA_DIR` resolves **lazily**, so the directory no longer
  depends on module import order.
- `backend/src/services/localModel.ts` — `Schema`, `LocalDoc`, filters, projections, sorting,
  updates, aggregation, `populate` (including nested), hooks, validation, unique indexes, and a
  constructable static facade. Collection names pluralise like Mongoose
  (`Batch → batches`, `Faculty → faculties`).
- `backend/src/config/database.ts` — same public surface (`connectDB` / `isDBConnected` /
  `getDatabaseName` / `disconnectDB` / `closeDB`); "connecting" now proves the directory is writable.
- `backend/src/config/storage.ts` — writer and reader both resolve through this one helper.
- `backend/src/database/migrate.ts` — verifies readability, writability, record counts and id shape
  instead of syncing server indexes.

**Bugs found and fixed while verifying (all were real defects, not test noise)**
- `save()` on a hydrated document serialised the whole `LocalModel` (including the entire schema
  definition) into the collection file, because the wrapper's `model` property was not excluded from
  `toObject()`. The next read poisoned the document and **every later `save()` threw**. Fixed in
  `toObject`/`adopt`/constructor, plus a read-time scrub so existing files self-heal.
- `EAGER DATA_DIR` — importing `services/localId.ts` (which re-exports the id helpers) resolved the
  data directory before the test harness could set it, so a "sandboxed" suite silently wrote to the
  live `backend/data/`. Now lazy and re-resolved when `DATA_DIR` changes.
- Nested `populate` resolved every path against the **root** model, so
  `.populate({ path: 'mentor', populate: { path: 'user' } })` never loaded `users`. Every meeting
  reminder silently skipped. Now each level resolves refs against the model it populated from.
- `populate` mutated the shared pre-fetched record cache, leaking one document's populated objects
  into another's. Now clones first.
- `{ type: [String], enum: [...] }` validated the **array** instead of each element, rejecting every
  valid multi-select (e.g. counselling categories).
- Collection names were `batchs.json` / `facultys.json` instead of `batches.json` / `faculties.json`.

**Suite isolation** — all six full-stack suites now sandbox **both** `DATA_DIR` and `UPLOADS_DIR`
via `src/tests/helpers/local-test-store.ts`. Application modules are imported **dynamically** inside
those suites, because static imports are hoisted and would resolve the directories first. A test run
now touches neither `backend/data/` nor `backend/storage/uploads/` and leaves no scratch behind.

**Pre-existing failure fixed (unrelated to storage):** `test:export` asserted an 18-column Excel
layout that predates the EMAIL / DEPARTMENT / CGPA / SGPA columns, and asserted the legacy arrears
vocabulary `ALL CLEAR` / `2 ARREARS` that the export no longer emits. Expectations updated to the
current 20-column `A:T` layout and the canonical `Clear` / `Active Arrear` labels.

### Student-record permission state machine — PASS (6 states, server-authoritative)

**What it was:** the spec called for `PENDING → APPROVED → EDITING → SUBMITTED → CONFIRMED`, with
`REJECTED` as a resubmission path. The backend actually persisted only **three** states
(`Pending | Verified | Rejected`) and `CONFIRMED` existed solely as a constant alias for `'Verified'`.
`APPROVED`, `EDITING` and `SUBMITTED` existed **nowhere** in `backend/src` or `frontend/src`. The user
was asked how to resolve the gap and chose **to add the three missing states** rather than map the
spec onto the existing three.

**Decisions**
- `Verified` is kept as the stored name of `CONFIRMED` — it was already the terminal confirmed state,
  so **no existing row required migration**. The three new values are `Approved`, `Editing`, `Submitted`,
  matching the codebase's existing Title-Case convention (the model enum is widened, not replaced).
- Uploading still always lands in `PENDING` and is hardcoded at the create call, so no request field can
  make an upload verified. The spec's "upload MUST NOT auto-verify" rule was already correct and is
  preserved.
- A **save is a draft**: it leaves the record in an editable state. Re-entering the mentor queue is a
  separate, explicit `POST /:id/submit`. This is why `EDITING` and `SUBMITTED` are now distinguishable.

**New: `backend/src/utils/record-permission.util.ts`** — the single authority for the machine
- `RECORD_STATE` / `RECORD_STATES` / `REVIEWABLE_STATES` / `STUDENT_EDITABLE_STATES`
- `TRANSITIONS` — an explicit `{from, to, role}` table. **Anything absent is rejected**, so a caller
  cannot reach a state by naming a different target. There is deliberately no `PENDING → CONFIRMED`
  edge: CONFIRMED is reachable only from SUBMITTED.
- `canTransition` (mentor) / `canStudentTransition` (owner) / `isTerminal`
- `deriveRecordPermissions(status, role)` → the capability object sent over the wire

**Enforcement (all previously duplicated inline `if (status === 'Verified') return 409` blocks are gone)**
- `updateDocument` / `updateStudentProgress` — refused unless the state is student-editable
- `deleteDocument` / `deleteStudentProgress` — student may only delete from an editable state;
  CONFIRMED is refused for **everyone**
- `verifyDocument` / `verifyMenteeProgress` — guarded transitions, not free-form status assignment
- New: `submitDocument` / `submitStudentProgress` → `POST /:id/submit`
- **`admin.controller.ts` CONFIRMED bypass closed** — `deleteAllDocuments` was
  `StudentDocument.deleteMany({})` with **zero status filtering**, so the admin purge destroyed
  mentor-confirmed official records. It now excludes CONFIRMED, deletes by explicit id list (no filter
  window), and reports `retainedConfirmed`.

**API responses** now carry `permissions` on every record: `getStudentDocuments`, `getStudentProgressList`,
`getMenteeProgressForMentor`, and every mutation. The UI never computes editability.

**Frontend**
- New `frontend/src/lib/recordStatus.tsx` — presentation only, **no permission logic**.
  `RecordStatusBadge`, `RecordStateHint`, `readPermissions` / `readState`. An unrecognised state
  renders as an explicit UNKNOWN badge rather than defaulting to "pending", so a backend state can
  never be visually disguised.
- `StudentProgressView.tsx` — Edit/Delete were rendered **unconditionally**; now gated on
  `permissions.canEdit` / `canDelete`, with `Continue Editing`, `Submit for Review`, `Resubmit`, and a
  reason shown instead of a dead button.
- `StudentDocumentsManager.tsx` — Delete was gated on **role, not status**; now gated on
  `permissions.canDelete`. Wired the previously **dead** `api.documents.update` (0 call sites) into a
  real edit modal, so a REJECTED certificate can be corrected instead of only deleted and re-uploaded.
- `MenteeProgressDashboard.tsx` — replaced the frontend lock guess `isLocked = isVerified` with the
  server's `canReview` / `canConfirm`; status filter list covers all six states.
- `errorHandler.ts` — a 409 was always reported as **"Duplicate Entry"**, which is wrong copy for a
  locked record; 409 now distinguishes `RECORD_LOCKED` and surfaces the server's message verbatim.
- `index.css` — added `.badge-secondary`, used in ~10 places but never defined (rendered unstyled).

**Verification** — `test:state-machine` **137/137 PASS**; backend build PASS; frontend build PASS;
`test:critical` PASS; `test:directory` 16/16 PASS; `test:grammar` PASS.
The new suite **caught a real bug**: a `PENDING → CONFIRMED` edge I had left in the table, which would
have let a mentor confirm a never-submitted record. The table was fixed, not the test.

### Grammar & Spelling Assistant — PASS (advisory, non-destructive)

**What it was:** long free-text fields (mentor remarks, meeting remarks, challenges, achievements,
rejection reasons) could only be hand-corrected, with no assistance and no guard against corrupting the
official data (register numbers, subject codes, CGPA, dates) that shares those paragraphs.

**Non-negotiables honoured (explicit user constraints)**
- **No automatic overwrite.** The endpoint is advisory: it returns a suggestion and the *original verbatim*;
  nothing is persisted until the user clicks **Apply Correction**. Verified at runtime: a check writes
  **zero** document / counselling / progress records.
- **No schema, auth, RBAC, or workflow change.** The existing `POST /api/mentor/grammar-check` route keeps
  its `authorize(FACULTY, HOD, ADMIN)`; a student is still refused.
- **No AI during PDF generation.** Verified: the student PDF generates and the record is byte-identical
  before/after, with no new record written.
- **API key stays backend-only.** No key/host/model/path/stacktrace leaks in the response; on AI failure the
  user's text is returned intact and the local engine still produces a suggestion.

**Backend — `backend/src/modules/counselling/ai-assistant.service.ts`**
- `extractProtectedValues` — dates are matched **first** and then masked, so a year inside `2026-04-12`
  is not also extracted as a standalone number. Codes use `\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{3,}\b`.
- `preservesProtectedValues` / `sanitizeLlmOutput` (strips fences, quotes, "Corrected:" labels, and
  discards pure-commentary replies) — a provider suggestion that alters an official value is **discarded**
  and the deterministic local engine is used instead.
- Rule engine now skips `isOfficialToken` tokens, so spellMap never rewrites a code-like token.

**Backend — `counselling.controller.ts`**
- `MAX_GRAMMAR_CHECK_CHARS = 4000` cap; blank text returns a graceful success (`hasCorrections: false`);
  failures return one generic message with no internals.

**Frontend**
- `GrammarAssistField.tsx` — reusable, explicitly secondary **✨ Improve Grammar** / **Apply Correction**
  buttons, `checkError` state with an amber `role="alert"` message cleared on change/keep-original.
- Wired into `MentorStudentProfileView.tsx` (counselling: concern, observation, skill, action plan,
  mentor remarks; meeting: challenges, mentor remarks/action) and `MenteeProgressDashboard.tsx`
  (progress rejection reason). Uses the existing design system; responsive and unobtrusive.

**Verification** — `test:grammar-safety` **44/44 PASS**; `test:grammar-api` (full-stack boot of
`src/index.ts` against a real mongod) **49/49 PASS**; backend build PASS; frontend build PASS.

**Known limitations (not regressions):** student-facing fields cannot use the assistant without an RBAC
change (deliberately not made); the pre-existing 900 ms debounce auto-check remains; `Editing` is still
unreachable (no begin-edit endpoint).

### UTF-8 mojibake / encoding remediation — PASS
- Removed corrupted characters from `MentorStudentProfileView.tsx` (`â€¢`, `â€”`, `â†’`, and similar).
- Fixed duplicate `"+ +"` button text.
- Fixed CSV `Content-Type` charset.
- Project-wide mojibake scan: **0 remaining**.
- Frontend build: **PASS**
- Backend build: **PASS**

### Mentoring Records: Discussion With + geo-tagged evidence — PASS
Added the mentoring record workflow the previous `counselling` screens were missing.

**Data model** — `MentoringEvidence` is one physical file plus structured metadata
(`evidenceId`, `latitude`, `longitude`, `accuracy`, `capturedAt`, `locationStatus`,
`locationVerified`, `evidenceGroupId`, `linkedStudents`). `CounsellingRecord` and `Meeting` both
gained `discussionWith`, `recordKind` (`INDIVIDUAL` | `SATURDAY_COMMON`) and `evidence[]`. One file
set can therefore be referenced by many records without being copied.

**Discussion With** — required, and NOT mutually exclusive: `['student']`, `['parent']`, or both.
The server refuses to guess (`400` if empty). A record that predates the field reads
"Not recorded" in the UI instead of being back-filled.

**Geo-tagging** — `utils/geotag.util.ts` validates every upload server-side. Coordinates are never
defaulted, rounded or approximated; the whole batch is rejected if a photo has no fix or an
implausible one. The browser requests the device position at *capture* time (`captureDeviceGeotag`).

**Size ceiling** — `evidence-image.service.ts` re-encodes progressively (WebP → JPEG, shrinking
quality/scale) until every file is `<= 200 KB`. All photos are validated and compressed **before**
anything is written, so a rejected batch leaves no orphan bytes.

**Routes** (all authenticated, FACULTY writes require the *active* mentor relationship):
| Route | Purpose |
|---|---|
| `POST /api/counselling` | create; multipart when photos are attached |
| `PUT /api/counselling/:id` | update; **append-only** for evidence |
| `DELETE /api/counselling/:id/evidence` | explicit detach of chosen ids |
| `POST /api/counselling/evidence/saturday` | one shared upload for N participants |
| `GET /api/counselling/evidence/:evidenceId/file` | inline view |
| `GET /api/counselling/evidence/:evidenceId/download` | explicit download |

Evidence is private — `/uploads` is not a public static mount, so the frontend fetches bytes with
the bearer token and renders them from a revoked-on-close object URL.

**Saturday meetings** — `POST .../evidence/saturday` resolves and authorises *every* participant
first, then stores the photo set **once** and links it to all of them, upserting one
`SATURDAY_COMMON` record per student and linking the `Meeting`. `recordKind` lets individual and
Saturday records coexist on one student.

**Fixes found while testing**
- `localModel.ts` invoked pre-save hooks as bare `hook(...)`; a shared hook relied on `this`, so the
  corrected call is `hook.call(this, this)`.
- Multipart `categories` parsing was stale in the update path, and a partial update blanked the
  required `correctiveAction`. A new Saturday record with no action plan now returns a clear `400`
  instead of a `500`.
- Evidence reference typing in `evidence.service.ts`.

**Frontend** — `EvidenceUploader` (capture + GPS + compress + explicit detach/undo),
`EvidenceGallery` (authenticated view, verified-coordinate label, download), `DiscussionWithSelect`,
`SaturdayEvidenceModal` (own mentee picker, one upload shared by all participants), all wired into
`MentorStudentProfileView.tsx` including record-list badges and the evidence strip.
Frontend build: **PASS**. Backend build: **PASS**. New suite `test:mentoring-evidence`: **114
passed, 0 failed**. All 8 pre-existing suites re-run and still green.

### Render boot crash on read-only filesystem — FIXED (verified locally)
- `backend/uploads` is not tracked in git, so it does not exist in a fresh container.
- Three **unguarded import-time `mkdirSync` calls** created it, and they ran during `require()`
  — before `startServer()` and outside its try/catch:
  - `backend/src/modules/documents/document.controller.ts` (`uploads/documents`)
  - `backend/src/modules/student-progress/student-progress.controller.ts` (`uploads/progress`)
  - `backend/src/modules/documents/student-details-pdf.service.ts` (request-time; surfaced as a 500)
- On Render the project directory is read-only, so `mkdir` fails, the process exits with code 1,
  never binds a port, and every route including `/api/health` fails — which the browser reports as HTTP 500.
- Strictly Render-only: local and Vercel have a writable working directory, which is why the same
  code path succeeds there.

**Fix:** new `backend/src/config/storage.ts`
- `UPLOADS_BASE` resolves once to a verified-writable directory: the historical
  `cwd/uploads`, else a fallback under the OS temp dir. Never throws.
- `resolveWritableUploadsDir(subdir)` creates per-feature subdirectories.
- `resolveStoredUploadPath(fileUrl)` maps stored `/uploads/...` URLs back to real files with
  path-traversal containment. This replaced three ad-hoc
  `path.resolve(process.cwd(), fileUrl)` call sites, which would have silently broken every
  stored file had the temp fallback been used alone.
- Optional `UPLOADS_DIR` env var overrides the base directory.

---

### Internal Assessment Marks — admin-controlled entry window + three PDF modes — PASS

**What it was:** mentors needed a subject-wise internal assessment record (IA1 / 50, IA2 / 50,
End Semester / 100) with a **controlled** correction path, and the record-book PDF needed to be
downloadable in three scopes: the full mentee dossier, an internal-assessment-only sheet, and a
mentor-documents pack.

**Permission state machine (server-authoritative):** a single `MarkEntryPermission` document holds
`enabled`, which `markTypes` (IA1 / IA2 / END_SEM) the window covers, and `durationDays`. Status is
computed fail-closed on every read — no row or `enabled: false` → `INACTIVE`, `enabled` but
`expiresAt` past/missing → `EXPIRED`, only enabled **and** future → `ACTIVE`. The public shape is
`MarkEntryPermissionState { status, enabled, markTypes, editableMarkTypes, durationDays, startsAt,
expiresAt, isActive }`; `editableMarkTypes` is empty unless status is ACTIVE. Mentor writes are
rejected with "Mark entry is not enabled..." (INACTIVE) or "Mark entry period has expired..." (EXPIRED)
— no client-side switch can open or extend the window.

**Correction flow with audit trail:** a `MarkUpdateRequest` carries the mentor's
`requestedMark` + `reason` (≥5 chars) against the official row; duplicate PENDING per (student,
subject, markType) is 409. The official `InternalMark` row is written **only** on Admin approval
(`previousMark` captured from the row read before the update, `resolvedMark` recorded, audit trail
kept); rejection requires an Admin reason. Request resolution is one-shot (409 on re-approve).

**Routes (`/api/marks`, all role-checked in-handler):** `GET/PUT /permission` (ADMIN-only),
`GET/PUT /student/:studentId` (FACULTY/HOD/ADMIN, scoped to the influencer's own dept for
FACULTY/HOD), `GET/POST /update-requests` (FACULTY/HOD/ADMIN, scope-bound), `PATCH
/update-requests/:id/approve|reject` (ADMIN-only). **Real defect caught by the suite:**
`buildScopedStudentFilter` is Student-shaped (`_id`/`department`/`registerNumber`) but
`MarkUpdateRequest` is keyed by `student`, so an unqualified dept filter matched everything —
the function now resolves scoped ids via `Student.find(scope).select('_id')` and maps them to
`filter.student: { $in: ids }`.

**PDF modes:** `GET /api/students/:id/pdf?mode=full|internal|mentor-documents` (default `full`,
unknown → 400). `full` = the existing dossier (1 PERSONAL … 10 DOCUMENTS, photos, annexures);
`internal` = the internal-assessment sheet for the official IA record; `mentor-documents` =
student & mentor info, meetings, counselling, photo evidence, documents (no personal/semester
sections). Filenames: `KSRCE_Internal_Assessment_<reg>.pdf` / `KSRCE_Mentor_Documents_<reg>.pdf`
/ `KSRCE_Mentee_<reg>_Dossier.pdf`.

**Frontend:** `client.ts` gains the typed `marks.*` API + `StudentPdfMode`; new Admin
`InternalMarks` tab (`AdminInternalMarks.tsx` — window status card, enable/disable + types +
duration form, correction queue with approve/reject modals); mentor `InternalMarksMentorPanel`
inside the mentee's Academic tab (read-only outside ACTIVE, inline edit + per-row save inside,
correction-request modal + per-student request list); three PDF buttons in both the mentor profile
view and the student dashboard.

**Verification:** new suite `test:internal-marks` (`backend/src/tests/internal-marks.test.ts`,
port 5112) 97/97 green — covers login for all four roles, enable→edit→approve, expiry mid-flight,
INACTIVE refusal, duplicate-request 409, reason too short, full RBAC isolation (mentor cannot
approve, HOD cannot, unassigned mentor sees nothing), admin-only status filtering with
rejection-reason, the audit row carrying oldMark→newMark, all three `?mode=` PDF renderings with
`%PDF-` byte checks and per-filename assertions, 400 on an unknown mode, and the owning student
being able to download while a forged token is refused. Regressions re-run green:
`test:mentoring-evidence` 100/100, `test:critical` 12/12, `test:grammar-api` 49/49,
`test:runtime` 38/38. Backend `tsc --noEmit` clean; frontend `tsc --noEmit` + `vite build` clean.

---

### Placement Monitoring, Achievement Points & Leaderboard — PASS (2026-10-08)

**What it was:** three related requirements added to the finished mentoring platform: a
final-year placement lifecycle the mentor/HOD monitor, an achievement ledger whose points are
awarded only on verification, and a cross-role leaderboard derived from verified points. All
three are new modules; `Placement.model.ts` / `Achievement.model.ts` already existed.

**Shared, server-authoritative helpers (each a pure function + its own suite of tests):**
- `backend/src/utils/achievement-points.util.ts` — the single `ACHIEVEMENT_POINT_TABLE`
  (Hackathon Winner 25 / Runner-up 20 / Finalist 15 / Participation 10; Symposium-Paper 8;
  Certification 8; Workshop 5; Competition-Event 5; Project-Technical Achievement 10; `Other` 0),
  `calculateAchievementPoints`, `isPointBearingCategory`, `achievementVerificationRefusal`.
  A row's `points` is its **potential** score; only `pointsAwarded` on verification counts.
- `backend/src/utils/placement.util.ts` — `FINAL_YEAR = 4`, `isFinalYearStudent`,
  `PLACEMENT_TRANSITIONS`, `canTransitionPlacementStatus` (same→same allowed), `allowedPlacementTransitions`,
  `derivePlacementFields` (SELECTED/PLACED → `selectionStatus 'SELECTED'`, NOT_SELECTED →
  `'NOT_SELECTED'`, APPLYING → `applicationStatus 'APPLIED'` unless supplied), `emptyPlacementCounts`,
  `tallyPlacementStatus`, `buildPlacementSummary`, `NOT_FINAL_YEAR_MESSAGE`.
- `backend/src/utils/leaderboard.util.ts` — `LeaderboardCandidate`,
  `compareLeaderboardCandidates` (points DESC → verified count DESC → register number ASC →
  studentId ASC, byte-stable), `rankLeaderboard` (sequential 1..N), `findRank`.

**Placement transitions (locked in prose, enforced in code):** NOT_STARTED → TRAINING /
APPLYING / NOT_PLACED; TRAINING → NOT_STARTED / APPLYING / NOT_PLACED; APPLYING →
TRAINING / INTERVIEW / SELECTED / NOT_SELECTED / PLACED / NOT_PLACED; INTERVIEW → APPLYING /
SELECTED / NOT_SELECTED / PLACED / NOT_PLACED; SELECTED → APPLYING / INTERVIEW / PLACED /
NOT_SELECTED; NOT_SELECTED → APPLYING / INTERVIEW / TRAINING / PLACED / NOT_PLACED (non-terminal);
PLACED → ∅ (terminal); NOT_PLACED → TRAINING / APPLYING / INTERVIEW / PLACED. Anything else — or
the "same" transition when disallowed — is 409 with the allowed list. **PLACED additionally
requires a company name** (`placedCompanyName || companyName`, checked after the transition) or
409. Non-final-year students are entirely blocked (400 with `NOT_FINAL_YEAR_MESSAGE`); a record is
only ever created by a mentor/HOD/Admin for their scoped student, and  placed / notPlaced are
server-derived booleans, never client-supplied.

**Routes (`/api/placements`, FACULTY/HOD/ADMIN only; students cannot see placement data):**
`GET/POST/PUT /student/:studentId` (returns the row, `allowedTransitions`, student label, mentor
name), `GET /mentor` (own **active** mentees + summary), `GET /hod/summary`, `GET /hod/mentor-wise`,
`GET /hod/student-wise?status=` (HOD + ADMIN, then `requireHod` — the ADMIN token without a
department is 403; an ADMIN can never borrow a department view). Field caps: companyName 120,
salaryDetails 300, mentorRemarks 1000; trainingProgress 0–100; package 0–200 (LPA); dates are
strict `YYYY-MM-DD`. Every write is audited (`CREATE_PLACEMENT` / `UPDATE_PLACEMENT`).

**Achievements (`/api/achievements`):** create/edit by the owning student or any FACULTY/HOD/ADMIN;
verify/reject by FACULTY/HOD/ADMIN. Duplicate detection is student + category + title + eventName +
eventDate, case/whitespace-insensitive → 409 (the draft row is deleted first, then 409). Editing an
**Approved** row is 409 (locked); editing a **Rejected** row resubmits it to Pending and zeroes
`pointsAwarded`. **Hackathon rows without a recorded result and `Other` rows are refused
verification** (409 — 0-point rows never enter the leaderboard as scored). Verified
(`verificationStatus === 'Approved'` on the row) is one-shot; approval credits
`pointsAwarded = calculateAchievementPoints(category, result)`. Audited as `CREATE_ACHIEVEMENT` /
`UPDATE_ACHIEVEMENT` / `VERIFY_ACHIEVEMENT` / `REJECT_ACHIEVEMENT`.

**Leaderboard (`/api/leaderboard`):** `GET /` ranks every **active** student in the caller's scope —
ADMIN/STUDENT = college, HOD = department, FACULTY = own **active** mentees — with the util ordering
above; the `me` block carries the caller's own `studentId` / `registerNumber` / `rank` / points /
count. `GET /student/:studentId` is the per-student detail (achievements + category totals). All
figures (scope, totals, verified-achievement count, rank, points) are computed server-side; the
frontend renders the payload verbatim.

**Frontend:** typed API bindings + types in `client.ts` (`api.placements.*`, `api.achievements.*`,
`api.leaderboard.*`); Sidebar gains "Placement Monitoring" (HOD) and "Achievement Leaderboard"
(HOD / FACULTY / STUDENT). New shared `LeaderboardView.tsx` (me card, podium stat cards, ranked
table with progress bar, highlight row, no dead states), `HodPlacementPanel.tsx` (Summary /
Student-wise / Mentor-wise sub-tabs with server-side status filter), `MentorPlacementPanel.tsx`
(single-student editor using the server's `allowedTransitions`), wired into `HodDashboard`,
`FacultyDashboard`, `StudentDashboard` and a new "11. Placement / Career" tab in
`MentorStudentProfileView.tsx`. Reused existing `EmptyState` / `SkeletonLoader` / `btn btn-gold` /
`overview-summary-*` / `.progress-track` styles; no new CSS dependencies.

**Verification:** two new suites — `test:placement` (`backend/src/tests/placement.test.ts`,
port 5113) all green (lifecycle + transitions + PLACED-company + RBAC/final-year + HOD isolation +
aggregates + audit) and `test:leaderboard` (`backend/src/tests/leaderboard.test.ts`, port 5114) all
green (points pipeline, duplicates, refusals, reject → resubmit, scopes, deterministic ranks, `me`,
detail). All 15 pre-existing suites re-run green on 2026-10-08 (see Verification table). Backend
`tsc --noEmit` clean; frontend `tsc --noEmit` + `vite build` clean. No commit or push made.

### Achievement Leaderboard UI/UX Enhancement - PASS (2026-10-08)

**What it was:** the shared `LeaderboardView.tsx` worked but presented as a plain section heading +
summary strip + table — no hero, no podium, no category breakdown, no mobile card layout, and its
header used `.section-title` / `.section-subtitle` classes that do not exist in `index.css`.

**Scope discipline (what was deliberately NOT touched):** frontend presentation only. No backend
file, route, controller, model, serializer, point table, rank composer, scope rule or authorization
changed; `client.ts` was not edited either (the component reads the already-shipped
`definitions.scope` through a local cast). `GET /api/leaderboard` takes no query parameters, so
**no filter controls were added** — a filter UI would have needed fake backend support. Role scopes
(HOD = department, FACULTY = assigned mentees, STUDENT = college + `me`) are unchanged because they
are resolved server-side from the JWT and rendered verbatim.

**What changed (`frontend/src/components/leaderboard/LeaderboardView.tsx`, rewritten in place):**
- **Hero header** — trophy tile, "Achievement Leaderboard", the KSRCE subtitle, plus chips built
  only from response data: server `scopeLabel`, students-in-scope count and the distinct
  `batchName` values present (max 4 + overflow). A note panel renders the server's
  `definitions.scope` text (fallback to the documented sentence).
- **Four summary stat cards** — Total students, Verified achievements, Total points awarded
  (display-only sum of the returned `totalPoints`), Top performer (real rank-1 entry or `-` /
  "Awaiting verified points"; never invented).
- **Top-3 podium** (`<ol>`) — 2nd / 1st / 3rd order on desktop via CSS `order`, 1st enlarged with
  gold treatment, avatar initials, name (button when `onViewStudent`), register number,
  department + batch, points, verified-achievement count, ordinal badge (1st/2nd/3rd — text, not
  colour alone) and a leader-relative bar. Podium only renders for students with points > 0, and
  with fewer than three scorers it falls back to natural rank order instead of an empty slot.
- **"Your position" card (students, `data.me`)** — explicit *Your Rank (of N)*, *Your Points*,
  *Your Achievements*, points-vs-leader bar, and a "View your row" jump when the rank sits beyond
  row 10 (scrolls to and focuses `#lb-self-row`). The own row in the table keeps its highlight,
  `aria-current`, `You` chip and primary left accent.
- **Full ranking table** — merged register number under the name, rank chips (crown/medal for the
  top 3), podium row tints, hover states, points/achievement alignment, a presentational
  **Level** badge (`Gold - Rank 1` / `Silver - Rank 2` / `Bronze - Rank 3` / `Verified achiever` /
  `No verified points yet` — derived from the server's rank + points, never fed back into scoring)
  and the existing score bar recoloured per rank. Ranking footnote unchanged.
- **Achievement breakdown** — verified points summed per category across the scope rows
  (`categoryPoints` / `categoryCounts` already returned per entry), bars relative to the top
  category, rendered only when verified points exist. Display-only aggregation; point values are
  never recomputed.
- **States** — dedicated skeleton (hero + 4 cards + podium + table) instead of the generic
  dashboard skeleton; a professional "No verified achievements yet" `EmptyState` when
  `verifiedAchievements === 0` (the honest 0-point table stays below it — real data, no fake
  ranking); existing "No students in scope" empty state kept; error state keeps the existing
  card + Retry pattern (now with `AlertTriangle` and a disabled "Retrying..." button).

**New scoped CSS** (`frontend/src/styles/index.css`, one appended `lb-` block, existing rules
untouched): responsive hero, stat grid, podium (desktop 2-1-3 via `order`, ≤768px stacks in rank
order), table → card transformation at ≤768px (grid areas keep rank, name, points and achievement
count visible on the first rows, `data-label` captions on the secondary cells), compact ≤480px
rules, and WCAG-AA contrast for every small-text badge pair (gold badges use `#92400E`, avatar
initials use dark token backgrounds, the "scored" level reuses the existing `badge-info` palette).
No new dependency, no global colour change, no chart library.

**Verification:** frontend `tsc --noEmit` PASS; `npm run build` (tsc + vite) PASS (CSS 31.1 → 45.3
kB); backend untouched (`git status` diff set unchanged, 62 files — same as before the task);
`test:leaderboard` re-run PASS 35/35, so the API contract the UI consumes is unchanged. No commit
or push made.

### Admin Features: Remove HOD · Faculty Department Reassignment · Student Documents Viewer — PASS (2026-10-08)

Three Admin-only feature improvements, built on the existing `/api/admin/*` surfaces. No storage,
document-permission, verification or upload logic was changed; the local-file/upload storage, the
record permission state machine and every existing test contract were preserved.

**Feature 1 — "Remove HOD" (Admin HOD Management).** `AdminHodManagement.tsx` now offers a
destructive-style **Remove** button (desktop table + mobile cards, active HODs only) behind a
confirmation modal that names the HOD and their department and explains the consequence. Removal
reuses the existing ADMIN-only `PATCH /api/admin/hods/:hodId/status` deactivation
(`api.admin.setHodStatus(id, false)`) — it **never deletes** the account or any record; the HOD's
audit (`DEACTIVATE_HOD`), department link and history all survive, and the slot is freed for a
successor. Reactivation is still refused with 409 while a successor occupies the slot (existing
rule).

**Feature 2 — Faculty Department Reassignment (Admin).** New ADMIN-only endpoint
`PATCH /api/admin/faculty/:facultyId/department` adding `reassignFacultyDepartment` to
`admin.controller.ts` + the route (`behind authorize(ROLES.ADMIN)` and re-checked in the handler).
Accepts `{ departmentId }` (resolved by id, or falls back to code/name like `createFaculty`),
refuses the current department (400) and unknown departments (400), and 404s on an unregistered
faculty. Success is atomic: it moves the **Faculty row** and the linked **User row** (which backs
the JWT `departmentId` claim) to the new department, deliberately **never touches any ACTIVE
MentorAssignment** — mentees do not move with the faculty and every historical counselling/academic
record keeps its original author — counts the preserved active assignments, writes a
`REASSIGN_FACULTY_DEPARTMENT` audit (action/entity + previous/new department ids), and returns
`{ faculty, previousDepartment, newDepartment, unchangedMentees }`. **Defect found by the new
suite:** mutating the populated `user` snapshot then `user.save()` threw `user.save is not a
function` on the local store — the handler now fetches the persisted User document via
`User.findById` and saves that. Frontend: `api.admin.reassignFacultyDepartment(facultyId,
departmentId)` binding; a two-step "Reassign Department" modal in `AdminDashboard.tsx` (select
new department → confirm old→new read-only copy + warning that mentee assignments are preserved and
must be reassigned manually via the existing reassignment flow) with a desktop Reassign Dept action
and a mobile Reassign Department button.

**Feature 3 — Dedicated Student Documents viewer (no profile redirect).** New
`frontend/src/pages/admin/AdminStudentDocuments.tsx`: clicking "Open Student Documents" in the
Admin Documents tab now renders that component instead of routing to the Student Profile. It is
self-loading via the existing `api.documents.getByStudent`, shows a student context header (name,
register number, department, mentor), a **document list** (title/file, category, verification
badge, uploaded date, View/Download), and a **dedicated viewer** for one document: authenticated
blob preview via `api.documents.fetchViewBlob` rendered as an `<iframe>` (PDF) or `<img>` (image);
any other type gets a clean "Preview unavailable" state + Download. The blob URL is revoked when
the viewer closes or unmounts (ref-based, `URL.revokeObjectURL`), the detail panel shows file
metadata (name, category, type, size, uploader, dates, rejection note when rejected), and Back
always walks viewer → document list → Admin student list. `AdminDashboard.tsx` gained a separate
`documentsStudent` state (distinct from `selectedStudentId`, which still drives the Student Profile
for the other tabs), an early-return rendering of the viewer for the documents tab, and resets it on
tab change. Server-side document security is unchanged — every read still passes through
`checkStudentAccess` (ADMIN allowed, all other roles refused on other students' documents).

**Verification:** new `test:faculty-dept-reassign` suite (`backend/src/tests/faculty-department-reassign.test.ts`,
port 5115) 18/18 PASS: response contract + preserved assignments, Faculty **and** User rows moved
(model-level), admin list re-scopes, actives assignments/counselling kept, audit row, re-login token
`departmentId` claim, HOD list re-scoping (CSE hides / ECE shows), drill-down re-scoping (ECE HOD
reads the moved mentor's mentees, CSE HOD 404), validation 400s, 404, HOD/FACULTY/STUDENT 403,
anonymous 401, and frontend source contracts (Remove HOD uses `setHodStatus` with no `deleteHod`
route; viewer wired via `documentsStudent`, not `selectedStudentId`). `test:hod-admin` re-run
22/22 PASS. Backend `tsc --noEmit` clean; frontend `tsc` + `vite build` clean. No commit or push
made.

---

## Ruled Out (with evidence)

- **Express 5 — NOT the cause.** Ran Render's exact `cd backend && npm install` against a clean
  `git archive` of `HEAD`: it resolves **express 4.22.3** in `backend/node_modules`; the root
  `express@5.2.1` is never installed. The `'/api/*'` / `'/uploads/*'` wildcard incompatibility is
  a real latent risk (Express 5 throws `Missing parameter name`) but is dormant here.
- **Sapling / external AI — NOT involved.** No `SAPLING_API_KEY` reference exists anywhere in
  `backend/src`. The service was deleted in commit `68e668e`. Current AI integration uses
  `AI_API_KEY` / `AI_MODEL` and already has a local fallback. The stale
  `backend/dist/modules/counselling/sapling.service.js` is gitignored local build output.
  (Supersedes the earlier "key present on Render" note — the key is simply never read.)
- **CORS / JWT / MongoDB — NOT involved.** Health reports `database: connected`; CORS is
  hardcoded `origin: '*'` with no env coupling.

---

## Current Issue

**FIXED and verified — Admin Mentoring Dashboard stuck on the loading skeleton.**

- **The bug report:** opening Admin → Mentoring Dashboard showed `DashboardSkeleton` indefinitely; the
  dashboard data never appeared.
- **Root cause:** the commit `2c2182a "Redesign sidebar and dashboard UI"` accidentally deleted the mount
  effect that triggers `loadData()`. The closing line of `loadData`'s `useCallback` was joined onto the
  next declaration (`}, [month]);  const loadReport = useCallback(`), which still compiles as valid
  TypeScript, so **no typecheck or build could catch it**. `loading` is initialised to `true` and the only
  code that clears it lives inside `loadData`, which was therefore never called on mount → skeleton
  forever. (The month `<input type="month">` that also called `loadData` renders only *after* loading
  resolves, so it could never break the deadlock.)
- **The `.broken` backup is itself corrupt:** it still has the effect, but its `loadData` declaration is
  missing its opening `const loadData = useCallback(...)` and `setLoading(true)` lines. It was used only as
  a reference for the intended effect and was **not** copied.
- **Fix (`frontend/src/pages/admin/AdminMentoringDashboard.tsx` only):** restored the effect
  `useEffect(() => { loadData(); }, [loadData]);` after `loadData`, and removed the now-redundant direct
  `loadData()` call in the Departments month input's `onChange` (the effect already refetches whenever
  `month` changes; the direct call was a duplicate fetch that used the stale month).
- **Loop safety:** `loadData` is memoised with `useCallback(..., [month])`, so the `[loadData]` effect runs
  once on mount and once per month change — never on every render.
- **Loading/error handling preserved:** `loadData` still sets `loading` true/false around the four
  `Promise.all` requests and sets `loadError` on failure; the existing `NetworkErrorState` /
  `ServiceUnavailableState` / `ServerErrorState` retry screens are reached on failure.
- **Verified (browser E2E, headless Chromium, built bundle):** Admin login → Mentoring Dashboard rendered
  real content — 0 `.skeleton-pulse` nodes and "College Mentoring Split" / "Department Snapshot" /
  "How each figure is measured" present — with all four `/api/admin/overview/*` calls 200; changing the
  reporting month fired exactly 4 requests (one per endpoint, no loop); forcing the four calls to fail
  showed the "Unable to Connect" error state with a working **Retry** that recovered to real data; 0 page
  errors. Frontend `tsc --noEmit` clean; `npm run build` clean (1659 modules). Regressions
  `test:admin-routes` 8/8 and `test:admin` 23/23. Frontend-only change — no backend/API/RBAC change.

**Previously — FIXED and verified — Administrator login rejected with HTTP 401 after a password change / config drift.**

- **The bug report:** `POST /api/auth/login` with the Administrator's credentials returned
  `401 Unauthorized`, while the login endpoint itself was healthy (a valid configured password
  returns 200 `ADMIN`, a wrong one returns 401).
- **Root cause:** `backend/src/database/bootstrap.ts` re-hashed `ADMIN_PASSWORD` and wrote it over the
  stored admin `passwordHash` (plus `username`/`email`/`fullName`/`department`) on **every** server
  start. Any password the admin had set in the app — or any stored password that differed from the
  current `ADMIN_PASSWORD` — was silently reverted on the next boot, so the password the user actually
  held failed verification and produced the 401.
- **Not the cause (ruled out with evidence):** the login handler/route/JWT, the stored account data,
  the frontend API base (`frontend/.env` → `http://localhost:5050`), and the recent sidebar/UI work —
  the login payload in `LoginPage.tsx`, `AuthContext.tsx` and `client.ts` is unchanged.
- **Fix:** on an existing admin, bootstrap now **preserves** the account — it no longer overwrites the
  password or identity on startup (it only guarantees `role === 'ADMIN'` and `isActive === true`).
  Creating a missing admin from `ADMIN_PASSWORD` still works. A deliberate reset remains available via
  `ADMIN_FORCE_PASSWORD_RESET=true` (one-shot, documented in `backend/.env.example`).
- **Reproduced / verified:** a throwaway-store reproduction showed the changed password rejected after a
  second bootstrap (stale `ADMIN_PASSWORD` accepted); after the fix the changed password survives start
  after start and the opt-in reset re-applies `ADMIN_PASSWORD` once. Live restart logged
  `[Bootstrap] Existing Administrator (ksrce@admin) preserved (password unchanged).`; live login returned
  200 `ADMIN` for the configured password and the `admin` alias, and 401 for a wrong password and an
  unknown user. New `test:admin-auth` **13/13**; `test:critical` 12/12; `test:admin-routes` 8/8;
  `test:runtime` 38/38; backend `tsc`/build clean; frontend `tsc`/`vite build` clean.

---

## Last Change

### Admin-only permanent HOD deletion — implemented + all 5 demo HODs deleted, verified no reappearance (2026-10-09)

- **Task:** make permanent deletion of the verified demo HOD accounts possible (Admin-only) and clean
  them out of the app + the Admin HOD Management list, preserving every genuine account and all
  history; no architecture change (still no MongoDB).
- **Backend:** new `DELETE /api/admin/hods/:hodId` (`admin-hod.controller.ts` `deleteHod`, mounted in
  `admin.routes.ts`). ADMIN-only (router + handler); validates id; refuses non-HOD roles, **active**
  HODs (409, deactivate first), and deletes while dependent records reference the account (409 after
  a full reference scan over User-id-holding fields; `AuditLog` excluded so history survives). Writes
  a preserved `DELETE_HOD` audit (no secrets) **before** `user.deleteOne()` — no cascade. Deletion is
  further gated to inactive HODs on an explicit allowlist (`VERIFIED_DEMO_HOD_IDS` exported from the
  controller, never matched by username/department/name). No broad user-deletion functions.
- **Frontend:** `Delete HOD` action only on inactive verified-demo rows (`is_active===0 &&
  is_verified_demo===1`); permanent-delete confirm modal (names the account, states "cannot be
  undone"); success/error toasts + refresh; Add/View/Edit/Activate/Deactivate and Remove untouched.
  `client.ts` gains `is_verified_demo` on the row type and `api.admin.deleteHod`.
- **Live execution (fresh instance on port 5052 — the user's dev watcher on stale 5050 was never
  touched):** 5 demo HODs deleted — `hookrepro.hod` (through the browser UI, `DELETE …→200`),
  `hookrepro.it`, `hod.it`, `vhod.verify.cse001`, `vhod.live883485` (via API, 200 each). Final live
  list: 8 HODs, all active, zero verified-demo; all 5 deleted usernames → 401.
- **History:** 166 pre-existing audit records preserved (0 missing); 5 new `DELETE_HOD` entries with
  `details = {username, fullName, departmentId, reason}` — no password/token/hash.
- **No reappearance:** backend stopped and re-booted twice on 5052 — HOD list stays 8/8/0, logins
  stay 401; across a clean no-login restart `audit_logs.json` is byte-identical and `users.json`
  changes only by the bootstrap's admin `updatedAt` touch (pre-existing benign behaviour).
- **One finding to report:** the built SPA calls the backend **directly** (`frontend/.env`
  `VITE_API_URL=http://localhost:5050`) — the 4173 serve-dist proxy is not used by the SPA. The
  browser was therefore still hitting the stale 5050 dev watcher (old code, no `is_verified_demo`);
  E2E used a dist rebuild with a temporary `VITE_API_URL=http://localhost:5052` override and the
  canonical dist was rebuilt afterwards (bundle hash back to `index-CCHU7sU1.js`).
- **Verification:** new `test:hod-delete` 17/17 (sandbox store, injected sandbox allowlist ids);
  re-run `test:hod-admin` 22/22, `test:admin-routes` 8/8, `test:admin-auth` 13/13; backend
  `tsc --noEmit` clean; frontend `tsc` + `vite build` clean; browser UI E2E evidence above.
  PROJECT_PROGRESS.md updated; no commit/push.

### Demo HOD accounts — identified, verified deactivated + unable to log in, no recreation on restart (2026-10-09)

- **Task:** remove every demo/sample/test HOD account from active listings and block login, preserving all genuine accounts and history.
- **Identified (5, all demo/test in origin — verified by name + audit trail, not by department alone):**
  - `vhod.verify.cse001` / "Verify HOD CSE" (CSE) — scripted verification account: audit shows CREATE_HOD → LOGIN → DEACTIVATE_HOD within the same second (2026-10-06T19:30:44Z).
  - `vhod.live883485` / "Verify HOD Live" (CSE) — same scripted verification pattern (2026-10-06T19:44:43Z).
  - `hod.it` / "Sample HOD IT" (IT) — literal "Sample" name; repeated demo logins on 2026-10-08.
  - `hookrepro.hod` / "HODMECH" (MECH) — hook-reproduction QA account (2026-10-08) with repeated ACTIVATE/DEACTIVATE cycles.
  - `hookrepro.it` / "Hook Repro HOD IT" (IT) — same hook-repro QA origin (2026-10-08).
- **Dependent-record scan:** only `users.json` (the accounts) and `audit_logs.json` (history — preserved) reference them. Zero references in counselling_records, meetings, monthly_progresses, notifications, academic_records, students, faculties, mentor_assignments, student_progress, student_documents.
- **Action:** none required — all 5 were **already deactivated**. Verified live: `GET /api/admin/hods` → total=5, active=0, inactive=5; login attempts for all 5 with the default HOD password → HTTP 403 "Your institutional account has been deactivated." (the `isActive` check in `auth.controller.ts` runs before password verification).
- **No permanent deletion performed (deliberate, compliant):** the codebase has **no** supported delete path for HOD users — `admin-hod.controller.ts` documents deactivation as "the only removal path — nothing here ever deletes a User"; grep confirms `User.deleteOne/deleteMany` is used only for students/faculties/tests/nuclear wipe. `clean-demo-data.ts` deletes every non-admin user and all records, violating the preservation requirements, so it was rejected. With no safe deletion mechanism, the task's rule ("permanent removal is supported → use it") resolves to deactivation — already satisfied.
- **No auto-recreation:** `bootstrap.ts` creates only departments/batches/settings/admin/schools — never HODs. Killed and restarted the real backend (`tsx src/index.ts` from `backend/`): health 200, HOD list byte-identical, admin login 200, demo logins still 403, user census unchanged (9 users: 1 ADMIN / 5 HOD / 2 FACULTY / 1 STUDENT), `users.json` + `audit_logs.json` hashes unchanged. Genuine accounts untouched; one-active-HOD-per-department preserved (0 active HODs).
- **Verification:** `test:hod-admin` 22/22, `test:admin-routes` 8/8, `test:admin-auth` 13/13, `test:faculty-notifications` 21/21 (includes the department-with-no-active-HOD → 409 rule); frontend `tsc --noEmit` PASS; `vite build` clean. **No code changed** (already-correct state). PROJECT_PROGRESS.md updated; no commit/push.

### Marks modals — native form submission suppressed with `e.preventDefault()` (2026-10-09, static verification only)

- **Goal:** no implicit/native form submission may ever trigger a page navigation from the two internal-marks modals (`AdminInternalMarks.tsx` decision modal, `InternalMarksMentorPanel.tsx` correction modal).
- **Changed (2 files, handler opening + signature only):** `submitDecision` and `submitCorrection` now receive `(e: React.FormEvent)` and call `e.preventDefault()` first; all existing validation, API payloads, approve/reject behavior, correction requests and success/error toasts are unchanged. No backend change.
- **Verified (static only — honest):** frontend `tsc --noEmit` exit 0; `vite build` clean. The planned Playwright in-browser check (Enter in the `type="number"` input must not navigate; Enter in a textarea must insert a newline without submitting) was prepared but **not executed** — the HOD-cleanup task took priority. Flagged as not-yet-run rather than claimed.

### Add/Edit HOD modal nested-form fix — `<form> cannot be a descendant of <form>` (2026-10-09)

- **Goal:** remove the nested-form structure in the Admin HOD Management Add/Edit modal so the
  browser stops logging `<form> cannot be a descendant of <form>`, keep exactly one valid form per
  submission, and preserve the Add/Edit HOD behavior: required-field validation, department
  validation, password handling, the one-active-HOD-per-department rule, the API payload, auth and
  the success/error messages.
- **Root cause:** `frontend/src/components/common/Modal.tsx` already renders its `.modal-content`
  as a `<form>` whenever `onSubmit`/`formId` are passed (`const ContentTag = onSubmit ? 'form' :
  'div';`), and `AdminHodManagement.tsx` ALSO wrapped its modal children in its own
  `<form id="hod-form" onSubmit={submit}>` — producing a `<form>` inside a `<form>` **and a
  duplicate `id="hod-form"`** in the DOM. The same redundant pattern existed in
  `AdminInternalMarks.tsx` (`mark-decision-form`) and `InternalMarksMentorPanel.tsx`
  (`mark-correction-form`).
- **Changed (3 frontend files, markup only):** in each call site the redundant inner
  `<form id=... onSubmit=...>` wrapper became a plain `<div>`, leaving the single form the shared
  Modal renders (which still carries the `id` + `onSubmit`). `Modal.tsx` is untouched, so every
  other Modal consumer (`MenteeProgressDashboard`, `MentorAiBotModal`, `SaturdayEvidenceModal`,
  `StudentProgressView`, …) is unaffected. The "Create HOD" / "Save Changes" submit button still
  submits the one modal form; `required` fields still validate; edit still hides the password field
  and disables the username input.
- **Verified:** `tsc --noEmit` exit 0; `vite build` clean (1659 modules). Headless-Chromium E2E on
  the built bundle (admin login → HOD Management): Add modal → exactly **1** `<form>` on the page,
  `#hod-form` **is** the modal form, 0 nested forms, no duplicate id; empty submit → 3 `:invalid`
  inputs and the modal stays open (validation preserved); filled submit → modal closes + success
  toast and `POST /api/admin/hods` fires with the filled payload (request intercepted; no record
  written); Edit modal → same single-form structure, username disabled, no password field, Cancel
  closes; **0 page errors and 0 console errors** — the reported `<form> cannot be a descendant of
  <form>` message no longer appears anywhere. No backend/routes/data changed; PROJECT_PROGRESS.md
  updated; no commit/push made.

### KSRCE Logo frame + duplicate sidebar branding removed (2026-10-09)

- **Goal:** remove the decorative gold/yellow rounded-square frame (border, ring, radius, shadow) around
  the KSRCE logo in the top header, and remove the duplicate college branding block from the sidebar,
  without replacing the logo asset or changing its size/position/aspect ratio, and without disturbing
  gold accents elsewhere.
- **Changed:**
  - `frontend/src/styles/index.css` — `.ksrce-logo-img` now declares only `width/height: 44px`,
    `object-fit: contain`, `flex-shrink: 0`; removed `background:#fff`, `border:2px solid
    var(--gold-500)`, `border-radius:8px`, `padding:2px` and the box-shadow. Removed the now-unused
    `.sidebar-logo`, `.sidebar-portal-name`, `.sidebar-portal-product` rules and their collapsed-rail
    variants; `.sidebar-portal` is now `justify-content: flex-end` so the collapse/close controls keep
    their previous right-side placement.
  - `frontend/src/components/common/Sidebar.tsx` — removed the duplicate branding (logo +
    "K.S.R. College of Engineering" + "Digital Mentor–Mentee") from `.sidebar-portal`; the
    collapse/expand and drawer-close controls remain.
  - `frontend/src/components/common/Navbar.tsx` — unchanged markup; the header logo is still the same
    `<img class="ksrce-logo-img" src="/ksrce-logo.png">`.
- **Preserved:** logo asset untouched (`/ksrce-logo.png`, 205×190 RGBA, transparent); header logo box
  44×44 (38×38 at ≤768px) with `object-fit: contain`; gold accents unchanged (header 2px gold bottom
  border, gold active-nav fill/border/left marker, gold role chip, gold-call-to-action buttons); routes,
  auth, APIs and business logic untouched.
- **Verified (headless Chromium, computed styles on the built bundle):** header `.ksrce-logo-img` →
  `border: 0px`, `border-radius: 0px`, `box-shadow: none`, transparent background, `padding: 0px`, box
  44×44, `object-fit: contain`, natural size 205×190; sidebar has 0 `.sidebar-logo` /
  `.sidebar-portal-text` / `.sidebar-portal-name` nodes and no college name in its text, while the
  collapse button remains and its toggle works; gold accents intact (header bottom border
  `2px rgb(197,155,39)`, active nav `rgba(212,175,55,0.14)` background + `rgba(212,175,55,0.38)`
  border + `rgb(212,175,55)` left marker, role chip gold gradient). 0 page errors. Frontend
  `tsc --noEmit` exit 0; `vite build` clean (1659 modules; CSS 82.34 kB, down from 83.11 kB). No
  commit/push made.

### Admin Mentoring Dashboard stuck on loading skeleton — mount effect restored (2026-10-09)

- **Goal:** fix the Admin Mentoring Dashboard rendering `DashboardSkeleton` forever, without touching APIs,
  auth, Admin authorization, response contracts, calculations or unrelated files.
- **Root cause:** `frontend/src/pages/admin/AdminMentoringDashboard.tsx` lost its mount effect. The end of
  `loadData`'s `useCallback` had been merged with the next line (`}, [month]);  const loadReport = useCallback(`),
  which typechecks, so neither `tsc` nor the build could detect the missing
  `useEffect(() => { loadData(); }, [loadData]);`. Because `loading` starts `true` and only `loadData`
  clears it, the skeleton never resolved. The regression came in with commit `2c2182a "Redesign sidebar and
  dashboard UI"`. The adjacent `.broken` file is itself corrupt (its `loadData` opening lines are missing), so
  it was only used as a reference and not copied.
- **Fix:** restored the effect after `loadData` (`useEffect(() => { loadData(); }, [loadData]);`) and removed the
  now-redundant `loadData()` call from the Departments month `<input type="month">` `onChange`. `loadData` is
  `useCallback([month])`, so the effect runs once on mount and once per month change — no infinite loop.
- **Verification:** headless-Chromium E2E against the production bundle (dist served statically, API on the local
  backend): dashboard loaded real data with 0 skeleton nodes and four `/api/admin/overview/*` responses 200; a
  month change produced exactly 4 refetches (one per endpoint, no loop); aborting the calls surfaced the
  "Unable to Connect" state with a Retry that recovered to data; no page errors. Frontend `tsc --noEmit` clean;
  `npm run build` clean (1659 modules). Regressions `test:admin-routes` 8/8, `test:admin` 23/23. Backend
  untouched. No commit/push made.

### Admin Login 401 — bootstrap no longer overwrites the stored password (2026-10-09)

- **Goal:** fix the reported `POST /api/auth/login → 401 Unauthorized` for the Administrator without
  bypassing auth, hardcoding credentials, disabling password verification, or auto-granting Admin.
- **Root cause:** `backend/src/database/bootstrap.ts` unconditionally re-hashed `ADMIN_PASSWORD` and
  overwrote the existing admin's `passwordHash` (and identity fields) on every startup, silently
  reverting any password the admin had changed in the app → the password the user held was rejected (401).
- **Fix:** the existing-admin branch now preserves the stored password and identity, enforcing only
  `role === 'ADMIN'` and `isActive === true`; a missing admin is still created from `ADMIN_PASSWORD`;
  `ADMIN_FORCE_PASSWORD_RESET=true` performs an explicit one-shot reset (documented in `backend/.env.example`).
- **Verification:** new regression `test:admin-auth` **13/13 PASS** (fresh-store creation; restart
  preserves an in-app-changed password and identity; stale `ADMIN_PASSWORD` rejected; second restart
  byte-identical; opt-in reset re-applies; reset is one-shot). Regressions `test:critical` 12/12,
  `test:admin-routes` 8/8, `test:runtime` 38/38. Live restart preserved the admin; live login 200 `ADMIN`
  (configured / lowercase / `admin` alias) and 401 for wrong/unknown. Backend `tsc`/`npm run build` clean;
  frontend `tsc`/`npm run build` clean. No commit/push made.
- **Out of scope (still open):** `AdminMentoringDashboard.tsx` is missing its mount
  `useEffect(() => { loadData(); }, [loadData]);` (present in the adjacent `.broken` backup) — a
  confirmed but unrelated dashboard defect, not changed here.

### Admin HOD Delete / Remove — Safe Deactivation via Existing Status Endpoint (2026-10-09)

- **Goal:** add a "Delete HOD" / "Remove HOD" action to the existing Admin → HOD Management list that safely deactivates (not permanently deletes) a HOD account, reusing the existing `PATCH /api/admin/hods/:hodId/status` endpoint.
- **Backend:** No new endpoints created. The existing `setHodStatus` handler (`admin-hod.controller.ts`) already implements safe deactivation: flips `User.isActive` to `false`, preserves all historical records (mentoring, academic, audit), frees the department slot for a successor, and creates a `DEACTIVATE_HOD` audit record. The handler is ADMIN-only (router + handler re-check).
- **Frontend:** `AdminHodManagement.tsx` already had the "Remove" button (🗑 icon, red styling) for active HODs in both desktop table and mobile card views, plus a confirmation modal ("Remove HOD?") with the required message: "This will remove the HOD's active access. Historical records and audit history will be preserved." Buttons: [Cancel] / [Remove HOD] with loading state. The `confirmRemoveHod` function calls `api.admin.setHodStatus(hodId, false)`.
- **RBAC:** Action visible ONLY to ADMIN (enforced server-side by `authorize(ROLES.ADMIN)` and handler re-check). HOD/FACULTY/STUDENT receive 403.
- **Rules preserved:** One active HOD per department. Deactivation frees the slot; reactivation blocked if successor already appointed. Historical records untouched.
- **Verification:** `test:hod-admin` 22/22 PASS (covers deactivation retains records, inactive HOD cannot log in, department freed for successor, one-active-HOD rule, audit logging). Backend `tsc --noEmit` clean; frontend `tsc --noEmit` + `vite build` clean.

### Official KSRCE Departments — Bulk Upload Reference Values Update (2026-10-09)

- **Goal:** update the institutional Department master list to the 15 official KSRCE departments so
  Bulk Upload templates (Student + Faculty) and validation use the authoritative list — no Science &
  Humanities departments, no hard-coded duplicates.
- **Source updated:** `backend/src/database/bootstrap.ts` — the single department seed list. The 4
  legacy departments (CSE, ECE, IT, MECH) replaced with the full 15:
  1. Automobile Engineering (AUTO)
  2. Biomedical Engineering (BME)
  3. Computer Science and Engineering (CSE)
  4. Civil Engineering (CIVIL)
  5. Computer Science and Design (CSD)
  6. Computer Science and Engineering (IOT) (CSE_IOT)
  7. Computer Science and Engineering (Cyber Security) (CSE_CS)
  8. Electronics and Communication Engineering (ECE)
  9. Electrical and Electronics Engineering (EEE)
  10. Mechanical Engineering (MECH)
  11. Information Technology (IT)
  12. Safety and Fire Engineering (SFE)
  13. Master of Computer Applications (MCA)
  14. Management Studies (MBA)
  15. Artificial Intelligence and Data Science (AIDS)
- **Bulk Upload impact:** templates (`generateStudentTemplate`, `generateFacultyTemplate`) and
  validators (`validateStudentExcel`, `validateFacultyExcel`) already read live departments via
  `Department.find({})` — no code changes needed there. The Reference Values sheet and Excel
  dropdowns now show all 15 departments automatically.
- **Validation impact:** `deptMap` in both validators resolves by code/name/ID from the live store,
  so invalid department names are rejected with "Unknown department" at validate time.
- **Preservation:** no existing Student/Faculty/HOD records modified; department IDs/relationships
  unchanged; no duplicate department list created; RBAC, HOD scoping, mentor assignments all
  unaffected.
- **Verification:** backend `tsc --noEmit` clean; frontend `tsc --noEmit` + `vite build` clean;
  `test:bulk-upload` 23/23 PASS (templates show 15 departments, dropdowns work, invalid names
  rejected); regressions `test:admin-routes` 8/8, `test:hod-admin` 22/22.

### Admin Bulk Upload — UI redesign + Excel template overhaul (2026-10-09)

- **Goal:** polish the Admin Bulk Upload module UI in the project's navy/gold design system (no
  Tailwind) and rebuild the Excel templates (25-column Student, model-supported Faculty,
  Instructions + Reference Values sheets, marked sample row, live dropdowns), then verify
  end-to-end. Existing feature inspected first — no duplicate APIs/models/routes created and no
  backend import logic rewritten.
- **Backend routes reordered** in `admin.routes.ts` to `/bulk-upload/<type>/<action>`
  (`students|faculty` × `template|validate|import` + `error-report`) to match the frontend and
  documented order; frontend URLs were never changed.
- **Templates rebuilt** (`bulk-upload.service.ts`): Student sheet carries the exact 25 headers in
  the exact 3-section order; Faculty carries only model-supported columns; both add an
  **Instructions** sheet (format rules + the 10 unsupported Faculty fields listed instead of
  collected: Date of Birth, Gender, Blood Group, Residential Status, Permanent Address,
  Qualification, Specialization, Experience, Date of Joining, Employment Type) and a
  **Reference Values** sheet; header/sample-row styling, one clearly marked sample row, live
  department/batch values and in-sheet dropdowns for every controlled field.
- **Safety:** any identifier starting with `SAMPLE` is always INVALID (sample never auto-imports);
  records are never overwritten; statuses stay VALID / INVALID / DUPLICATE / ALREADY_EXISTS;
  `.xlsx` only, 10 MB limit, Admin-only.
- **Frontend:** `AdminBulkUpload.tsx` rewritten around the design system — page header with
  Admin-only chip, 🎓/👨‍🏫 selector cards, keyboard-accessible drag-drop dropzone, 4-step
  workflow indicator (Upload → Preview → Validate → Import), template download card, preview
  summary cards + status filters/search, import result summary with Download Error Report /
  Upload Another File; `bu-` CSS block appended to `index.css`; `Bulk*` types in `client.ts`
  rewritten to the backend response shapes (backend is source of truth).
- **Verification:** backend `tsc --noEmit` clean; frontend `tsc --noEmit` + `vite build` clean
  (`bu-` selectors present in the emitted bundle); new `test:bulk-upload` **23/23 PASS**; regressions
  `test:admin-routes` 8/8, `test:hod-admin` 22/22. New npm script `test:bulk-upload` (port 5116).

### Admin Features: Remove HOD · Faculty Department Reassignment · Student Documents Viewer (2026-10-08)

- **Goal:** three Admin improvements — a real "Remove HOD" action, a faculty department reassignment
  action, and a dedicated document viewer for Admin → Student Documents — without weakening RBAC,
  HOD department isolation, the record-permission state machine, or mentee/history data.
- **Feature 1 (Remove HOD):** `AdminHodManagement.tsx` Remove button (desktop + mobile) behind a
  confirmation modal; removal deactivates via the existing `api.admin.setHodStatus(id, false)` —
  no delete route, account + records + audit retained.
- **Feature 2 (Faculty Dept Reassign):** `PATCH /api/admin/faculty/:facultyId/department`
  (ADMIN-only, handler re-checks the role). Moves Faculty + User rows (re-login carries the new
  `departmentId`), never moves ACTIVE MentorAssignments or counselling records, writes
  `REASSIGN_FACULTY_DEPARTMENT` audit, returns previous/new department + `unchangedMentees`. A real
  defect was caught by the new suite: the handler saved the populated `user` snapshot (plain object)
  and threw `user.save is not a function` — fixed by fetching and saving the persisted User doc.
  Frontend: `api.admin.reassignFacultyDepartment` binding + two-step Reassign Department modal and
  desktop/mobile buttons in `AdminDashboard.tsx`.
- **Feature 3 (Student Documents viewer):** new `AdminStudentDocuments.tsx` — list + dedicated
  viewer (PDF iframe / image blob via `fetchViewBlob`, blob revoked on close, "Preview unavailable"
  + Download otherwise, metadata panel, viewer → list → list back-navigation). `AdminDashboard.tsx`
  now routes the Documents tab through a separate `documentsStudent` state (with tab-change reset)
  instead of `selectedStudentId`, so documents never redirect to the Student Profile; the other tabs
  still open the profile as before.
- **Verification:** new `test:faculty-dept-reassign` 18/18 PASS; `test:hod-admin` re-run 22/22 PASS;
  backend `tsc --noEmit` clean; frontend `npm run build` (tsc + vite) clean; 18 backend suites green.
  No commit/push made.

### Achievement Leaderboard UI/UX Enhancement (2026-10-08)

- **Goal:** make the existing Achievement Leaderboard look and behave like a polished college
  achievement platform — hero, summary cards, podium, breakdown, mobile cards — **without touching
  any backend, API, scoring, ranking, scope or authorization code**.
- **Inspected first:** `PROJECT_PROGRESS.md`, `LeaderboardView.tsx`, `client.ts`
  (`api.leaderboard`, `LeaderboardEntry` / `LeaderboardResponse` / `LeaderboardMe`),
  `leaderboard.controller.ts` (confirmed `GET /api/leaderboard` accepts **no** query parameters,
  so no filters were added), `EmptyState` / `Skeleton` / `SkeletonLoader`, the `.card` / `.badge` /
  `.table` / `.progress-*` / `.overview-summary-*` design tokens in `styles/index.css`, and all four
  `LeaderboardView` call sites (HOD / Faculty / Student dashboards).
- **Changed exactly two files:** `frontend/src/components/leaderboard/LeaderboardView.tsx`
  (rewritten in place, same props and same single API call) and `frontend/src/styles/index.css`
  (one appended, `lb-`-prefixed block; no existing rule modified). The previous header also used
  `.section-title` / `.section-subtitle`, classes that were never defined — the new hero replaces
  them.
- **Behaviour preserved:** one `GET /api/leaderboard` per mount, `res.data ?? res` unwrapping,
  `onViewStudent` / `highlightStudentId` props, the own-row highlight, the ranking footnote, the
  empty/error patterns, and every server-computed figure rendered verbatim. New UI numbers are
  display-only sums of returned values (scope point total, category bars, points-vs-leader).
- **Verification:** frontend `tsc --noEmit` PASS, `npm run build` PASS, backend untouched,
  `test:leaderboard` re-run 35/35 PASS. No commit/push made.

### Placement Monitoring, Achievement Points & Leaderboard (2026-10-08)

- **Goal:** give the institution a final-year placement monitor (mentor/HOD), an achievement ledger
  whose points are awarded only by verification, and a deterministic, cross-role leaderboard — all
  three driven by stored records, no client-supplied scores.
- **Rules locked in prose and code:** the placement transition table (PLACED terminal, NOT_PLACED
  non-terminal, same→same allowed, every other edge 409 with the allowed list); PLACED requires a
  company name; final-year = `year === 4`; points credit **only** on verify/approve; Hackathon rows
  need a recorded result and `Other` rows are 0-point (both refuse verification); duplicates are
  case/whitespace-insensitive 409; leaderboard ranks points DESC → verified count DESC → register
  number ASC and includes every active in-scope student (0-points included); scopes are
  ADMIN/STUDENT = college, HOD = department, FACULTY = own active mentees; placement is
  mentor/HOD-facing only (no student access).
- **Backend:** three pure util modules (`achievement-points.util.ts`, `placement.util.ts`,
  `leaderboard.util.ts`), three controllers + routers (`placements`, `achievements`,
  `leaderboard`) mounted in `src/index.ts`, serializers, caps (companyName 120 / salaryDetails 300 /
  mentorRemarks 1000; trainingProgress 0–100; package 0–200; strict `YYYY-MM-DD`), audit entries
  on every write, `requireHod` on the `/hod/*` placement views (ADMIN → 403, no department leak).
- **Frontend:** typed `api.placements / api.achievements / api.leaderboard` in `client.ts`; new
  `LeaderboardView.tsx` (shared, read-only), `HodPlacementPanel.tsx` (Summary / Student-wise /
  Mentor-wise), `MentorPlacementPanel.tsx` (transition-aware single-student editor); Sidebar nav for
  HOD "Placement Monitoring" and HOD/FACULTY/STUDENT "Achievement Leaderboard"; dashboards wired; new
  "11. Placement / Career" tab in `MentorStudentProfileView.tsx`.
- **Verification:** `test:placement` (port 5113) and `test:leaderboard` (port 5114) both 100% green;
  all 15 pre-existing suites re-run green including `test:internal-marks` 97/97; backend
  `tsc --noEmit` clean; frontend `tsc --noEmit` + `vite build` clean. PROJECT_PROGRESS.md updated.
  No commit or push was made.

### HOD Dashboard analytics pass — month filter, distinct-student coverage, 30-day mentor report (2026-10-07)

- **Goal:** every HOD figure must come from real stored, department-scoped data and follow one
  written rule: *"mentored in the selected month" = DISTINCT students with ≥1 `CounsellingRecord` in
  that month; sessions are counted separately and can never inflate coverage.*
- **Shared arithmetic (backend):** `backend/src/utils/mentoring-analytics.util.ts` gained
  `assignedMentees` on `DepartmentSummary` (distinct students with an ACTIVE assignment),
  `parseMonthRef(raw, fallback)` (strict `YYYY-MM`, invalid → current month, UTC first-of-month),
  and `mentorReportRows({faculty,assignments,sessions,students}, fromDay, toDay)` — a windowed
  counterpart of `mentorWiseRows` with Set-based distinct coverage and a `notCovered[]` list sorted
  by registerNumber. The Admin suite (`test:admin`) still asserts `weeklyProgress.length === 8`:
  Admin stays on its 8-week buckets; only HOD moved to 4.
- **HOD controller (`backend/src/modules/hod/hod.controller.ts`):**
  - `GET /api/hod/dashboard`, `/mentor-wise`, `/mentors/:id` accept `?month=YYYY-MM`; pie `.month`,
    mentor-wise rows and mentor detail all recompute for that ref; invalid values fall back to the
    current month (never a 400, never a silent wrong month).
  - Mentor detail adds `summary.sessionsThisMonth` and per-mentee `sessionsThisMonth` /
    `coveredThisMonth`.
  - `GET /api/hod/weekly-progress` and the dashboard's inline weekly buckets now **default to 4
    weeks (30-day window)**, honour `?weeks=` (clamped 1–26) and stay explicit in the response.
  - `GET /api/hod/report-30-day` gains `reportMentors` (windowed mentor rows, only mentors with
    `totalMentees > 0`, each carrying `notCovered` register numbers) and computes `mentorsActive`
    from those rows; the existing monthly `mentorWise` field is kept so nothing breaks.
  - `GET /api/hod/department-overview` adds `activeMentees` (`summary.assignedMentees`).
  - Scope discipline unchanged: every filter is built from `req.user.departmentId` inside the
    handler; the frontend can never widen the query.
- **Frontend (`frontend/src/pages/hod/HodDashboard.tsx` + `client.ts` + `styles/index.css`):**
  - Reporting-month `<input type="month">` in the overview header; `month` is the `loadData`
    dependency, so changing it refetches everything (dashboard, mentor-wise, overview) with the
    existing skeleton states — month is also forwarded to `openMentor` so the detail modal agrees.
  - 7 summary cards (Active Mentees added; month-aware "Mentored {month}" labels; Coverage shows
    "No students" rather than a misleading 0% when the department has none), the "no students"
    warning alert, and a `.hod-split-wide` pie+weekly row / `.hod-split-half` tables row that
    collapse to one column at ≤1024px.
  - Monthly Mentor Coverage table gained a client-side mentor filter `<select>`, a month badge and
    an explicit note when a month holds no records (empty state, never fabricated numbers).
  - Mentor detail modal: 6 summary cards (incl. Sessions This Month) and the 6 required mentee
    columns (Mentoring Status, Last Mentoring Date, Sessions This Month, Covered This Month…).
  - Reports tab: new **Mentor-wise 30-day Report** table (8 columns incl. `notCovered` register
    badges / "All covered"), a weekly header stating "30-day window · 4 weeks", a report fetch
    failure state with a Retry button (`reportError`), and month-aware "Mentored {month}" columns.
  - Reused the existing `EmptyState` / `SkeletonLoader` / `Modal` / error-state components and the
    existing inline-SVG pie (no chart library is installed).
- **Test fixes found by the new work (test code was wrong, not the product):**
  - A pre-existing date flake: weekly bucket assertions assumed records land in a single bucket,
    which breaks when `dayOffset(-N)` straddles a Monday boundary → now assert per-day membership.
  - `test:hod` caps/default expectations updated 8 → 4 for the HOD weekly default (the Admin 8-week
    contract lives in `test:admin` and is untouched).
- **New assertions in `hod-scope.test.ts` (28 → 33 checks):** `assignedMentees`/`activeMentees`
  values; dashboard weekly = 4 buckets scoped to CSE; past-month filter re-deriving the pie;
  invalid `?month` falling back; mentor detail month agreement; `reportMentors` rows with
  `notCovered` naming the right register number; and a **duplicate-session seed** (2 extra records
  for the same student + day) proving coverage stays 2/3 while session counts rise.
- **Verification:** `test:hod` 33/33; all 14 backend suites green (`test:state-machine` 137,
  `test:admin` 23, `test:hod-admin` 22, `test:faculty-notifications` 21, `test:mentoring-evidence`
  100, `test:runtime` 38, `test:critical` 12, `test:admin-routes` 8, `test:directory` 16,
  `test:grammar-api` 49, `test:grammar-safety` 44, `test:export` green, `test:grammar` green);
  backend `tsc` clean; frontend `tsc --noEmit` + `vite build` clean. No commit or push was made.

### Login bounce-to-login loop — root cause and fix (2026-10-07)

- **Symptom:** login succeeded, the dashboard painted, then the app redirected back to the login form.
- **Root cause:** `frontend/src/context/AuthContext.tsx` `refreshUser()` (runs on page load via a
  `[token]` effect and re-verifies the session) called `logout()` in its `catch` for **any** error.
  Since `login()` sets the user optimistically and only then re-verifies via the same
  `refreshUser()`, any transient failure of `GET /api/auth/me` (backend restart, 5xx, cold start,
  wrong API base, brief network blip) wiped the just-issued `ksrce_token` and threw the user back
  to the login page. Amplified by `frontend/.env` / `frontend/.env.example` pointing the API base
  at `http://localhost:5000` — a port this project does not use (the backend is 5050; 5000 is an
  unrelated sibling project, which its DB definitively rejects these credentials), so every API
  call including the post-login restore was doomed to fail.
- **Fix (`frontend/src/context/AuthContext.tsx`):** `refreshUser` now only logs out on a genuine
  rejection (`statusCode 401/403` — the server explicitly saying this session is dead). Transient
  failures keep the current user and token; the stored session is never destroyed by a network or
  server error.
- **Fix (config):** `frontend/.env` → `VITE_API_URL=http://localhost:5050`;
  `frontend/.env.example` → restored to the documented values (Render URL for production, empty for
  the Vite dev proxy to `localhost:5050`). No `localhost:5000` anywhere.
- **Evidence:** local 5050 and the Render/Vercel production stack both verify clean end-to-end;
  nothing in the repo listens on 5000; `backend/data/audit_logs.json` shows the reported session
  never hit the local backend, pointing to a transient/env failure on the restore request —
  reproduced in-browser by forcing `/auth/me` to 500 right after login (pre-fix: bounced, token
  wiped; post-fix: dashboard stays, token kept).
- **Untouched:** the project-wide auth contract, token storage (`ksrce_token`, single key), route
  guards, error-handling component, and all backend auth code.

### Admin/HOD department display — Admin no longer shows an assigned department (2026-10-07)

- **The report:** the Admin HOD Management page header read "ADMIN PORTAL / IT Department", which
  implies the logged-in Admin is scoped to a single department.
- **Rule enforced:** ADMIN is college-level and not tied to a department; HOD owns exactly one
  department. The Admin user record happens to carry a department ref, so the header labelled the
  Admin with it.
- **Fix (frontend only, three display sites):** `Sidebar.tsx` mobile-drawer/secondary line and the
  sidebar header, and the `Navbar.tsx` desktop dept badge now special-case `role === 'ADMIN'` →
  neutral branding ("SYSTEM ADMINISTRATION"; mobile shows "ADMIN • KSRCE"; no dept badge). HOD /
  FACULTY / STUDENT rendering is unchanged — a HOD still sees exactly their own department. No
  backend change: HOD authorization, `/api/hod/*`, Admin HOD CRUD and the stored admin record are
  untouched. Add/Edit HOD keeps the required single-select Department field.
- **Verification:** Playwright against the local stack (login as Admin) — sidebar header now shows
  "ADMIN PORTAL / SYSTEM ADMINISTRATION", no "IT/CSE/ECE/MECH Department" and no admin dept badge;
  HOD Management tab opens; Add HOD modal still shows a required Department select with all four
  departments (CSE/ECE/IT/MECH). `tsc --noEmit` PASS; `npm run build` (tsc && vite build) PASS.

### Admin Mentoring Dashboard 404 — route contract verified (2026-10-06)

- **The bug report:** the running Admin dashboard requested `/api/admin/mentoring-overview/dashboard`,
  `/api/admin/mentoring-overview/hods`, `/api/admin/mentoring-overview/departments`,
  `/api/admin/mentoring-overview/mentoring-comparison` and `/api/admin/hods` — all 404s.
- **What the investigation proved:** the frontend source (`frontend/src/api/client.ts`,
  `api.adminMentoring`) already targets `/admin/overview/*` and `api.admin.getHods` targets
  `/admin/hods` — the exact routes the backend actually mounts (`admin-overview.routes.ts` at
  `/api/admin/overview`, registered in `src/index.ts` **before** the general `/api/admin` router;
  `GET/POST /api/admin/hods` in `admin.routes.ts`). `mentoring-overview` / `mentoring-comparison`
  exist in `AdminMentoringDashboard.tsx` only as `currentTab` keys, never as URLs. `git show
  HEAD:frontend/src/api/client.ts` contains **no** adminMentoring / HOD-management code at all, so
  the browser producing the 404s was running a stale deployed bundle against the current route
  table. There was therefore **no product code change to make** — the ground truth needed to be
  locked down and proven at runtime.
- **The lock:** new `test:admin-routes` (`backend/src/tests/admin-dashboard-routes.test.ts`,
  port 5102) boots the real `src/index.ts` over HTTP and asserts: the five reported URLs plus
  department detail / department mentors / mentor detail / report-30-day (8 `/api/admin/overview/*`
  calls) return **200 with real data**; the legacy `/api/admin/mentoring-overview/*` prefix returns
  **404** so no duplicate routes tempt a stale client; the overview surface and `/api/admin/hods`
  stay **ADMIN-only** (HOD 403, anonymous 401); the verified `/api/hod/dashboard` is unchanged and
  still department-isolated (CSE 2 students, ECE 1, ECE sees 0 mentored); and
  `frontend/src/api/client.ts` is read statically to prove it ships exactly the server routes and
  never the wrong prefix.
- **Verification result:** `test:admin-routes` **8/8 PASS**; regressions `test:admin` 23/23,
  `test:hod-admin` 22/22, `test:hod` 24/24; the freshly built bundle
  (`frontend/dist/assets/index-BIUqstrf.js`) contains `/admin/overview/*` and `/admin/hods` and no
  `/admin/mentoring-overview` URL (the bare `mentoring-overview` / `mentoring-comparison` strings
  that remain are `currentTab` keys only); backend `tsc` clean; frontend `tsc && vite build` clean.

### Faculty → HOD Department Notifications (2026-10-06)

- **What was added — the send side.** A Faculty member can post a notice to their own department's
  HOD. `POST /api/notifications/faculty` (`authorize(ROLES.FACULTY)`) derives the department
  **server-side** from the sender's own `Faculty` record (`faculty.department ?: user.departmentId`);
  a body that names any *other* department is refused 400 ("Cross-department notifications are not
  allowed"), a Faculty account with no Faculty record is refused 403, and a department with no
  active HOD is refused 409 (a notice nobody can act on is not silently stored). Title ≤150 chars,
  message ≤2000 chars, both required (400). One `Notification` document is fan-out per **active HOD**
  of the department **plus** one per **active Admin** — so the existing Admin "System
  Notifications" feed shows the activity without touching any authorization rule.
- **The read side.** New `GET /api/hod/notifications` (`requireHod`, fails closed when the token has
  no `departmentId` claim) returns `{ notifications, unreadCount, totalCount, department }` filtered
  by `{ user, department, type: FACULTY_NOTIFICATION }`. Mark-read reuses the existing user-scoped
  `PATCH /api/notifications/:id/read` — a HOD from another department marks nothing. The Faculty
  "sent" list (`GET /api/notifications/sent`, FACULTY only) is scoped by `facultyId` and lists **one
  row per send** with the HOD's read receipt; the standard inbox rows gained additive
  `faculty_name` / `department` / `department_name` fields, so pre-existing consumers are unchanged.
- **Model/contract.** `Notification.model.ts` gained optional `department` (ref, indexed,
  `{department,isRead}` index), `facultyId`, `facultyName` and `recipientRole` ('HOD' | 'ADMIN' —
  the HOD copy of each send is the actionable one, which is exactly what the sent-list filter uses
  to avoid one notice appearing once per recipient). Type constant `FACULTY_NOTIFICATION` added to
  `NOTIFICATION_TYPES`. Every handler treats the department as server-authoritative; `logAudit`
  records `CREATE_FACULTY_NOTIFICATION`.
- **Frontend.** `api.notifications.{sendFaculty,sent}` + `api.hod.departmentNotifications` (typed in
  `client.ts`). HOD sidebar gains "Faculty Notifications" → `HodDashboard` tab: list with
  unread highlighting, unread badge, Refresh, per-notice Mark Read and a detail modal. Faculty
  sidebar gains "Notifications" → `FacultyDashboard` tab: composer (title/message with counters,
  server decides the department) plus the sent list with read-receipt status and a detail modal.
  Admin `AdminDashboard` notifications table adds Faculty / Department / Status columns (Status
  shown only for `FACULTY_NOTIFICATION` rows). No duplicate notification system was created.
- **Verification result:** new `test:faculty-notifications` (`backend/src/tests/faculty-
  notifications.test.ts`, port 5101) **21/21 PASS** — create+store, HOD sees it with every field,
  stored-not-fabricated, the HOD inbox carrying the new fields, cross-department isolation across
  two seeded departments, department-ID/field rejection storing nothing, a foreign HOD unable to
  mark read vs. the right HOD marking it read (per-recipient state), the full RBAC matrix on send /
  HOD read / sent (403/401), an unscoped HOD failing closed, validation 400s, no-Faculty-record 403,
  no-active-HOD 409, sent-list scoping **without** per-recipient duplication, Admin activity via the
  existing inbox with untouched Admin permissions, unchanged legacy `faculty-notifications` /
  `dashboard` surfaces, and a location-field scan over 6 responses. Regressions: all 12 pre-existing
  suites re-run green (see Verification); backend `tsc` clean; frontend `tsc && vite build` clean.
- **Defect caught by the new suite:** the first attempt stored one copy per HOD recipient and admin,
  so the author's sent list showed the same notice twice. `recipientRole` was added and the sent-list
  filter narrowed to the HOD copies — the test was not weakened.

### Admin HOD Management (2026-10-06)

- **New Admin surface** — `backend/src/modules/admin/admin-hod.controller.ts` with four endpoints
  mounted in `admin.routes.ts`, each `authorize(ROLES.ADMIN)` **and** re-verified in the handler
  (a HOD / FACULTY / STUDENT / anonymous caller is refused 403 / 401 even if a handler were
  re-mounted elsewhere): `GET /api/admin/hods` (list + active/inactive summary),
  `POST /api/admin/hods` (create), `PUT /api/admin/hods/:hodId` (edit),
  `PATCH /api/admin/hods/:hodId/status` (deactivate/activate).
- **The one-active-HOD-per-department rule lives server-side.** A `User` with `role: 'HOD'` plus a
  single `department` ref is exactly what a HOD already was (no new Hod model, nothing in the
  verified `/api/hod/*` logic changed). Create/update/activate all scan the other HOD users and
  refuse with 409 ("`<dept> already has an active HOD (<name>)`"); a deactivated HOD **frees the
  slot**, so the Admin can appoint a successor without ever deleting the original account.
- **Deactivation is a status flip only** — `user.isActive = false`. No delete route exists.
  Historical mentoring/academic records keep their author; the auth controller already refuses
  login for inactive users. Reactivation is refused 409 if a successor has taken the department.
- **Setup follows the existing auth pattern** — `bcrypt.hash(..., 10)`, default password
  `Password@123`, login by username or email; username is auto-derived from the email (uniquified)
  when the form leaves it blank. Required-field / email-format / password-length / unknown-department
  checks return 400; duplicate email/username return 409.
- **Audit** — `CREATE_HOD`, `UPDATE_HOD`, `ACTIVATE_HOD`, `DEACTIVATE_HOD` entries.
- **Defect caught by the new suite:** a hydrated document's `department` field is a ref object, not
  a plain string, so `String(user.department)` silently produced `[object Object]` and the
  duplicate-HOD scan never matched. All id comparisons now go through the existing
  `toIdString()` normaliser (`backend/src/utils/access.util.ts`). The test failed, the code was
  fixed, the test was not weakened.
- **Frontend** — reusable `frontend/src/pages/admin/AdminHodManagement.tsx` (rendered by
  `AdminDashboard` for tab `hod-management`, Sidebar entry "HOD Management"): HOD table (Name /
  Email / Department / Status / View / Edit / Deactivate) with a mobile card layout, Add / Edit
  modal (Full Name, Email, Department — departments already holding an active HOD are disabled in
  the picker — Username, optional password, Status), a View modal, a confirm step for
  deactivate/activate, inline client validation plus toast success/error, and the existing
  skeleton / Network / Service / Server error states. `frontend/src/api/client.ts` gains typed
  `api.admin.{getHods,createHod,updateHod,setHodStatus}`.
- **Verification result:** new `test:hod-admin` **22/22 PASS** (creating a HOD, the account logging
  in with the supplied password, one `departmentId` claim, duplicate-department HOD rejection on
  both create and edit, validation 400s, duplicate email 409, edit rename and department move,
  deactivation retaining the account *and* the seeded records while blocking login, slot-freed
  successor appointment, reactivation conflict 409, ADMIN-only 403/401 matrix incl. a HOD being
  unable to mint a HOD, and HOD dashboard still department-scoped — CSE sees 2 students, ECE sees 1,
  cross-department mentor read 404). Regressions: `test:hod` 24/24, `test:admin` 23/23,
  `test:critical` 12/12, `test:runtime` 38/38, `test:state-machine` 137/137; backend `tsc` clean;
  frontend `tsc && vite build` clean.

### Admin college-wide Overall Mentoring Dashboard (2026-10-06)

- **Shared arithmetic first, so the two portals cannot disagree.** All mentoring maths now lives in
  `backend/src/utils/mentoring-analytics.util.ts` (pure functions only: `summarise`,
  `mentoredStudentIdsThisMonth`, `mentorWiseRows`, `weeklyBuckets`, `pct`, `toDay`, `idOf`,
  `clampWeeks`). `hod.controller.ts` became a thin adapter that binds an already department-scoped
  `HodScope` to it. `test:hod` is **still 24/24**, which is the proof that HOD output and department
  isolation are byte-for-byte unchanged.
- **New Admin surface** — `backend/src/modules/admin/admin-overview.controller.ts` with a
  deliberately **separate** `admin-overview.routes.ts` mounted at `/api/admin/overview` in
  `src/index.ts` *before* the general `/api/admin` router, so its guard is the first handler that
  sees the request. Endpoints: `/dashboard`, `/hods`, `/departments`, `/department-comparison`,
  `/departments/:id`, `/departments/:id/mentors`, `/mentors/:id`, `/report-30-day`. The router
  applies `authorize(ROLES.ADMIN)` and every handler **also** re-checks `req.user.role`, so a
  handler cannot be reached by HOD / FACULTY / STUDENT even if it were re-mounted elsewhere.
- **Definitions travel with the data.** Each response carries a `definitions` block stating exactly
  how `mentored`, `pending`, `mentors`, `coverage` and `sessions` are computed, and the frontend
  renders the returned numbers rather than re-deriving them.
- **Security hole closed.** `GET /api/admin/departments`, `/api/admin/batches` and
  `GET /api/admin/settings` were reachable by **any** logged-in role, because
  `StudentDashboard` used the Admin department/batch lists to populate its identity-request
  dropdowns. Those three routes now carry `authorize(ROLES.ADMIN)`, and a new authenticated-only
  `backend/src/modules/reference/` module exposes `/api/reference/departments`, `/batches` and
  `/counts` with just `id / name / code / academic years` — no mentoring data, no faculty personal
  data, nothing that is Admin functionality. `StudentDashboard` was migrated to it.
- **Frontend:** `frontend/src/pages/admin/AdminMentoringDashboard.tsx` (new) — Overall / HOD
  Overview / Departments / Comparison / 30-Day Report tabs, the college PIE as inline SVG (no chart
  library is installed), coverage bars, the four-level drill-down, and an expandable "How each figure
  is measured" panel. Wired into `AdminDashboard` and the Admin sidebar as `mentoring-dashboard`.
- **Verification result:** `test:admin` **23/23** (new); `test:hod` 24/24; `test:runtime` 38/38 with
  check 16 rewritten to assert **both** halves of the reference/Admin split;
  `test:state-machine` 137/137; `test:directory` 16/16; `test:critical` 12/12; backend `tsc` clean;
  frontend `tsc && vite build` clean.
- **Defects found and fixed during verification:** (1) the first HOD refactor pass declared local
  `summarise` / `weeklyBuckets` functions with the same names as their new imports, which made them
  recursively call themselves and shadow the import — resolved with aliased imports
  (`summariseMetrics`, `buildWeeklyBuckets`) and a renamed `mentorWiseForScope` adapter, since a
  local `const mentorWise` would have been its own TDZ. (2) The HOD row and department row shapes
  exposed `pendingStudents` and `mentoringCoverage` but not `mentoredThisMonth`, forcing the client
  to subtract to get it; the field is now sent explicitly.
- **Flagged, deliberately not changed:** `/admin/dashboard-stats` and
  `/admin/mentors/:mentorId/mentees` still allow `ROLES.HOD`. That is pre-existing behaviour outside
  this task's scope and altering it would change the verified HOD surface. The new
  `/api/admin/overview/*` routes are the strictly Admin-only path.

### Previous: HOD department-scoped dashboard

- **Most recent change:** HOD department-scoped dashboard, mentoring analytics, CRUD, mentor
  assignment and faculty notifications.
- **First, the blocker:** `frontend/src/api/client.ts` did not parse (TS1109/TS1005). Five object
  literals were never closed (`mentorship`, `documents`, `pdf`, `reports`, `audit`), which is why
  every block below ~line 750 read as malformed. Closes added; frontend `tsc` returned clean.
- **Files affected (backend):**
  - `backend/src/modules/hod/hod.controller.ts` — all 11 endpoints rewritten. Department scope is
    applied **inside** each Mongo filter, never by post-filtering a wider read. A HOD token with no
    `departmentId` claim is refused 403 rather than treated as institution-wide; there is no admin
    bypass here. All figures derive from stored `CounsellingRecord` / `Meeting` /
    `MentorAssignment` rows.
  - `backend/src/modules/hod/hod.routes.ts` — HOD-only route table.
  - `backend/src/tests/hod-scope.test.ts` — **new**; 24 assertions across two seeded departments.
  - `backend/package.json` — script `test:hod`.
- **Files affected (frontend):**
  - `frontend/src/api/client.ts` — HOD response types + `api.hod` (dashboard, department-overview,
    mentorWise, mentorDetail, weeklyProgress, report30Day, students/faculty CRUD, assignMentor,
    removeMentor, facultyNotifications).
  - `frontend/src/pages/hod/HodDashboard.tsx` — six summary cards, monthly PIE as **inline SVG**
    (no chart library is installed), weekly-progress bars, mentor-wise table + detail modal, 30-day
    report, student/faculty add-edit-view, mentor assignment, faculty notifications, Saturday
    meeting log.
- **Removed:** stray root-level `hod.controller.ts` / `hod.routes.ts` duplicates. Only
  `./modules/hod/hod.routes.js` was ever imported by `src/index.ts`, so nothing referenced them.
- **Verification result:** `test:hod` 24/24 PASS; backend `tsc` PASS; frontend `tsc` PASS;
  `test:critical` PASS (12/12); `test:directory` 16/16 PASS.
- **Defect found and fixed during verification:** `removeHodAssignment` called `.save()` on a row
  that `loadScope()` had loaded with `.lean()`, so ending an assignment threw at runtime. It now
  re-reads the row as a live document with its own `department` + `ACTIVE` filters, and the
  historical row is retained as `COMPLETED` rather than deleted.
- **Previous change:** Grammar & Spelling Assistant — advisory, non-destructive text improvement.
- **Files affected (backend):**
  - `backend/src/modules/counselling/ai-assistant.service.ts` — protected-value extraction/guard, LLM
    output sanitizer, official-token skip in the local engine, strengthened prompt.
  - `backend/src/modules/counselling/counselling.controller.ts` — length cap, graceful blank handling,
    generic failure message, explicit response shape.
  - `backend/src/tests/grammar-safety.test.ts` — **new**; 44 deterministic guard assertions.
  - `backend/src/tests/grammar-api.test.ts` — **new**; 49 full-stack HTTP/runtime assertions.
  - `backend/package.json` — scripts `test:grammar-safety`, `test:grammar-api`.
- **Files affected (frontend):**
  - `frontend/src/components/mentor/GrammarAssistField.tsx` — error UI, "✨ Improve Grammar" /
    "Apply Correction" copy.
  - `frontend/src/pages/mentor/MentorStudentProfileView.tsx` — counselling + meeting fields wired.
  - `frontend/src/components/mentor/MenteeProgressDashboard.tsx` — rejection-reason field wired.
  - `frontend/src/api/client.ts` — `checkGrammar` documented as advisory-only.
- **Verification result:** `test:grammar-api` 49/49 PASS; `test:grammar-safety` 44/44 PASS;
  `test:state-machine` 137/137 PASS; `test:critical` PASS (12/12); `test:directory` 16/16 PASS;
  `test:grammar` PASS; backend build PASS; frontend build PASS; `test:export` still fails on the
  pre-existing, unrelated column-order assertion (re-confirmed on stashed pristine `HEAD`).
- **Previous change:** full 6-state student-record permission state machine, enforced server-side.
- **Files affected (backend):**
  - `backend/src/utils/record-permission.util.ts` — **new**; states, transition table, capability derivation.
  - `backend/src/models/StudentDocument.model.ts` / `StudentProgress.model.ts` — enums widened.
  - `backend/src/modules/documents/document.controller.ts` — guarded update/delete/verify, new `submitDocument`.
  - `backend/src/modules/documents/document.routes.ts` — `POST /:documentId/submit`.
  - `backend/src/modules/student-progress/student-progress.controller.ts` — same guards, new
    `submitStudentProgress`, `permissions` on every payload, summary counters per state.
  - `backend/src/modules/student-progress/student-progress.routes.ts` — `POST /:id/submit`.
  - `backend/src/modules/admin/admin.controller.ts` — CONFIRMED records excluded from the global purge.
  - `backend/src/tests/record-permission-state.test.ts` — **new**; 137 assertions.
  - `backend/src/tests/runtime-verification.test.ts` — document-workflow check now walks the full
    PENDING → APPROVED → submit → SUBMITTED → CONFIRMED path and asserts the read-only refusals.
- **Files affected (frontend):**
  - `frontend/src/lib/recordStatus.tsx` — **new**; presentation only, no permission logic.
  - `frontend/src/api/client.ts` — `submit` endpoints, typed `RecordState`/`RecordPermissions`.
  - `frontend/src/api/errorHandler.ts` — 409 split into `CONFLICT` vs `RECORD_LOCKED`; `RECORD_LOCKED`
    added to `ApiErrorType` (fixed frontend build).
  - `frontend/src/components/student/StudentProgressView.tsx` — actions gated on backend permissions.
  - `frontend/src/components/documents/StudentDocumentsManager.tsx` — edit modal wired, delete gated.
  - `frontend/src/components/mentor/MenteeProgressDashboard.tsx` — two-stage review from `canConfirm`.
  - `frontend/src/pages/admin/AdminDashboard.tsx` — purge modal states that confirmed records are retained.
  - `frontend/src/styles/index.css` — `.record-state-hint`, `.unavailable-action`, `.badge-secondary`.
- **Verification result:** `test:state-machine` 137/137 PASS; backend build PASS; frontend build PASS;
  `test:critical` PASS; `test:directory` 16/16 PASS; `test:grammar` PASS; `test:export` fails on a
  pre-existing, unrelated column-order assertion (re-confirmed on stashed pristine `HEAD`).

---

## Pending

- PENDING — The HOD Reassignment tab ends the previous assignment row before creating the new one
  (history retained as `COMPLETED`). Confirm with the HODs that this matches their paper process;
  if they need the original assignment row to remain `ACTIVE` until the new one is accepted, the
  ordering in `createHodAssignment` / `removeHodAssignment` needs a two-step confirm instead.
- PENDING — HOD mentor assignment is a first-class feature on the HOD page, but the separate
  institution-wide reassignment flow (covered by `test:critical`) still has its own rules. Decide
  whether the two should share one code path.
- PENDING — Admin HOD Management works on plain `role: 'HOD'` users. The `User` model has **no phone
  field**, so the HOD create/edit form and API deliberately omit phone (the requirement's "if the
  existing user model supports it" clause). Add a phone field to `User` first if HOD phone storage
  becomes a requirement.
- PENDING — The one-active-HOD-per-department rule is the chosen "duplicate HOD" semantics, and
  deactivation is the **only** removal mechanism (no delete route exists, ever; historical records
  keep their HOD author). A deactivated HOD frees the slot for a successor. If the institution would
  instead rather reserve a slot per department forever (one HOD account per department, period), the
  create/update/activate scan needs that as an option — confirm before changing.
- PENDING — Redeploy to Render and confirm `/api/health` and the student dashboard return 200
  on a cold container.
- PENDING — Obtain Render runtime logs to confirm or refute the causal link for the historical 500.
- PENDING — Decide on durable upload storage. Local-disk uploads do **not** survive a Render redeploy
  (the filesystem is ephemeral). The temp-dir fallback keeps the API alive but is also ephemeral.
  If uploaded certificates must persist, they need object storage; this is a design decision, not a bug fix.
- PENDING — `render.yaml` service names (`digital-mentor-mentee-backend` / `-frontend`) do not match
  the live host (`digital-mentor-mentee`). Confirm whether the blueprint is meant to replace the
  existing manually-created service before changing names.
- SUPERSEDED (2026-10-07) — `npm run test:export` used to fail on an Excel column-order assertion:
  column 6 was `EMAIL` where the test expected `CLASS & SECTION`. The export expectations were
  updated in a later task (see Completed → "Pre-existing failure fixed") and the suite now passes
  green; the entry is retained for history only.
- PENDING — Mentors must now act **twice** (Approve, then Confirm) for a record to reach CONFIRMED.
  Any mentor-facing documentation, email template or onboarding guide that describes a single-step
  "Verify" action needs updating.
- PENDING — `syncStudentDetailsPdf` still writes `verificationStatus: 'Verified'` for the
  system-generated Student Details Form. That document is excluded from every mentor review surface,
  so it is not reachable as a confirmable achievement, but it is the one remaining writer of CONFIRMED
  that no mentor performed. Deliberately left as-is (it is a generated artefact, not an achievement);
  worth a decision if the rule is ever tightened to "only a mentor action may create CONFIRMED".
- PENDING — Grammar Assistant is available on mentor/HOD/admin surfaces only. Student-facing long-text
  fields cannot use it without adding `ROLES.STUDENT` to the `grammar-check` route, which would be an
  RBAC change and was deliberately not made. The pre-existing 900 ms debounce auto-check in
  `GrammarAssistField.tsx` was also left as-is.
- PENDING — `Editing` remains an unreachable state: there is no begin-edit endpoint that moves an
  APPROVED record into EDITING. Deliberately left; the state exists in the machine for the documented
  workflow but nothing enters it yet.
- PENDING — Mentoring evidence photos inherit the same ephemeral-filesystem problem as the existing
  uploads: they live under `backend/storage/uploads/counselling/` and do **not** survive a Render
  redeploy. Same design decision as the certificate uploads above — durable object
  storage is required before evidence can be treated as an official record.
- PENDING — Evidence geotags are captured from the device and validated for plausibility, but nothing
  verifies the device was physically at the mentoring venue. A mentor can capture elsewhere, and
  desktop browsers typically have no location at all, which makes the upload fail closed. That is
  deliberate, but it means the feature effectively requires a location-capable device; if on-desktop
  capture is a real requirement, an explicit supervisor override flow needs to be designed.

---

- PENDING — Mentor visibility of internal marks outside the entry window is read-only plus a
  correction request. If the college wants bulk import of marks (e.g., from an academic portal
  CSV) or exports of the official IA sheet, add that as a new task.

## Verification

Backend and frontend both build clean (`tsc` / `vite build`). All 20 suites, run against the local
file store (re-run in full on 2026-10-08 after the Placement / Achievement / Leaderboard pass; the
new `test:faculty-dept-reassign` suite was added in the Admin features pass that day,
`test:bulk-upload` was added in the Bulk Upload pass on 2026-10-09 and
`test:hod-delete` in the Admin-only permanent HOD deletion pass on 2026-10-09):

| Script | Result |
|---|---|
| `test:state-machine` | PASS — 137 passed, 0 failed |
| `test:hod` | PASS — 33 passed, 0 failed (HOD department scoping + analytics, incl. `?month`, distinct-student coverage, 4-week windows, `reportMentors`) |
| `test:admin` | PASS — 23 passed, 0 failed (Admin college-wide mentoring dashboard; still asserts Admin weekly = 8) |
| `test:hod-admin` | PASS — 22 passed, 0 failed (Admin HOD Management) |
| `test:admin-routes` | PASS — 8 passed, 0 failed (Admin dashboard route contract vs the reported 404s) |
| `test:grammar` | PASS — all grammar engine cases passed |
| `test:grammar-safety` | PASS — 44 passed, 0 failed |
| `test:grammar-api` | PASS — 49 passed, 0 failed |
| `test:export` | PASS — overall mentee export 100% green |
| `test:directory` | PASS — 16 passed, 0 failed |
| `test:critical` | PASS — all 12 steps, zero data loss across reassignment |
| `test:runtime` | PASS — 38 passed, 0 partial, 0 failed |
| `test:mentoring-evidence` | PASS — 100 passed, 0 failed |
| `test:faculty-notifications` | PASS — 21 passed, 0 failed (Faculty → HOD notifications) |
| `test:internal-marks` | PASS — 97 passed, 0 failed (Internal Assessment Marks + three PDF modes) |
| `test:placement` | PASS — all green, 0 failed (final-year placement lifecycle; port 5113) |
| `test:leaderboard` | PASS — all green, 0 failed (achievement points + deterministic leaderboard; port 5114) |
| `test:faculty-dept-reassign` | PASS — 18 passed, 0 failed (Admin faculty department reassignment + Remove-HOD/Documents-viewer frontend contracts; port 5115) |
| `test:bulk-upload` | PASS — 23 passed, 0 failed (bulk template contract, validation/import, error report, route order, frontend source contracts; port 5116) |
| `test:hod-delete` | PASS — 17 passed, 0 failed (Admin-only permanent HOD deletion; port 5117) |

`test:faculty-notifications` (`backend/src/tests/faculty-notifications.test.ts`) is the dedicated
suite for the Faculty → HOD notification work above. It seeds **two** departments (CSE and ECE),
each with its own HOD and its own faculty, so a missing department filter is provable rather than
assumed. It covers: a Faculty member creating a notice for the department derived from their own
Faculty record; the HOD seeing it with every required field; the row being real stored data; the
standard inbox carrying the new `faculty_name` / `department_name` fields; the ECE HOD never seeing
a CSE notice (list, unreadCount and inbox all clean); each department receiving only its own
notices; a body addressing another department refused 400 with nothing stored; a HOD of the wrong
department unable to mark a notice read while the right HOD can (read state is per recipient); the
full RBAC matrix on create / HOD read / sent list (403 for other roles, 401 anonymous); a HOD token
without a department claim failing closed; validation 400s; a Faculty account with no Faculty
record refused 403; a department with no active HOD refused 409; the sent list scoped to the author
**and** showing exactly one row per send (no per-recipient duplication) with the HOD's read
receipt; Admin seeing the activity through the existing inbox with Admin permissions untouched; the
  pre-existing legacy `faculty-notifications` / `dashboard` surfaces unchanged; and a scan of 6
  notification responses proving no GPS / location field is emitted.

`test:internal-marks` (`backend/src/tests/internal-marks.test.ts`, port 5112) is the dedicated
suite for the Internal Assessment Marks module. It boots the real entrypoint on the local file
store and covers: the ADMIN-only permission surface (`GET/PUT /api/marks/permission`); status
derivation (INACTIVE before first enable, ACTIVE during the window, EXPIRED after backdating
`expiresAt`) exposed via `GET /api/marks/student/:id`; mentor entry inside the window for exactly
the admin-selected mark types; refusal strings outside it; an expired window refusing edits while
still allowing a correction request; the correction request lifecycle (create, duplicate-request
409, reason-too-short 400, PENDING → Admin approve/reject, `previousMark`/`resolvedMark`,
rejection-reason required); marks written to the official row only on approve and left untouched on
reject; FACULTY/HOD department scoping of both students and requests; full RBAC (mentor and HOD
403 on the permission switch, student 403 on marks and requests, unassigned mentor 403, HOD 403 on
approve, mentor 403 on their own request's approve); and PDF rendering for
`mode=full|internal|mentor-documents` with proper filenames plus 400 on an unknown `mode`. 97/97 PASS.

`test:placement` (`backend/src/tests/placement.test.ts`, port 5113) is the dedicated suite for the
final-year placement lifecycle. It boots the real entrypoint and covers: record creation for a
final-year student under each role in scope; the transition table both ways (every allowed move
accepted and persisted, disallowed moves 409 with the allowed list, same→same when legal);
**PLACED requiring a company name** and **PLACED being terminal**; NOT_SELECTED remaining
non-terminal (a not-selected student may still become PLACED); non-final-year students refused 400;
student accounts refused all placement reads and writes (placement is mentor/HOD-facing); HOD
department isolation (summary / mentor-wise / student-wise never cross the boundary, and an ADMIN
token cannot borrow the `/hod/*` views — 403); status-filtered student-wise lists; aggregates
(totals, percentages, in-progress, with/without record) matching stored rows; and the audit trail
creating `CREATE_PLACEMENT` / `UPDATE_PLACEMENT` entries. All green.

`test:leaderboard` (`backend/src/tests/leaderboard.test.ts`, port 5114) is the dedicated suite for
achievement scoring + the leaderboard. It boots the real entrypoint and covers: the points pipeline
(potential `points` vs credited `pointsAwarded`; only `Approved` verified rows score); verification
refusing Hackathon rows without a recorded result and `Other` rows (0 points); re-verify and
Approved-row edits 409; rejection zeroing `pointsAwarded` and a subsequent edit resubmitting to
Pending; duplicate detection (case/whitespace-insensitive student+category+title+eventName+eventDate
→ 409); college / department / mentee scopes honouring `isActive` everywhere; zero-point active
students being ranked; deterministic, byte-stable ranks (points DESC → verified count DESC →
register number ASC); the `me` block carrying the caller's own rank/points/count; the per-student
detail endpoint; and ADMIN being refused the placement-only `/hod/*` surface while the leaderboard
itself stays available to every role. All green.

`test:admin-routes` (`backend/src/tests/admin-dashboard-routes.test.ts`) is the dedicated regression
suite for the reported Admin Dashboard 404s. It boots the real entrypoint and asserts every one of
the 8 `/api/admin/overview/*` URLs the Admin UI calls (`dashboard`, `hods`, `departments`,
`department-comparison`, `departments/:id`, `departments/:id/mentors`, `mentors/:id`,
`report-30-day`) plus `/api/admin/hods` returns 200 with real data; the wrong legacy
`/api/admin/mentoring-overview/*` prefix returns 404 (no duplicate routes were introduced to please
a stale client); the dashboard figures are computed from stored records with a student mentored
twice still counted once; the overview surface stays ADMIN-only (HOD 403, anonymous 401); the
HOD-scoped dashboard is unchanged and still isolated; and the frontend `client.ts` source ships
exactly the server routes and never the wrong prefix. 8 assertions, 8/8 PASS.

`test:mentoring-evidence` (`backend/src/tests/mentoring-evidence.test.ts`) is the dedicated suite
for the mentoring-records work above. It covers: required Discussion With (student / parent / both,
and rejection when empty), device geo-tag acceptance and rejection of bad coordinates, the 200 KB
ceiling after re-encoding, append-only updates, explicit evidence deletion, the Saturday shared
upload (1 physical copy across N students), mentor authorisation on every route, and the student
dossier + PDF carrying the new fields.

`test:hod` (`backend/src/tests/hod-scope.test.ts`) is the dedicated suite for the HOD work above
(**33 assertions** after the 2026-10-07 analytics pass). It
seeds **two** departments (CSE and ECE) with students, faculty, active assignments and mentoring
records so a missing department filter is provable rather than assumed. It covers: dashboard
summary (incl. `assignedMentees`), monthly PIE split, mentor-wise coverage, mentor detail (mentees /
last mentoring date / session count / `sessionsThisMonth`), weekly progress bucketing and range
clamping (4-week default, `?weeks=` honoured up to 26), the 30-day report with its new
`reportMentors` windowed rows and `notCovered` register numbers, department overview with
`activeMentees`, the reporting-month filter (`?month=YYYY-MM` on dashboard / mentor-wise / mentor
detail, invalid month falling back to current), the **distinct-student coverage rule proven by a
duplicate-session seed** (extra same-day records raise session counts but never coverage), faculty +
student add / edit / list, mentor assignment, assignment removal, faculty notifications, RBAC
(FACULTY 403, STUDENT 403, anonymous 401), a HOD with **no** department claim
failing closed, an empty department returning 0 / 0% / pie total 0 rather than NaN or a
placeholder, and a scan of 9 HOD responses proving no `latitude` / `longitude` / `geotag` field is
emitted anywhere.

`test:admin` (`backend/src/tests/admin-overview.test.ts`) is the dedicated suite for the college-wide
Admin dashboard. It seeds **two populated departments plus one deliberately empty one** so both
"the figure is real" and "an empty scope does not fake a number" are provable. It covers: college
totals; a student with **two** dated records in the month counting **once**; the college-wide PIE
split; the HOD overview (one row per HOD login, carrying that HOD's own department figures);
department rows summing exactly to the college totals; the college figure being **identical** to the
same department's own HOD-scoped figure (proving the shared arithmetic); comparison ranking by
descending coverage; the four-level drill-down (Admin → Department → HOD → Mentor → Student) with
unknown ids returning 404 and no cross-department mentor leakage; weekly buckets excluding
out-of-window records; the department-wise 30-day report with its range clamped; the empty department
returning 0 / 0% / pie 0 with two reads agreeing; every one of the 8 endpoints answering **403** to
HOD / FACULTY / STUDENT and **401** to anonymous; the reference/Admin split; HOD isolation still
intact after the Admin module was added; a scan of 8 Admin mentoring responses proving no location
field is emitted; and the metric definitions travelling with the data.

`test:hod-admin` (`backend/src/tests/admin-hod-management.test.ts`) is the dedicated suite for the
Admin HOD Management work above. It seeds a HOD-claimable department landscape plus students with an
active mentor assignment and a counselling record so "the HOD author of historical records is never
losing them" is provable. It covers: creating a HOD (default or supplied password); the new account
logging in and reaching only its own department; exactly one `departmentId` claimed; a duplicate
department HOD rejected 409 on create **and** on edit-onto-an-occupied-department, with the count
unchanged; validation 400s (missing name / bad email / short password / unknown department);
duplicate email 409; edit rename and department move; deactivation blocking login for the HOD while
the account **and** its authored records survive; the freed slot accepting a successor HOD;
reactivation refused 409 while a successor holds the department; status-validation 400; the full
ADMIN-only matrix — HOD / FACULTY / STUDENT get 403 and anonymous gets 401 on every one of the four
endpoints, and a HOD calling `POST /hods` cannot inflate the HOD count; non-HOD / malformed ids 404;
and the HOD dashboard staying department-scoped afterwards (CSE sees 2 students, ECE sees 1, a
cross-department mentor read is 404).

`test:faculty-dept-reassign` (`backend/src/tests/faculty-department-reassign.test.ts`, port 5115) is
the dedicated suite for the Admin features pass. It boots the real entrypoint and seeds a CSE mentor
with **two** ACTIVE assignments and a counselling record plus matching CSE/ECE HODs. It proves: the
reassign response contract (faculty row now ECE, previous CSE → new ECE, `unchangedMentees` = 2);
the **Faculty and User** documents both moved at model level; the Admin faculty list re-scopes; the
two ACTIVE assignments keep their ids and the mentee drill-down still lists both students; the
counselling record keeps its original mentor + student; a `REASSIGN_FACULTY_DEPARTMENT` audit row
carries the previous/new department ids and the preserved count; a re-login token now carries the
ECE `departmentId` claim; HOD lists re-scope (CSE hides the mentor, a new ECE HOD sees it) and the
mentee drill-down is assignment-derived (ECE HOD 200 + both students, CSE HOD 404); validation 400s
(same department / missing / unknown department) and 404 on an unregistered faculty; HOD / FACULTY /
STUDENT 403 and anonymous 401; and frontend source contracts for the whole feature set (Remove HOD
drives `setHodStatus` with no `deleteHod` route; `AdminStudentDocuments` viewer wired through
`documentsStudent`, never `selectedStudentId`, and never coupled to the Student Profile). 18/18 PASS.

- **Admin Mentoring Dashboard browser E2E (2026-10-09):** headless Chromium against the built bundle
  (`frontend/dist` served statically, API proxied to the local backend): login → Mentoring Dashboard
  rendered real content with **0** `.skeleton-pulse` nodes and all four `/api/admin/overview/*` calls
  200; changing the reporting month issued exactly 4 requests (one per endpoint, no loop); aborting the
  four calls surfaced the "Unable to Connect" error state with a Retry that recovered to real data; 0
  page errors. This verifies the restored mount effect end-to-end. The fix is frontend-only, so no new
  backend suite was added.

- **Restart persistence:** verified with two separate processes. Process A created a Student,
  Department, Batch and User and wrote an upload; process B read the same ids back and resolved the
  upload by exact path with matching bytes.
- **Hermeticity:** after a full run, `backend/data/` still contains only the legacy SQLite backup
  files and `backend/storage/uploads/` still contains exactly its 69 real files.
- **Exact warning** `Temporary local file storage. Replace with a persistent database/storage
  implementation before production deployment.` is present verbatim in `README.md` and in the
  server startup log.
- **Dependency scan:** no `mongoose` / `mongodb` / `mongodb-memory-server` entry in either
  `package.json`, either `package-lock.json`, or `node_modules`; no `MONGODB_URI` outside comments
  that explain its removal.
- **Known, not fixed:** `npm audit` reports 12 transitive advisories (2 low, 3 moderate, 5 high,
  2 critical). None are in the storage layer.

---

## Important Decisions

1. Fix the actual Render-specific root cause — do **not** paper over it.
2. Do **not** modify or regress working Vercel functionality.
3. Do **not** use mock data as a workaround.
4. Do **not** disable security (auth / CORS / rate limits) as a workaround.
5. This notepad is committed with the project and must be updated after every task;
   historical entries must never be deleted — mark them outdated instead.
6. Do not pin or rewrite the Express wildcard routes speculatively: Render's own install resolves
   express 4.22.3, so there is no evidence to act on.
7. Upload path resolution goes through one shared helper so the writer and reader cannot disagree
   about the base directory.
8. The permission state machine is a **server-side table**, not scattered `if` statements. Every read-only
   decision and every state change goes through `record-permission.util.ts`.
9. The UI renders the backend's `permissions` object verbatim. It must never re-derive editability,
   never guess a lock, and never silently disable an action without showing the server's reason.
10. A **save is a draft**. Only an explicit submit re-enters the mentor queue.
11. CONFIRMED is immutable for **everyone**, including admins. An admin bulk delete must retain it and
    report how many were retained.
12. Local file storage is a **development-only** stopgap. It must always announce itself with the
    exact temporary-storage warning, and it must never be described as production-ready.
13. Keep a Mongoose-compatible model layer rather than rewriting controllers. The persistence engine
    is the only thing that should have to change when a real database arrives.
14. Test suites may never write to `backend/data/` or `backend/storage/uploads/`. Both directories are
    sandboxed, and application modules are imported dynamically so the sandbox is set first.

---

## Deployment

- **Local:** PASS — frontend and backend both build and run; records persist across restarts.
- **Vercel:** PASS — unaffected; no frontend or Vercel-facing change was made.
- **Render:** PARTIAL — the read-only-`mkdirSync` fix is still in place, and the local file store
  no longer crashes there. **Not production-safe as configured:** the free plan has no persistent
  disk, so every deploy discards `backend/data/` and `backend/storage/uploads/`. Attach a disk and
  set `DATA_DIR` / `UPLOADS_DIR` (or `render.yaml` disk config) before any real use. A redeploy is
  still needed to confirm the host behaviour.

---

## Latest Investigation

- **Storage:** `DATA_DIR` used to resolve at import time, so the effective data directory depended
  on which module a file imported first. Two suites therefore wrote to the live store while
  appearing sandboxed. Fixed by resolving lazily; verified by asserting the live directories are
  untouched after a full run.
- **Save path:** `LocalDoc.toObject()` did not exclude the wrapper's own `model` property, so the
  first `save()` of a hydrated document wrote the model name and full schema definition into the
  collection file; the next read replaced the document's live model and every later `save()` threw
  `this.model.schema.preSaveHooks is not iterable`. Reproduced deterministically with three
  consecutive `ensureSystemBootstrap()` runs against one store.
- **Populate:** nested `populate` resolved refs against the root model, so mentor→user was never
  loaded and all meeting reminders were silently skipped (`createdCount: 0`). Both the nested-ref
  resolution and the cache-mutation leak are fixed.
- **Previous (Render):** exact error was import-time `EPERM ... mkdir '<cwd>\uploads\documents'`,
  exit code 1, before `app.listen()`. Root cause was an untracked `uploads` directory plus an
  unguarded import-time `mkdirSync` against Render's read-only project filesystem. Superseded in
  practice by the local file store, which resolves its directories through one helper.

---

## Log

| Date | Status | Summary |
|------|--------|---------|
| 2026-10-09 | PASS | Login page — authentication info banner removed. Removed **only** the "Institutional Portal Access • Role-Based Authentication" `.alert.alert-info` banner from `frontend/src/pages/auth/LoginPage.tsx` — its `ShieldCheck` icon, blue background/border and inline 1.25rem bottom margin are gone, so the sign-in form follows the card header's own 1.6rem spacing directly (layout adjusts naturally; no leftover reserved space). Every other login-page element unchanged (brand panel + features, crest logo, "Sign in to your portal" head, Username/Password fields + visibility toggle, Sign In button, Download/Install KSRCE Web App, footer). No authentication logic, API request, validation, session handling or routing touched; no dependency added; the generic `.alert-info` CSS variant is retained for other potential alert users. Verified: `tsc --noEmit` PASS, `vite build` PASS (1659 modules), banner text absent from source and emitted bundle; headless-Chromium checks on the built dist — desktop 1440×900 and mobile 390×844 both show 0 `alert-info` nodes and 0 banner text, brand panel `flex` on desktop / hidden on mobile, card fits the viewport with no horizontal overflow (`scrollWidth == innerWidth`), username/password/toggle/Sign In/Download buttons all present, and **0 page errors and 0 console errors**. No commit/push. |
| 2026-10-09 | PASS | Admin-only permanent HOD deletion + live demo-account cleanup. **Backend:** new `DELETE /api/admin/hods/:hodId` (ADMIN-only, re-checked in handler) — validates id, refuses non-HOD roles (403), active HODs (409 — deactivate first) and deletion while any dependent record references the account (full User-id reference scan; `AuditLog` deliberately excluded); writes a preserved `DELETE_HOD` audit (no secrets, details `{username, fullName, departmentId, reason}`) **before** narrow `user.deleteOne()` (no cascade, no broad deletion functions). Deletion extra-gated to inactive HODs on an explicit allowlist (`VERIFIED_DEMO_HOD_IDS` export — never matched by username/department/name). **Frontend:** `Delete HOD` action only on inactive verified-demo rows (`is_active===0 && is_verified_demo===1`) — the 8 active genuine HODs keep only View/Edit/Deactivate/Remove — with a permanent-delete confirm modal ("cannot be undone"), toasts + list refresh; `client.ts` gains `is_verified_demo` + `api.admin.deleteHod`. **Live cleanup executed on a fresh 5052 instance (user's stale 5050 dev watcher untouched):** all 5 demo HODs deleted — `hookrepro.hod` via the browser UI E2E (`DELETE …→200`, list 13→12 HODs, buttons 5→4, toast), `hookrepro.it`/`hod.it`/`vhod.verify.cse001`/`vhod.live883485` via API; final list 8 HODs all active, 5 deleted usernames → 401; 166 pre-existing audit records preserved (0 missing) + 5 new `DELETE_HOD`. **No reappearance:** restarted twice on 5052 — list stays 8/8/0, logins 401, clean no-login restart leaves `audit_logs.json` byte-identical and `users.json` changed only by the bootstrap's admin `updatedAt` touch. **Finding:** the built SPA ignores the 4173 proxy — `frontend/.env` bakes `VITE_API_URL=http://localhost:5050` into dist, which is why the browser still saw the stale 5050 watcher; E2E ran on a dist rebuilt with a temporary 5052 override and the canonical dist was rebuilt afterwards (back to `index-CCHU7sU1.js`). New `test:hod-delete` 17/17 (port 5117); re-run `test:hod-admin` 22/22, `test:admin-routes` 8/8, `test:admin-auth` 13/13; backend `tsc --noEmit` clean; frontend `tsc` + `vite build` clean; 20 backend suites. PROJECT_PROGRESS.md updated; no commit/push. |
| — | PASS | UTF-8 mojibake / CSV charset fixes; both builds green. |
| — | FAIL | Render student dashboard HTTP 500 — root cause open. |
| — | PASS | Root cause found: import-time `mkdirSync` crash on Render's read-only FS. Express 5 and Sapling ruled out with evidence. Fix implemented; backend/frontend builds and 3 test suites green. Awaiting redeploy verification. |
| — | PASS | MongoDB/Mongoose removed; local JSON file storage in `backend/data/` and uploads in `backend/storage/uploads/`. Fixed model-serialisation-on-save, eager `DATA_DIR`, nested populate, array-enum validation and collection-name bugs found while verifying. All 8 suites green (38/38 on the runtime suite), restart persistence verified, test runs fully hermetic, existing uploads migrated. |
| — | PASS | Mentoring Records: required Discussion With (student / parent / both, server refuses to guess), device geo-tagged evidence photos re-encoded to ≤200 KB, authenticated private photo view/download, append-only updates with explicit detach, and Saturday photos stored **once** and shared across all participants via a `SATURDAY_COMMON` record + linked `Meeting`. Frontend uploader, gallery and Saturday modal wired into `MentorStudentProfileView`. New suite `test:mentoring-evidence` 114/114; all 8 pre-existing suites re-run green; both builds clean. Also fixed the shared pre-save hook contract in `localModel.ts`, stale multipart category parsing, and a partial-update path that blanked required `correctiveAction`. |
| 2026-10-06 | PASS | Admin college-wide Overall Mentoring Dashboard. Extracted the mentoring arithmetic into `backend/src/utils/mentoring-analytics.util.ts` and made the HOD controller a thin scope-bound adapter over it (`test:hod` still 24/24, so HOD output and department isolation are unchanged). Added `admin-overview.controller.ts` + a separate `admin-overview.routes.ts` mounted at `/api/admin/overview` (ADMIN-only at the router **and** re-checked in every handler) covering the overall dashboard, HOD overview, department overview, department comparison, the four-level drill-down and the department-wise 30-day report. **Closed a real security hole:** `GET /api/admin/departments`, `/batches` and `/settings` were reachable by any logged-in role because the Student identity-request dropdowns depended on them; they are now `authorize(ROLES.ADMIN)`, and a new authenticated-only `/api/reference/*` module supplies the minimal `id/name/code/year` lists those dropdowns need. New `AdminMentoringDashboard.tsx` (overview, HOD, department, comparison and 30-day tabs + drill-down) wired into the Admin shell and sidebar; `StudentDashboard` migrated to the reference endpoints. New suite `test:admin` 23/23; `test:runtime` check 16 rewritten to assert both halves of the reference/Admin split; all 11 suites green and both builds clean. |
| 2026-10-06 | PASS | Admin HOD Management. New `admin-hod.controller.ts` + four ADMIN-only routes in `admin.routes.ts` (`GET/POST /api/admin/hods`, `PUT /api/admin/hods/:hodId`, `PATCH /api/admin/hods/:hodId/status`), each `authorize(ROLES.ADMIN)` **and** re-checked in the handler. Works on plain `role:'HOD'` users (nothing in the verified `/api/hod/*` logic changed) with **one active HOD per department** enforced server-side on create / edit / activate (409); deactivation is a status flip only (no delete route) that frees the slot for a successor, and reactivation is 409 while occupied. Setup mirrors the auth pattern (bcrypt-10, default `Password@123`, username auto-derived from email, duplicate email/username 409, validation 400s) and audits `CREATE_HOD` / `UPDATE_HOD` / `ACTIVATE_HOD` / `DEACTIVATE_HOD`. **Defect found by the new suite:** hydrated ref fields are objects, so `String(user.department)` silently broke the duplicate scan — all comparisons now go through `toIdString()` (`access.util.ts`). Frontend `AdminHodManagement.tsx` (add/edit/view modals, deactivate/activate confirm, occupied-department picker preview, mobile cards) wired into `AdminDashboard` + sidebar; typed `api.admin.{getHods,createHod,updateHod,setHodStatus}` in `client.ts`. New suite `test:hod-admin` 22/22; regressions `test:hod` 24/24, `test:admin` 23/23, `test:critical` 12/12, `test:runtime` 38/38, `test:state-machine` 137/137; backend `tsc` clean; frontend `tsc && vite build` clean. |
| 2026-10-06 | PASS | Faculty → HOD department notifications. `POST /api/notifications/faculty` (FACULTY only) sends a notice to the sender's **own** department, derived server-side from the sender's `Faculty` record — a body naming another department is 400, no Faculty record is 403, no active HOD is 409 — fanning out to each active HOD **and** each active Admin (one doc per recipient so read state is per recipient). New `GET /api/hod/notifications` (`requireHod`, fails closed on a missing `departmentId` claim) lists `{user, department, type: FACULTY_NOTIFICATION}` with `unreadCount` / `totalCount` / `department`; mark-read reuses the user-scoped `PATCH /api/notifications/:id/read`. `GET /api/notifications/sent` (FACULTY only) is the author's read-receipt list, one row per send thanks to the new `recipientRole` field; `Notification` gained `department`/`facultyId`/`facultyName`/`recipientRole` and the constant `FACULTY_NOTIFICATION`; inbox rows gained additive `faculty_name`/`department_name`; audit `CREATE_FACULTY_NOTIFICATION`. **Defect caught and fixed:** a per-recipient fan-out had the sent list repeating a notice once per recipient — narrowed to the HOD copies (`recipientRole: 'HOD'`). Frontend: HOD "Faculty Notifications" tab (list, unread badge, mark-read, detail modal), Faculty "Notifications" tab (composer + sent list with read receipt), Admin notifications table gains Faculty/Department/Status columns. New suite `test:faculty-notifications` 21/21; all 12 pre-existing suites re-run green; backend `tsc` clean; frontend `tsc && vite build` clean. |
| 2026-10-06 | PASS | Admin Mentoring Dashboard 404 — route contract locked. The browser 404s were traced to the current frontend **already** calling the real server routes (`/api/admin/overview/*`, `/api/admin/hods`); `mentoring-overview` / `mentoring-comparison` exist only as `currentTab` keys in `AdminMentoringDashboard.tsx`, and `git show HEAD:frontend/src/api/client.ts` contains none of this code, so a stale deployed bundle was the culprit and **no product code change was needed**. New `test:admin-routes` (`backend/src/tests/admin-dashboard-routes.test.ts`, port 5102) bootstraps the real entrypoint and asserts the exact 8 overview URLs + `/api/admin/hods` return 200 with real data, the legacy `/api/admin/mentoring-overview/*` prefix is 404 (no duplicate routes), ADMIN-only RBAC (HOD 403 / anonymous 401), HOD isolation intact, and `client.ts` never ships the wrong prefix — 8/8 PASS. Regressions: `test:admin` 23/23, `test:hod-admin` 22/22, `test:hod` 24/24. Fresh bundle verified: contains `/admin/overview/*` and `/admin/hods`, zero `/admin/mentoring-overview` URLs. Backend `tsc`, frontend `tsc && vite build` clean. 14 suites now. |
| 2026-10-07 | PASS | Login bounce-to-login loop fixed. Root cause: `AuthContext.refreshUser` logged out on **any** error, so a single failed post-login `GET /api/auth/me` (transient backend hiccup, restart, wrong API base) wiped the fresh `ksrce_token` and bounced to the login page; `frontend/.env`/`.env.example` also pointed the API at the unused port 5000 (real backend is 5050). Fix A: `refreshUser` logs out only on 401/403; transient errors keep user+token. Fix B: `.env` → `http://localhost:5050`, `.env.example` → documented Render/empty-proxy values. Reproduced pre-fix by forcing `/auth/me` to 500 after login (token wiped, back at login); post-fix the same forced failure keeps the dashboard. Playwright regression: login→dashboard stays 8s+, reload restores session, logout clears token, zero non-2xx API responses; `test:critical` 12/12; frontend `tsc && vite build` clean. |
| 2026-10-07 | PASS | Admin no longer displays the stored admin-department ref. Sidebar header ("ADMIN PORTAL" + "SYSTEM ADMINISTRATION" instead of "<dept> Department"), mobile drawer line ("ADMIN • KSRCE") and Navbar dept badge now treat `role === 'ADMIN'` as college-level. HOD/FACULTY/STUDENT rendering untouched; HOD stays scoped to exactly one department. Add/Edit HOD modal still has the required single-select Department field (CSE/ECE/IT/MECH). Frontend-only change (2 files); no backend or data change. Verified in-browser (admin login → header neutral, no dept badge, HOD Management + Add HOD modal intact); `tsc --noEmit` and `npm run build` both PASS. |
| 2026-10-07 | PASS | HOD Dashboard analytics pass — month filter, distinct-student coverage, 30-day mentor report. Shared util gained `assignedMentees`, `parseMonthRef` (strict `YYYY-MM`, invalid → current month) and `mentorReportRows` (windowed mentor rows with Set-based coverage + `notCovered[]`); `hod.controller.ts` accepts `?month` on dashboard/mentor-wise/mentor detail, reports `sessionsThisMonth` (summary + per-mentee), defaults weekly buckets to **4 weeks (30-day window, `?weeks=` honoured ≤26)**, adds `reportMentors` + windowed `mentorsActive` to `/report-30-day`, and `activeMentees` to `/department-overview` — every filter built from `req.user.departmentId` inside the handler. Frontend: reporting-month `<input type="month">` drives a `loadData` refetch, 7 stat cards (Active Mentees, month-aware labels, "No students" coverage state), `.hod-split-wide`/`.hod-split-half` responsive splits (≤1024px → 1 column), mentor filter select, month badge + no-records note, mentor modal with Sessions This Month, new Mentor-wise 30-Day Report table with `notCovered` register badges, report error Retry state; inline-SVG pie and EmptyState/SkeletonLoader reused (no chart library). `test:hod` extended 28 → 33 checks (duplicate-session seed proves coverage stays 2/3 while sessions rise; weekly default 4; Admin still asserts 8) and fixed a date-flake (per-day bucket matching across the Monday boundary). All 14 backend suites green; backend `tsc` clean; frontend `tsc --noEmit` + `vite build` clean; PROJECT_PROGRESS.md updated; no commit/push made. |
| 2026-10-07 | PASS | Internal Assessment Marks — admin-controlled entry window + three PDF modes. `MarkEntryPermission` (enabled / markTypes / durationDays) with server-computed fail-closed status (`INACTIVE` → "Mark entry is not enabled...", `EXPIRED` → "Mark entry period has expired...", only `ACTIVE` grants `editableMarkTypes`); mentor `InternalMark` rows (IA1 / 50, IA2 / 50, End Sem / 100) editable only inside the window; `MarkUpdateRequest` correction flow (reason ≥5 chars, duplicate-PENDING 409) where the official row changes **only** on Admin approval (`previousMark` → `resolvedMark`, reject requires reason, one-shot resolution). Routes `/api/marks/permission|/student/:id|/update-requests|/update-requests/:id/approve|reject` all role-checked in handler. **Defect found by the suite:** `listMarkUpdateRequests` applied the Student-shaped dept scope directly to `MarkUpdateRequest.student` — now resolves scoped ids via `Student.find` first. PDF now takes `?mode=full|internal|mentor-documents` (unknown → 400) with per-mode filenames. Frontend: admin Internal Marks tab, mentor panel in the mentee Academic tab, three PDF buttons on mentor + student views. New `test:internal-marks` 97/97 (port 5112); regressions green — `test:mentoring-evidence` 100/100, `test:critical` 12/12, `test:grammar-api` 49/49, `test:runtime` 38/38; backend `tsc` clean; frontend `tsc` + `vite build` clean; PROJECT_PROGRESS.md updated; no commit/push made. |
| 2026-10-08 | PASS | Placement Monitoring, Achievement Points & Achievement Leaderboard. New pure utils (`achievement-points.util.ts` — point table + refusal rules; `placement.util.ts` — FINAL_YEAR=4, transition table, derived booleans, summary maths; `leaderboard.util.ts` — deterministic rank composer) driving three modules mounted at `/api/placements`, `/api/achievements`, `/api/leaderboard`. Placement is mentor/HOD/Admin only: per-student GET/POST/PUT (returns server `allowedTransitions`; PLACED terminal + requires a company name; NOT_PLACED non-terminal; non-final-year 400), mentor aggregate, HOD summary/mentor-wise/student-wise (ADMIN cannot borrow `/hod/*`). Achievements: student adds, FACULTY/HOD/Admin verify/reject; duplicate 409; Approved edit 409; Rejected edit → Pending + 0 points; Hackathon-without-result and `Other` refuse verification; points credited only on approval. Leaderboard: ranks every active 0-point-inclusive in-scope student (college/dept/mentees) by points DESC → verified count DESC → register number ASC; `me` carries caller rank; per-student detail endpoint. Frontend: `LeaderboardView` (shared), `HodPlacementPanel` (Summary/Student-wise/Mentor-wise), `MentorPlacementPanel` (transition-aware editor), sidebar + dashboard wiring incl. mentor profile tab "11. Placement / Career". New `test:placement` (5113) + `test:leaderboard` (5114) both green; all 15 pre-existing suites re-run green; backend `tsc` + frontend `tsc`/`vite build` clean; 17 suites now; PROJECT_PROGRESS.md updated; no commit/push made. |
| 2026-10-08 | PASS | Achievement Leaderboard UI/UX enhancement — **frontend presentation only, zero backend/API/scoring/scope change**. Rewrote `LeaderboardView.tsx` in place: hero header (trophy tile, KSRCE subtitle, server `scopeLabel` + in-scope student count + real `batchName` chips, server `definitions.scope` note), 4 summary stat cards (students, verified achievements, display-only point total, real top performer), top-3 podium (`<ol>`, 2nd-1st-3rd via CSS `order` on desktop, rank-order stack ≤768px, 1st enlarged + gold, avatar initials, ordinal badges, leader-relative bars, natural order when fewer than 3 scorers, podium only when points > 0), student "Your position" card (Your Rank / Your Points / Your Achievements, points-vs-leader bar, "View your row" jump + focus past rank 10), full ranking table (name + register merged, crown/medal rank chips, podium tints, own-row `aria-current` + `You` chip, presentational Level badge from server rank/points, per-rank score bars), display-only category breakdown from `categoryPoints`, dedicated skeleton, "No verified achievements yet" empty state (real 0-point table retained, no fake ranking) and the unchanged card+Retry error pattern. One appended `lb-` CSS block: table → cards at ≤768px (grid areas keep rank/name/points/achievements visible, `data-label` captions), ≤480px compaction, WCAG-AA badge/avatar contrast. **No filters added** — `GET /api/leaderboard` accepts no query parameters. Verified: frontend `tsc --noEmit` PASS, `npm run build` PASS, backend diff set unchanged, `test:leaderboard` re-run 35/35 PASS; PROJECT_PROGRESS.md updated; no commit/push made. |
| 2026-10-08 | PASS | Admin Features: Remove HOD · Faculty Department Reassignment · Student Documents Viewer. **Remove HOD** (`AdminHodManagement.tsx` Remove button + confirm modal) reuses the existing ADMIN-only `PATCH /api/admin/hods/:hodId/status` deactivation — never deletes the account or records, audit/`DEACTIVATE_HOD`/department link retained, slot freed for a successor. **Faculty Department Reassignment** (`PATCH /api/admin/faculty/:facultyId/department`, ADMIN-only): moves the Faculty **and** User rows (re-login token's `departmentId` claim follows), deliberately preserves every ACTIVE MentorAssignment (mentees never move with the faculty) and every counselling/academic record, writes `REASSIGN_FACULTY_DEPARTMENT` audit, returns `{faculty, previousDepartment, newDepartment, unchangedMentees}`; same-dept/missing/unknown dept 400, unregistered faculty 404. **Defect caught by the new suite:** saving the populated `user` snapshot threw `user.save is not a function` on the local store — the handler now fetches the persisted User document. Frontend: `api.admin.reassignFacultyDepartment` + two-step Reassign Department modal (select → confirm copy + warning) with desktop/mobile buttons. **Student Documents viewer:** new `AdminStudentDocuments.tsx` (list + dedicated PDF/image preview via `fetchViewBlob` blob, revoked on close; "Preview unavailable" + Download for other types; metadata panel; viewer → list → list navigation) wired into the Admin Documents tab through a separate `documentsStudent` state (tab-change reset) so documents never redirect to the Student Profile; other tabs unchanged. New `test:faculty-dept-reassign` 18/18 (port 5115; response contract, model-level moves, mentee/counselling preservation, audit, re-login claim, HOD re-scoping + assignment-derived drill-down, 400/404/403/401, frontend source contracts); `test:hod-admin` re-run 22/22; backend `tsc --noEmit` clean; frontend `tsc` + `vite build` clean; 18 backend suites green; PROJECT_PROGRESS.md updated; no commit/push made. |
| 2026-10-09 | PASS | Admin Bulk Upload — UI redesign + Excel template overhaul. **Backend:** routes reordered to `/bulk-upload/<type>/<action>` (frontend URLs unchanged); templates rebuilt — Student sheet with the exact 25 headers in 3 sections, Faculty sheet limited to model-supported columns (10 requested fields unsupported by the models — Date of Birth, Gender, Blood Group, Residential Status, Permanent Address, Qualification, Specialization, Experience, Date of Joining, Employment Type — are listed in the Instructions sheet, not collected), plus Instructions + Reference Values sheets, live department/batch values and in-sheet dropdowns for every controlled field; one clearly marked sample row that can never auto-import (identifier starting `SAMPLE` → always INVALID), extended student/faculty validators and import persistence for the new columns, value parsers (`A+ve`/`450/500`/date/contact formats). **Frontend:** `AdminBulkUpload.tsx` rewritten in the navy/gold design system (no Tailwind) — header + Admin-only chip, 🎓/👨‍🏫 selector cards, keyboard-accessible drag-drop dropzone, 4-step workflow indicator, template card, preview summary cards + status filters/search, import result summary with Download Error Report / Upload Another File; `bu-` CSS block appended to `index.css`; `Bulk*` types in `client.ts` rewritten to the backend response shapes. **Verification:** backend `tsc --noEmit` clean; frontend `tsc --noEmit` + `vite build` clean (`bu-` selectors in the emitted bundle); new `test:bulk-upload` 23/23 PASS (port 5116, added as `test:bulk-upload` npm script); regressions `test:admin-routes` 8/8, `test:hod-admin` 22/22; 19 backend suites; PROJECT_PROGRESS.md updated; no commit/push made. |
| 2026-10-09 | PASS | Official KSRCE Departments — Bulk Upload Reference Values Update. **Source:** `backend/src/database/bootstrap.ts` updated to the 15 official KSRCE departments (AUTO, BME, CSE, CIVIL, CSD, CSE_IOT, CSE_CS, ECE, EEE, MECH, IT, SFE, MCA, MBA, AIDS). No Science & Humanities departments. **Bulk Upload impact:** Student/Faculty templates and validators already read live departments via `Department.find({})` — Reference Values sheet and Excel dropdowns now show all 15 automatically; validation rejects invalid names with "Unknown department". **Preservation:** no existing records modified; no duplicate department list; RBAC/HOD scoping/mentor assignments unaffected. **Verification:** backend `tsc --noEmit` clean; frontend `tsc --noEmit` + `vite build` clean; `test:bulk-upload` 23/23 PASS (15 departments in template, dropdowns work, invalid names rejected); regressions `test:admin-routes` 8/8, `test:hod-admin` 22/22; no commit/push made. |
| 2026-10-09 | PASS | Admin HOD Delete / Remove — Safe Deactivation via Existing Status Endpoint. **Backend:** reuses existing `PATCH /api/admin/hods/:hodId/status` (`setHodStatus`) — no new endpoint. Flips `isActive=false`, creates `DEACTIVATE_HOD` audit, frees department slot, preserves all historical records. **Frontend:** "Remove" button (🗑) in HOD Management table/cards for active HODs, confirmation modal with required message, loading state, success toast, list refresh. ADMIN-only (server-enforced 403 for HOD/FACULTY/STUDENT). **Verification:** `test:hod-admin` 22/22 PASS (deactivation retains records, inactive HOD login refused, department freed, one-active-HOD rule, audit). Backend `tsc --noEmit` clean; frontend `tsc --noEmit` + `vite build` clean; no commit/push made. |
| 2026-10-09 | PASS | Admin login 401 — root cause: `bootstrap.ts` re-hashed `ADMIN_PASSWORD` over the stored admin `passwordHash` on every startup, silently reverting an in-app password change (so the password the user held got 401). **Fix:** existing admin is preserved (only `role === 'ADMIN'` / `isActive === true` enforced); a missing admin is still created from `ADMIN_PASSWORD`; explicit one-shot `ADMIN_FORCE_PASSWORD_RESET=true` added and documented in `backend/.env.example`. New `test:admin-auth` **13/13**; regressions `test:critical` 12/12, `test:admin-routes` 8/8, `test:runtime` 38/38; live login 200 `ADMIN` (configured / lowercase / `admin` alias) and 401 wrong/unknown; backend `tsc`+build and frontend `tsc`+build clean. Out of scope (still open): `AdminMentoringDashboard.tsx` missing its mount effect. No commit/push made. |
| 2026-10-09 | PASS | Admin Mentoring Dashboard stuck on the loading skeleton — root cause: commit `2c2182a "Redesign sidebar and dashboard UI"` merged the end of `loadData`'s `useCallback` into the next declaration (`}, [month]);  const loadReport = useCallback(`), deleting the mount `useEffect(() => { loadData(); }, [loadData]);`. It still typechecks, so no build/test caught it; `loading` starts `true` and only `loadData` clears it, so the skeleton never resolved (the month input that also called `loadData` renders only after loading). The `.broken` backup is itself corrupt (its `loadData` opening lines are missing) and was used only as a reference. **Fix (`AdminMentoringDashboard.tsx` only):** restored the effect (safe — `loadData` is `useCallback([month])`, so it runs once on mount and once per month change) and removed the redundant direct `loadData()` from the month `onChange`. **Verified:** headless-Chromium E2E on the built bundle — dashboard loaded real data with 0 `.skeleton-pulse` nodes and all four `/api/admin/overview/*` 200; month change → exactly 4 refetches (no loop); aborted calls → "Unable to Connect" + working Retry recovering to data; 0 page errors. Frontend `tsc --noEmit` + `vite build` clean; regressions `test:admin-routes` 8/8, `test:admin` 23/23; backend untouched; PROJECT_PROGRESS.md updated; no commit/push made. |
| 2026-10-09 | PASS | KSRCE logo decorative gold frame removed + duplicate sidebar branding removed. **`index.css`:** `.ksrce-logo-img` trimmed to `width/height:44px`, `object-fit:contain`, `flex-shrink:0` (removed white background, 2px gold border, 8px radius, 2px padding, box-shadow); deleted unused `.sidebar-logo` / `.sidebar-portal-name` / `.sidebar-portal-product` (+ collapsed variants) and right-aligned the remaining `.sidebar-portal` controls. **`Sidebar.tsx`:** removed the duplicate logo + college-name + product block from `.sidebar-portal` (collapse/close controls kept). Asset untouched (205×190, transparent); header logo box unchanged (44×44, 38×38 ≤768px, `object-fit:contain`). Gold accents unchanged (header gold bottom border `2px rgb(197,155,39)`, active-nav gold fill/border/left marker, gold role chip, buttons). Verified via headless-Chromium computed styles: logo border 0px / radius 0px / shadow none / transparent / padding 0px / box 44×44 / natural 205×190; 0 `.sidebar-logo` nodes and no college name in the sidebar; nav active gold retained; collapse toggle still works; 0 page errors. Frontend `tsc --noEmit` exit 0; `vite build` clean (1659 modules, CSS 82.34 kB). PROJECT_PROGRESS.md updated; no commit/push. |
| 2026-10-09 | PASS | Add/Edit HOD modal nested-form bug fixed. Shared `Modal.tsx` renders its `.modal-content` as a `<form>` whenever `onSubmit`/`formId` are passed, and `AdminHodManagement.tsx` wrapped its children in an extra `<form id="hod-form" onSubmit={submit}>` — the browser logged `<form> cannot be a descendant of <form>` and the DOM carried two `id="hod-form"` elements. The redundant inner `<form>` is now a `<div>` in all three call sites that had it (`AdminHodManagement.tsx` — the reported bug, plus the identical pattern in `AdminInternalMarks.tsx` `mark-decision-form` and `InternalMarksMentorPanel.tsx` `mark-correction-form`), leaving one valid form per modal; `Modal.tsx` unchanged so other consumers (MenteeProgressDashboard, MentorAiBotModal, SaturdayEvidenceModal, StudentProgressView, …) are unaffected. Verified: frontend `tsc --noEmit` exit 0; `vite build` clean; headless-Chromium E2E — exactly one `<form>` on the page in both Add and Edit HOD modals, `#hod-form` is the modal form itself, 0 nested forms, 0 duplicate ids, required validation still blocks an empty submit (modal stays open), Create HOD still posts the filled payload and closes with the success toast, edit keeps username disabled + password hidden, 0 page errors and 0 console errors (the reported message is gone). No backend/routes/data changed; PROJECT_PROGRESS.md updated; no commit/push. |
| 2026-10-09 | PASS | Marks modals — native form submission suppressed. `submitDecision` (`AdminInternalMarks.tsx`) and `submitCorrection` (`InternalMarksMentorPanel.tsx`) now open with `(e: React.FormEvent)` + `e.preventDefault()`, so no implicit/native submission can navigate the page; validation, API payloads, approve/reject flow, correction requests and toasts unchanged. No backend change. **Static verification only (flagged honestly):** frontend `tsc --noEmit` exit 0, `vite build` clean; the Playwright in-browser check (Enter-key navigation) was prepared but not executed before the HOD-cleanup task took priority. No commit/push. |
| 2026-10-09 | PASS | Demo HOD accounts — identified, verified deactivated + login-blocked, no recreation on restart. Live store holds exactly 5 HOD users, every one demo/test/verification in origin (audit trail: scripted CREATE_HOD→LOGIN→DEACTIVATE_HOD same-second for `vhod.verify.cse001` / `vhod.live883485`, 2026-10-06; literal "Sample" account `hod.it`, 2026-10-08; hook-reproduction QA accounts `hookrepro.hod`/`hookrepro.it`, 2026-10-08). All 5 were **already** `isActive=false`: `GET /api/admin/hods` total=5 active=0 inactive=5; default-password login attempts → HTTP 403 "account has been deactivated" for all 5. Zero dependent records (only `users.json` + preserved `audit_logs.json` reference them); genuine accounts and one-active-HOD-per-department untouched (0 active HODs). Permanent delete deliberately not performed — no supported HOD delete path exists (deactivation is the only removal mechanism) and `clean-demo-data.ts` is a nuclear wipe. Restart check: killed + restarted `tsx src/index.ts` (health 200), HOD list byte-identical, admin login 200, logins still 403, census 9 users (1 ADMIN/5 HOD/2 FACULTY/1 STUDENT); `bootstrap.ts` never seeds HODs. Tests: `test:hod-admin` 22/22, `test:admin-routes` 8/8, `test:admin-auth` 13/13, `test:faculty-notifications` 21/21; frontend `tsc --noEmit` + `vite build` clean. No code changed; PROJECT_PROGRESS.md updated; no commit/push. |
