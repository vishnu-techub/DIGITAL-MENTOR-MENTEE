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

- **Admin overview stat cards are now clickable drill-downs + an "About Us" search result (2026-10-16):** each of the seven Admin overview cards (Total Students, Total Faculty, Assigned Mentees, Unassigned Students, Active Arrears, Mentoring Sessions, Uploaded Documents) is now a focusable `role="button"` control (pointer cursor, hover/focus states, chevron affordance) that opens a modal listing the **real records** behind the number. Four cards reuse existing paginated endpoints — Total Students / Assigned / Unassigned via `GET /api/students` (`isActive=true`, and the previously **ignored** `assignmentStatus` query param is now applied at the QUERY level so `total` and the pager are correct), Total Faculty via `GET /api/admin/faculty`; the remaining three use new ADMIN-only endpoints `GET /api/admin/dashboard-details/{active-arrears,mentoring-sessions,documents}` (no college-wide list for them existed, and per-student fetching would be N+1). Each detail aggregate is derived with the **same** rule as its card (`calculateArrearStatistics(...).activeArrearsCount`; `CounsellingRecord.countDocuments()`; `StudentDocument.countDocuments()`), so totals reconcile. Modals match the navy/gold system, show loading/empty/error states, debounced search and pagination, close on Escape/backdrop and lock background scroll. Separately, typing the **exact** phrase `About Us` (case-insensitive, trimmed) in the Mentor Assignment search surfaces an `About Us — View Page` result (an incomplete `Abou` never triggers it) that navigates (click **or** Enter) to a new standalone `/about` route built only from verified institutional facts (`backend/src/modules/pdf/institutional-header.ts`); ordinary mentor search is unchanged. **Verification:** new backend suite `test:admin-stat-details` **9/9** (detail totals == `/api/admin/dashboard-stats`, search/pagination honesty, assigned+unassigned == total, HOD 403 / anonymous 401 on all three detail endpoints, client-route lock); **headless-Chrome CDP** run `.runtime-verify/admin-stats/verify.mjs` **10/10** (7 cards focusable + pointer; each opens the correctly-titled dialog with real rows and Escape closes it; Total Students card=157 == dialog=157; Assigned 103 + Unassigned 54 == Total 157; Enter opens a card; exact `About Us` shows the result and navigates to `/about` while `Abou` does not; Enter navigates; normal mentor search still returns rows; 390px mobile opens a fitting dialog; 0 console errors / 0 exceptions); regressions `test:admin-routes` 8/8, `test:directory` 16/16, `test:admin` 23/23; backend + frontend `tsc --noEmit` exit 0; frontend `npm run build` exit 0 (emits the `AboutUsPage` chunk). Branch `temp`, uncommitted.

- **Kavitha 3D robot floating launcher added to the AI assistant (2026-10-16):** the AI assistant launcher now uses the **approved 3D Kavitha robot image** (`frontend/public/assets/kavitha-3d-robot.png`, 385×405 RGBA) in a circular deep-navy badge at the **bottom-right corner**, with a gentle **floating animation (`kavitha-float` 3.8s)**, a **subtle hover lift/scale and electric-blue glow (`kavitha-glow`)**, and a **tooltip "Kavitha — AI Assistant"** on hover/focus. Accessibility: `aria-label` "Open/Close Kavitha — AI Assistant", `aria-expanded`, `aria-haspopup="dialog"`, decorative images use `alt=""` + `aria-hidden="true"`, focus-visible outline; **prefers-reduced-motion** is respected. Clicking opens/closes the **existing Kavitha chatbot**, preserving conversation history and AI integration (`api.ai.*`, `localStorage.aiAssistant_lastConversationId`). The asset is served (`/assets/kavitha-3d-robot.png` → HTTP 200 image/png 238,757 bytes), intrinsic dimensions (385×405) prevent layout shift, and the panel is positioned above the launcher. **Live browser verification** (headless Chrome CDP, scratch backend + Vite frontend) — **25/25 PASS**: launcher visible, robot image loaded (naturalWidth>0), mask/float structure, tooltip, a11y, sizes (88px desktop / 72px mobile), on top of content, panel opens/closes (single panel), header shows "Kavitha — AI Assistant" with header robot, chat request issued + **real Gemini reply received**, retry-on-blocked-request works, panel fits mobile viewport, reduced-motion honoured, 0 console errors, 0 exceptions. Frontend `tsc --noEmit` exit 0; `npm run build` exit 0 (dist includes the asset). Branch `temp`, uncommitted.\n\n- **FIX — College PDF header consolidated + diagonal watermark corrected (2026-10-15):** the shared institutional
  header was re-implemented as **one** spec (`backend/src/modules/pdf/institutional-header.ts`) used by the **Repeating
  per-page record-book header, the annexure cover sheets, and the legacy jsPDF fallback** — previously each drew its own
  slightly different copy (logo box 15 vs 17mm, name 13 vs 14pt, the annexure cover **omitted** the affiliation/address
  lines, dividers at 28.4 / 28.5 / 33mm, margins 12 vs 14mm). The cover sheet now prints the **full** header (navy bar,
  logo top-left, centred `K.S.R. COLLEGE OF ENGINEERING`, affiliation subtitle, address) with the **`Annexure N` label
  below the college name** and the divider beneath, and the record-book cover margin is now 12mm (matching the base
  pages). The `K S R C E` watermark now runs **bottom-left → top-right** (a `/` diagonal; was `\`) and is **clearly
  visible but still translucent** — CSS layer changed from `rgba(128,128,128,0.08)` @ `rotate(45deg)` (composited ≈245,
  effectively invisible) to `rgba(102,102,102,0.26)` @ `rotate(-45deg)` (composited ≈215). **Verified on the real
  generated PDF** (live backend `:5050`, `.runtime-verify/pdf/live-*.pdf`): header centred on every page
  (name 12.3mm, subtitle 18.3mm, address 21.2mm, `midOff=+0pt`), annexure cover `Annexure 1` at 24.7mm + divider at
  30.6mm, verbatim certificate page preserved (landscape, no header), watermark measured `meanX up 108mm → down 88mm`
  (`/`) with `minGray 216` (was 221); `test:record-book-header` **75/75** (new watermark-visibility check included),
  `test:record-book-certificates` **27/27**, `test:runtime` **38/38**, `test:certificate-visibility` **22/22**,
  `test:document-watermark` **44/44**, `test:document-watermark-runtime` **46/46**, `test:leaderboard` **35/35**,
  `test:state-machine` **137/137**, `test:security-hardening` **8/8**; backend + frontend `tsc` clean; both `npm run
  build` exit 0. Branch `temp`, uncommitted.

- **BUG FIX — uploaded achievement certificates missing from the Official Record Book (PDF) (2026-10-15):** a certificate a student uploaded through
  **My Progress & Achievements** appeared in the portal (and, after the previous fix, in My Documents) but the downloaded **Official Record Book (PDF)**
  (`GET /api/pdf/student/:id?mode=full|mentor-documents`) printed "**0 student-uploaded document(s) on record**" and appended **no** certificate pages.
  **Root cause:** the record-book data collector read **only** `StudentDocument` — the same collection split as the My Documents bug — and on a real
  record every `StudentDocument` row is the auto-generated `student_details_form` (listed, but deliberately never self-embedded), so the actual
  certificate (a `StudentProgress` row) was neither listed nor attached. The legacy jsPDF fallback had the identical defect in its own query.
  **Fix (no duplicates, no re-upload, points untouched):** a new shared collector `collectStudentDocumentArchive` reads **both** collections, maps them onto
  the existing record-book shape (`source: 'DOCUMENT' | 'PROGRESS'`) and de-duplicates by one shared stored-file identity rule
  (`backend/src/utils/uploaded-file-key.util.ts`, now also used by `student-progress.controller.ts`); **both** renderers use it; records with no file
  attached get a clear, honest "no certificate file attached" message instead of the misleading "administrator repair" wording; the annexure cover sheet
  names the real upload channel; and `internal` mode (marks-only) no longer appends document annexures, matching the legacy renderer.
  **Verified on the real generated PDF:** `mode=full` 3 → **5 pages**, certificate listed and its original `adobe.pdf` text **reproduced verbatim** on p5;
  `mode=mentor-documents` 2 → **4 pages**; a live upload→regenerate→delete round trip **17/17** (2 docs / 2 covers with both texts, then PDF restored
  **byte-identical**, file removed, rows restored, leaderboard unchanged); new `test:record-book-certificates` **27/27**; regressions
  `test:record-book-header` **74/74**, `test:certificate-visibility` **22/22**, `test:runtime` **38/38**, `test:document-watermark-runtime` **46/46**,
  `test:leaderboard` **35/35**, `test:state-machine` **137/137**, `test:security-hardening` **8/8**; backend + frontend `tsc` clean; backend + frontend
  `npm run build` exit 0. Branch `temp`, uncommitted.

- **BUG FIX — achievement certificates missing from a student's "My Documents" (2026-10-15):** a certificate a student uploaded through
  **My Progress & Achievements** did not appear on the **My Documents** tab even though it was visible in My Progress and the achievement
  points/leaderboard worked. **Root cause:** the certificate lives in the achievement/participation ledger (`StudentProgress`), a *different*
  collection from the document store (`StudentDocument`) that `getStudentDocuments` read — and the file endpoints (`/api/documents/:id/file|download`)
  resolved **only** `StudentDocument` ids, so the stored file could not be fetched either (`/uploads/*` is authenticated and resolves only via
  `StudentDocument`). **Fix (backend + one frontend file; no migration, no duplicate records):** `getStudentDocuments` now merges the student's
  achievement certificates onto the document list by reusing the **one canonical** de-duplicating routine the mentor review screen already uses
  (`buildUnifiedProgressRecords`), normalised onto the document shape (`source:'progress'`, real `verificationStatus`, `fileAvailable`, read-only
  capabilities); `streamDocumentFile` resolves `StudentProgress` ids too under the **same** `checkStudentAccess` ownership rule, serving the
  **original** bytes; the My Documents card tags them "From My Progress" and disables View/Download with a clear note when `fileAvailable === false`.
  A file already represented by a `StudentDocument` is folded by the shared routine, so it is listed **exactly once** and nothing is duplicated.
  **Points untouched** — no point value, eligibility rule, ranking, verification or scoring code changed; leaderboard totals verified identical.
  **Verified:** real **headless Chrome** (CDP, `.runtime-verify/cert/browser-docs.mjs`) **14/14 PASS** — certificate card displayed, tagged, exactly
  one, View previews the **certificate** via a secure blob iframe (`/api/documents/6acfbc…/file` 200, title `adobe.pdf`), 0 error boundary / 0
  console errors; live API probes confirmed owner preview/download 200, anonymous 401, other student 403, no duplicate, and upload→appears→cleanup;
  new `test:certificate-visibility` **22/22**, `test:runtime` **38/38**, `test:document-watermark-runtime` **46/46**, `test:leaderboard` **35/35**,
  `test:state-machine` **137/137**, `test:security-hardening` **8/8**; backend `tsc` + frontend `tsc`/`vite build` clean. Branch `temp`, uncommitted.

- **BUG FIX — Achievement Leaderboard "Something Went Wrong" (Rules-of-Hooks violation) (2026-10-15):** the student
  (and every role's) **Achievement Leaderboard** page rendered the KSRCE error boundary — "Something Went Wrong — An
  unexpected error occurred." — even though `/api/leaderboard` returned **200** with real data. **Root cause
  (`frontend/src/components/leaderboard/LeaderboardView.tsx` only):** the 2026-10-15 performance-optimisation pass added a
  `useMemo` for the derived presentation **after** two early returns (`if (error) return …;` and `if (!data) return
  <LeaderboardSkeleton/>;`), so the hook count changed between renders — the loading render (`data === null`) ran
  `useState×3 + useCallback + useEffect` (**5 hooks**); the loaded render additionally ran the `useMemo` (**6**) → React
  threw `Rendered more hooks than during the previous render. at LeaderboardView (…:244)`, which the nearest `ErrorBoundary`
  turned into the "Something Went Wrong" screen. **Fix:** hoisted `entries` + the whole `derived = useMemo(…)` block to run
  **unconditionally above both early returns**, made the memo null-safe for the loading render (`data?.entries ?? []`,
  `(data?.verifiedAchievements ?? 0) > 0`, `data?.me ? … : null`), deleted the duplicated block and left an explanatory
  comment; hook order is now stable on every render. No backend/API/scoring/RBAC/styling/dependency change. **Audit:** all
  9 other `useMemo` sites in the frontend (`PrincipalDashboard`, `AdminMentoringDashboard`, `HodMarksManagement`,
  `AdminSubjectManagement`, `AdminBulkUpload`, `MarksEntryTable`, `ClassRosterPanel`, `MultiSelect`, `BulkAssignMentees`)
  already sit **before** their early returns — `HodDashboard` even carries an explicit comment about it — so `LeaderboardView`
  was the only wrong site. **Verified in a real browser** (headless Chrome via CDP, dev server 3000 + real backend 5050,
  logged in as student `73152421125`): pre-fix **reproduced** (error boundary + the exact Rules-of-Hooks
  console error + 200 on the API); post-fix **8/8 PASS** — `.lb-root` present, hero "Achievement Leaderboard", **157 students
  in scope**, 0 error-boundary, 0 exceptions, **0 console errors**. Regressions: `test:leaderboard` **35/35**; frontend
  `tsc --noEmit` **exit 0**; `vite build` **exit 0**. Harness kept at `.runtime-verify/achv/verify.mjs`. Branch `temp`,
  uncommitted, no commit/push.

- **Admin Subject Management + subject-aware marks upload (2026-10-15):** the subject list that marks are entered
  against was previously *implicit* — `InternalMark` stored a denormalised `subjectCode`/`subjectName`/`semesterNumber`
  and the selectable subjects were derived from whatever marks already existed, so an Admin could not define a subject
  before the first upload. A new **Admin → Subject Management** catalogue now owns that list, and the HOD marks workflow
  consumes it. **Storage/model:** new `backend/src/models/Subject.model.ts` (`code, name, department (ref Department),
  semester 1-8, academicYear "YYYY-YYYY", regulation?, subjectType THEORY|PRACTICAL|PROJECT|ELECTIVE, maxMarks 1-1000,
  passMarks ≤ maxMarks, status ACTIVE|INACTIVE, createdBy/updatedBy, timestamps`, collection `subjects`) with a compound
  unique index `{code, department, semester, academicYear}`; exported from `models/index.ts` and added to
  `ALL_MODELS`/`PERMANENT_MODELS` in `database/migrate.ts` (i.e. it is a permanent collection and persists across
  restarts). **API:** new `backend/src/modules/subjects/` (`subject.controller.ts` + `subject.routes.ts`) mounted at
  `/api/admin/subjects` **before** the general `/api/admin` router; every route is `ADMIN`-only via
  `authorize(ROLES.ADMIN)` and each handler re-checks the role. Routes: `GET /` (search + department/semester/academic
  year/type/status filters + server-side pagination + per-row marks/student usage counts), `GET /meta` (filter
  vocabulary), `POST /`, `GET/PUT /:id`, `PATCH /:id/status`, `DELETE /:id`. A duplicate code in the same scope returns
  **409** with a clear message; a cross-field check rejects `passMarks > maxMarks` (400); a subject that has recorded
  marks cannot be hard-deleted (409, “deactivate instead”). **Marks engagement (additive, backward-compatible):**
  `getSubjectsForClass` now returns the **union** of the Admin catalogue (for the department + cohort year's two
  semesters) and the legacy marks-derived subjects, each tagged `source: MASTER|MARKS`, `isActive`, `status`, and the
  catalogue fields (`id/maxMarks/passMarks/subjectTypeLabel/regulation`) so the existing `{subjectCode, subjectName,
  semesterNumber}` shape still works. `validateMarksExcel`/`executeMarksImport` consult the catalogue **only once the
  department has ≥1 catalogue subject**: at that point the named subject must exist and be **ACTIVE** (unknown → “not
  registered …”; inactive → “inactive and cannot be used for new marks uploads”) and its `maxMarks` bounds the assessment
  max and the recorded mark. Departments with **no** catalogue keep the exact legacy free-form behaviour, so
  `security-hardening.test.ts` (which imports `SEC201` with no master entry) still passes. **Frontend:**
  `frontend/src/api/client.ts` gained `SubjectRow/SubjectListResponse/SubjectMeta/SubjectInput/HodSubjectOption` types
  and `admin.subjects.{list,meta,getById,create,update,setStatus,remove}`; the HOD `getSubjects` return type is now
  `HodSubjectOption[]`. New page `frontend/src/pages/admin/AdminSubjectManagement.tsx` (premium navy/gold design —
  heading + description, Add Subject, debounced search, department/semester/academic-year/type/status filters, paginated
  table with status badges + marks/student usage, add/edit modal with frontend **and** server validation, deactivate
  confirmation, delete-when-unused confirmation, loading/empty/error states, responsive). Wired as the `subjects` tab in
  `AdminDashboard.tsx` and a `Subject Management` item in the Admin **ACADEMIC** sidebar section; the HOD upload/subject
  dropdowns (`HodMarksManagement.tsx`, `HodClassManagement.tsx`) now **disable** inactive options and prefer an active
  subject on auto-select. Once a department has adopted a catalogue, a **legacy** marks-derived code that is not in it
  stays **listed but view-only** (`source:MARKS`, `isActive:false`) so history stays visible in reports while the upload
  selector greys it out — the selector never offers a subject the server would then reject. **Verified:** backend API
  suite `npm run test:subject-management` **17/17 PASS** (add · duplicate 409 · pass>max 400 · edit · deactivate/reactivate
  · inactive refused for upload · correct subject associated · row-level invalid-mark errors · unknown-subject refusal once
  a catalogue exists · edit never rewrites an existing mark · history still listed · legacy subject view-only once a
  catalogue exists · delete rules · non-Admin 403 + no cross-department leak · search/filter/pagination · persistence
  in `subjects.json`); browser UI suite `.runtime-verify/subjects/verify.mjs` **12/12 PASS** in headless Chrome against a
  scratch store (sidebar entry → page header → empty state → add → duplicate rejected → edit → deactivate confirm →
  reactivate → search → pagination → semester filter → **0 runtime exceptions**). Regressions checked: `test:security-hardening`
  8/8, `test:hod-class-management` 8/8, `test:internal-marks` 97/97, `test:bulk-upload` 23/23, `test:hod-scope` 33/33,
  `test:admin-routes` 8/8, `test:admin-auth` 13/13; `tsc --noEmit` exit 0 (frontend **and** backend); `vite build` exit 0.
  Honest limitation: the HOD dropdown **disabling** is enforced server-side and proven by the API suite, but was not
  itself clicked in a browser (the HOD marks page exposes no stable selectors and the selection flow is multi-step).
  Branch `temp`, uncommitted, no commit/push.

- **Subject Management — multi-select scope (2026-10-15):** a subject now applies to **several** departments,
  semesters, academic years and regulations at once. `Subject.model.ts` stores the canonical scope as arrays
  (`departments/semesters/academicYears/regulations`) **and** keeps the original scalars as the first element of each
  array — the scalars preserve the existing unique index, API shape and readers, while the arrays are the source of
  truth compared in JavaScript (the local store's matcher cannot test membership on a top-level array field — verified
  empirically). Exported helpers `subjectDepartments/subjectSemesters/subjectAcademicYears/subjectRegulations/
  normaliseSubjectScopes/subjectAppliesTo`, plus an idempotent `backfillSubjectScopes()` run from `runMigrations()` that
  upgrades any legacy scalar-only record. The Admin controller accepts **both** the array and legacy scalar input shapes,
  requires ≥1 of each mandatory field, rejects a same-code subject whose scope **overlaps** an existing one (409) while
  allowing a disjoint reuse of the code, resolves department ids to labels, and computes usage across every combo;
  `getSubjectsForClass` expands a multi-semester subject into one option per applicable semester;
  `resolveUploadSubject` matches code + `semesters` + (when supplied) `academicYears`, with `academicYear` threaded
  through `validateMarksExcel`/`executeMarksImport`. Frontend: a new reusable `MultiSelect` component
  (`frontend/src/components/common/MultiSelect.tsx` — chips, search, select-all/clear-all, keyboard, creatable mode,
  drop-up placement) replaces the four single-value fields in `AdminSubjectManagement.tsx`, the table shows department
  chips + comma-joined values, and the navy/gold `.ms-*`/`.subj-tag` styles were added to `index.css`. **Verified:**
  `npm run test:subject-management` **26/26 PASS** (the 17 original checks unchanged plus 9 multi-select checks: multi
  create + mirrors · overlap 409 / disjoint 201 · empty-field 400s · edit preserves selections · value removal narrows ·
  compatible upload succeeds · incompatible semester **and** department refused · marks untouched · arrays on disk); UI
  harness `.runtime-verify/subjects/verify.mjs` **16/16 PASS** (adds chips-render · multi-select create · empty-required
  inline errors · chip removal on edit; **0 runtime exceptions**). Regressions: `test:security-hardening` 8/8,
  `test:bulk-upload` 23/23, `test:hod-class-management` 8/8, `test:hod-scope` 33/33, `test:internal-marks` 97/97,
  `test:admin-routes` 8/8, `test:admin-auth` 13/13; `tsc --noEmit` exit 0 (both); `vite build` exit 0. Honest limits:
  scope matching is JS-side (fine for the full-scan local store, revisit before a real DB); regulation is stored/
  displayed/filterable but **not** upload-enforced (no `Student.regulation`); MultiSelect gestures/screen-reader order
  not separately audited. Branch `temp`, uncommitted, no commit/push.

- **Login page — pixel-match to `A:\movies\ref.png` (64.5/35.5 split · reference type scale) (2026-10-15):** matched the
  **real rendered page** to the supplied reference screenshot (`ref.png`, 1696×927), read numerically with a `sharp` +
  Chrome-DevTools pixel harness (this environment has no image *viewer*, but it can measure pixels precisely).
  **Measured from the reference:** panel seam x≈1093; white card 482×777 at x1156; hero copy left edge x≈64; heading is
  **three display lines ~47–48 px** with a small **"WELCOME TO" kicker** above them (ink ~13 px, width 165 px); four
  feature rows **73 px** apart (block ~255 px). **Changes — `frontend/src/styles/index.css` (`.lg-*` only):** grid
  `minmax(0,64fr) minmax(0,36fr)` → **`64.5fr/35.5fr`** (seam lands on the reference axis; card x moves 1151 → **1156**,
  an exact match); `--lg-gutter` `clamp(…,3.2vw,…)` → **`clamp(…,3.7vw,…)`** (copy starts at x64, not x54);
  `.lg-hero-title` `clamp(1.42rem,2.3vw,1.95rem)` → **`clamp(calc(var(--lg-u)*1.42), 2.8vw, calc(var(--lg-u)*2.6))`** with
  `line-height:1.1`; new **`.lg-hero-line:first-child`** kicker rule (`font-size:max(0.7rem,0.44em)`, `line-height:1.5`,
  `letter-spacing:0.09em`, `margin-bottom:0.62em`, `color:rgba(255,255,255,.9)`); `.lg-features` `gap` `1.9vh` →
  **`clamp(calc(var(--lg-u)*0.8), 2.98vh, calc(var(--lg-u)*1.6))`** (row pitch 63 → **73 px**, feature block 224 → **254 px**).
  **Verified on the running app** (Chrome headless via CDP, fractional DPR so the CSS viewport renders at 1696×927):
  card **x1156** exact, y75, **479×776** (ref 482×777), centre Δ 0; panel x1094 (ref 1093); heading ink bands — kicker
  **y183** (ref 185), `DIGITAL` **y228** (225), `MENTOR–MENTEE` **y280** (277), `MANAGEMENT SYSTEM` **y333** (329) — all
  **within 4 px**; title **47.4 px** (ref ~48), line pitch **52.1 px** (ref 52); feature title bands **74/71/75 px** apart
  (ref 74/73/75); password toggle, wrong-password alert, successful login → app shell, **0 console errors**; manifest +
  service worker register, and a **trusted** (input-dispatched, not JS `.click()`) press on the install button raises the
  native prompt with no exception and no `alert()`; **1440/1024/768/390/320** all free of horizontal overflow with the card
  centred; `tsc --noEmit` **exit 0** (frontend **and** backend); `vite build` **exit 0** (CSS 144.46 kB). **Known
  residuals (deliberate):** the reference's lead paragraph wraps to **2 lines (~90 chars)** while this component's copy —
  taken verbatim from the earlier written spec — wraps to **3**, so the hero feature list sits ~22 px and the bottom
  tagline ~24 px lower than the reference; the copy and the tagline inset were **not** changed (that copy is
  spec-mandated, and trimming it would be inventing text). Branch `temp`, uncommitted, no commit/push.

- **Login page — reference-match pass: 64/36 split, 420 px card, `OR` separator (2026-10-15):** matched the written reference spec.
  **Campus image:** verified `A:\movies\K.S.R.C.E. Campus at Twilight.png` is **byte-identical** (SHA-256
  `F57DF013…A6DA13`, 2,580,028 B, 1672×941) to `frontend/public/assets/ksrce-campus-twilight.png`, which the CSS already
  loads via `/assets/ksrce-campus-twilight.png` — so the exact reference photograph was already in place and no duplicate
  asset was created. (A separate `assets/ksrce-campus-login.png` exists but is referenced by no source file.) **Layout:**
  `.lg-page` grid changed **62/38 → 64/36** (`minmax(0,64fr) minmax(0,36fr)`); `.lg-card` `max-width` **440 → 420 px**;
  card vertical rhythm tightened (head margin 1.6→1.4 rem, college 0.9→0.8, divider 1/0.8→0.85/0.7, form-group
  1.15→1.05, foot 1.25/1→1.05/0.9) so the card measures **420×682** at the reference viewport. **`OR` separator:** added
  the `OR` rule between the sign-in button and the PWA action (`.lg-or-sep` / `.lg-or-line` / `.lg-or-text`), rendered
  only when `!isInstalled` so it never dangles. **Content:** the component's copy already matched the spec exactly
  (crest, 4-line heading with gold `MENTOR–MENTEE`, exact description, the four named features, `EMPOWERING FUTURE
  ENGINEERS`, card header, both labels/placeholders/required stars, `Sign In to Portal` + arrow, `Download / Install KSRCE
  Web App`, footer) — no text changes, and **no** remember-me / forgot-password controls were added because no real
  functionality exists for them. **Verified on the running app** in headless Chrome at the **reference viewport
  1490×810**: split exactly 954/536 = **64 / 36 %**, card **420×682** centred (Δ 0, 64 px top/bottom margin), hero left
  edge x=48 for crest/heading/paragraph/features/tagline, gaps 88/28/29/88 px, heading 31.2 px (4 lines), lead 3 balanced
  lines (317/294/362), four 36×36 icons at one x; **1440×900** → 922/518, card 420×681; **1024×768** → 655/369, card
  313×695 centred; **390 / 320** stacked with **no horizontal overflow** and vertical scroll. Campus photo `200`
  (2,580,328 B) and logo `200` (naturalWidth 205) load; password toggle / wrong-password alert / successful login / PWA
  button all work with **0 console errors** (only the expected 401); `tsc --noEmit` exit 0; `vite build` exit 0 (CSS
  138.91 kB). **Honest limitation:** this environment has **no image input**, so the attached reference screenshot could
  not be viewed or pixel-diffed — the page was matched to the spec's stated text and measurements and validated with
  computed styles, element geometry and sharp pixel statistics. Branch `temp`, uncommitted, no commit/push.

- **Login page — hero refinement: smaller headline, balanced lead, feature contrast (2026-10-15):** a second, focused pass on the left hero only (right panel untouched). **Headline:** reduced slightly so the four-line block feels balanced — desktop `clamp(1.42rem,2.3vw,1.95rem)` → **31.2 px** (was 33.6 px), tablet `clamp(1.28rem,2vw,1.72rem)` → **20.48 px** (was 22.02 px); all four lines keep one consistent `line-height` (1.2 → 37.44 px / 24.58 px) and weight 700 with identical left x. **Lead paragraph:** heading→paragraph gap raised to **31 px** (was 25) for breathing room, and the measure constrained to **40ch** (383.6 px desktop / 353.3 px tablet) so the copy wraps into **three balanced lines** (widths 317 / 294 / 362 px, ~9 % spread). **Vertical order:** crest→heading 130 px, heading→paragraph 31 px, paragraph→features 32 px, features→tagline 129 px — every gap positive, nothing collides. **Feature list:** four icons **36×36 at the same x**, every title/description at the same text-column x (96 desktop / 82 tablet), uniform 57 px row pitch; the localised navy scrim behind the copy was widened (`radial-gradient(150% 125% at 0% 52%, rgba(6,27,54,.66) …)`) so the row-gap backgrounds measure luminance 36–54 while the bright image band to the right of the list is ~76 — text sits over the darker area, no opaque boxes added. **Tagline:** `EMPOWERING FUTURE ENGINEERS` still at the hero's left edge (x=46) and near the bottom (y=851, 32 px padding); on a 720 px-tall window every gap stays positive (features→tagline 66 px) so it never overlaps the list. **Right panel:** untouched — deep-navy gradient, white card 440×670 centred (Δ ≤1 px), logo/heading/inputs/toggle/button/PWA/footer preserved; no new decorations or animations. **Verified on the running app** in headless Chrome: alignment at **1440** (all blocks x=46; 62/38 split) and **1024** (all blocks x=32; card Δ 0); **390/320** stacked with **no horizontal overflow** and vertical scroll (docH 944 / 992); logo `200` (naturalWidth 205) and campus photo `200` (2,580,028 B) load; gold `MENTOR–MENTEE` fits with no clipping 280→1440 px; password toggle / wrong-password alert / successful login / PWA button all still work with **0 console errors** (only the expected 401). `tsc --noEmit` exit 0; `vite build` exit 0 (CSS 138.62 kB). Honest limitation: screenshots can't be visually inspected here (no image input) — validated via computed styles, element geometry and sharp pixel statistics. Branch `temp`, uncommitted, no commit/push.

- **Login page — final UI polish: hero alignment, spacing, panel cleanup (2026-10-15):** refined the existing
  split-screen login **in place** (no rebuild). **Left hero:** the crest, hero copy, feature list and bottom tagline
  now live inside one shared content column (`.lg-brand-inner`) so they inherit a single left edge (measured x=46 at
  1440, x=32 at 1024, x=18 on mobile), one vertical rhythm and one set of gaps. The vertical rhythm was opened up so the
  heading no longer feels cramped: heading `line-height` 1.16 → 1.2, heading→paragraph gap 17 → 25 px,
  paragraph→feature-list gap 27 → 33 px, feature-row gap 15.3 → 17.1 px. All four headline lines keep identical
  size/weight/line-height and `MENTOR–MENTEE` stays gold with `white-space: nowrap`. **Feature list:** all four icon
  boxes measure exactly 36×36 at the same x, every title/description starts at the same text-column x (96 desktop /
  82 tablet), thin `rgba(245,189,53,.32)` gold borders and uniform gaps; nothing overlaps the heading, paragraph or
  tagline. **Campus background:** `.lg-brand` repositioned to `46% 42%` after a sharp pixel profile of the 1672×941
  photograph (per-column edge energy + brightness bands) so the building structure stays in frame while the warm sunset
  cluster stays visible; the navy veil was lightened (left stop 0.84 → 0.72) so the image is no longer over-darkened
  (hero-region mean R rose 65 → 71) while the localised scrim behind the copy keeps the text background at luminance
  38–53 (white text contrast preserved). **Right panel:** the decorative dot-grid/bloom layer was removed entirely
  (`.lg-panel-decor` element + rules deleted), leaving only the smooth deep-navy → midnight gradient with the card as the
  single focal point; the white card, thin gold border, 20 px radius and soft shadow are unchanged and it remains
  centred (measured centre delta ≤1 px) at 440×670 (not enlarged). **Responsive:** 62/38 two-column at 1440 & 1024, one
  column ≤960 px; no horizontal overflow at 1440/1024/768/390/320; short/mobile screens scroll vertically (docH 944 at
  390×844, 992 at 320×568) instead of clipping. **Preserved:** auth API/payload/fields/errors, `useAuth`/session/role
  redirects, password toggle, PWA install, the campus asset and every other page; no new dependency. **Verified on the
  running app** (3000 + real auth 5050) in headless Chrome: layout/geometry as above; password toggle
  password→text→password; wrong password → `Invalid username or password.`; correct (`Ksrce@admin` / `Ksrce@1234`) →
  token + app shell + sidebar; **0 console errors/exceptions** (only the expected 401 on the wrong-password attempt);
  `tsc --noEmit` exit 0; `vite build` exit 0 (CSS 138.62 kB); campus asset `200 image/png` 2,580,028 B. Honest
  limitation: screenshots cannot be visually inspected here (no image input), so pixels were validated with sharp
  statistics. Branch `temp`, uncommitted, no commit/push.

- **Login page — right-panel premium navy + left-hero alignment fix (2026-10-15):** follow-up to the split-screen
  redesign, fixing the two defects found by inspection: (a) the right-hand sign-in area read as a flat, faintly-outlined
  block (the page gradient showed through the transparent `.lg-panel` and two oversized decorative circles/borders
  crowded the card) and (b) the left hero copy did not share one alignment/spacing system. The panel now paints its own
  rich deep-navy → midnight gradient edge-to-edge (radial top-right blue lift + a barely-there bottom-left gold bloom
  over a `162deg #0d2a4d → #0a2342 → #061b36 → #04101f` wash); the oversized circles were removed and replaced with a
  single soft gold radial bloom plus a very faint, mask-faded dot grid inside `.lg-panel-decor` (clipped separately so
  the card shadow is never cut); the white card is the focal point — thin gold border (`rgba(245,189,53,.42)`), 20 px
  radius, layered navy shadow — centred on both axes and never overlapping the navy/gold divider. The left hero now
  uses one shared left edge (`.lg-brand-body`) with four explicit headline lines (`WELCOME TO` / `DIGITAL` /
  `MENTOR–MENTEE` — the whole line gold via `.lg-hero-accent` + `white-space: nowrap` / `MANAGEMENT SYSTEM` white), a
  controlled paragraph `max-width: min(52ch,100%)`, four feature rows with identical 36×36 gold icon boxes, a fixed
  `0.9rem` icon→text gap and one text column, and the `EMPOWERING FUTURE ENGINEERS` tagline pinned bottom-left. Split
  is `grid-template-columns: minmax(0,62fr) minmax(0,38fr)`, `min-height:100dvh`, safe-area padding, `overflow-x: clip`;
  it stacks to one column ≤960px and scrolls vertically instead of clipping. No auth/API/payload/field/redirect change;
  password toggle and PWA install kept; no new dependency. Verified on the running app (3000 + real auth 5050) in
  headless Chrome via CDP: 62/38 split at 1440 & 1024; panel `background-color: rgb(6,27,54)` with its gradient and
  navy corner samples (13,42,77)/(32,62,90)/(4,16,31); card 440×670 centred exactly on the panel centre at 1440
  (x 946–1386, y 115–785) with white samples (255,255,255); `MENTOR–MENTEE` computed `rgb(245,189,53)`; all four hero
  lines share one left x and one line-height; feature icons all 36×36 with a consistent text x; no horizontal overflow
  at 1440/1024/768/390/320; password toggle password→text works, wrong password → `Invalid username or password.`,
  correct login (`Ksrce@admin` / `Ksrce@1234`) stores the token and renders the app shell; real API **401** (wrong) /
  **200 role ADMIN + token** (correct); **0 console errors**; `tsc --noEmit` exit 0 and `vite build` exit 0
  (CSS 139.08 kB). Honest limitation: screenshots cannot be visually inspected in this environment (no image input),
  so the result was validated from computed styles, geometry and rendered-pixel statistics. Branch `temp`, uncommitted,
  no commit/push.

- **Login page — premium split-screen redesign v2 (2026-10-15):** the login UI was restructured to deliver a visibly new experience. Asset: `frontend/public/assets/ksrce-campus-twilight.png` (2.46 MB) copied from `A:\movies\K.S.R.C.E. Campus at Twilight.png` and applied via CSS `background-size: cover` on the left hero. Left panel (≈62%) now uses an editorial, multi-line headline: WELCOME TO / DIGITAL / MENTOR–MENTEE (with MENTEE in gold) / MANAGEMENT SYSTEM; features: crest + college name/subtitle, refined paragraph, four feature rows (gold-accented icons), bottom "EMPOWERING FUTURE ENGINEERS" tagline with gold line. Right panel (≈38%): deep navy background, vertically centered warm-white login card (thin gold border, ~22px radius, soft shadow), card header with logo/college/system, gold divider, "WELCOME BACK" + subtitle. All existing auth logic, password toggle, token/session/role redirects, PWA install behavior, field names, and API calls remain unchanged. Responsive at 1440/1024/768/390/320. Typechecks pass (frontend/backend). Build passes. AI tests: ai-assistant 47/47, gemini-integration 38/38. Uncommitted changes preserved. No commit/push.

- **Grammar engine — broad vocabulary, modular rules, optional local model (2026-10-13):** the deterministic writing
  assistant was scaled from the small curated dataset to a **modular, broad-coverage** engine, using **licensed**
  vocabulary sources (never a fabricated or inflated list) plus an **optional** local-model path. New modules under
  `backend/src/modules/grammar/` — `vocabulary/morphology.ts` (pure English morphology: irregular verbs/plurals,
  inflections, `FORM_TO_BASE`, `PAST_FORMS`), `vocabulary/domain-vocabulary.ts` (curated safe sets),
  `vocabulary/lexicon.ts` (a one-time, cached **370,103-word** dictionary + **50,000-word** frequency ranking),
  `grammar.rules.ts` (ordered reusable rules: subject–verb agreement, verb form after modal/`to`/do-auxiliary, perfect,
  progressive, missing `did`, quantifier/partitive plurals, a/an, collocations), `grammar.spelling.ts` (conservative
  dictionary-gated typo correction) and `grammar.context.ts` (the optional Ollama adapter, **OFF by default**).
  Provenance and licences are in `vocabulary/data/SOURCES.md` (`words_alpha.txt` — dwyl/english-words, **The Unlicense**;
  `en_50k.txt` — hermitdave/FrequencyWords, **MIT**). The contract is unchanged: normalise → protect official values →
  spelling/vocabulary → ordered rules → optional local model when configured → validate/reject unsafe output → return the
  original when unreliable. Benchmarks: one-time lexicon load **~614 ms / ~49.5 MB**, steady-state **~3,544
  corrections/s** (≈0.28 ms/call), a 2,498-char paragraph **~3.0 ms** (p95 ~4.6 ms). New suites
  `test:grammar-coverage` **1084/1084** and `test:grammar-context` **35/35** (real mock Ollama server); regressions
  `test:grammar-api` **63/63**, `test:grammar-dataset` **85/85**, `test:grammar-safety` **45/45**, `test:grammar` green.
  No local model is installed on this machine, so that path stays OFF and is verified against a mock server only; setup
  instructions are recorded below. UI, RBAC, the API contract and the local JSON storage are unchanged. Branch `temp`,
  uncommitted. See Completed + Log.

- **Grammar engine — missing-auxiliary repair now covers `coming` (2026-10-13):** the running Mentoring form returned
  `He not coming tomorrow.` for `he not coming tomorrow` instead of `He is not coming tomorrow.` **Root cause:** the
  missing-auxiliary repair is curated/list-gated, and `coming` was simply absent from `MISSING_AUX_GERUNDS`, so the
  clause never matched and only capitalisation + terminal punctuation ran (the rule order in `grammar.service.ts` —
  word corrections → `fixMissingAuxiliaryVerbs` → `PHRASE_RULES` → capitalisation/punctuation — was already correct).
  Fixed by adding `coming` (plus a curated set of other unambiguous action participles — going, talking, asking,
  telling, waiting, …; noun/adjective `-ing` words such as morning/evening/meeting/building stay excluded) to
  `backend/src/modules/grammar/grammar.dataset.ts`, and by tightening `grammar.structure.ts` so the optional
  object-plural normalisation runs only when the clause continues past the bare object — a bare `she not attending
  class` now becomes `She is not attending class.` while `…attending class regularly` still becomes
  `…attending classes regularly.` Verified over the **live** server (via the frontend proxy, the exact path the form
  uses) and in the suites: `test:grammar-dataset` **85/85**, `test:grammar-safety` **45/45**, `test:grammar-api`
  **63/63**, `test:grammar` green, backend `tsc` + frontend `vite build` exit 0. Branch `temp`, uncommitted. See
  Completed + Log.

- **Login page — premium polish pass (2026-10-13):** the existing navy/gold login page
  (`frontend/src/pages/auth/LoginPage.tsx` + the scoped `.lg-*` block in `frontend/src/styles/index.css`) was refined
  **in place**, not rebuilt. The excessive dark veil that hid the campus building was replaced with a lighter,
  localised scrim (a readable radial wash behind the copy while the diagonal/vertical washes drop to ~`0.3`–`0.68`),
  so `/assets/ksrce-campus-login.png` (unchanged, 2 728 283 B, byte-identical) is clearly visible; the crest, heading
  hierarchy, card padding/border/layered shadow, 50 px inputs with a gold `:focus`/`:focus-visible` ring, a 38×38
  password toggle, a 52 px Sign-In button (hover/focus/disabled/loading), the secondary-but-accessible PWA button, the
  grid/arc accents, and the responsive layout (compact mobile banner + full-width form at ≤480 px) were all refined.
  Everything is scoped to `.lg-*` — the shared `.login-*` rules (`ChangePasswordPage`) are untouched. **No** change to
  authentication, request format, error handling, role redirects, PWA install, storage or any other role's dashboard;
  no new dependency; no credentials hardcoded. Verified live: `3000` → 200; campus PNG → 200 `image/png`
  byte-identical; `POST /api/auth/login` → 200 (ADMIN + token) and **401** for a wrong password; `tsc && vite build`
  exit 0. Branch `temp`, uncommitted. See Completed + Log.

- **Dataset-based grammar engine — deterministic, conservative, extensible (2026-10-13):** the writing assistant's
  correction engine was extracted from the inline rule function in `ai-assistant.service.ts` into a new modular
  `backend/src/modules/grammar/` package (`grammar.dataset.ts` curated exact sentences + word dictionary + ordered
  phrase rules; `grammar.normalize.ts` matching-only normalisation and similarity; `protected-values.ts` official-value
  guard; `grammar.service.ts` `correctText` orchestrator). It is **not** a language model and makes **no** claim of
  exhaustive coverage: known sentences are corrected by exact match, near-identical variants by a similarity-gated
  approximate match (curated opt-in only, threshold 0.9), and everything else by careful word/phrase rules. If no
  reliable correction exists it returns the text **unchanged** with an explicit status (`NO_RELIABLE_CORRECTION`); for a
  close-but-unsafe match it refuses with `AMBIGUOUS_INPUT` — it never substitutes a similar sentence, never fabricates
  facts, and official values (names, register numbers, subject codes, marks, CGPA, dates) are protected. The existing
  advisory **Improve Grammar** flow, RBAC, local JSON storage and every unrelated feature are unchanged. A same-day
  follow-up added a sentence-anchored **missing-verb repair** for fragmentary clauses
  (`student not attending class regularly` → `The student is not attending classes regularly.`): it inserts the missing
  article/auxiliary only for a curated subject list at a sentence start and only when no other finite verb follows the
  participle, so already-correct clauses and reduced relatives (`Students facing difficulty should approach…`) are never
  touched. New suite `test:grammar-dataset` **73/73**; regressions `test:grammar-safety` **45/45**, `test:grammar-api`
  **54/54**, `test:grammar` green, backend `tsc` + frontend `tsc`/`vite build` clean. Branch `temp`, uncommitted. See
  Completed + Log.

- **Premium login page redesign — campus-photo hero + navy/gold card (2026-10-13):** the login page
  (`frontend/src/pages/auth/LoginPage.tsx`) was rebuilt to a premium institutional layout using the supplied
  campus photograph `A:\movies\eb72e87c-e8c7-44b1-9a40-baa0134bc3ab.png`, copied verbatim to
  `frontend/public/assets/ksrce-campus-login.png` (2 728 283 B; source preserved). Desktop is a full-screen
  60/40 split — a campus **branding panel** (photo as `object-fit: cover` dominant visual under a navy veil,
  fine dotted-grid texture, curved gold arcs, the verified college crest + `K.S.R. COLLEGE OF ENGINEERING` /
  `AUTONOMOUS • TIRUCHENGODE`, the gold-accented `Digital Mentor–Mentee Management System` hero, the supporting
  sentence, four icon feature highlights — Mentor & Mentee Management, Academic Records & Analytics, Placement
  Monitoring & Achievements, Department & Institution Insights — and the `Empowering Future Engineers` footer)
  beside a **sign-in panel** with a compact white card (gold border + top accent, college logo/name, `Welcome Back`,
  the form, the PWA install button and the `Permanent Academic Records System / Secured Institutional Access •
  K.S.R. College of Engineering` footer). All new styling is a scoped `.lg-*` block in
  `frontend/src/styles/index.css`; the existing `.login-*` classes are **deliberately kept untouched** because
  `ChangePasswordPage.tsx` reuses them. Form, validation, error display, show/hide password, loading state, PWA
  install and every API/auth rule are unchanged (no Remember-Me or Forgot-Password existed, so none was invented;
  no credentials hardcoded); no dashboard, route, endpoint, request format or session behaviour changed. Verified on
  the **live dev server (3000)** with headless Chrome: desktop 1440×900 two-column (left panel = navy-family +
  photo-blend, gold accents present, white card), tablet 1024×768 two-column, mobile 390×844 stacked banner + card;
  real `POST /api/auth/login` returns **200** (ADMIN) and **401** for a wrong password; frontend `tsc` + `vite build`
  exit 0; `test:critical` **12/12**. Branch `temp`, uncommitted. See Completed + Log.

- **User-facing "Counselling" → "Mentoring" — remaining labels cleared (2026-10-12):** a previous UI update set the
  user-facing term to **Mentoring** (stated in the code) but many visible labels still read **Counselling**; the most
  obvious was the mentor's mentee-profile view, which mixed both (`5-Domain Mentoring Records` card foot but tab
  `6. Counselling`, card `Counselling Sessions`, `Mentee Counselling Records & Dossier`, the add/edit record modal,
  field labels and the empty state). Every remaining **user-visible** mentoring-workflow occurrence now reads
  **Mentoring**: the sidebar (`Counselling Records` → `Mentoring Records`, `5-Domain Counselling` → `5-Domain
  Mentoring`, the student `Mentoring & Counselling` → `Mentoring History`); the mentor profile view (tab, summary
  card + aria-label, dossier title, record `Mentoring Date`, edit button, empty state, add-modal title/subtitle/
  field labels/errors); the Faculty dashboard (`Add/Pending/Recent Mentoring`, `5-Domain Mentoring`, mentoring-record
  table + `Open Mentoring Desk`); the Admin **5-Domain Mentoring Hub** (page title, `Student Mentoring Directory`,
  `Mentoring Action`, `View Student Mentoring`); the HOD faculty detail (`Mentoring History`, `Mentoring records`,
  `Last Mentoring`, `Mentoring provided`); the Student 5-domain history; the Principal KPI hint/table/note; and the
  AI-assistant prompts. **Deliberately preserved:** the unrelated admission category `Counselling (Govt Quota)`
  (StudentDashboard, CompleteProfileWizard, mentor admission display), every internal identifier (tab keys,
  `/counselling/*` API paths, `counselling*` fields, `CounsellingRecord`, component/type names, code comments) and
  backend/generated-PDF text. Display-only: no route, id, endpoint, field, stored record or business rule changed.
  Frontend `tsc` + `vite build` clean; the built bundle and the running dev server (3000) contain **only** the two
  admission-type `Counselling (Govt Quota)` strings and none of the mentoring-workflow ones. Branch `temp`,
  uncommitted. See Completed + Log.

- **Bulk Upload & Assign Mentees — ADMIN college-wide / HOD own-department (2026-10-12):** a clearly visible
  **Bulk Assign Mentees** button now sits on the Admin **Mentor Assignment Desk** header and the HOD **Departmental
  Mentor Assignment** header. It opens a self-contained 4-step modal (`Upload → Preview & Validate → Confirm →
  Results`): download an **Excel (.xlsx)** or **CSV** template, drag/choose a file, review a fully validated preview
  (row no., register no. + student name, employee id + mentor name, current mentor, proposed mentor, status, message;
  status filter chips + search), then explicitly confirm. Validation is **server-side on every row** — required
  columns, unknown student/mentor, inactive mentor, HOD department scope (student **AND** mentor), duplicates, existing
  assignments (create vs reassign), malformed values, and file type/size/row limits (5 MB / 1000 rows). Invalid and
  duplicate rows are **never** written; a student who already has a mentor needs an **explicitly authorised,
  reason-backed reassignment** and their previous mentor is preserved as `COMPLETED` history. `maxMentees` is **not**
  enforced anywhere in the app, so it is a WARNING only and never blocks (cross-department is a WARNING for ADMIN).
  Execution re-validates from the raw `{registerNumber, employeeId}` pairs (client statuses are never trusted), is
  per-row and reports `ASSIGNED` / `REASSIGNED` / `SKIPPED` / `FAILED` with reasons, writes the same
  `MentorAssignment` / `Notification` / `AuditLog` (`ASSIGN_MENTOR` / `REASSIGN_MENTOR` plus a `BULK_ASSIGN_MENTORS`
  summary) records as the single flows, prevents duplicate submissions, and offers downloadable **validation** and
  **results** reports (CSV + Excel). Templates ship illustrative example rows (`261T001/EMP1001`, `261T002/EMP1002`)
  that are always detected and can never create an assignment. Verified end-to-end over the real HTTP stack **29/29**;
  regressions `test:critical` 12/12, `test:bulk-upload` 23/23, `test:bulk-actions` 15/15, `test:hod` 33/33,
  `test:admin` 23/23, `test:security-hardening` 8/8. Branch `temp`, uncommitted. Browser-driven UI pass still PENDING.
  See Completed + Log.

- **Principal dashboard — compact, premium Principal-only redesign (2026-10-12):** the Principal portal
  (`frontend/src/pages/principal/PrincipalDashboard.tsx`) is a self-contained, Principal-specific executive dashboard
  (deep-navy/gold, premium cards, restrained radii/shadows, Lucide icons). The **oversized navy hero banner has been
  removed** — in-banner title, marketing subtitle, the `Principal · Institutional Leadership` and
  `Read-only executive access` badges, repeated college branding, welcome message, in-banner date and the whole large
  empty card are gone (the element no longer renders, so no empty space remains). The page now opens directly into a
  **compact heading** (`Principal Dashboard` + `Institutional performance at a glance` + a small current-date chip)
  with reduced top padding, then **8 real KPI cards**, dependency-free SVG/CSS analytics (coverage-by-department bars,
  reporting-month coverage ring, weekly activity columns, and a students / faculty / **mentors** distribution), premium
  department cards with the existing read-only drill-down (department → mentors → mentees), and a real institutional
  activity + pending-attention panel. **Scope respected:** the shared `AdminMentoringDashboard`, the global `Navbar`
  (which keeps the college crest + name) and every other role are untouched; all Principal styling lives in a scoped
  `pd-*` block. It reads the same server-computed `/api/admin/overview/*` surface (still view-only by the server
  allow-list). Verified in a real headless browser **50/50**; suites `test:principal` **53/53**, `test:admin` **23/23**,
  `test:hod` **33/33**, `test:critical` **12/12**, `test:bulk-actions` **15/15**. Branch `temp`, uncommitted.
  See Completed + Log.

- **Faculty Mentor Cards + click-through detail — HOD "Department Faculty Mentors" (2026-10-12):** the HOD faculty
  table was replaced by responsive **cards** (desktop 3 / tablet 2 / mobile 1 per row; loading, empty and error states)
  showing name, employee ID, email, designation, department, cabin, contact number (when present), current mentee count,
  coverage % and active/inactive status, plus the existing in-card actions (**View Details**, **Edit**) and the
  **Add Faculty** button. Clicking a card (or View Details) opens one dedicated **detail dialog** with tabs that exist
  only where the app has data — Overview, Mentees, Counselling History, Meetings, Documents, Assignment History — all
  fed by **real, HOD-department-scoped** records; a mentee's existing student page opens from the Mentees tab when
  permitted. **No hardcoded faculty data.** The detail is served by **extending the existing `getMentorDetail`**
  (`GET /api/hod/mentor/:mentorId`) with dept-scoped `assignments` (ACTIVE **and** historical `MentorAssignment` rows
  for that mentor), `counselling` (records authored by that mentor), `meetings` (that mentor's meetings) and
  `documents` (metadata for the current mentees' `StudentDocument`s) — no new routes, no N+1 frontend calls.
  Relationships are keyed by **stable ids**, never names; current vs historical assignments are distinguished by
  status; reassigned students appear once as current and once as history, never duplicated. Counselling notes are shown
  only to the HOD of the owning department (the module's existing rule) and no raw geo-tagged evidence photos are
  exposed. Verified in a **real headless browser** against the built SPA and the real backend (**34/34** checks): cards
  replace the table, the correct faculty opens, 3/2/1 responsive columns, each tab's real data, empty state, Edit
  independent of the card click, keyboard Enter, cross-department 404, and mentee → student navigation. Branch `temp`,
  uncommitted. See Completed + Log.

- **Bulk selection · bulk delete · bulk document (ZIP) download — Student Master + Faculty / Mentors (2026-10-12):** the
  two admin management screens now support multi-row selection (header checkbox = current page, per-row checkbox, live
  selected count, selected rows tinted with a gold rail), and a sticky action bar appears as soon as ≥1 row is selected:
  **Select all** (server-resolved whole eligible set within the caller's scope, not just the visible page), **Clear**,
  **Download documents** and **Delete selected**. Selection is keyed by **record id**, so it survives pagination and a
  refresh, and never "jumps" to a different record; it is cleared when the filter set or the tab changes. **Bulk delete**
  is a hard delete that reuses the real cascade, validates every id server-side and enforces scope per record (ADMIN
  anywhere; **HOD own department only** — bulk deliberately widens the ADMIN-only single delete to HOD-with-scope, an
  explicit product decision), reports partial failures per record (`{requested, deleted, failed}`), refreshes the list and
  drops only the ids that were actually deleted. As a side effect a **latent single-delete bug was fixed**:
  `deleteStudent` filtered `StudentDocument` by `student`, but the model keys its owner as `studentId`, so document
  metadata rows were silently orphaned — both paths now delete correctly (files on disk are still deliberately left
  untouched, matching the pre-existing policy). **Bulk download** streams a real ZIP `Bulk_Documents_YYYY-MM-DD.zip` with
  `Students/Student_Name_StudentID/…` (and `Faculty/…` / `Mentors/…`) folders using collision-safe filenames, plus a
  `manifest.csv`; it serves the existing **watermarked** copy via `resolveServedDocumentPath` and never modifies
  originals, and there are **no** fabricated or placeholder entries. Zero eligible documents returns HTTP 200 JSON
  `{hasDocuments:false,…}` with a per-record reason (no empty ZIP); the UI shows an informational toast instead of
  downloading nothing. Because no faculty/mentor document store exists, Faculty/Mentor bulk download returns an explicit
  "no documents available" result. New suite `test:bulk-actions` **15/15**. Backend `tsc --noEmit` + `npm run build` and
  frontend `tsc --noEmit` + `vite build` all exit 0. Verified on the **running app** (live 5050): selection ids 128
  students / 1 faculty, search scoping, a real ZIP (135 743 B → `Students/Vishnuvarthan P_73152421125/Student Details
  Form.pdf` + a header+row `manifest.csv`), the no-documents and faculty JSON paths, 400 on empty ids, and per-record
  bulk-delete failure reporting — all correct. The bulk **UI** is build-verified but not yet click-verified in a headless
  browser (see Pending). Branch `temp`, uncommitted. See Completed + Log.

- **Student record book — two headings removed ("INSTITUTIONAL VERIFICATION & DIGITAL ENDORSEMENT" and "OFFICIAL DIGITAL
  MENTOR–MENTEE RECORD BOOK") (2026-10-12):** both headings were removed from the **generated PDF** in all three places
  they were emitted, not merely hidden: (1) the signature heading — the `.sigheading` div in `signatureBlockHtml()`
  (the invisible reserve copy), the pdf-lib `drawText` in `stampPageFurniture`, and the jsPDF fallback
  (`pdf.service.ts`); (2) the full-mode document title — `docTitleFor('full')` now returns `''`, `stampPageFurniture`
  skips the title line, and the jsPDF fallback skips it too. The other two document types keep their own titles
  (`OFFICIAL INTERNAL ASSESSMENT REPORT`, `MENTORING RECORDS & DOCUMENT ARCHIVE`) — verified present on **every page**
  of those renders. **Blank space reclaimed:** the signature reserve dropped (`margin-top` 16 mm → 9 mm; the heading +
  its 12 mm margin deleted) and the header band shrank for the full book only (top margin **35 → 31.5 mm**, divider
  **30.6 → 28.4 mm**) so the removed title line leaves no gap (the two titled modes keep 35 mm / 30.6 mm); the
  watermark centring offset is derived from the band so it stays centred. The `StudentDocument.renderVersion` stamp was
  bumped to `2026-10-12-removed-headings`, so the stale **stored Student Details Form** is regenerated in place. Verified
  on the **real HTTP path** (`GET /api/pdf/student/73152421125?mode=…`): `full` 2 pp, `internal` 1 p, `mentor-documents`
  1 p — neither removed heading present on any page; college name / logo header (ink from 12.3 mm, body from 34.9 mm on
  the full book), `K S R C E` watermark, `Page X of Y` footer and the four signing captions all intact; page counts
  unchanged. Full matrix green: `test:record-book-header` **74/74**, `test:runtime` **38/38**, `test:critical`
  **12/12**, `test:document-watermark` **44/44**, `test:document-watermark-runtime` **46/46**; `tsc --noEmit` +
  `npm run build` both exit 0. Branch `temp`, uncommitted. See Log.

- **Student record book — signature block now bottom-anchored; "big blank below the signature" closed (2026-10-11):**
  the previous fix (body 10 pt/1.42, 7.5 mm signing lines, `margin-top: 16 mm`) only nudged the signature down —
  on the real live 2-page book page 2 still ended at y≈593 with **~204 pt blank below the signature**, and the
  single-page `internal` report ended at y≈394 with **~403 pt blank** (it read as "content crammed at the top with
  a void under the signatures"). Root cause: the signature block was emitted **in normal flow** right after the
  content, so on a short final page it floated up with the page's unused height left below it. It is now anchored to
  the **bottom of the final page**: `signatureBlockHtml()` emits an invisible, geometry-identical
  `.signatures.sig-reserve` placeholder (so the paginator still reserves the block's height and the content can never
  reach the signature band) and `stampPageFurniture` draws the **visible** block once, with pdf-lib, near the page
  bottom of the last Chrome-rendered page (heading y≈692, signing lines y≈757, captions y≈764–775; columns at
  x≈34/169/304/439 across the 12 mm side margins). Measured on the **real HTTP path** (`POST /api/auth/login` admin →
  `GET /api/pdf/student/73152421125?mode=…`): `full` **2 pages**, last-page body now ends y≈775 with the signatures at
  the bottom (was 593); `internal` **1 page**, y≈775 (was 394); `mentor-documents` **1 page**, y≈775. Page counts are
  **unchanged** (placeholder keeps pagination identical); long 120-row synthetic still **9 pages** with the signature
  on the last page. Two further "old PDF served" vectors were closed: (a) the live `GET /api/pdf/student/:id` now
  sends `Cache-Control: no-store` + `Pragma/Expires` so a browser can never replay a stale download; (b) the
  **stored Student Details Form** (generated once via `syncStudentDetailsPdf` and served from disk) was stale on this
  machine — both the original (201 893 B, 08 Oct) and the watermarked copy (200 479 B, 09 Oct) predated the fix and
  showed the old ~337 pt-blank layout. A `renderVersion` stamp was added to `StudentDocument`; `getStudentDocuments`
  now regenerates the derived form in place when its stamp is out of date (idempotent — verified only one refresh),
  and the served form is now the new layout (136 463 B original / 137 350 B watermarked, signature captions y≈764).
  Full matrix green: `test:record-book-header` **68/68**, `test:runtime` **38/38**, `test:critical` **12/12**,
  `test:document-watermark` **44/44**, `test:document-watermark-runtime` **46/46**; `tsc --noEmit` + `npm run build`
  both exit 0. Branch `temp`, uncommitted. See Log.

- **Servers restarted cleanly — one fresh backend (5050) + one fresh frontend (3000) on localhost (2026-10-11):**
  every stale project dev process was identified by command line and project path, then the backend tree
  (launcher `powershell` 13568 → npm 29692 → cmd 28004 → `tsx watch` 25280 → server child **21204** on 5050) was
  stopped with `taskkill /PID 13568 /T /F` (descendants only — the OpenCode service parent 28436 and the unrelated
  `chrome-devtools-mcp` processes were deliberately left running). Port 5050 confirmed released and no project
  Node process remained; no frontend/Vite had been running (3000/5173/4173 free). Fresh servers started from the
  project's own config: backend `npm run dev` (`tsx watch src/index.ts`) → new server **PID 19744** on 5050,
  `/api/health` → `{"status":"ok","database":"connected"}`; frontend `npm run dev` (Vite v6.4.3) → **PID 7688** on
  `http://localhost:3000/`, title `KSRCE Mentoring | K.S.R. College of Engineering`. The Vite `/api` → `localhost:5050`
  proxy reaches the new backend (proxied `/api/health` ok; `POST /api/auth/login` as `Ksrce@admin` 200; `GET
  /api/pdf/student/:id?mode=full` 200 `application/pdf`, `%PDF-`, ~137 KB for two real students). Nothing was
  deleted or reset — no source, `.env`, `backend/data/`, uploads, `node_modules`, Git history or uncommitted changes
  touched. See the Completed entry + Log.

- **Student record book — "content compressed at the top, big blank below the signature" fixed (2026-10-11):** the
  live short records spilled onto page 2 where only ~44% of the height was used — sections 5–10 and a tiny
  signature block sat in the top third with ~440 pt blank below. Cause: the print type was small/tight
  (body 9 pt/line-height 1.32; table cells 8 pt @ 1.1 mm padding; a crammed one-line signature underline) and a
  genuinely short record simply leaves a sparse last page. Fix enlarges/spaces the print typography
  (body **10 pt/1.42**; cells **9 pt @ 1.5 mm** padding; banner/annexure/photo text scaled up) and rebuilds the
  signature block with a real **7.5 mm signing line** per column plus `break-inside: avoid`. On the two real live
  students page 1 still fills to ~776 pt and page 2 now carries sections 5–10 with the signature captions at
  y≈582–593 pt (was 340–353 pt) → the blank tail shrank from ~440 pt to ~200 pt, still **2 pages (no third-page
  spill)**. The long 120-row synthetic record book (7 → **9 pages** with the larger type) still repeats column
  headers on all 8 subject-row pages, keeps the header inside its band and clips nothing (max body bottom 788 <
  797 pt); the `K S R C E` watermark is centred on the physical page on all 9 pages (and on the live 2-page
  books). One renderer check was corrected to measure the watermark's own PDF geometry — the old pixel-diff
  bbox was biased on sparse pages where opaque cells are painted over the background mark. Full matrix green:
  `test:record-book-header` **68/68**, `test:runtime` **38/38**, `test:document-watermark` **44/44**,
  `test:document-watermark-runtime` **46/46**, `test:internal-marks` **97/97**, `test:critical` **12/12**;
  backend `tsc --noEmit` + `npm run build` both exit 0. Branch `temp`, uncommitted. See Log.

- **Student PDF persists in the real running app — root cause found & closed (2026-10-11):** the layout fix was
  already in the working tree and every renderer-level test was green, yet the user still saw the old broken PDF
  in the browser. The missing link was the **live process**: the backend on 5050 (`tsx watch` child PID 17128)
  had started at 21:36:53 — the *same second* the fix file was last saved — i.e. it was running a snapshot taken
  at the moment of that write, so the browser kept hitting code that never included the final fixes
  (start-time/file-mtime race; not provable after the fact, which is why the process was restarted). After
  restarting 5050 with the current code (authorized), the real HTTP path was driven exactly like the browser
  (`POST /api/auth/login` as admin → `GET /api/pdf/student/:id?mode=full`): three real live students now produce
  fixed record books (header + `Page X of Y` + `K S R C E` on every page; body starts below the 30.6 mm header
  rule; nothing clipped). Multi-page/continuation behaviour was then verified over the same endpoint on an
  isolated scratch instance (port 5098, temp store; live data untouched) seeded with 120 internal-marks rows,
  40 meetings, evidence photos, JPEG scans and a real 3-page PDF annexure: **19-page full record book** — header,
  watermark and correct footnote on all 15 Chrome pages, long-table column headings repeated on its 5
  continuation pages, zero body/header overlap, no clipping, uploaded photos/scans byte-identical afterwards,
  watermark proven a true background layer via pixel-diff vs an un-watermarked control (document ink unchanged,
  `\` slope ≈ +0.95, centred y≈424 vs 421 pt); `internal` and `mentor-documents` modes likewise furnished with
  their annexure tails preserved. Full regression matrix still green: `test:record-book-header` **56/56**,
  `test:runtime` **38/38**, `test:document-watermark` **44/44**, `test:document-watermark-runtime` **46/46**,
  `test:internal-marks` **97/97**, `test:critical` **12/12**; `tsc --noEmit` + `npm run build` both exit 0. No
  product code changed in this follow-up (verification + process restart only). See Log. Branch `temp`, still
  uncommitted.

- **Student PDF — watermark, header & content-overlap final pass (2026-10-11):** the `K S R C E` watermark is a
  true background layer on every rendered page — proven by pixel-diff of the watermarked render against an
  un-watermarked control (document ink byte-identical; ≤0.4% edge-blend pixels shift ≤18/255), centred on the
  **physical page** (ink bbox centre y≈424pt vs page centre 421pt) and running the required bottom-right →
  top-left `\` diagonal (slope ≈ +0.95). The KSRCE institutional header repeats on every page through the
  pdf-lib `stampPageFurniture` mechanism inside a reserved 35mm top band (navy rule + verified
  `assets/ksrce-logo.png` + college name + autonomous/AICTE/Anna University line + Tiruchengode address + gold
  document title + subtle divider), and long tables now **repeat their column headers on every continuation
  page** via real `<thead>` rows (`table.grid thead { display: table-header-group }`). No body text is clipped
  (min bottom margin 5.5pt) and nothing overlaps the header or watermark. Verified on a synthetic 7-page /
  120-row record book (`test:record-book-header` **56/56**), the real HTTP pipeline (`test:runtime` **38/38**
  incl. the image annexure page), the uploaded-document watermark service (`test:document-watermark` **44/44**,
  `test:document-watermark-runtime` **46/46**), plus regressions `test:internal-marks` **97/97** and
  `test:critical` **12/12**; backend `tsc --noEmit` and `npm run build` both **exit 0**. See the Completed entry
  + Log; nothing committed / pushed.

- **Repeating KSRCE institutional header on every page of the student documents: PASS (2026-10-11)** — the
  record book (and the `internal` / `mentor-documents` downloads that share the pipeline) now carries the
  college header — college name, autonomous/AICTE/Anna University affiliation line, Tiruchengode address, the
  gold document title and the verified `assets/ksrce-logo.png` — on **page 1 and every subsequent page**. A
  real top band is reserved (`@page { margin: 35mm 12mm 16mm }`) and the header is **stamped per page with
  pdf-lib** (`stampPageFurniture`, the mechanism the footer already used), because Chrome's print engine
  supports neither `@page` margin boxes nor a space-reserving `position: fixed` header (measured: fixed header
  text y≈107pt vs body y≈96pt at a 34mm top margin → overlap, which is why the old code emitted the header
  once on page 1 only). Long tables, image montages and any content flowing to a new page therefore never
  cover the header; the `K S R C E` watermark is untouched. Verified on a real 7-page / 120-row record book
  (`test:record-book-header` **50/50**, per-page bounding-box proof of zero body/header overlap) plus the real
  HTTP pipeline (`test:runtime` **38/38**, header on every footered page incl. the image annexure). Full
  backend matrix **30/30 EXIT 0**; backend build exit 0. See the Completed entry + Log. No commit/push made.

- **Browser E2E verification + two UI defects fixed (2026-10-11):** a real headless-Chromium
  click-through over a disposable sandbox (second backend on 5056 over a fresh temp store; SPA
  rebuilt with a temp `VITE_API_URL`; the live 5050/3000 servers untouched) — **42/42 checks PASS**
  across all five roles and every section (login/error, admin, student+RBAC, HOD class + marks +
  Excel template + bulk import + persistence + corrupt-file rejection, ECE cross-department
  isolation, faculty, Principal forced-password-change + read-only, responsive at three viewports,
  console/page errors). Two confirmed defects found and fixed: **(G)** a failed login was silent —
  `AuthContext.login` toggled the global `isLoading` before its `await`, so `App`'s boot gate
  unmounted `LoginPage` and the 401 error never rendered (removed the global toggle; the button keeps
  its local state); **(H)** any toast wiped the HOD Marks class/subject/semester selection —
  `useToast()` returned a non-memoized value recreated on every render, re-running the `loadSubjects`
  effect that reset the selection (fixed at the root: `ToastContext` value now memoized and
  actions-only). Full backend matrix re-run: **29/29 EXIT 0** (incl. `runtime` 38/38, `ai-assistant`
  47/47, `security-hardening` 8/8); backend `npm run build` exit 0; frontend `npm run build` exit 0.
  Nothing committed; branch `temp` preserved.
- **Full security, bug-fix & regression audit (2026-10-11):** project-wide pass across every role,
  page, API, authz rule, upload/PDF/Excel path and the AI-assistant surface, with four confirmed
  defects fixed and regression-verified end-to-end (nothing committed; branch `temp` preserved).
  **(A)** Login brute-force protection — new dependency-free `login-rate-limit.middleware.ts`
  (sliding window of failed attempts per `IP+username`, default 10 per 15 min, plus a per-IP ceiling
  of 60 — env-tunable via `LOGIN_MAX_ATTEMPTS` / `LOGIN_MAX_IP_ATTEMPTS` / `LOGIN_WINDOW_MS`; only
  401s push the window, a successful login resets it, 429 + `Retry-After` when full) wired onto
  `POST /api/auth/login`. **(B)** Marks Excel template department isolation —
  `generateMarksTemplate` now takes the HOD's `departmentId` and filters the roster inside the query,
  so one department's template can never leak another department's students; the controller passes
  `scope.departmentId`. **(C)** Marks bulk import re-validation — `executeMarksImport` re-checks
  `isMarkType`, semester (integer 1–8) and mark range against stored max server-side and persists the
  owning `student` on create, closing the client-trusting write path (cross-department rows still
  refused). **(D)** JWT secret hardening — `JWT_SECRET` is read from the environment (dotenv first),
  `NODE_ENV=production` fails the process at boot when unset, and the dev fallback is a fresh random
  secret; the old hardcoded literal is gone. Also fixed a pre-existing record-book defect the audit
  surfaced: the HTML/CSS PDF renderer passed the raw base64 string (not a Buffer) to `sharp()` in its
  decode pre-check, so **every valid uploaded image was mislabelled "could not be decoded" and
  dropped from the record book**; the check now decodes the payload into a Buffer and images embed
  again (`test:runtime` back to **38/38**). One stale source-contract assertion in
  `test:faculty-dept-reassign` was updated to match the deliberate, backend-supported permanent
  deletion safety valve for inactive verified demo HODs (the `DELETE /api/admin/hods/:hodId` endpoint
  existed; the assertion predated it) — suite back to **18/18**. New `test:security-hardening`
  (7/7, port 5119) locks in the login throttle (429 + Retry-After, reset on success, per-identity
  isolation), template department isolation, import persistence + cross-department refusal, the JWT
  source contract and the middleware wiring. Full affected-suite re-run: **all green** — `hod`,
  `hod-class-management`, `internal-marks`, `bulk-upload`, `admin`, `admin-routes`, `hod-admin`,
  `hod-delete`, `principal`, `admin-auth`, `critical`, `document-watermark-runtime`,
  `evidence-location`, `evidence-location-runtime`, `mentoring-evidence`, `faculty-dept-reassign` all
  EXIT 0; backend `tsc` + `npm run build` PASS; frontend `tsc --noEmit` PASS. The same-day
  follow-up pass closed the last environment blocker and the last audit gap (see next bullet).
- **Full audit follow-up pass (2026-10-11):** nothing new was broken; the initial pass's one
  unverifiable suite and one audit gap were closed with real fixes and fresh evidence. **(E)**
  `test:ai-assistant` never needed a live Ollama host — it drives an **in-process mock Ollama**
  server (`OLLAMA_BASE_URL` pointed at an ephemeral local port before `index.js` imports), passed
  all 47 checks, and then **hung at teardown** because the imported backend keeps the event loop
  alive (HTTP listener + 1-hour reminder interval) while the suite only ever called
  `process.exit(1)`. Added the explicit `process.exit(0)` every other suite that boots
  `src/index.js` already uses → **47/47 PASS, EXIT 0, port freed**; the AI module itself is
  untouched. **(F)** Marks **bulk import** was the only privileged write with no audit record
  (manual saves write `UPDATE_INTERNAL_MARK_HOD`; the bulk path wrote nothing). `executeMarksImport`
  now writes one `IMPORT_MARKS_BULK` audit row per run — outcome summary + ≤50 register numbers +
  ≤20 subject codes, never secrets — via the existing failure-tolerant `logAudit()`, and a new
  regression check (3b) asserts the rows including a fully-refused import still auditing
  `failed=1/imported=0`. `test:security-hardening` is now **8/8**. Full 28-suite matrix re-run
  sequentially: **28/28 EXIT 0** (incl. `test:runtime` 38/38, `test:faculty-dept-reassign` 18/18,
  `test:ai-assistant` 47/47). Backend `tsc --noEmit` + `npm run build` PASS; frontend `tsc
  --noEmit` + `vite build` PASS (pre-existing chunk-size warning only). Static scans re-confirmed:
  no secrets outside test fixtures, `JWT_SECRET` env-driven + prod fail-closed, upload path
  resolution rejects traversal. Two deliberate design decisions remain documented (Pending /
  Completed): marks **bulk upload** stays outside the admin-controlled mark-entry window
  (HOD/trusted-uploader path), and the login throttle state is in-process only (single-instance
  local-store deployment).
- **Principal role (2026-10-10):** implemented and verified end-to-end. A default **read-only
  Principal** account is provisioned idempotently at bootstrap (username `Principal`, email
  `Principal@ksrce.ac.in`, role `PRINCIPAL`, `mustChangePassword: true` on create only; the initial
  credential is the shipped bootstrap default, overridable via `PRINCIPAL_USERNAME` /
  `PRINCIPAL_EMAIL` / `PRINCIPAL_PASSWORD`. Later boots never duplicate, re-hash or re-arm the
  account — verified byte-identical across repeated boots). First login is **forced** through a
  password change by a signed JWT `mustChangePassword` claim plus a global `/api` middleware that
  allow-lists only `/health`, `/auth/login`, `/auth/me`, `/auth/change-password` — every protected
  route (including the college dashboard and all admin/HOD/settings/export routes) answers 403 until
  the account sets a new one. The change validates current + new + confirmation, rejects mismatch /
  too-short / same-as-current / wrong-current, persists a fresh bcrypt hash, clears the flag and
  issues a refreshed token (the old flagged token is inert); only the new password logs in
  afterwards. The Principal portal is a separate college-wide dashboard (reuses the verified
  `AdminMentoringDashboard` atop `/api/admin/overview/*`, now `authorize(ADMIN, PRINCIPAL)`) reached
  only via `/principal/*`; **real gap found and closed by the new suite** — the student PDF endpoint
  previously fell through to "no rule → allow" for the Principal, so an explicit PRINCIPAL deny now
  403s downloads by register number and by id. New `test:principal` **53/53**; regressions
  `test:admin` 23/23, `test:admin-routes` 8/8, `test:admin-auth` 13/13, `test:hod-admin` 22/22;
  backend `npm run build` PASS; frontend `tsc --noEmit` + `vite build` PASS. No commit/push made.
- **Overall project status:** PASS — Backend and frontend both build clean. All backend test
  suites green (29/29 EXIT 0; see Verification), and a real headless-Chromium browser pass
  click-verifies all five roles end-to-end (42/42; see Completed). Full 6-state permission machine
  implemented and enforced
  server-side. Grammar & Spelling Assistant implemented and runtime-verified. Persistence layer is
  now local files. Mentoring Records now carry a required Discussion With (student / parent / both)
  and size-capped evidence photos, including Saturday photos stored once and shared
  across participants. Each evidence submission records an optional, device-reported location fix
  (lat/long/accuracy) and honest capture/upload timestamps; a denied or unavailable location never
  blocks the upload. Uploaded documents and the generated Student Details Form get a separate
  `K S R C E` watermarked copy while the original is preserved. The watermark is applied as a
  **genuine background layer** (its content stream is moved behind every page's original content),
  so tables, headings and signatures always paint on top of it and are never obscured — fixed
  2026-10-10. On a page that is one opaque full-page scan or filled background the underlaid
  watermark is hidden behind that opaque paint rather than covering content (an accepted, documented
  limitation). HOD department dashboard, mentoring analytics, student/faculty CRUD, mentor
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
  and the generic `alert-info` style remains available. No auth/API/routing change. A scoped
  **login premium-polish pass** (same day) refined the page without changing layout or palette:
  Cinzel serif confirmed on the college name + hero heading (gold-accented span), Inter sans for
  every form/description label, a deeper card with a 3px gold top accent and 24px radius, 46px
  touch-friendly inputs with a navy border + gold focus ring at `:focus`, a 46px navy Sign In
  button (hover lift + shadow, `btn-loading` spinner and `disabled` duplicate-submission guard
  unchanged), the PWA button restyled as a gold-outline secondary action, improved
  legal/footer contrast, restrained gold glows on the navy gradient, plus tablet (961–1180px)
  and mobile (≤640px) refinements and a login-scoped `prefers-reduced-motion` guard.
- **Admin Mentoring Dashboard — College Mentoring Split + Weekly Progress focused refinement:** PASS (2026-10-09) — a presentation-only second pass over exactly those two cards. **Split card:** refined circular coverage ring with a clear % (server `pie` figures, de-duplicated), two restrained stat rows (green **Mentored**, amber/red **Pending**) each showing count + % in one consistent format, and a subtle footer naming the reporting month + the de-duplicated student total; inline SVG, decorative-but-labelled. **Weekly card:** consistent `DATE RANGE | BAR | COUNT` rows — compact one-line ranges (`Aug 17 – Aug 23`) with a fixed date-label column width, low-attention flexible bars on a subtle track with the theme fill, a clean zero-state with visible dashed stubs, subtle separators + row hover, and every value straight from the API `weeklyProgress`. **Responsive:** desktop shows two equal-height side-by-side panels; tablet and mobile stack cleanly with no horizontal overflow. No API, route, RBAC, calculation, data-fetching or unrelated card changed. Verified end-to-end on an isolated backend (`verify-data2`, seeded 21 counselling records) + rebuilt SPA at 1440×900 / 1024×768 / 390×844 — 0 failures. **Pre-existing issue found (NOT fixed — out of scope):** the 30-Day Report tab never loads its data because the mount effect tests `currentTab === 'reports'` while the parent supplies `'mentoring-reports'`; the tab shows the "Report unavailable" empty state. See the Completed entry + Log for details.
- **Student Dashboard Overview + Profile Completion card bug:** PASS (2026-10-09) — confirmed and
  fixed the card reading `profile?.profileCompleted` (a key `GET /api/students/:id` has never
  returned — it sends `profile_completed: 0|1`), so a completed+saved profile always rendered
  **Incomplete**. The completion arithmetic moved to one shared helper
  (`backend/src/utils/profile-completion.util.ts`) used by both `getStudents` and `getStudentById`;
  the detail response now additionally carries `profile_completion_percentage` +
  `profile_completion_missing` (additive fields only). The Overview tab was rebuilt in the same
  navy/gold tokens (scoped `sd-` CSS): banner spacing/typography/alignment with a prominent-but-
  balanced Record Book button and aligned Internal Assessment / Mentor Documents actions, uniform
  `sd-stat` cards that cannot overflow, a real progress bar + "Missing: …" hints on Profile
  Completion (never an invented number), a true two-column Meeting Schedule / Assigned Faculty
  Mentor pair that collapses ≤900px with readable empty states and only-present mentor contact rows,
  and a compact Recent Saturday Mentoring Log empty state. Verified end-to-end on an isolated
  backend + rebuilt SPA: before-fix bundle "Incomplete" vs after-fix "Complete" at desktop/tablet/
  mobile with no horizontal overflow; 8/8 case checks (missing fields, filled+saved, refresh,
  sign-out/in, save-failure refuses a false Complete, optional empties, response format +
  directory/detail agreement, console hygiene). Frontend + backend `tsc --noEmit` PASS; `vite
  build` PASS (canonical dist rebuilt with the production 5050 base); `test:directory` 16/16,
  `test:critical` 12/12, `test:runtime` 38/38 re-run green.
- **Sidebar independent scrolling + fixed header:** PASS (2026-10-09) — the reported "the whole page
  moves when I scroll the sidebar" symptom had two causes: (1) the global `html, body { overflow-x:
  hidden }` safeguard silently turned `html`/`body` into a scroll container and disabled
  `position: sticky` on the header **and** the sidebar (they computed `sticky` but scrolled away —
  header `top` = -600 after scrolling 600px), and (2) the sidebar was never height-constrained inside
  the content-growing flex row, so `.sidebar-nav` never scrolled internally. Fixed by switching the
  safeguard to `overflow-x: clip` (no scroll container), pinning the desktop rail with `position:
  sticky; top: var(--header-hpx); height: calc(100vh - var(--header-hpx))`, and adding
  `min-height:0; overflow-x:hidden` + `flex-shrink:0` to the nav rows. Also fixed a stale
  `document.body.style.overflow='auto'` left by `Modal.tsx` / `MentorAiBotModal.tsx` after close
  (now restores the previous value). Verified 53/53 headless-Chromium checks across desktop 1440 /
  tablet 900 / mobile 390 (nav scrolls internally, header + rail stay pinned, main still scrolls,
  collapsed rail + drawer + modal all correct, no horizontal overflow, 0 console errors) plus
  before/after root-cause probes; `tsc --noEmit` clean; `vite build` PASS; canonical dist rebuilt.

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
- **Mentoring Evidence location:** OPTIONAL, device-reported only. The earlier mandatory GPS/geotag flow was removed; a lighter, privacy-respecting location capture was reintroduced (2026-10-09) as part of the evidence-location feature: a single browser geolocation request fires only when the mentor attaches photos, coordinates are validated server-side and labelled "device-reported, not independently verified", and denial/timeout/unavailability never blocks the upload. No location history is collected and coordinates are never exposed unauthenticated.

---

## Completed

### Uploaded achievement certificates missing from the Official Record Book (PDF) — unified into the shared archive, real pages reproduced (2026-10-15) — PASS

**Symptom.** A certificate the student uploaded through **My Progress & Achievements** was visible in the portal (and, after the previous fix, in My Documents), but the downloaded **Official Record Book (PDF)** listed only the system *Student Details Form*, printed "**0 student-uploaded document(s) on record**", and appended **no** certificate pages. The intended behaviour (stated in the module's own comments) is to embed the **actual uploaded pages** — images inline, PDFs appended as annexures after the signed record — not a summary or a link.

**Reproduced on the real running app** (student `73152421125`). `GET /api/student/progress` returned the certificate (`Verified`, `Hackathon Certificate`, `certificateUrl=/uploads/progress/prog-1791999062825-454237-adobe.pdf`); `GET /api/pdf/student/73152421125?mode=full` returned **200**, 3 pages, a documents section listing only the form, **0** annexure cover sheets and none of the certificate's text (`mode=mentor-documents` likewise, 2 pages). `backend/data/student_documents.json` held **only** `student_details_form` rows; the certificate lived in `student_progress.json`.

**Root cause.** The record-book data collector (`collectRecordBookData`, `record-book-html.data.ts`) queried **only** `StudentDocument`. On a real record every `StudentDocument` row is the auto-generated `student_details_form` (`isPrimary: true` → `is_system_form`), which the embed loop deliberately skips so the dossier never embeds itself — so the certificate in `StudentProgress` was neither listed nor attached. The legacy jsPDF fallback (`pdf.service.ts`) had its **own** inline `StudentDocument` query with the identical defect.

**Fix — one shared archive collector, used by both renderers; no duplicate records.**

- **New shared util** `backend/src/utils/uploaded-file-key.util.ts` — `normaliseStoredFileKey(url)`, the single canonical stored-file identity rule (compares only the stable `uploads/...` logical path). `student-progress.controller.ts`'s local `normaliseFileKey` now delegates to it, so the My Documents merge and the PDF archive can never disagree about when two rows are the same physical file.
- **New shared collector** `collectStudentDocumentArchive(studentObjectId)` in `record-book-html.data.ts` — reads **both** `StudentDocument` (sorted `isPrimary`/`uploadedAt`) and `StudentProgress` (oldest first), maps both onto the existing record-book document shape (`id, source, title, file_name, document_type, category, event_details, uploaded_on, verification_status, is_system_form, file_type, file_size, file_url`), and de-duplicates by `normaliseStoredFileKey`. A progress row that folds into an already-listed file only **enriches** generic metadata (title/event/category); it never changes the listed verification status. Used by **both** `collectRecordBookData` (HTML renderer) and `pdf.service.ts` (legacy fallback, whose inline query was removed).
- **Clear no-file message** in both embed loops (`record-book-html.service.ts` `resolveDocumentFiles`, `pdf.service.ts`): a record with `file_url === ''` is a real listed record with nothing to reproduce, reported plainly ("This record has no certificate file attached…") — never as a lost file or "needs administrator repair".
- **Accurate provenance** on the annexure cover sheet: "…uploaded by the student through **My Progress & Achievements**" vs "through Student Documents", driven by `source`.
- **Related consistency fix:** the HTML renderer appended PDF annexures even for `mode=internal`, although it renders no documents section for that mode — the legacy jsPDF renderer already guarded both together. `appendPdfAnnexures` is now guarded by `mode !== 'internal'` too, so the unified archive cannot leak certificate pages into the marks-only internal report.

**Preserved.** No change to any point value, eligibility rule, ranking, verification or scoring code; watermarking, RBAC/ownership and the `is_system_form` self-embed guard are untouched. Original certificate files are never modified. A file referenced by both stores is listed and reproduced **exactly once**.

**Verification.**

| Check | Result |
|---|---|
| Real HTTP path, pre-fix (`mode=full`) | 200, **3 pages**, documents section = form only, "**0 student-uploaded document(s) on record**", **0** annexure covers, certificate text absent |
| Real HTTP path, post-fix (`mode=full`) | 200, **5 pages**, **2** listed rows, **1** annexure cover, `adobe.pdf` text **reproduced verbatim** on p5 (`.runtime-verify/pdf/repro.mjs`, `.runtime-verify/pdf/dump.mjs`) |
| Real HTTP path, post-fix (`mode=mentor-documents`) | 200, **4 pages**, certificate listed + reproduced (p4) |
| Live upload → regenerate → delete (`.runtime-verify/pdf/probe-live-e2e.mjs`) | **17/17 PASS** — second cert uploads (201 Pending) → 2 docs / 2 covers / both texts present → delete (admin) → PDF **byte-identical** to baseline, file removed, row set restored, points unchanged (rank 1 / 5 pts / 1 achievement) |
| New suite `npm run test:record-book-certificates` | **27/27 PASS** — listing, verbatim PDF page, image inline at real dimensions (240×160), form never self-embedded, cross-student isolation, both-store de-dup (listed + reproduced once), missing / unsupported / no-file clear reasons, internal mode document-free, read-only (file hashes + record fingerprints unchanged) |
| `npm run test:record-book-header` | **74/74 PASS** |
| `npm run test:certificate-visibility` | **22/22 PASS** |
| `npm run test:runtime` | **38/38 PASS** |
| `npm run test:document-watermark-runtime` | **46/46 PASS** |
| `npm run test:leaderboard` | **35/35 PASS** |
| `npm run test:state-machine` | **137/137 PASS** |
| `npm run test:security-hardening` | **8/8 PASS** |
| backend / frontend `tsc --noEmit` | exit 0 |
| backend / frontend `npm run build` | exit 0 |

**Remaining issues / notes (reported, not fabricated).**
- **Orphaned pre-existing record:** `StudentProgress` row `6ac69edac00f5614c49174be` (KAVIN S, `731523205099`, `Pending`) points at a student id absent from `students.json`, and its file is absent from disk. Unreachable from any record book; left untouched.
- **Pre-existing test artifact (left in place per "do not add or remove points"):** `backend/data/achievements.json` holds one Approved achievement, `PROBE Workshop Attendance` (5 points), from an earlier probe. Removing it would change the leaderboard, so it was left as-is.
- The record book prints the verification status the ledger already holds; it never re-verifies. A `Pending` progress certificate therefore appears as `Pending`.

Branch `temp`, uncommitted, no commit/push.

### Achievement certificates missing from "My Documents" — merged from the participation ledger without duplicating records (2026-10-15) — PASS

**Symptom.** A certificate the student uploaded through **My Progress & Achievements** was invisible in **My Documents**, even though it showed in My Progress, and the achievement points / leaderboard worked.

**Reproduced on the real running app** (student `73152421125`). `GET /api/student/progress` returned the certificate (`Verified`, `Hackathon Certificate`, `certificateUrl=/uploads/progress/prog-1791999062825-454237-adobe.pdf`), but `GET /api/documents/student/:id` returned **only** the `student_details_form`. The stored files proved the split: `backend/data/student_progress.json` held the certificate row while `backend/data/student_documents.json` held only `student_details_form` rows. Fetching the stored file directly (`/uploads/progress/…`) returned 401/404 because the authenticated `/uploads/*` route resolves paths **only** through a `StudentDocument`.

**Root cause.** The certificate lives in the achievement/participation ledger (`StudentProgress`, what **My Progress** writes to), a *different collection* from the document store (`StudentDocument`) that **My Documents** reads. `getStudentDocuments` listed only `StudentDocument`, so an achievement certificate had no record to appear from — and `streamDocumentFile` (`/api/documents/:id/file|download`) resolved **only** `StudentDocument` ids, so its file could not be served either. This is a **visibility** defect; the points system was already correct and is untouched.

**Fix — backend + one frontend file, no migration, no duplicate records.**

- `backend/src/modules/documents/document.controller.ts`
  - `getStudentDocuments` now merges the student's achievement certificates onto the document list by reusing the **one canonical** de-duplicating routine the mentor review screen already uses (`buildUnifiedProgressRecords`) and normalising them onto the document response shape (`documentType:'certificate'`, `source:'progress'`, real `verificationStatus`, `fileAvailable`, `title`=activity, `category`/`eventName`/`organizer`/`eventDate`, plus a deliberately **read-only** capability set with a "Manage this certificate from My Progress." reason — so no action button points at the document endpoints). A file already represented by a `StudentDocument` is folded by the shared routine, so it is listed **exactly once** and nothing is written.
  - `streamDocumentFile` (serving both `/file` and `/download`) now resolves `StudentProgress` ids as well as `StudentDocument` ids, applying the **same** `checkStudentAccess` ownership rule and serving the **original** stored bytes (progress certificates are not watermarked). Header handling extracted into one `sendStoredFile` helper used by both branches.
- `frontend/src/components/documents/StudentDocumentsManager.tsx`
  - Tags achievement certificates "From My Progress"; when `fileAvailable === false` the View/Download buttons are disabled and a clear "File unavailable." note replaces a broken preview. (The default `ALL` filter already renders them, and `openPreview`/`handleDownload` already use `doc.id`, which the backend now resolves.)
- Removed the superseded, unused `backend/src/utils/certificate-achievement.util.ts` (dead code from an earlier plan; referenced nowhere).

**Preserved.** No change to any point value, eligibility rule, ranking, verification or the achievement points service. Existing certificate records and files were neither deleted nor rewritten. Existing document permissions are unchanged; achievement certificates are read-only in this view and remain manageable in My Progress.

**Verification.**

| Check | Result |
|---|---|
| Real headless Chrome (`.runtime-verify/cert/browser-docs.mjs`, CDP, dev 3000 → backend 5050) | **14/14 PASS** — certificate card displayed, tagged "From My Progress", **exactly one**, View previews the **certificate** via a secure blob iframe (`/api/documents/6acfbc56f975f18de9ebb8cb/file` → 200, iframe title `adobe.pdf`), 0 error boundary, 0 exceptions, 0 console errors |
| Live API (`.runtime-verify/cert/probe-verify.mjs`) | My Documents returned **2** rows (form + certificate, `source=progress`); owner preview/download 200 (`application/pdf`, 246 778 B, original filename `adobe.pdf`); anonymous 401; another student 403; no duplicate |
| Upload → appears → cleanup (`.runtime-verify/cert/probe-e2e.mjs`) | before 2 → upload 201 (Pending) → after 3 (visible + previews 200) → cleanup delete 200 → back to 2; leaderboard unchanged (rank 1, totalPoints 5, achievementCount 1) |
| Missing-file path (`.runtime-verify/cert/probe-missing2.mjs`) | a record whose bytes are gone is **still listed** (`fileAvailable=false`) and its preview returns 404 — never a fabricated file |
| New regression suite `npm run test:certificate-visibility` | **22/22 PASS** (merge, ownership, dedup, read-only perms, points-neutral) |
| `npm run test:runtime` | **38/38 PASS** |
| `npm run test:document-watermark-runtime` | **46/46 PASS** |
| `npm run test:leaderboard` | **35/35 PASS** |
| `npm run test:state-machine` | **137/137 PASS** |
| `npm run test:security-hardening` | **8/8 PASS** |
| backend `tsc --noEmit` | exit 0 |
| frontend `tsc --noEmit` + `npm run build` | exit 0 |

**Remaining issues / notes (reported, not fabricated).**
- **Orphaned pre-existing record:** `StudentProgress` row `6ac69edac00f5614c49174be` (KAVIN S, `731523205099`, `Pending`) points at student id `6ac69edac00f5614c49174bc`, which does **not** exist in `students.json`, and its file `backend/storage/uploads/progress/sih2026_cert.pdf` is **absent from disk**. It is unreachable from any student's My Documents and is left untouched.
- **Pre-existing test artifact (left in place per "do not add or remove points"):** `backend/data/achievements.json` holds one Approved achievement, `PROBE Workshop Attendance` (5 points), created by an earlier verification probe. Removing it would change the leaderboard, so it was left as-is — delete it if unwanted.
- Browser-level verification uses headless Chrome via CDP (the repo has no Playwright/jsdom), the same technique the leaderboard entry used.

Branch `temp`, uncommitted, no commit/push.

### Achievement Leaderboard "Something Went Wrong" — Rules-of-Hooks violation in `LeaderboardView` (2026-10-15) — PASS

**Symptom.** Opening **Achievement Leaderboard** (student view; the component is shared, so every role was affected)
rendered the KSRCE error boundary — *"Something Went Wrong — An unexpected error occurred."* — while `GET /api/leaderboard`
returned **200** with real data, i.e. the backend was healthy.

**Root cause (FINAL).** A React **Rules-of-Hooks** violation in `frontend/src/components/leaderboard/LeaderboardView.tsx`,
introduced by the 2026-10-15 performance-optimisation pass that memoised the derived presentation. The new `useMemo` was
placed **after** the two early returns:

```
if (error)  return (…error card…);
if (!data)  return <LeaderboardSkeleton />;          // render 1 (data === null) stops here
const derived = useMemo(() => { … }, [data, entries]); // reached only from render 2 onward
```

Render 1 (loading, `data === null`) ran `useState×3 + useCallback + useEffect` = **5 hooks**; render 2 (loaded) added the
`useMemo` = **6**. React threw `Rendered more hooks than during the previous render. at LeaderboardView (…:244)`, which the
`ErrorBoundary` surfaced as the generic error screen. No exception reached `window.onerror` — it appeared as the console
error above plus the boundary.

**Fix (one file).** Hoisted the `entries` line and the entire `derived = useMemo(…)` block to run **unconditionally, above
both early returns** (immediately after the `load`/`useEffect` hooks); made the memo null-safe for the loading render
(`data?.entries ?? []`, `(data?.verifiedAchievements ?? 0) > 0`, `data?.me ? … : null`); removed the now-duplicated block;
added a comment explaining why it must stay above the early returns. Hook order is now stable on **every** render. No
backend, API, scoring, RBAC, styling or data-shape change; no dependency added.

**Why no other page broke.** All nine other `useMemo` sites in the frontend were audited and already sit **before** their
early returns (`PrincipalDashboard`, `AdminMentoringDashboard`, `HodMarksManagement`, `AdminSubjectManagement`,
`AdminBulkUpload`, `MarksEntryTable`, `ClassRosterPanel`, `MultiSelect`, `BulkAssignMentees`); `HodDashboard` already
carried an explicit "hooks before early returns" comment. `LeaderboardView` was the single wrong site.

**Verification.**

| Check | Result |
|---|---|
| Pre-fix, real browser (`.runtime-verify/achv/verify.mjs`, headless Chrome, dev 3000 → backend 5050, student `73152421125`) | **FAIL reproduced** — error boundary; console error `Rendered more hooks than during the previous render. at LeaderboardView (…:244)`; `/api/leaderboard` 200 |
| Post-fix, same harness | **8/8 PASS** — `.lb-root` present, hero "Achievement Leaderboard", **157 students in scope**, 0 error-boundary, 0 exceptions, **0 console errors** |
| `npm run test:leaderboard` | **35/35 PASS** |
| frontend `tsc --noEmit` | **exit 0** |
| frontend `vite build` | **exit 0** |

Branch `temp`, uncommitted, no commit/push.

### Admin Subject Management + subject-aware marks upload (2026-10-15) — PASS

**Objective.** Give the Administrator a first-class subject catalogue and make the marks workflow use it: create/edit/
activate/deactivate subjects with department · semester · academic year · regulation · type · maximum & pass marks,
without inventing departments or replacing any existing college data, and without breaking the legacy subject flow.

**Design constraint that shaped everything.** `security-hardening.test.ts` uploads a mark with `subjectCode: 'SEC201'`
that has **no** catalogue entry and requires `imported === 1`. So the catalogue could not be made mandatory. The
implemented rule is **additive**: enforcement switches on **per department**, only once that department has at least one
catalogue subject. Before that, the legacy free-form code is accepted exactly as before. No subjects are seeded, so
every existing install keeps the legacy path until an Admin adds the first subject.

**Files changed.**
- **New** `backend/src/models/Subject.model.ts` — schema, `SUBJECT_TYPES`/`SUBJECT_STATUSES`, `isSubjectType`/
  `isSubjectStatus`/`normaliseSubjectType`, `SUBJECT_TYPE_LABEL`, compound unique index
  `{code, department, semester, academicYear}`.
- `backend/src/models/index.ts` — export the new model.
- `backend/src/database/migrate.ts` — `Subject` added to `ALL_MODELS` **and** `PERMANENT_MODELS`.
- **New** `backend/src/modules/subjects/subject.controller.ts` — `getSubjects` (search/filter/paginate + usage counts),
  `getSubjectMeta`, `getSubjectById`, `createSubject` (409 duplicate, 400 pass>max), `updateSubject`, `setSubjectStatus`,
  `deleteSubject` (409 when marks exist), and `loadDepartmentSubjects` (used by the HOD marks list).
- **New** `backend/src/modules/subjects/subject.routes.ts` — ADMIN-only router.
- `backend/src/index.ts` — mount `app.use('/api/admin/subjects', subjectRoutes)` **before** the general `/api/admin`
  router.
- `backend/src/modules/hod/hod.controller.ts` — `getSubjectsForClass` rewritten to union catalogue + legacy subjects;
  import `loadDepartmentSubjects`; legacy subjects become view-only (`isActive:false`) once the department has a catalogue.
- `backend/src/modules/hod/marks-bulk-upload.service.ts` — `resolveUploadSubject` helper; subject enforcement in
  `validateMarksExcel` (blocking unknown/inactive; per-row max-marks bounds) and `executeMarksImport` (per-row, so a
  direct POST cannot bypass `/validate`).
- `frontend/src/api/client.ts` — subject types + `admin.subjects.*`; HOD `getSubjects` → `HodSubjectOption[]`.
- **New** `frontend/src/pages/admin/AdminSubjectManagement.tsx` — the page.
- `frontend/src/pages/admin/AdminDashboard.tsx` — import + `if (currentTab === 'subjects')` dispatch (before the shared
  loading/error gates).
- `frontend/src/components/common/Sidebar.tsx` — `Subject Management` item in the Admin **ACADEMIC** section.
- `frontend/src/pages/hod/HodMarksManagement.tsx`, `frontend/src/pages/hod/HodClassManagement.tsx`,
  `frontend/src/pages/hod/ClassManagementClassCard.tsx` — subject option type gains the catalogue fields; inactive
  options are `disabled`; auto-select prefers an active subject.
- **New** `backend/src/tests/subject-management.test.ts` + `test:subject-management` script.
- **New** `.runtime-verify/subjects/verify.mjs` — headless-Chrome UI verification (scratch `DATA_DIR`, real dev server).

**Backend verification — `npm run test:subject-management` → 17/17 PASS.** Add · duplicate code rejected (409, exactly one
row) · pass>max rejected (400) · edit · deactivate/reactivate round-trip · inactive subject flagged `isActive=false` in
the HOD list **and** refused by `/import` with an explanatory reason (nothing written) · a valid upload associates the
mark with the correct student+subject (`ia1=44`) · over-range mark fails with a row-level “between 0 and 50” reason ·
unknown subject refused once the department has a catalogue · editing a subject leaves the existing mark untouched ·
historical subject still listed for the class · a legacy subject is listed view-only (`source=MARKS`, `isActive=false`)
once its department has a catalogue while the catalogued subject stays selectable · delete refused when marks exist (409)
/ allowed when unused · HOD create/edit/deactivate all 403 and no cross-department subject leak ·
search/filter/pagination/meta · `subjects.json` contains the row on disk (restart-safe).

**UI verification — `.runtime-verify/subjects/verify.mjs` → 12/12 PASS.** Boots a scratch backend + `vite` dev server,
logs in through the real form, then: sidebar entry opens the page · page header renders · fresh catalogue shows the empty
state · add from the modal · duplicate rejected (modal stays open, error shown, no second row) · edit · deactivate asks
for confirmation then shows `INACTIVE` · reactivate · search narrows to one row · server-side pagination present and
moves pages (13 subjects → 10 + 3) · semester filter returns only matching rows · **0 runtime exceptions / 0 unexpected
console errors**.

**Regression + build.** `test:security-hardening` 8/8 · `test:hod-class-management` 8/8 · `test:internal-marks` 97/97 ·
`test:bulk-upload` 23/23 · `test:hod-scope` 33/33 · `test:admin-routes` 8/8 · `test:admin-auth` 13/13 · backend
`tsc --noEmit` exit 0 · frontend `tsc --noEmit` exit 0 · `vite build` exit 0. Branch `temp`, uncommitted.

### Subject Management — multi-select scope (departments · semesters · academic years · regulations) (2026-10-15) — PASS

**Objective.** Let one subject apply to **several** departments, semesters, academic years and regulations at once, with
chip/searchable multi-selects in the Add/Edit form, and make the marks-upload scoping respect those selections — while
preserving every existing subject and mark, all uncommitted work, and the established permission model.

**Design decision — arrays of record + scalar mirrors.** The local file store's query matcher resolves a dotted path the
Mongo way for **nested** arrays (`nested.arr.k`) but **not** for a top-level array field — verified empirically:
`matchesFilter({ departments: ['d1','d2'] }, { departments: 'd1' })` is `false`. Rather than risk a broad change to the
shared matcher, each subject now stores the canonical scope as arrays **and** keeps the original scalar fields as the
**first element of each array**. The scalars preserve the existing unique index, the legacy API shape and every existing
reader; the arrays are the source of truth compared in JavaScript via the new helpers in `Subject.model.ts`. All query
sites that need scope matching load the (small) subject collection once and filter in JS, which is equivalent in cost to
the store's own full scan.

- `departments: LocalId[]`, `semesters: number[]`, `academicYears: string[]`, `regulations: string[]` (required except
  regulations); mirrors `department`/`semester`/`academicYear`/`regulation`.
- New exported helpers: `subjectDepartments`, `subjectSemesters`, `subjectAcademicYears`, `subjectRegulations`,
  `normaliseSubjectScopes`, `subjectAppliesTo`, and `backfillSubjectScopes`.
- **Legacy migration:** idempotent `backfillSubjectScopes()` copies scalars into the arrays for any record missing them,
  invoked from `runMigrations()` after `syncIndexes()`. It is a no-op on a store whose subjects already have arrays.

**Files changed.**
- `backend/src/models/Subject.model.ts` — array scope fields + scalar mirrors; the four scope helpers + `backfillSubjectScopes`.
- `backend/src/database/migrate.ts` — call `backfillSubjectScopes()` at boot (logs the count when > 0).
- `backend/src/modules/subjects/subject.controller.ts` — `parseSubjectInput` accepts **both** the array shape
  (`departmentIds`/`semesters`/`academicYears`/`regulations`) **and** the legacy scalar shape (wrapped into 1-element
  arrays), validates ≥1 of each required field, de-duplicates, and normalises; new `findScopeConflict` rejects a
  same-code subject whose scope **overlaps** any (department, semester, academic-year) combo (409) while allowing a
  **disjoint** reuse of the code; `serialiseSubject` returns `departmentIds/departments[]/semesters/academicYears/
  regulations` **plus** the first-element mirrors; `getSubjects` filters by array membership in JS; `getSubjectMeta`
  unions academic years from subjects + batches and regulations from subjects; `computeSubjectUsage` sums marks/students
  across every (department, semester) combo; `loadDepartmentSubjects` matches any selected department/semester/year and
  is used, unscoped-safe, by the HOD list.
- `backend/src/modules/hod/hod.controller.ts` — `getSubjectsForClass` expands a catalogue subject that covers several
  semesters into **one option per applicable semester** (intersection with the class's semesters); regulation read via
  `subjectRegulations`.
- `backend/src/modules/hod/marks-bulk-upload.service.ts` — `resolveUploadSubject(deptId, code, semester, academicYear?)`
  now filters the department's catalogue in JS and matches code **and** the subject's `semesters` **and** (only when a
  year is supplied) its `academicYears`; `validateMarksExcel` passes its `academicYear`; `executeMarksImport` gains an
  optional `academicYear` (threaded from `req.body.academicYear`).
- `frontend/src/api/client.ts` — `SubjectRow` gains `departmentIds/departments[]/semesters/academicYears/regulations`
  (keep scalar mirrors); `SubjectInput` is now the multi-select shape.
- **New** `frontend/src/components/common/MultiSelect.tsx` — a reusable, accessible (ARIA combobox + multi-selectable
  listbox) multi-select: removable chips, search, select-all/clear-all, keyboard (arrows/Enter/Escape/Backspace/Tab),
  duplicate-proof, `creatable` mode (used for academic years + regulations) with a validator, drop-up placement when
  space is tight, and a `+N more` overflow.
- `frontend/src/pages/admin/AdminSubjectManagement.tsx` — the four scope fields are now `MultiSelect`s (departments and
  semesters fixed; academic years and regulations type-to-add); the form state/validation use arrays (≥1 required,
  YYYY-YYYY years); the table shows department chips plus comma-joined semesters/years/regulations; option vocabularies
  are built from `meta`.
- `frontend/src/styles/index.css` — the `.ms-*` MultiSelect design system (navy/gold) and `.subj-tag` table tags.
- `backend/src/tests/subject-management.test.ts` — 9 new checks (see below).
- `.runtime-verify/subjects/verify.mjs` — MultiSelect helpers (`msOpen/msPick/msType/msPickOrAdd/msChips/msRemoveChip/
  msError`) and 4 new UI checks.

**Backend verification — `npm run test:subject-management` → 26/26 PASS** (the 17 original checks still pass unchanged
on the multi-select engine, plus: create with several departments/semesters/academic-years/regulations and correct
first-element mirrors · overlapping duplicate rejected (409) **and** a disjoint same-code scope accepted (201) · empty
department / empty semester / malformed academic year all rejected 400 with nothing stored · edit preserves every
selection · removing a value narrows only that array · upload succeeds for a class the subject applies to (MS200, CSE
year-1 sem-1, imported `ia1=33`) · uploads for an incompatible **semester** (MS300 semester-3-only) and an incompatible
**department** (MS400 ECE-only, also absent from the CSE selector) are both refused · existing CS101 mark untouched
(`ia1=44`) · scope arrays present in `subjects.json` on disk).

**UI verification — `.runtime-verify/subjects/verify.mjs` → 16/16 PASS** in headless Chrome against a scratch store:
sidebar → header → empty state → add (chips render) → duplicate rejected → **multi-select create (2 departments,
Sem 3+4, two academic years) shown as chips and in the table** → **empty required selections blocked with inline
errors** → **edit pre-fills every chip and removing one narrows the saved selection** → edit → deactivate confirm →
reactivate → search → pagination (14 subjects → 10 + 4) → semester filter → **0 runtime exceptions**.

**Regression + build.** `test:security-hardening` 8/8 · `test:bulk-upload` 23/23 · `test:hod-class-management` 8/8 ·
`test:hod-scope` 33/33 · `test:internal-marks` 97/97 · `test:admin-routes` 8/8 · `test:admin-auth` 13/13 · backend
`tsc --noEmit` exit 0 · frontend `tsc --noEmit` exit 0 · `vite build` exit 0. Branch `temp`, uncommitted.

**Honest limitations.** (1) The store's matcher does **not** support membership on a top-level array field, so scope
matching is done in JavaScript after loading the subject collection — correct for the current full-scan local store, but
it is **not** an indexed query and would need revisiting before a real database. (2) Regulation is stored, displayed and
filterable but is **not** enforced during uploads, because `Student` carries no regulation field to compare against.
(3) The `MultiSelect` was exercised through the real page via CDP (open · pick · type-to-add · remove chip · required
errors), but its drag/touch gestures and screen-reader announcement order were not separately audited.



**Objective.** Make the **actually rendered** login page match the supplied reference **image**
(`A:\movies\ref.png`, 1696×927) as closely as possible — layout, typography, spacing, colours, panel
proportions and card — and correct every difference that can be established from the raster.

**Method.** This environment cannot *view* images, so the reference was analysed **numerically**:
`sharp` extracts raw pixels and custom scripts render ASCII luminance maps, threshold "band" scans,
and a `diff` heat-map of `ref.png` against a live capture. The live page is screenshotted through Chrome
headless with `--remote-debugging-port` and a **fractional `deviceScaleFactor`** (1488 CSS px @ 1.1398)
so the capture lands on the reference's exact pixel dimensions, and element geometry/computed styles are
read over CDP. Helper scripts live in `.runtime-verify/login-ref/` (analysis) and `.runtime-verify/login-v2/`
(`measure.mjs`, `lines.mjs`, `funcs.mjs`, `pwa-verify.mjs`, capture harness).

**What the reference measures.** Panel seam x≈1093. White card 482×777 at x1156 (≈14 px below the
viewport centre). Hero copy's left edge x≈64. The heading is **three display lines at ~47–48 px** (ink
height 34–35, pitch 52) with a **"WELCOME TO" kicker** above them — ink only ~13 px tall but 165 px wide,
i.e. ~44 % of the display size, not a fourth display line. Four feature rows whose title bands sit
**73 px** apart (block ≈255 px tall).

**Files changed.** `frontend/src/styles/index.css` — the login `.lg-*` block only:
- `.lg-page` grid `minmax(0,64fr) minmax(0,36fr)` → `minmax(0,64.5fr) minmax(0,35.5fr)`.
- `.lg-page` `--lg-gutter` `clamp(calc(var(--lg-u)*1.5), 3.2vw, calc(var(--lg-u)*3.25))` →
  `clamp(calc(var(--lg-u)*1.5), 3.7vw, calc(var(--lg-u)*3.45))`.
- `.lg-hero-title` `font-size` `clamp(1.42rem, 2.3vw, 1.95rem)` (33.6 px desktop) →
  `clamp(calc(var(--lg-u)*1.42), 2.8vw, calc(var(--lg-u)*2.6))` (≈47.4 px at the reference framing);
  `line-height` `1.2` → `1.1`.
- New `.lg-hero-line:first-child` (the kicker): `font-size: max(0.7rem, 0.44em)`, `line-height: 1.5`,
  `letter-spacing: 0.09em`, `margin-bottom: 0.62em`, `color: rgba(255,255,255,0.9)`. The `0.7rem` floor
  keeps it legible on the ≤1180/≤960/≤480 breakpoints where the display size is under ~28 px.
- `.lg-features` `gap` `clamp(calc(var(--lg-u)*0.8), 1.9vh, calc(var(--lg-u)*1.15))` →
  `clamp(calc(var(--lg-u)*0.8), 2.98vh, calc(var(--lg-u)*1.6))`.
No JSX/markup change; no new dependency. **Root cause of the headline mismatch:** the reference's heading
is a full step larger than the old rem cap allowed, and "WELCOME TO" is a kicker rather than a 4th display
line (ref/old width ratios: `DIGITAL` 1.35×, `MENTOR–MENTEE` 1.34×).

**Verification — the actual running app** (dev 3000 + real auth 5050), headless Chrome via CDP:
- **1696×927 framing:** panel x**1094** (ref 1093); card x**1156** (exact), y75, **479×776** (ref 482×777),
  centre Δ 0; crest x63 y44; heading ink bands kicker **y183–197** (ref 185–197), `DIGITAL` **y228–260**
  (225–260), `MENTOR–MENTEE` **y280–312** (277–312), `MANAGEMENT SYSTEM` **y333–365** (329–362) — within
  **4 px**; `titleFont 47.4032px`, `titleLh 52.1435px`; feature title bands **539/613/684/759** = pitch
  **74/71/75** (ref **517/591/664/739** = 74/73/75); feature block **254 px** (ref 255).
- **Responsive:** 1440/1024/768/390/320 → **no horizontal overflow**; card centred (Δ ≤1); at 768/390/320 the
  hero stacks to a banner, the lead paragraph and feature list are hidden as before, `docH` 1005/955/1010
  (vertical scroll, expected); the kicker's `0.7rem` floor engages at ≤1024.
- **Assets:** campus background resolves to `http://localhost:3000/assets/ksrce-campus-twilight.png` and
  loads (`campusResource.t` 2,580,328 B, 56 ms); logo `complete` naturalWidth 205.
- **Flows (unchanged behaviour):** password toggle `password → text → password` (`aria-pressed` true/false);
  wrong password → `Invalid username or password.` and stays on login; correct admin credentials → token
  stored + app shell + sidebar; **0 console errors / 0 exceptions** (only the expected 401 network log).
- **PWA:** `link[rel=manifest]` = `/manifest.json`; service worker registered (scope `http://localhost:3000/`);
  a **trusted** `Input.dispatchMouseEvent` click on `Download / Install KSRCE Web App` raises Chrome's native
  install prompt (deferredPrompt present) with **no exception and no `alert()`**. Note: a *JS* `.click()`
  is not a user gesture, so `prompt()` throws `NotAllowedError` — an artefact of the probe, not a page bug.
- **Static:** `npx tsc --noEmit` **exit 0** in `frontend` **and** `backend`; `npx vite build` **exit 0**
  (CSS 144.46 kB, gzip 25.69 kB).
- **Pixel diff** `ref.png` vs capture (48×26 grid, photo-dominated): mean abs diff **25.28 / 255** (was
  26.29 before this pass); the residual is the campus photograph and anti-aliasing, not structure.

**Known residuals (deliberate, not fixed).** (1) The reference's lead paragraph wraps to **2 lines**
(line-1 ink 491 px, line-2 238 px ≈ 90 chars); this component's copy is longer and wraps to **3**. That
copy came verbatim from the earlier written spec, so it was **left unchanged** rather than inventing text
— the consequence is that the hero feature list sits ~22 px and the bottom tagline ~24 px lower than the
reference (the body is ~31 px taller and the hero distributes with `space-between`). (2) The reference's
bottom tagline is inset further from the panel edge (ink y851 vs 876) and reads slightly larger; the inset
was left at the spec's value because raising it would push the headline ~16 px above the reference's
(which is the element the user asked to match). (3) The reference card sits ~14 px below the viewport
centre; the card here is exactly centred (`cardCenterDelta 0`) — the reference offset is likely a capture
artefact, so it was not hard-coded. All three are recorded here so they can be revisited if the copy or
the tagline inset is allowed to change.

**Preserved / untouched.** Auth API, payloads, field names, error strings, role redirects,
`useAuth`/token storage, password show/hide, PWA install flow, the campus asset, `.login-*`
(`ChangePasswordPage`), all other pages; no new dependency; no commit or push (branch `temp`).

### Login page — reference-match pass (64/36 · 420 px card · `OR` separator) — PASS (2026-10-15)

**Objective.** Match the written reference spec as closely as possible: two-panel desktop layout (~64 % campus hero /
~36 % navy login), ~420 px login card, `OR` separator before the PWA action, exact copy, cinematic campus photo.

**Reference-image finding.** `A:\movies\K.S.R.C.E. Campus at Twilight.png` is **byte-identical** to
`frontend/public/assets/ksrce-campus-twilight.png` (SHA-256 match, 2,580,028 B, 1672×941). The CSS already references it
as `/assets/ksrce-campus-twilight.png`, so the exact reference photograph was already present — nothing to copy, and no
duplicate created. A second asset, `assets/ksrce-campus-login.png`, is referenced by no source file (left untouched).

**Files changed.**
- `frontend/src/styles/index.css` (scoped `.lg-*` only):
  - `.lg-page` grid `minmax(0,62fr) minmax(0,38fr)` → `minmax(0,64fr) minmax(0,36fr)`.
  - `.lg-card` `max-width` `440px` → `420px`.
  - New `.lg-or-sep` / `.lg-or-line` / `.lg-or-text` (the `OR` rule).
  - Card rhythm: `.lg-card-head` margin-bottom `1.6rem`→`1.4rem`; `.lg-card-college` margin-top `0.9rem`→`0.8rem`;
    `.lg-card-divider` `margin:1rem 0 .8rem`→`0.85rem 0 0.7rem`; `.lg-card .form-group` `1.15rem`→`1.05rem`;
    `.lg-pwa-row` margin-top `1.15rem`→`0.9rem`; `.lg-foot` `margin-top:1.25rem;padding-top:1rem`→`1.05rem`/`0.9rem`.
- `frontend/src/pages/auth/LoginPage.tsx`: wrapped the conditional PWA block in `<>…</>`, adding
  `<div class="lg-or-sep">…OR…</div>` above the PWA button (rendered only when `!isInstalled`).

**Content:** already matched the spec verbatim (crest, heading lines + gold `MENTOR–MENTEE`, description, four features,
tagline, card header, labels/placeholders/required stars, submit + arrow, PWA button, footer). Remember-me and
forgot-password were **not** added (no real functionality exists — spec says add only if functional).

**Preserved (unchanged).** Auth API/payload/fields/errors, `useAuth`/session/token storage, role redirects, password
show/hide, PWA install, campus asset, all other pages; `.login-*` (`ChangePasswordPage`) untouched; no new dependency.

**Verification — actual running app (dev 3000 + real auth 5050), headless Chrome via CDP.**
- **1490×810 (reference):** split 954 / 536 = **64 / 36 %**; card **420×682** at (1012, 64), centre Δ 0, bottom margin
  64 px; hero left edge **x=48** for crest/heading/paragraph/features/tagline; gaps 88 / 28 / 29 / 88 px; heading 31.2 px
  (4 lines); lead 3 balanced lines (317/294/362); four 36×36 icon boxes at one x (titles x=98); no horizontal overflow
  (docH 810).
- **1440×900:** 922 / 518; card 420×681 centred. **1024×768:** 655 / 369; card 313×695 centred; gaps 106/28/26/106.
- **390×844 / 320×568:** stacked banner, card 355×665 / 285×715 centred; **no horizontal overflow**; vertical scroll
  (docH 958 / 1006).
- **Assets:** campus photo `200 image/png` 2,580,028 B, logo `200` naturalWidth 205; right panel has no extra decor.
- **Pixel (sharp):** hero region [72,69,70]; text-background luminance 33–47 with the bright image band right of the copy
  ~124; card samples all-white; panel corners navy; coverage navy 38.1 % / nearWhite 20.6 % / gold 0.9 %.
- **Flows:** password toggle password→text→password; wrong password → `Invalid username or password.`; correct
  (`Ksrce@admin` / `Ksrce@1234`) → token + app shell + sidebar; PWA button present. **0 console errors / 0 exceptions**
  (only the expected 401).
- `npx tsc --noEmit` **exit 0**; `npx vite build` **exit 0** (CSS 138.91 kB).
- **Honest limitation:** no image input in this environment, so the attached screenshot could **not** be viewed or
  pixel-diffed; the implementation was matched to the spec's stated text/dimensions and validated with computed styles,
  geometry and rendered-pixel statistics. Remaining uncertainty: exact crop/position and micro-spacing could not be
  confirmed against the raster reference.

### Login page — hero refinement (smaller headline · balanced lead · feature contrast) — PASS (2026-10-15)

**Objective.** Second, focused pass on the left hero only: reduce the headline slightly so it balances in the panel,
open the gap under it, make the lead copy wrap into balanced lines, tighten the feature-list contrast over the photo,
and keep the tagline clear of the list — with the right-side login card left essentially untouched.

**Files changed.** `frontend/src/styles/index.css` (scoped `.lg-*` block only):
- `.lg-hero-title` font-size `clamp(1.5rem,2.5vw,2.1rem)` → `clamp(1.42rem,2.3vw,1.95rem)` (33.6 → 31.2 px desktop).
- `.lg-hero-text` `margin-top` `clamp(1.4rem,2.8vh,1.9rem)` → `clamp(1.75rem,3.4vh,2.4rem)`; `max-width` `min(52ch,100%)` → `min(40ch,100%)`.
- `.lg-brand-body::before` scrim `radial-gradient(125% 105% at 0% 46%, rgba(6,27,54,.6) 0%, …0 70%)` → `radial-gradient(150% 125% at 0% 52%, rgba(6,27,54,.66) 0%, …0 74%)`.
- Tablet media (961–1180px): `.lg-hero-title` `clamp(1.35rem,2.15vw,1.85rem)` → `clamp(1.28rem,2vw,1.72rem)`; `.lg-hero-text` `max-width` `44ch` → `40ch`.
- `LoginPage.tsx` **not** touched in this pass (no markup/behaviour change).

**Why 40ch / three lines.** A width sweep (30–54ch) in the live page showed the wrap options; 38–40ch yields three
balanced lines (317/294/362 px, ~9 % spread) while 52ch yields two lines (496/482 px). Three balanced lines were chosen
to pair with the reduced headline and give the hero a deliberate, filled composition.

**Preserved (unchanged).** Login API/payload/fields/errors, `useAuth`/session/token storage, role redirects, password
show/hide, PWA install, the campus asset and every other page. Only `.lg-*` selectors changed; `.login-*`
(`ChangePasswordPage`) untouched; no new dependency; no credential hardcoded.

**Verification — actual running app (dev server 3000, real auth API 5050), headless Chrome via CDP.**
- `npx tsc --noEmit` **exit 0**; `npx vite build` **exit 0** (CSS 138.62 kB); campus photo `200 image/png` 2,580,028 B;
  logo `200 image/png` (naturalWidth 205).
- **1440×900:** headline 31.2 px, 4 lines, line-height 37.44 px; lead 3 lines (317/294/362) at 383.6 px; gaps
  crest→heading 130 / heading→paragraph 31 / paragraph→features 32 / features→tagline 129 px (all positive); four
  feature icons 36×36 at x=46 with titles at x=96; tagline y=851; card 440×670 centred (Δ 1 px); 62/38 split; no overflow.
- **1024×768:** headline 20.48 px (lh 24.58); lead 3 lines (292/271/334) at 353.3 px; gaps 106/28/26/106 px; icons 36×36
  at x=32, titles x=82; card 333×678 centred (Δ 0); no overflow.
- **390×844 / 320×568:** stacked banner 390×231 / 320×229, crest+headline+tagline all at x=18 (paragraph and feature
  list hidden ≤960 px by design); **no horizontal overflow**; vertical scroll where required (docH 944 / 992).
- **Contrast (sharp):** heading/paragraph/feature backgrounds luminance 37–54; bright image band right of the copy ~131
  (sunset preserved); feature row-gap backgrounds 36–54 vs busy right area 76; panel corners navy; card samples all-white;
  coverage navy 39.3 % / nearWhite 19.7 % / gold 0.6 %.
- **Gold line:** `MENTOR–MENTEE` text width 317 px in a 611 px box at 1440 (fits), no clipping or document overflow from
  280 → 1440 px.
- **Flows:** password toggle password→text→password; wrong password → `Invalid username or password.` staying on the form;
  correct login (`Ksrce@admin` / `Ksrce@1234`) → `ksrce_token` stored + app shell + sidebar; PWA install button present.
  **0 console errors, 0 exceptions** (only the expected 401 log).
- **Honest limitation:** screenshots could **not** be visually inspected in this environment (no image input) — results
  validated from computed styles, element geometry and rendered-pixel statistics.

### Login page — final UI polish (hero alignment · spacing · panel cleanup) — PASS (2026-10-15)

**Objective.** Keep the existing split-screen login but make it cleaner, better aligned, more readable and visually
balanced: one shared left content column for the hero, consistent spacing, a calmer campus crop, and a distraction-free
right panel — without touching authentication.

**Files changed.**
- `frontend/src/pages/auth/LoginPage.tsx` — wrapped the crest, hero copy, feature list and bottom tagline in a single
  `<div className="lg-brand-inner">` (one shared content column); removed the `<span className="lg-panel-decor">`
  element from the sign-in panel.
- `frontend/src/styles/index.css` (scoped `.lg-*` block only):
  - New `.lg-brand-inner` — `position: relative; z-index: 1; display: flex; flex-direction: column;
    justify-content: space-between; gap: var(--lg-stack); flex: 1 1 auto; min-width/height: 0`.
  - `.lg-brand` `background-position: center 44%` → `46% 42%` (tablet `46% 44%`, mobile `46% 56%`).
  - `.lg-brand-veil` left stop `0.84 → 0.72`, mid `0.6 → 0.46`, and the right stops lightened.
  - `.lg-hero-title` `line-height` `1.16 → 1.2`.
  - `.lg-hero-text` `margin-top` `clamp(1.15rem,2.2vh,1.6rem) → clamp(1.4rem,2.8vh,1.9rem)`.
  - `.lg-features` `margin-top` `clamp(1.4rem,3vh,2rem) → clamp(1.7rem,3.6vh,2.35rem)`; `gap`
    `clamp(.7rem,1.7vh,1rem) → clamp(.8rem,1.9vh,1.15rem)`.
  - Deleted `.lg-panel-decor`, `.lg-panel-decor::before` and `.lg-panel-decor::after`.

**Why the campus crop moved.** A `sharp` profile of `frontend/public/assets/ksrce-campus-twilight.png` (1672×941) gave a
per-column edge-energy + brightness profile: structural detail is strongest on the left/mid (x ≈ 0.1–0.4) and the warm
sunset cluster sits centre-right (x ≈ 0.4–0.8). At the desktop `cover` ratios the image is height-limited (only
horizontal position matters), so `46%` keeps both the building structure and the sunset in the visible window; the
vertical value is kept explicit for clarity.

**Preserved (unchanged).** `POST /api/auth/login`, request payload, field names, validation/error messages,
`useAuth`/session/token storage, role redirects, password show/hide, PWA install (`!isInstalled` + `promptInstall`), the
campus asset and every other role's page. Only `.lg-*` changed; the shared `.login-*` rules (`ChangePasswordPage`) are
untouched. No new dependency; no credential hardcoded.

**Verification — the actual running app (dev server 3000, real auth API 5050), headless Chrome via CDP.**
- Build: `npx tsc --noEmit` **exit 0**; `npx vite build` **exit 0** (CSS 138.62 kB); campus asset `200 image/png`
  **2,580,028 B**.
- Alignment (one shared left edge): crest / heading / paragraph / feature list / tagline all at **x=46** (1440×900),
  **x=32** (1024×768), **x=18** (390 / 320 stacked).
- Spacing (1440×900): crest→heading 140 px, **heading→paragraph 25 px** (was 17), **paragraph→features 33 px**
  (was 27), features→tagline 139 px; feature rows evenly spaced 57 px apart (rows at y 501/558/615/672).
- Heading: four lines all `33.6 px`, `line-height 40.32 px` (×1.2), weight 700, identical left x; `MENTOR–MENTEE`
  gold `rgb(245,189,53)` and `white-space: nowrap`.
- Feature list: all four icons **36×36** at the same x; every title/description at text-column x **96** (desktop) /
  **82** (tablet); gaps uniform; no overlap. Smallest measured feature gap 17.1 px.
- Right panel: `.lg-panel-decor` is gone (probe returns `null`); panel is just the gradient with `rgb(6,27,54)` base;
  card 440×670, **centred** (centre delta ≤ 1 px) with `intent` border `rgba(245,189,53,.42)`, radius 20 px.
- Responsive / overflow: 62/38 at 1440 (893/547) and 1024 (635/389); stacked ≤960 (brand 290 px at 768, 231 px at
  390, 229 px at 320; card 460/355/285 px wide, centred); **no horizontal overflow at 1440 / 1024 / 768 / 390 / 320**;
  vertical scroll where needed (docH 944 at 390×844, 992 at 320×568).
- Readability (sharp pixel stats): hero-region mean brightened (R 65 → 71) so the sunset is less washed out; the pure
  background behind the copy measured luminance **38–53** (white text keeps very high contrast) while the bright image
  band to the right of the copy measured luminance ~132 (sunset preserved).
- Flows: password toggle `password → text (aria-pressed true) → password (false)`; wrong password → alert
  `Invalid username or password.` staying on the form; correct login (`Ksrce@admin` / `Ksrce@1234`) → `ksrce_token`
  stored, login page gone, app shell + `.sidebar` present. **0 console errors, 0 exceptions** (only the expected 401
  log for the wrong-password attempt).
- Honest limitation: screenshots could **not** be visually inspected in this environment (no image input), so the
  visual result was validated from computed styles, element geometry and rendered-pixel statistics.

### Login page — right-panel premium navy + left-hero alignment fix — PASS (2026-10-15)

**Objective.** Follow-up to the split-screen redesign: make the right-hand navy area read as a deliberate premium panel
(not a flat translucent block) and give every left-hero block one consistent alignment/spacing system, verified in the
actual running app — without changing authentication.

**Files changed.**
- `frontend/src/pages/auth/LoginPage.tsx` — the whole `MENTOR–MENTEE` headline line is now wrapped as
  `<span className="lg-hero-line lg-hero-accent">` (previously only `MENTEE` was gold). The rest of the v2 markup
  (`.lg-page`, `.lg-brand`, `.lg-panel`, `.lg-card`, `.lg-features`, `.lg-brand-foot`) landed with the redesign entry
  below.
- `frontend/src/styles/index.css` (scoped `.lg-*` block only, ~lines 5928–6577) — `.lg-panel` now paints its own full
  deep-navy → midnight gradient (`162deg #0d2a4d → #0a2342 → #061b36 → #04101f`) with a radial top-right blue lift and a
  faint bottom-left gold bloom; `.lg-panel-decor` reduced to a single soft gold radial bloom (`::before`) plus a
  mask-faded dot grid (`::after`) — the oversized circles / hard borders are gone; `.lg-card` border
  `rgba(245,189,53,.42)`, radius 20 px, layered navy shadow; `.lg-hero-title-v2` four explicit `.lg-hero-line` blocks on
  a shared left edge with one `line-height: 1.16`; `.lg-hero-accent` gold + `white-space: nowrap`; paragraph
  `max-width: min(52ch,100%)`; `.lg-feature-icon` fixed 36×36 with a fixed `0.9rem` gap and one text column;
  `.lg-brand-foot` tagline bottom-left; `min-height: 100dvh`, safe-area padding and `overflow-x: clip` on `.lg-page`;
  one-column stack ≤960px.

**Preserved (unchanged).** `POST /api/auth/login` endpoint, request payload, field names, validation and error
messages, `useAuth`/session/token storage, role redirects, password show/hide toggle, PWA install
(`!isInstalled` + `promptInstall`), the `/assets/ksrce-campus-twilight.png` hero asset, and every other role's
dashboard. Only the `.lg-*` family changed; the shared `.login-*` rules (reused by `ChangePasswordPage`) are untouched.
No new dependency; no credential hardcoded.

**Verification — the actual running app (dev server 3000, real auth API 5050), headless Chrome via CDP.**
- Build: `npx tsc --noEmit` **exit 0**; `npx vite build` **exit 0** (CSS 139.08 kB).
- Right panel: computed `background-color: rgb(6, 27, 54)` with the gradient image; corner samples navy
  `rgb(13,42,77)` / `rgb(32,62,90)` / `rgb(4,16,31)` (top-left / bottom-left / bottom-right), i.e. a real depth ramp,
  not a flat or transparent fill.
- Card: 440 × 670 px, centre **exactly** the panel centre at 1440 (x 946–1386, y 115–785); interior samples all
  `rgb(255,255,255)`; never overlaps the navy/gold divider.
- Split / overflow: **62 % / 38 %** at 1440 and 1024 (brand 893 px / panel 547 px at 1440);
  `scrollWidth === clientWidth` (no horizontal overflow) at 1440 / 1024 / 768 / 390 / 320.
- Left hero: `MENTOR–MENTEE` computed `rgb(245, 189, 53)`; all four headline lines share one left x and one
  `line-height` (38.98 px at 33.6 px); heading→paragraph gap 20 px; all four feature icons exactly 36 × 36 px with a
  consistent text x; `EMPOWERING FUTURE ENGINEERS` tagline bottom-left.
- Flows: password toggle `password → text`; wrong password → alert `Invalid username or password.` staying on the
  form; correct login (`Ksrce@admin` / `Ksrce@1234`) → token stored, login page gone, app shell + `.sidebar` present;
  real API **401** (wrong) / **200 role ADMIN + token** (correct); **0 console errors/exceptions**.
- Honest limitation: screenshots could **not** be visually inspected in this environment (no image input), so the
  visual result was validated from computed styles, element geometry and rendered-pixel statistics, not by eye.

### Login page — premium redesign aligned to the latest navy/gold reference — PASS (2026-10-14)

**Objective.** Refine the existing premium login page to match the latest navy/gold reference **without** touching
authentication: a campus-photo hero on the left (≈62 %) with branding, title, description, a four-item icon feature list
and the `EMPOWERING FUTURE ENGINEERS` footer, beside a ≈38 % navy panel holding a white, gold-bordered sign-in card.

**Files changed.**
- `frontend/src/pages/auth/LoginPage.tsx` — each `FEATURE_HIGHLIGHTS` entry gained a `description`; the feature list now
  renders icon + title + description; a `<span className="lg-panel-decor" aria-hidden="true" />` was added inside the
  sign-in panel.
- `frontend/src/styles/index.css` (scoped `.lg-*` block only) — `flex: 1 1 62%` (`.lg-brand`) / `38%` (`.lg-panel`);
  `.lg-hero-title` now `text-transform: uppercase` with letter-spacing and an adjusted clamp/max-width; `.lg-title`
  (`Welcome Back`) is uppercase; new `.lg-feature-text` / `.lg-feature-desc` styles and a larger `.lg-feature-icon`;
  new `.lg-panel-decor::before/::after` gold arcs (`rgba(245,189,53,.11)` / `.07`) inside a clipped layer; and
  `.lg-card { z-index: 1 }` so the card sits above the decorations while its shadow stays unclipped.

**Preserved (unchanged).** Login API endpoint + request payload, `useAuth` login, session/token storage
(`ksrce_token`), role redirects, validation/error messages, password show/hide, button loading/disabled states, PWA
manifest/service worker/install (still gated by the existing `!isInstalled` + `promptInstall` workflow), and all other
role dashboards. No non-`.lg-*` (shared) style changed; the `.login-*` rules reused by `ChangePasswordPage` are
untouched; no dependency added; no credential hardcoded.

**Verification — the actual running app (dev server 3000, real auth API 5050), driven in headless Chrome via CDP.**
- Build: `tsc && vite build` **exit 0** (CSS bundle 140.04 kB).
- Layout: brand **62 %** / panel **38 %** at 1440 and 1024; stacked banner + form at 390;
  **no horizontal overflow** (`scrollWidth === clientWidth`) at 1440 / 1024 / 390.
- Design: `.lg-hero-title` computed `text-transform: uppercase` (35.2 px desktop / 23.55 px tablet / 20.48 px mobile)
  with the `Mentor–Mentee` span gold `rgb(245, 189, 53)`; `.lg-title` (`Welcome Back`) uppercase; **4** feature rows
  each with icon + title + description; card border `1px rgba(245,189,53,.32)` and radius 20 px; primary button navy
  gradient `linear-gradient(135deg, #13315c, #071526)` with a gold border and a right-arrow icon.
- Campus image: `/assets/ksrce-campus-login.png` loaded with natural size **1 672 × 941**; the left panel's rendered
  pixels have mean luminance ≈ **66–77** (std-dev ≈ 29–47) and the building band only ≈ **3.7 %** near-black pixels —
  i.e. clearly visible, not over-darkened.
- Flows: password toggle `password → text (aria-pressed true) → password`; invalid login → alert
  `Invalid username or password.` while staying on the form; valid login (`Ksrce@admin`) → `ksrce_token` stored and the
  dashboard renders. **0 console errors** across the whole run.
- Honest limitation: the captured screenshots could **not** be visually inspected in this environment (no image input),
  so the visual result was validated from computed styles, layout metrics and rendered-pixel statistics — not by eye.

### Grammar engine — broad vocabulary, modular rules, optional local model — PASS (2026-10-13)

**Objective.** Scale the writing-assistant backend from the small curated dataset to a modular, broad-coverage
deterministic engine backed by a large **licensed** vocabulary, with the pipeline *normalise → protect official values
→ reliable spelling/vocabulary → ordered grammar rules → broader context engine when configured → validate/reject
unsafe output → return the original when unreliable*. No fabricated/duplicate word list; keep the existing UI,
RBAC, API contract and local JSON storage exactly as they were; measure memory and latency; evaluate a local model
honestly.

**Architecture (new + changed files).**
- `backend/src/modules/grammar/vocabulary/morphology.ts` — hand-written English morphology (irregular verbs/plurals,
  final-consonant doubling, `thirdPerson`/`pastTense`/`pastParticiple`/`presentParticiple`/`pluralize`,
  `VERB_LEMMAS`, the reverse-lookup `FORM_TO_BASE` that drops ambiguous forms, and `PAST_FORMS`/`isPastForm`).
  Pure data + pure functions, no I/O, not derived from any word list.
- `backend/src/modules/grammar/vocabulary/domain-vocabulary.ts` — curated *safe* closed sets (`DOMAIN_WORDS`,
  `COUNT_NOUNS`, `PLURAL_DETERMINERS`, `SINGULAR_SUBJECTS`, `PLURAL_SUBJECTS`, `AGREEMENT_VERBS`,
  `PROGRESSIVE_VERBS`, article exceptions).
- `backend/src/modules/grammar/vocabulary/lexicon.ts` — lazy, cached (loaded once per process) dictionary +
  frequency layer with `isKnownWord`, `suggestSpelling`, `getLexiconStats`, `warmUpLexicon`.
- `backend/src/modules/grammar/grammar.rules.ts` — ordered, reusable rules (see list below).
- `backend/src/modules/grammar/grammar.spelling.ts` — conservative, dictionary-gated typo correction.
- `backend/src/modules/grammar/grammar.context.ts` — optional Ollama adapter (OFF by default).
- `backend/src/modules/grammar/grammar.service.ts` — pipeline wiring; `ai-assistant.service.ts` — optional local-model
  branch before the deterministic engine, keeping exactly the five response keys
  (`corrected,hasCorrections,original,source,status`).
- `backend/src/index.ts` — one-time lexicon warm-up at boot (logged; non-fatal when the data is absent).
- `backend/scripts/copy-grammar-data.cjs` + `postbuild` script — copy the data into `dist/` so a production build works.
- Tests: `backend/src/tests/grammar-coverage.test.ts`, `grammar-context.test.ts`, `grammar-bench.ts`.

**Vocabulary and licences (documented in `vocabulary/data/SOURCES.md`).**
- `words_alpha.txt` — `dwyl/english-words`, **The Unlicense** (public domain). 4,234,910 B; SHA-256
  `3ED0C946…2DA48`. Loaded into a `Set`; **370,103** entries at runtime (a tiny `NON_WORD_ENTRIES` override removes
  `untill`, `tommorrow`, `enviroment` so the modern spelling can be offered; nothing on disk is edited).
- `en_50k.txt` — `hermitdave/FrequencyWords` `content/2018/en/en_50k.txt`, **MIT**. 622,749 B; SHA-256 `5351FF40…FB458`.
  Loaded into a `Map`; **50,000** ranked words. Only aggregate word frequencies are used.
- `first20hours/google-10000-english` was evaluated and **rejected** (unclear/unattributed licence).
- The load is a one-time synchronous read (`~614 ms`) cached for the whole process — **no per-request disk access and
  no repeated parsing**, and no 500M-entry file/DB.

**Rules the deterministic engine now applies (only when every word involved is in a curated set).**
subject–verb agreement (singular *and* plural, with an `of`-guard so `one of the students has` is never re-agreed);
`be`/`have`/`do` closed-class forms (`they is → are`, `he have → has`, `she do not → does not`); verb form after
modal/`to`/do-auxiliary (`to submitted → to submit`); present perfect (`has go → has gone`, `have wrote → have written`);
progressive (`is go → is going`); a missing `did` (`student not submitted → The student did not submit`); missing-verb
fragments (`student not attending class regularly → The student is not attending classes regularly.`); `there is/are`;
quantifier and partitive plurals (`many student → many students`, `none of the student → none of the students`);
`a`/`an`; adjective + preposition collocations (`depend of → depend on`, `good in → good at`, `suffer with → suffer
from`, `listen music → listen to music`, `inspite of → in spite of`, …); doubled words; capitalisation and terminal
punctuation.

**Safe handling.** Names, register numbers, subject codes (e.g. `24ITT36`), marks, CGPA/SGPA, percentages, dates and
IDs are protected by the existing `preservesProtectedValues` guard and can never be matched by the letter/boundary
rules. Curated domain terms (`mentee(s)`, `cgpa`, `nptel`, `hackathon`, `viva`, …) are whitelisted so the dictionary
never "corrects" them. Ambiguous verb forms (`read`, `put`, `found`) and stative/adjective `-ing` words are never
rewritten.

**Optional local model (OFF by default — no model is installed on this machine).**
- Enable with `GRAMMAR_LOCAL_MODEL=true` (also `1`/`on`/`yes`); endpoint/model/timeout via the shared
  `OLLAMA_BASE_URL` / `OLLAMA_MODEL` / `OLLAMA_TIMEOUT_MS` (defaults `http://127.0.0.1:11434`, `qwen3:8b`, 60 s).
- Setup: install Ollama, run `ollama serve`, then `ollama pull qwen3:8b` (or any model and set `OLLAMA_MODEL`), then
  start the backend with `GRAMMAR_LOCAL_MODEL=true`. Hardware here: 16 GB RAM, 12 logical CPUs, no usable GPU info —
  a 7–8B quantised model is feasible on CPU but slow; this path is optional and never required.
- Any failure (disabled, unreachable, timeout, HTTP error, malformed, empty, unchanged output, or output that drops an
  official value) silently falls back to the deterministic engine, and the model is never claimed to be running.

**Benchmarks (`npm --prefix backend run bench:grammar`; Windows, Node v24.15.0, 16 GB RAM, 12 logical CPUs).**
- Lexicon one-time load: **614 ms**, **~49.5 MB** heap; dictionary **370,103** words, ranked **50,000**; loaded once
  (repeated access reports identical `loadMs`/counts).
- Throughput: **5,000 mixed sentences in 1,411 ms ≈ 3,544 corrections/s (≈0.28 ms/call)**.
- Latency: short sentence avg 0.35 ms / p95 0.78 ms; **2,498-char paragraph** avg 3.0 ms / p95 4.6 ms.
- Heap after the runs: **~72 MB**.

**Verification (real counts).**
- `test:grammar-coverage` — **1084/1084** (hundreds of *varied* cases: agreement, be/have/do, verb form, perfect,
  progressive, fragments, `there is/are`, quantifier/partitive plurals, a/an, collocations, spelling, capitalisation,
  official values, already-correct text, unknown/ambiguous text, determinism + well-formedness invariants).
- `test:grammar-context` — **35/35** against a real mock Ollama HTTP server (off-by-default sends no request; enabled +
  valid is used; unchanged / value-dropping / commentary / HTTP 500 / malformed / empty / timeout / unreachable all fall
  back to the deterministic engine; no model name or URL leaks).
- Regressions: `test:grammar-api` **63/63** (real `src/index.ts` boot + real HTTP), `test:grammar-dataset` **85/85**,
  `test:grammar-safety` **45/45**, `test:grammar` green. `npx tsc --noEmit` and `npm run build` (tsc + `postbuild`
  data copy) exit 0.
- Corpus checks are the honest scope: the deterministic engine is **not** a language model and no universal-correction
  claim is made from unit tests alone.

**Known limitations (documented, not hidden).**
- Missing copula (`he able to solve`, `the student good in maths`) is left alone (only the preposition is fixed in the
  latter) — there is no reliable safe rule for inserting `is/are` before an adjective.
- A genuinely unknown token one edit from a common word can be "corrected" (`qubit → quit` is blocked because short
  words are skipped, but this class of false positive cannot be fully eliminated by edit distance alone); distance-2
  suggestions were removed entirely because they turned coinages (`xyzzy → dizzy`) into wrong corrections.
- `capable to` was deliberately dropped (it produced ungrammatical `capable of do`).
- Generic `want/need + noun` and reduced relatives are intentionally untouched to avoid changing meaning.
- Some inputs close to a curated sentence return `AMBIGUOUS_INPUT` (original returned) rather than applying a rule.

**Files:** `backend/src/modules/grammar/` (`grammar.rules.ts`, `grammar.spelling.ts`, `grammar.context.ts`,
`grammar.service.ts`, `vocabulary/*`), `backend/src/modules/counselling/ai-assistant.service.ts`,
`backend/src/index.ts`, `backend/scripts/copy-grammar-data.cjs`, `backend/src/tests/grammar-coverage.test.ts`,
`backend/src/tests/grammar-context.test.ts`, `backend/src/tests/grammar-bench.ts`, `backend/package.json`. Branch
`temp`, uncommitted — **no commit/push**.

### Grammar engine — missing-auxiliary repair covers "coming" (`he not coming tomorrow`) — PASS (2026-10-13)

**Reported.** From the running Mentoring form: `he not coming tomorrow` produced `He not coming tomorrow.` — only
capitalised and punctuated, with the required auxiliary missing. Expected `He is not coming tomorrow.`

**Root cause.** The missing-auxiliary repair is intentionally curated/list-gated: `fixMissingAuxiliaryVerbs` matches
only a curated subject, an optional `not`, a curated participle (`MISSING_AUX_GERUNDS`) and the clause tail, and only
at a sentence start. `coming` was **not** in `MISSING_AUX_GERUNDS`, so `he not coming tomorrow` / `student not coming
tomorrow` never matched and fell through to the mechanical capitalisation + terminal-punctuation step. The rule
ordering in `grammar.service.ts` (word corrections → `fixMissingAuxiliaryVerbs` → `PHRASE_RULES` →
capitalisation/punctuation) was already correct.

**Fix.**
- `backend/src/modules/grammar/grammar.dataset.ts` — added `coming` to `MISSING_AUX_GERUNDS` together with a curated
  group of other unambiguous action participles (`going`, `talking`, `asking`, `telling`, `bringing`, `waiting`,
  `looking`, `watching`, `visiting`, `leaving`, `arriving`, `sending`, `eating`, `drinking`, `walking`, `sitting`,
  `standing`, `wearing`, `paying`). Noun/adjective `-ing` words (morning, evening, meeting, building, ceiling,
  something, …) remain deliberately excluded, so the rule stays safe and list-gated.
- `backend/src/modules/grammar/grammar.structure.ts` — the optional object-plural normalisation
  (`MISSING_AUX_OBJECT_PLURALS`) now runs only when the clause continues past the bare object. A bare, clause-final
  object is left exactly as typed (`she not attending class` → `She is not attending class.`), while a continued clause
  keeps the previously verified behaviour (`student not attending class regularly` → `The student is not attending
  classes regularly.`). This satisfies the new examples without regressing the earlier pluralisation.

**Results (real).**
- `he not coming tomorrow` → `He is not coming tomorrow.` (`RULES_APPLIED`)
- `student not coming tomorrow` → `The student is not coming tomorrow.`
- `she not attending class` → `She is not attending class.`
- `they not submitting assignments` → `They are not submitting assignments.`
- `He is not coming tomorrow.` → unchanged (`NO_RELIABLE_CORRECTION`)
- Reduced relatives (`Students coming late should report to the mentor.`) still untouched; protected values are never
  touched (the repair copies the tail verbatim).

**Verification.**
- Added regression cases to `backend/src/tests/dataset-grammar.test.ts` (singular/plural subjects, existing
  auxiliaries, reduced-relative/ambiguous clauses, punctuation variants) — suite **85/85**.
- Added the exact failing input, the sibling examples and an already-correct clause to
  `backend/src/tests/grammar-api.test.ts`, driven over the real `src/index.ts` boot as a real mentor — suite
  **63/63**.
- `test:grammar-safety` **45/45**; `test:grammar` green; backend `tsc` exit 0; frontend `tsc && vite build` exit 0.
- **Live running server** (through the frontend dev proxy, the same `/api/mentor/grammar-check` route
  `GrammarAssistField` calls): `he not coming tomorrow` → **He is not coming tomorrow.**, plus the four sibling cases
  as above; the already-correct clause returns unchanged.

**Files:** `backend/src/modules/grammar/grammar.dataset.ts`, `backend/src/modules/grammar/grammar.structure.ts`,
`backend/src/tests/dataset-grammar.test.ts`, `backend/src/tests/grammar-api.test.ts`. Branch `temp`, uncommitted.

### Login page — premium polish pass (campus visibility, card, form, responsive) — PASS (2026-10-13)

**Objective.** Refine the existing navy-and-gold login page (`frontend/src/pages/auth/LoginPage.tsx` + its scoped
`.lg-*` block in `frontend/src/styles/index.css`) into a more polished, premium institutional sign-in **in place** —
no rebuild, no new dependency, and no change to authentication, routing, PWA behaviour, storage or any other role's
dashboard.

**Inspection.** Read `PROJECT_PROGRESS.md`; inspected `LoginPage.tsx`, the whole `.lg-*` CSS block, the global
`.btn`/`.form-control`/`.form-label` tokens, `vite.config.ts` (dev port `3000`, `/api` → `localhost:5050`) and
`PwaContext`; confirmed there is **no** Remember-Me / Forgot-Password control on the login page (so none was
invented); verified the live dev servers were up (frontend `3000` → 200, backend `5050 /api/health` →
`{"status":"ok","database":"connected"}`). Every pre-existing uncommitted change was preserved.

**Changes (all inside the scoped `.lg-*` block; `.login-*` untouched).**
- **Campus visibility:** replaced the very heavy veil (left `0.97`/`0.9`, vertical `0.72→0.88`) with a *localised*
  radial scrim behind the copy (max `0.6`) plus lighter diagonal/vertical washes (`0.78→0.3`, `0.55→0.68`), so the
  building/entrance stay clearly recognisable. Text readability is preserved by stronger, tighter `text-shadow` on the
  hero title/copy/crest. Crop tuned to `object-position: center 42%` (desktop and mobile); the image file and its URL
  are unchanged (`/assets/ksrce-campus-login.png`, still 2 728 283 B).
- **Branding/crest:** badge 54→52 px with a 15 px radius and softer gold border; college name 0.95→1.0 rem; sub-line in
  `--lg-gold-soft` with its own shadow; column left-aligned for a cleaner lock-up with the badge.
- **Typography:** hero title `clamp(1.65rem, 2.9vw, 2.45rem)`, `line-height 1.17`, `max-width 21ch`, near-white;
  supporting copy to `rgba(233, 239, 247, 0.95)` at `1.72`.
- **Card:** padding `2.4 / 2.15 / 1.8 rem`, `max-width 440px`, radius 20 px, softer `rgba(245,189,53,0.32)` border and
  a three-layer shadow (incl. a 1 px inset highlight); header rhythm retimed (divider, `Welcome Back` 1.5 rem,
  sub `1.55`).
- **Fields:** `min-height 50px`, `0.72rem` padding, a gold `3px rgba(245,189,53,0.28)` focus ring over a navy border
  covering **both** `:focus` and `:focus-visible`; label gap `0.42rem`; the password toggle now has a real **38×38**
  target (`right: 0.4rem`) with hover/active/focus-visible states (visibility logic unchanged).
- **Sign In:** `min-height 52px` navy gradient with an inset highlight, brighter hover + lift, a gold focus ring, and
  explicit `disabled` / `btn-loading` states (cursor, full opacity, spinner re-centred) — the global `.btn-loading`
  spinner is reused, no new dependency.
- **PWA button:** kept clearly secondary (gold glyph, softer `rgba(245,189,53,0.55)` border, quieter hover) but still
  a full-height (≥44 px) accessible target.
- **Decoration:** grid opacity `0.65→0.4` (24 px pitch); arcs softened (`0.18→0.13` / `0.1→0.07`).
- **Responsive/overflow:** compact banner (`min-height 208px`, `184px` at ≤480) with a lighter mobile veil and the
  hero body/supporting text/features hidden on phones; panel padding tightened; the card is `max-width 460px` on
  stacked tablets and **`100%` (full width) at ≤480**; `overflow-x: hidden` retained on `.lg-page`; added `aria-busy`
  to the submit button.

**Unchanged / preserved.** `useAuth().login`, the `POST /api/auth/login` request shape, error handling, role-based
redirects (`AuthContext`/`App.tsx`), show/hide password, the `PwaContext` install workflow, local JSON storage and
every non-login screen. No credential is hardcoded and backend authentication is untouched.

**Verification (actual results, live).**
- Live dev server `http://localhost:3000/` → **200** (`text/html`); `/assets/ksrce-campus-login.png` → **200
  `image/png`, 2 728 283 B** (byte-identical to the source); `/ksrce-logo.png` → **200 `image/png`**.
- The running dev server serves the updated stylesheet — the new rules (card shadow, `min-height: 50px`, `btn-loading`
  re-centring) are present in the served CSS module (219 032 B).
- Real auth over the dev proxy: `POST /api/auth/login` `Ksrce@admin` → **200** (`success`, `data.user.role = ADMIN`,
  `data.token` present); a wrong password → **401**. Authentication is neither weakened nor modified.
- Frontend `tsc && vite build` → **exit 0** (1 684 modules; CSS 139.30 kB / gzip 24.72 kB). No backend suite needed
  re-running (no backend file was touched), but the login path is exercised end-to-end above.

**Honest limitation.** No browser-automation tool is available in this environment, so the desktop/tablet/mobile
**visual** layouts were validated by the scoped CSS breakpoints (`>1180` two-column; `961–1180` two-column, tightened;
`≤960` stacked banner + card; `≤480` compact banner + full-width card) plus the successful compile — not by rendered
screenshots. (The prior pass's headless-Chrome screenshots cover the pre-polish layout.)

**Files:** `frontend/src/pages/auth/LoginPage.tsx` (one `aria-busy` attribute), `frontend/src/styles/index.css`
(the `.lg-*` block only). Branch `temp`, uncommitted.

### Grammar engine — missing-verb fragment repair ("student not attending class regularly") — PASS (2026-10-13)

**Reported.** The writing assistant returned only a cosmetic change for fragmentary clauses. Input
`student not attending class regularly` produced `Student not attending class regularly.` — capitalised and
punctuated but still missing the subject article and the auxiliary verb. Expected correction:
`The student is not attending classes regularly.`

**Root cause.** The deterministic pipeline only contained word/phrase substitution rules. No rule understood the
shape *subject + `not` + participle* (`student not attending class regularly`, `he not attending classes regularly`,
`she not submitting assignments`) or *subject + participle* (`student facing difficulty in mathematics`), so the
clause fell through to the mechanical capitalisation + terminal-punctuation step — the only "correction" possible.
The exact/approximate dataset paths did not cover it either: there is no curated entry for it, and no
`allowApproximate` entry was close enough to accept.

**Fix.** New ordered structural step `backend/src/modules/grammar/grammar.structure.ts`
(`fixMissingAuxiliaryVerbs`), invoked from `grammar.service.ts` **after** word corrections and **before** the
ordered phrase rules (so pluralisation/spacing still run over the rebuilt clause):
- Matches only at a **sentence start** (string start or just after `.!?`), an optional `the`, a **curated subject**
  (`student/students/mentee/mentees/he/she/it/they/we`), an optional `not`, a **curated participle**, and the rest of
  the clause. The participle list is explicit (`MISSING_AUX_GERUNDS`) precisely so noun/adjective `-ing` words
  (during, morning, building, ceiling, …) can never be mistaken for verbs.
- Inserts the correct article and auxiliary (`The student is …`, `He is …`, `They are …`) and copies the remainder of
  the clause through byte-for-byte, so names, codes, marks and dates survive verbatim.
- A small **curated set of singular count objects** is pluralised only inside a clause that was actually rebuilt
  (`attending class → attending classes`, `submitting assignment → submitting assignments`), so an already-correct
  `attending class` is never reworded just for style.
- **Safety guard:** if any curated finite verb / auxiliary / modal (`FINITE_VERB_MARKERS`) appears after the
  participle, the clause is a reduced relative (`Students facing difficulty should approach the mentor.`) and is left
  completely untouched. A subject already followed by an auxiliary (`student is attending …`) never matches.

**Tests.** `backend/src/tests/dataset-grammar.test.ts` gained a "Missing auxiliary verb (fragment) repair" section:
the four required patterns, plural-subject `are`, the fragment reported as a structural change, already-correct
clauses unchanged, the reduced-relative guard, official values after the participle preserved, and dataset-integrity
checks for the new curated lists. `grammar-api.test.ts` gained a full-stack case posting the exact screenshot input to
`POST /api/mentor/grammar-check`.

**Verification (actual results).** `test:grammar-dataset` **73/73 PASS**; `test:grammar-safety` **45/45 PASS**;
`test:grammar-api` (real `src/index.ts` boot) **54/54 PASS**; `test:grammar` all engine cases PASS; backend
`tsc --noEmit` exit 0; frontend `tsc --noEmit` and `vite build` exit 0. **Live verification:** the `test:grammar-api`
run boots the real production entrypoint, logs in as a real mentor and issues the exact request the form makes
(`POST /api/mentor/grammar-check { text: "student not attending class regularly" }`); it now returns
`corrected = "The student is not attending classes regularly."`, `status = RULES_APPLIED`, `hasCorrections = true`,
and nothing is persisted until the user clicks Apply Correction. The Inline Writing Assistant card shows **Original**
and **Corrected Version** with **Apply Correction** / **Keep Original** before any change is written.

**Limitations (not regressions).** Coverage is curated: the subject list, participle list and singular-object
pluralisation list are explicit and extensible, not open-ended. An input that is close to a curated sentence but below
the approximate threshold (e.g. `student not attending class regularly because of health issue`, close to the curated
`she is not attending the class regularly because of health issue`) is still reported `AMBIGUOUS_INPUT` and returned
unchanged — the conservative pre-existing behaviour. It must never be "completed" with synthetic data.

### Dataset-based grammar engine — deterministic, conservative, extensible (no external AI required) — PASS (2026-10-13)

**What it was.** The writing assistant's correction engine lived as one inline `runRuleBasedGrammarEngine`
function plus duplicated protected-value code inside `ai-assistant.service.ts`. There was no explicit dataset, no
similarity gating, and no machine-readable statement of *why* a suggestion was or was not produced, which made
"is this text correct?" hard to answer honestly and the rule set hard to extend.

**Design.** A new module folder `backend/src/modules/grammar/` was added; the feature is deliberately
**dataset-based and not a language model**, and it does not claim completeness:
- `grammar.dataset.ts` — `EXACT_CORRECTIONS` (curated whole sentences, each with a stored correct form), an
  extensible `WORD_CORRECTIONS` misspelling/proper-noun dictionary, and ordered `PHRASE_RULES` for subject–verb
  agreement, articles, prepositions, frequent sentence-structure errors and contraction punctuation. Thresholds
  (`APPROX_MATCH_THRESHOLD = 0.9`, `AMBIGUOUS_THRESHOLD = 0.7`, `APPROX_TOPIC_FLOOR = 0.5`) and confidences live here.
- `grammar.normalize.ts` — `normalizeForMatching` (case/whitespace/quote/dash/trailing-punctuation folding used for
  **matching only**, never as output), `tokenize` / `contentTokens` (stop-word filtered), `tokenSetSimilarity`,
  `levenshtein`, `similarityRatio`.
- `protected-values.ts` — `extractProtectedValues` / `preservesProtectedValues` / `isOfficialToken`, the single guard
  shared by the dataset engine and the optional external-LLM path.
- `grammar.service.ts` — `correctText(text)` orchestrator returning
  `{original, corrected, hasCorrections, status, confidence, notes}`.

**Pipeline (order matters).** 1) exact curated match after safe normalisation; 2) approximate match — only for
curated entries flagged `allowApproximate`, only at ≥ 0.9 token similarity and only when the curated pair itself keeps
the same topic (≥ `APPROX_TOPIC_FLOOR`); 3) curated word dictionary (boundary-matched, official-code tokens skipped);
4) ordered phrase rules (contraction spelling before subject–verb rules; the full structural rewrite before the
sub-rules it subsumes; spacing last); 5) safe capitalisation + terminal punctuation. If nothing reliable changes the
text it is returned **verbatim**.

**Status contract** — `GrammarStatus` is now part of the API response: `EXACT_MATCH | APPROXIMATE_MATCH |
RULES_APPLIED` (a reliable correction was produced), `NO_RELIABLE_CORRECTION` (nothing changed), `AMBIGUOUS_INPUT`
(close to a curated correction but not safe to apply — the text is kept exactly as typed), and `EXTERNAL_AI` (only when
an operator has configured `AI_API_KEY`; the external path and its protected-value guard are preserved).

**Meaning preservation.** No similar sentence is ever substituted when meaning may differ; official values are checked
before any whole-sentence suggestion is accepted; a corpus heuristic (short all-caps tokens treated as possible codes)
keeps the dataset path conservative on shouted text while the case-insensitive rules still run.

**Wiring.** `ai-assistant.service.ts` now delegates to `correctText` and re-exports the protected-value helpers, so its
public surface is unchanged; `counselling.controller.ts` returns `status` in both the blank and normal responses; the
frontend `checkGrammar` type and `GrammarAssistField.tsx` show a status-driven message ("No reliable correction found" /
"Text is ambiguous — kept exactly as you typed it") instead of a false "no issues". The field still replaces the text
**only after the user clicks Apply Correction**.

**Tests.** New `backend/src/tests/dataset-grammar.test.ts` (`npm run test:grammar-dataset`) covers every curated exact
pair, case/whitespace/punctuation tolerance, the approximate threshold, ambiguous input being returned unchanged, a
clean sentence reporting `NO_RELIABLE_CORRECTION`, blank input, punctuation, capitalisation, spelling/SVA/articles/
prepositions, meaning preservation (names/register numbers/subject codes/CGPA/dates survive; no number or fact
invented; an attendance sentence is never rewritten into a communication sentence), determinism and dataset integrity
(unique keys, same-topic approximate pairs, no identity word mappings).

**Verification (actual results).** `test:grammar-dataset` **59/59 PASS**; `test:grammar-safety` **45/45 PASS**;
`test:grammar-api` (real `src/index.ts` boot) **49/49 PASS**; `test:grammar` all engine cases PASS; backend
`tsc --noEmit` exit 0; frontend `tsc --noEmit` exit 0 and `vite build` exit 0. Three genuine issues were found and
fixed while running the new suite: the approximate topic floor wrongly excluded three legitimately same-topic curated
pairs (resolved by keeping the floor at 0.5 and *not* opting those heavily-rewritten pairs into the whole-sentence
approximate path — they remain available via exact match and rules); an over-strict dataset-integrity assertion
flagged intentional proper-noun capitalisation (`english → English`); and a test expectation believed all-caps text
must take the whole-sentence path when the case-insensitive structural rule correctly handles it.

**Limitations (not regressions).** The dataset is curated, not exhaustive: unknown sentences return
`NO_RELIABLE_CORRECTION` rather than a guess. Whole-sentence approximate matching is deliberately limited to a small
opt-in set; heavily rewritten curated pairs correct only on an exact match. Fully-uppercase sentences skip the
whole-sentence dataset path (short all-caps tokens may be official codes) but still receive rule-based fixes. No
external AI is required; the optional LLM path is used only when `AI_API_KEY` is configured.

### Premium login page redesign — campus-photo hero + navy-and-gold sign-in card — PASS (2026-10-13)

**Objective.** Redesign the existing login page in place to a premium institutional layout matching the supplied
reference, using the provided campus photograph, with **zero** change to authentication, authorization, routing, PWA
behaviour or any other role's dashboard.

**Project inspection.** Read `PROJECT_PROGRESS.md`; identified `frontend/src/pages/auth/LoginPage.tsx` as the component
rendered for `/` and `/login` while unauthenticated (`App.tsx`); traced auth through `AuthContext`
(`POST /api/auth/login`, token handled by `api/client`) and installation through `PwaContext`; inspected the design
tokens in `frontend/src/styles/index.css`. Every pre-existing uncommitted change was preserved.

**Campus image.** Verified `A:\movies\eb72e87c-e8c7-44b1-9a40-baa0134bc3ab.png` exists (1 672 × 941, 2 728 283 B) and
copied it **verbatim** to `frontend/public/assets/ksrce-campus-login.png` (source left intact). It is referenced only as
`/assets/ksrce-campus-login.png` — no absolute Windows path in code (confirmed: `A:\movies` / `eb72e87c` appear in
neither `LoginPage.tsx`, `index.css` nor the built bundle). It renders as `<img … object-fit: cover>` under a navy veil
plus a bottom gradient, so the campus building and entrance stay visible while the overlaid text remains readable.

**Component (`frontend/src/pages/auth/LoginPage.tsx`).** Rebuilt as `.lg-page` → `.lg-brand` (campus panel) +
`.lg-panel` (sign-in card):
- Brand panel: verified crest + `K.S.R. COLLEGE OF ENGINEERING` / `AUTONOMOUS • TIRUCHENGODE`; hero
  `Digital **Mentor–Mentee** Management System` (gold accent on `Mentor–Mentee`); the supporting sentence; four compact
  icon feature highlights (Mentor & Mentee Management · Academic Records & Analytics · Placement Monitoring &
  Achievements · Department & Institution Insights) using the existing `lucide-react` icons; `Empowering Future Engineers`
  footer.
- Sign-in card: college logo + name + system title, `Welcome Back` heading and a short supporting line; Username or
  Register Number and Password fields (unchanged ids/labels/autocomplete), show/hide password control, validation/error
  alert, `Sign In to Portal` submit button with the existing loading state, the retained
  `Download / Install KSRCE Web App` button (shown only while `!isInstalled`, using the existing `promptInstall`), and the
  `Permanent Academic Records System` / `Secured Institutional Access • K.S.R. College of Engineering` footer.

**Styles (`frontend/src/styles/index.css`).** Added one scoped `.lg-*` block (palette `#061B36` / `#0A2342` / `#F5BD35`,
premium rounded card, gold borders, soft shadows, dotted-grid + curved accents, hover/focus transitions and a
`prefers-reduced-motion` guard with desktop / tablet (961–1180px) / stacked (≤960px) / mobile (≤480px) rules). The
pre-existing `.login-*` rules are **kept untouched** because `ChangePasswordPage.tsx` reuses `.login-page`,
`.login-panel`, `.login-card`, `.login-card-logo`, `.login-title`, `.login-sub`, `.login-alert`,
`.login-password-toggle`, `.login-foot` and `.login-pwa-btn`; only the login page changed.

**Changed files.** `frontend/src/pages/auth/LoginPage.tsx` (redesign), `frontend/src/styles/index.css` (scoped `.lg-*`
block added), `frontend/public/assets/ksrce-campus-login.png` (new asset).

**Verification.**
- Campus image exists and is served: `HEAD http://localhost:3000/assets/ksrce-campus-login.png` → **200 image/png**,
  2 728 283 B; present in `frontend/dist/assets/` after the build.
- No absolute path leak: `A:\movies` / `eb72e87c` / `A:/movies` absent from the built bundle, `LoginPage.tsx` and
  `index.css`; the bundle contains exactly one `/assets/ksrce-campus-login.png` reference.
- Live page (real dev server 3000, headless Chrome, `--dump-dom`): the rendered DOM contains `lg-page`, the campus
  `<img src="/assets/ksrce-campus-login.png">`, the crest, the gold `Mentor–Mentee` span, all four feature items, the
  `lg-card`, `Welcome Back`, `Sign In to Portal`, the PWA button and `Empowering Future Engineers`.
- Visual/pixel checks on headless screenshots: desktop 1440×900 → overall **69.4%** navy-family pixels, **0.45%** gold
  accents, **18.4%** near-white card; panel right edge sampled `(4,22,44)` (deep navy), card mid `(251,251,251)` (white),
  brand photo region non-flat (σ≈61) → the photo is loaded and blended. Tablet 1024×768 keeps two columns
  (brand photo + navy, σ≈64). Mobile 390×844 → photo banner on top (σ≈111), white card below.
- Authentication unchanged: real `POST /api/auth/login` (`Ksrce@admin`) → **200**, role `ADMIN`, token issued; wrong
  password → **401**.
- Builds/tests: frontend `npx tsc --noEmit` exit 0; `npm run build` exit 0 (only the pre-existing chunk-size warning);
  backend `test:critical` **12/12**.
- Scope: `git diff` for `frontend/src` shows no Admin / Principal / HOD / Faculty / Mentor / Student dashboard edit from
  this pass; no route, endpoint or auth rule touched.

Branch `temp`, uncommitted — no commit/push.

### User-facing "Counselling" → "Mentoring" — remaining mentoring-workflow labels cleared — PASS (2026-10-12)

**Objective.** The user-facing term had already been set to **Mentoring**, but the previous UI update left the word
**Counselling** visible in several mentoring-workflow labels. Clear every remaining user-visible occurrence while
preserving route behaviour, record ids, API endpoints, JSON/field names, stored data, business logic, internal
identifiers and unrelated categories.

**Root cause.** The rename had been applied to a few action buttons only (e.g. the mentor profile already said `Save
Mentoring Record`) but not to the tab, headings, cards, tables, empty states, modal titles, field labels, navigation
items, page titles or hints — so the same screen showed both words (e.g. `5-Domain Mentoring Records` as a card foot
while its tab stayed `6. Counselling`).

**Change (display text only).** Navigation/sidebar labels (`frontend/src/components/common/Sidebar.tsx`); the mentor
mentee-profile view (`frontend/src/pages/mentor/MentorStudentProfileView.tsx` — tab `6. Counselling`, summary card,
aria-label, dossier page title, record `Mentoring Date`, edit button, empty state, add/edit modal title + subtitle +
`Mentoring Date` / `Mentoring Category` labels and their validation messages); the faculty dashboard
(`frontend/src/pages/faculty/FacultyDashboard.tsx` — `Add/Pending/Recent Mentoring`, `5-Domain Mentoring`, mentoring
table, `Open Mentoring Desk`, quick-add modal); the category selector
(`frontend/src/components/mentor/CounsellingCategorySelect.tsx` — `Mentoring Category`, placeholder, validation); the
Admin dashboard (`frontend/src/pages/admin/AdminDashboard.tsx` — `Mentoring Sessions`, `Institutional 5-Domain
Mentoring Hub`, `Student Mentoring Directory`, `Mentoring Action`, `View Student Mentoring`, retention/deletion copy);
the HOD faculty detail (`frontend/src/components/faculty/FacultyDetailView.tsx` — `Mentoring History`, `Mentoring
records`, `Last Mentoring`, `Mentoring provided`, empty state); the Principal dashboard (`PrincipalDashboard.tsx` KPI
hint + `Last mentoring` column + note; `PrincipalActivity.tsx`, `PrincipalCharts.tsx` empty copy); the HOD dashboard
empty copy; the Student dashboard (`5-Domain Mentoring History`, `Mentoring Sessions Recorded`, PDF download copy);
the AI-assistant prompts (`components/ai/AiAssistant.tsx`, `components/mentor/MentorAiBotModal.tsx`); and the login
tagline.

**Preserved on purpose.** The unrelated **admission category** `Counselling (Govt Quota)` (StudentDashboard.tsx,
CompleteProfileWizard.tsx, and the mentor profile's admission-type display) — it is an admission type, not the
mentoring workflow. Also unchanged: every internal identifier (tab keys such as `'counselling'` / `'mentoring-history'`,
`/counselling/*` API paths, `counselling*` / `counselling_count` / `counsellingRecords` fields, `CounsellingRecord`,
component/type names like `CounsellingCategorySelect`, CSS ids, code comments) and all backend / generated-PDF text.

**Verification.** Frontend `tsc` + `vite build` exit 0. The compiled bundle (`frontend/dist/assets/index-*.js`)
contains **exactly two** `Counselling` strings, both the intentional `Counselling (Govt Quota)` admission option, and
none of the mentoring-workflow labels; all renamed labels (`5-Domain Mentoring`, `Mentoring Records`, `Mentoring
History`, `Mentoring Sessions`, `Mentee Mentoring Records & Dossier`, `Add Mentoring`, `Open Mentoring Desk`,
`Mentoring Action`, `Student Mentoring Directory`, `5-Domain Mentoring History`) are present. The **running Vite dev
server** (`http://localhost:3000`) already serves the updated sidebar module (verified by fetching
`/src/components/common/Sidebar.tsx`), so a refresh shows the new labels via HMR. No backend or data change, so the
backend suites are unaffected. Branch `temp`, uncommitted — no commit/push. A headless-browser click pass was not run
for this pass (build + bundle + live dev-server module inspection used instead).

### Bulk Upload & Assign Mentees to Faculty Mentors — ADMIN college-wide / HOD own-department — PASS (2026-10-12)

**Objective.** Add a complete bulk-upload-and-assign workflow on top of the existing mentorship module, preserving
local JSON storage, reusing the existing assignment business rules, validation and audit/notification mechanisms, and
leaving every unrelated page untouched.

**Entry points.** A gold **Bulk Assign Mentees** button on the Admin **Mentor Assignment Desk** header
(`frontend/src/pages/admin/AdminDashboard.tsx`, `currentTab === 'assignment'`) and on the HOD **Departmental Mentor
Assignment** header (`frontend/src/pages/hod/HodDashboard.tsx`, `currentTab === 'reassignment'`). Both render the same
self-contained modal `frontend/src/components/mentorship/BulkAssignMentees.tsx` (existing `Modal` + `bu-*` primitives +
a new scoped `ba-*` CSS block). The single-student **Assign Mentees** / **View Roster** actions are untouched.

**Flow.** `Upload → Preview & Validate → Confirm → Results`. Download **Excel (.xlsx)** or **CSV** templates; upload
`.xlsx`/`.csv` (drag-drop or browse); see a fully validated preview; explicitly confirm (with a separate confirmation
dialog that lists the summary and, when needed, a reassignment-authorisation checkbox + required reason); then a
per-row results table with downloadable CSV/Excel reports.

**Template columns:** `Student Register Number | Mentor Employee ID`. The shipped templates contain **illustrative
example rows** (`261T001/EMP1001`, `261T002/EMP1002`) clearly marked in italic on a tinted fill (XLSX has an
`Instructions` sheet + an `Assignments` sheet; CSV has `#` comment instructions). These pairs — and any `SAMPLE…`
identifier — are detected server-side and reported **INVALID**; they can never create an assignment, even if a real
student/faculty happens to match those IDs.

**Server-side row validation (no client trust).** Required columns (header scanned within the first 10 rows with
alias support); register numbers must match an existing student; employee IDs must match an existing faculty mentor;
inactive mentors are refused; **HOD** rows must have both the student **and** the mentor in the caller's department
(enforced again at execution); duplicate `registerNumber` rows are flagged `DUPLICATE`; existing active assignments
become `ALREADY_ASSIGNED` (same mentor) or `REASSIGNMENT_REQUIRED` (different mentor); missing/malformed values are
`INVALID`. File guards: `.xlsx`/`.csv` only, 5 MB (`BULK_ASSIGN_MAX_FILE_BYTES`) and 1000 rows
(`BULK_ASSIGN_MAX_ROWS`), corrupted Excel → clear 400.

**Statuses:** `VALID`, `WARNING` (assignable with caveat — ADMIN cross-department, or mentor at capacity), `INVALID`,
`DUPLICATE`, `ALREADY_ASSIGNED`, `REASSIGNMENT_REQUIRED`. `maxMentees` is **not** enforced anywhere in the existing
application, so capacity is a **warning only and never blocks** (an explicit product decision).

**Preview columns:** row number, register number + student name, employee ID + mentor name, current mentor, proposed
mentor, validation status, and error/warning message, with status filter chips + a search box. A validation report is
downloadable as CSV.

**Execution (deterministic, per-row, never trusts the client).** The assign endpoint re-validates from the raw
`{registerNumber, employeeId}` pairs. `INVALID`/`DUPLICATE`/`ALREADY_ASSIGNED` rows are `SKIPPED` with a reason;
reassignments require `authorizeReassignments: true` **and** a non-empty reason or they are `SKIPPED`; new assignments
are `ASSIGNED`; authorised reassignments complete the old row (`status: 'COMPLETED'`, `assignedUntil`) and create a new
`ACTIVE` row (`REASSIGNED`), preserving history; write errors are reported `FAILED` (with a compensating revert if the
new row cannot be created after the old is completed). Duplicate submissions are no-ops (`SKIPPED`), no duplicate
active rows can be created, notifications are wrapped so a notification failure can never fail an assignment, and a
single `BULK_ASSIGN_MENTORS` summary audit row is written alongside the per-row `ASSIGN_MENTOR`/`REASSIGN_MENTOR`
audit entries (`details.source === 'BULK_ASSIGNMENT'`).

**Reports.** `POST /api/mentorship/bulk/report` builds a read-only **validation** or **results** report as CSV
(hand-rolled) or Excel (ExcelJS); the results report reflects the actual per-row outcomes, so a partial failure is
never reported as a full success.

**Architecture / boundaries.** New `backend/src/modules/mentorship/bulk-assignment.service.ts` (template generation,
CSV/XLSX parsing via a shared string matrix, validation, execution, report generation),
`bulk-assignment.controller.ts` (multer memory 5 MB + `.xlsx`/`.csv` filter, template/validate/assign/report handlers)
and `bulk-assignment.routes.ts` (`GET /template`, `POST /validate`, `POST /assign`, `POST /report`; each
`authorize(ADMIN, HOD)`), mounted at `router.use('/bulk', bulkAssignmentRoutes)` **before** the single-student routes.
Parsing is separate from execution. No CSV/xlsx dependency was added (`exceljs` already present; the CSV reader is
hand-rolled). Admin may operate college-wide; a HOD is scoped server-side to its own department for **both** the
student and the mentor; Faculty/Mentors and Students have no assignment privileges.

**Verification.** New `backend/src/tests/bulk-assignment.test.ts` (`npm --prefix backend run test:bulk-assignment`)
boots the **real** `src/index.ts` on a temporary local store (port 5120) and drives the real routes over HTTP with
seeded temporary data — **29/29 PASS**, covering: both template downloads; .xlsx and .csv parsing; preview columns +
every status + summary counts; illustrative example rows never assigned; required-column/row-limit/file-type/corrupted/
size guards; confirmed execution with per-row results and preserved reassignment history; duplicate-submission
prevention; forged client statuses ignored; reassignment authorisation + reason enforcement; capacity warning-only;
ADMIN cross-department warning; HOD student+mentor scoping; RBAC (faculty/student/anonymous refused); notifications +
audit; CSV + Excel reports; single-student assign/reassign regression; no leaked secrets. Regressions:
`test:critical` 12/12, `test:bulk-upload` 23/23, `test:bulk-actions` 15/15, `test:hod` 33/33, `test:admin` 23/23,
`test:security-hardening` 8/8. Backend `tsc --noEmit` clean; frontend `tsc` + `vite build` clean. Branch `temp`,
uncommitted — no commit/push.

### Principal dashboard — oversized banner removed, compact premium heading + mentor analytics series — PASS (2026-10-12)

**Scope (strict):** the Principal role only. The redundant introductory hero was removed from the **actual Principal
dashboard component** — not hidden — so no empty card or dead vertical space remains (`.pd-header` no longer renders at
all). No Admin / HOD / Faculty / Mentor / Student page and no shared component was modified; the shared `Navbar` keeps
the college crest + institution name, so institutional identity is preserved.

**Removed:** the large rounded navy-gradient header card (`.pd-header`), the oversized in-banner `Principal Dashboard`
heading, the tagline, the `Principal · Institutional Leadership` badge, the `Read-only executive access` badge, the
repeated college crest/name, the welcome message and the in-banner date. The old `PrincipalHeader` hero markup and the
`.pd-header*` / `.pd-chip*` CSS rules were **deleted** (not merely hidden).

**Replaced with:** a compact page heading (`.pd-pagehead`) rendered outside any banner — `Principal Dashboard` with the
short supporting line `Institutional performance at a glance` and a small gold-accented current-date chip — plus a
Principal-scoped `.page-body:has(> .pd-root)` rule that trims the page's top padding so the overview starts higher.
`:has()` only matches a page that renders the Principal-only `.pd-root`, so every other role keeps the shared padding.

**Analytics:** the students/faculty distribution chart now also plots the real per-department **mentor** count from
`AdminDepartmentRow.mentors` (card retitled "Students, faculty & mentors by department", 3-item legend), covering the
"faculty versus mentor distribution by department" requirement from real data only. No series is invented and no
historical trend is shown (no comparison series exists server-side).

**Verification (real browser):** `backend/.runtime-verify/principal-dashboard-browser.mts` (gitignored scratch) — **50/50
PASS**: compact heading present (title + subtitle + date chip); the old `.pd-header` banner absent; the role/read-only
badges gone; no crest repeated inside the heading; 8 KPI cards with real values (students 4, faculty 3, mentored 3,
coverage 75%, sessions 4, pending 1); analytics incl. the new mentor series; department cards; activity + alerts;
desktop/tablet/mobile columns and no overflow; all 5 tabs; department → mentor → mentees drill-down; **Admin and HOD
portals render with no Principal-only markup (`.pd-pagehead` / `.pd-root`)**; zero page-level JS errors. Suites:
`test:principal` 53/53, `test:admin` 23/23, `test:hod` 33/33, `test:critical` 12/12, `test:bulk-actions` 15/15.
`frontend tsc --noEmit` + `vite build` clean; `dist` rebuilt clean (no baked API URL). The predecessor HOD
faculty-cards browser harness also re-ran green (**34/34**). Branch `temp`, uncommitted — no commit/push.

### Principal executive dashboard — premium Principal-only redesign — PASS (2026-10-12)

**Scope (strict):** the Principal role only. `frontend/src/pages/principal/PrincipalDashboard.tsx` was rewritten from
a one-line re-export of the shared `AdminMentoringDashboard` into a self-contained executive dashboard. The shared
`AdminMentoringDashboard`, the global `Navbar`, the sidebar and every other role's components were **not modified** —
all new style lives in a scoped `pd-*` CSS block and all new markup lives in Principal-only components.

**Design:** deep navy/midnight foundation with gold accents (existing K.S.R. design tokens), clean white/neutral
surfaces, refined typography/spacing, premium cards (subtle borders, soft shadows, restrained radii), subtle hovers,
Lucide icons and sparing gradients.

**New components (`frontend/src/components/principal/`, Principal role only):**
- `PrincipalHeader.tsx` — college crest (`/ksrce-logo.png`), institution name, "Principal Dashboard", tagline, role
  badge, read-only chip, and a live long date + time-of-day greeting with the signed-in Principal's name.
- `PrincipalKpi.tsx` — `PrincipalKpiCard` (label / prominent value / icon tile / hint) plus `PD_TONE_PAINT`.
- `PrincipalCharts.tsx` — dependency-free `PrincipalCoverageRing` (inline SVG), `PrincipalRankedBars`,
  `PrincipalWeeklyColumns`, `PrincipalDistributionBars`, and `coverageColor` / `formatShortDay`.
- `PrincipalDepartmentCard.tsx` — premium department summary card with a read-only "View" drill-down trigger.
- `PrincipalActivity.tsx` — `PrincipalActivityFeed` (real per-department last-mentoring activity) and
  `PrincipalAlerts` (real, derived pending-attention items).
- `PrincipalDashboardSkeleton.tsx` — layout-matched loading skeleton.

**Data (real, unchanged):** everything comes from the existing Principal-allowed `GET /api/admin/overview/*` routes
(`dashboard`, `hods`, `departments`, `department-comparison`, `report-30-day`, `departments/:id`,
`departments/:id/mentors`, `mentors/:id`) via `api.adminMentoring.*`. No new endpoints, no backend/API/permission
changes. KPI values, coverage, the weekly series, department figures, activity and alerts are all server-computed; the
dashboard performs **no client arithmetic** and shows **no trend delta** (there is no historical comparison series, so
none is fabricated). Metrics the Principal has no endpoint for (attendance, academic performance, announcements) are
honestly **omitted**. "Mentoring sessions" is labelled as counselling records + Saturday meetings, matching the
backend's `totalMentoringSessions`.

**Tabs preserved (sidebar keys unchanged):** `mentoring-dashboard` (default), `mentoring-hods`,
`mentoring-departments`, `mentoring-comparison`, `mentoring-reports`, with an in-page `pd-tabs` bar that also calls
`onSelectTab`. The existing month selector, search and the department → mentor → mentee drill-down are retained as
premium read-only views. The dashboard is **view-only**: the backend still refuses every PRINCIPAL request outside
`/api/admin/overview/*` (403), so no edit/delete/approve/export control can leak in.

**Responsive:** the KPI grid auto-fits multi-column on desktop and collapses to one column on mobile; analytics is
two-column on desktop and stacks on ≤1024px; tables use the shared `.table-responsive`; the weekly chart is wrapped;
no horizontal overflow at 1440 / 900 / 390. Skeleton loading, error states (network / 503 / server) and informative
empty states throughout.

**Verification (real browser):** `backend/.runtime-verify/principal-dashboard-browser.mts` (gitignored scratch) boots
the real backend on an isolated local store plus the built SPA and drives headless Chrome over the DevTools Protocol —
**47/47 PASS**: overview allowed / non-overview refused (403); header identity/title/greeting/badge/read-only/crest;
8 KPI cards with real values (students 4, faculty 3, mentored 3, coverage 75%, sessions 4, pending 1); all four
analytics; department cards; activity + alerts; desktop/tablet/mobile columns and no overflow; HOD/Department/
Comparison/Reports tabs; the department → mentor → mentees drill-down (current mentees only, the reassigned student
excluded); return to the dashboard; **Admin and HOD portals render without any Principal-only markup**; and zero
page-level JS errors throughout. Suites: `test:principal` 53/53, `test:admin` 23/23, `test:hod` 33/33,
`test:critical` 12/12, `test:bulk-actions` 15/15; frontend `tsc --noEmit` + `vite build` clean; `dist` rebuilt clean
(no baked API URL). Branch `temp`, uncommitted — no commit/push.

### HOD "Department Faculty Mentors" — responsive mentor cards + click-through full-process detail — PASS (2026-10-12)

**Scope:** the HOD portal only (`frontend/src/pages/hod/HodDashboard.tsx`). The faculty **table** became a responsive
**card grid**, and a card (or its **View Details** action) opens a single **detail dialog** whose tabs are backed by
real, HOD-department-scoped data. No hardcoded faculty data; Add Faculty / Edit and every other faculty action are
unchanged.

**Cards (`frontend/src/components/faculty/FacultyMentorCard.tsx`, new):** name, employee ID, email, designation,
department, cabin, contact number (when present), assigned-mentee count, coverage % and an active/inactive badge; the
existing **View Details** and **Edit** actions. The card root is `role="button"` + `tabIndex=0` with Enter/Space
activation, and every inner action calls `stopPropagation()` on click/keydown so **Edit never also opens the detail**.
Grid is 3 / 2 / 1 columns (breakpoints ≤1180px / ≤700px), with loading skeleton, empty and error states.

**Detail (`frontend/src/components/faculty/FacultyDetailView.tsx`, new):** a single wide `Modal`
(`maxWidth="1100px"`) with tabs **Overview / Mentees / Counselling History / Meetings / Documents / Assignment
History** (only sections the app supports). Mentees lists name, register number, class/section/year, assignment
status, counselling session count, last counselling date and progress, with an **Open** action that closes the dialog
and opens the mentee's existing student-details page. Each section has a clear empty state; nothing is fabricated;
timestamps/statuses render when present. Reuses `Modal`, `EmptyState`, the shared `.tabs`/`.timeline`/
`.overview-summary-grid`/`.badge-*`/`progress-*` styles plus one appended scoped `faculty-*` CSS block.

**Backend (extended, no new routes):** `getMentorDetail` (`GET /api/hod/mentor/:mentorId`,
`backend/src/modules/hod/hod.controller.ts`) already resolved the mentor inside `loadScope` and refused
foreign-department ids; it now also returns, everything intersected with the HOD scope:
- `assignments` — every `MentorAssignment` for this mentor in the department (**ACTIVE and historical**), with
  `isCurrent`, status, change reason and dates;
- `counselling` — records authored by this mentor (`mentor === mentorId`) for in-scope students (keeps
  pre-reassignment history);
- `meetings` — this mentor's meeting records;
- `documents` — `StudentDocument` **metadata** for the mentor's **current** mentees (bytes are served by the existing
  authenticated document view/download endpoints).

**Data relationships:** keyed by stable faculty / student ids, never by names; current vs historical distinguished by
assignment status; a reassigned student is current for the new mentor and history for the old one, never duplicated.
Every section is scoped to the calling HOD's department, and a foreign-department mentor id returns **404**. Content
stays within the module's existing permission rules; no raw geo-tagged evidence photos are emitted.

**Verification (real browser):** `backend/.runtime-verify/faculty-cards-browser.mts` (gitignored scratch) boots the
real backend on an isolated local store plus the built SPA and drives headless Chrome over the DevTools Protocol —
**34/34 PASS**: cards replace the table (3 department faculty → 3 cards, old "Emp ID" header gone), a card shows the
real facts + coverage, desktop/tablet/mobile = 3/2/1 columns, clicking the correct card opens the correct faculty, all
six tabs present, Mentees lists the **current** mentees and excludes the reassigned one, Counselling shows the mentor's
own real records (including a **pre-reassignment** record) and not another mentor's, Meetings/Documents show real
records, Assignment History shows current + historical with reason, the document preview fetches the real bytes (200),
a no-mentee faculty shows the empty state, **Edit opens the form without also opening the detail**, keyboard Enter
opens the detail, a mentee **Open** loads the student page, `/api/hod/faculty` excludes foreign-department faculty and
`/api/hod/mentor/<foreign>` → 404, and zero page-level JS errors throughout. Builds/tests: backend `tsc --noEmit` +
`npm run build` clean; frontend `tsc --noEmit` + `npm run build` clean; `test:hod` **33/33**, `test:critical`
**12/12**, `test:bulk-actions` **15/15**. Branch `temp`, uncommitted; no commit/push.

### Bulk selection · bulk delete · bulk document (ZIP) download — Student Master + Faculty / Mentors — PASS (2026-10-12)

**Scope:** the two ADMIN management screens (`Students Master` and `Faculty / Mentors`, both in
`AdminDashboard.tsx`). Faculty records ARE the mentor records in this data model, so one bulk action
covers both. HOD receives no bulk UI (HOD uses `HodDashboard.tsx`) but the backend authorizes HOD for
bulk delete/download scoped to its own department.

**Backend (reused / extended existing routes; storage unchanged):**
- `backend/src/services/bulk-documents.service.ts` — `createArchive` (jszip), `buildManifestCsv`,
  `safeSegment` / `safeFileName` / `uniqueName` (collision-safe, traversal-proof), `bulkArchiveFileName`
  (`Bulk_Documents_YYYY-MM-DD.zip`), and `BULK_DOCUMENT_LIMITS` (maxRecords 200 / maxTotalBytes 250 MB /
  maxNameLength 100).
- `backend/src/modules/students/student-bulk.controller.ts` — `GET /api/students/selection/ids`,
  `POST /api/students/bulk-delete`, `POST /api/students/bulk-documents`.
- `backend/src/modules/admin/faculty-bulk.controller.ts` — `GET /api/admin/faculty/selection/ids`,
  `POST /api/admin/faculty/bulk-delete`, `POST /api/admin/faculty/bulk-documents` (download returns an
  explicit "no documents available" JSON result — there is no faculty document store).
- Routes wired in `student.routes.ts` / `admin.routes.ts`, each `authorize(ADMIN, HOD)` **and**
  re-checked in the handler; HOD scope is `req.user.departmentId`, ADMIN unrestricted.
- Extracted `cascadeDeleteStudent` (`student.controller.ts`) and `cascadeDeleteFaculty`
  (`admin.controller.ts`) and refactored the single-record deletes to call them, so bulk and single paths
  cannot drift. Exported `resolveServedDocumentPath` from `document.controller.ts` so bulk downloads
  honour the same watermarked-copy policy.
- **Latent bug fixed:** the original `deleteStudent` cascade deleted `StudentDocument` rows with
  `{ student: studentId }`, but `StudentDocument` keys its owner as `studentId` — so document metadata was
  silently orphaned on every single delete. Corrected to `{ studentId: studentId }` for both paths.
  Uploaded files on disk are still left untouched (pre-existing policy).

**Frontend:**
- `frontend/src/api/client.ts` — typed `BulkDeleteOutcome` / `BulkDownloadResult` plus a
  `bulkDownloadDocuments()` helper that normalises a streamed ZIP **or** the JSON no-documents result;
  `api.students.{selectionIds,bulkDelete,bulkDownloadDocuments}` and
  `api.admin.{facultySelectionIds,bulkDeleteFaculty,bulkDownloadFacultyDocuments}`.
- `frontend/src/hooks/useRowSelection.ts` — selection keyed by record id (survives pagination/refresh;
  explicit `clear`/`addMany`/`removeMany`/`replaceWith`).
- `frontend/src/components/bulk/{BulkActionBar,BulkDeleteModal,SelectionCheckbox}.tsx` — sticky action
  bar (buttons disabled while an action is in flight), an irreversible-action confirmation listing every
  affected record, and a real indeterminate select-all checkbox.
- `AdminDashboard.tsx` — header + per-row checkboxes on both desktop tables, checkboxes on both mobile
  card lists, selected-row/card styling, the bulk bar on both tabs, selection cleared on filter/tab
  change, and success / partial / no-documents toasts. Scoped `bulk-*` CSS block appended to
  `index.css` (responsive at ≤640px).

**Verification (real running app, live backend on 5050):** `GET /api/students/selection/ids` → 128 ids;
`GET /api/admin/faculty/selection/ids` → 1 id; `?search=Vishnuvarthan` → exactly the one match; a real
ZIP (135 743 B, `application/zip`) unpacked to `Students/Vishnuvarthan P_73152421125/Student Details
Form.pdf` plus a root `manifest.csv` with the matching row; a non-existent id returned
`hasDocuments:false` JSON; faculty download returned the "no documents available" JSON; empty ids → 400;
bulk-delete with two non-existent ids reported `deleted=0 failed=2` with per-record reasons. New suite
`test:bulk-actions` **15/15** (port 5099, temp store: RBAC 403s, HOD department scope, search filter,
partial failures, cascade, ZIP folder + collision-safe names + `manifest.csv`, no-empty-ZIP, oversized
payload, single-delete regression, no secret leak). `tsc --noEmit` + `npm run build` (backend) and
`tsc` + `vite build` (frontend) all exit 0.

**Limitations:** the bulk **UI** is build-verified and the **APIs** were verified on the running app, but
the new selection / action bar / modal interactions were not yet driven in a headless browser session
(see Pending). Faculty/Mentor bulk **download** intentionally returns "no documents available" because
the system has no faculty document store. Bulk download is bounded (≤200 records, ≤250 MB); larger
selections are refused server-side rather than partially served.

### Clean server restart — one fresh backend (5050) + one fresh frontend (3000) on localhost — PASS (2026-10-11)

**Goal.** Stop every stale project dev server and bring up exactly one fresh frontend and one fresh backend on
localhost, without deleting or resetting anything (a restart, not a reset).

**Inspection (done before any change).** Read `PROJECT_PROGRESS.md`, both `package.json` files,
`frontend/vite.config.ts` (`server.port 3000`, proxy `/api` → `http://localhost:5050`) and the env files
(`backend/.env` `PORT=5050`; `frontend/.env` `VITE_API_URL=http://localhost:5050`). Listed Node processes with
full command lines and mapped listening ports to PIDs.

- **Project processes found:** the backend tree — launcher `powershell` 13568 (`npm run dev`) → `node` npm-cli
  29692 → `cmd` 28004 (`tsx watch src/index.ts`) → `tsx watch` 25280 → server child **21204** listening on **5050**.
  Every command line referenced `A:\mini projects\New folder\backend`.
- **Not project processes (left untouched):** four `chrome-devtools-mcp` Node processes (OpenCode harness MCP) and
  the `opencode.exe serve --service` parent (28436).
- **Frontend:** none running — ports 3000 / 5173 / 4173 had no listener.

**Stop.** `taskkill /PID 13568 /T /F` terminated 21204, 25280, 28004, 29692 and 13568 (descendants only, never the
OpenCode service parent). Verified afterwards: no Node process referencing this project remained and port 5050 was
not listening.

**Start (the project's existing commands, no config changed).** Backend first — `npm run dev` from `backend/`
(`tsx watch src/index.ts`) → new server **PID 19744** on 5050, `/api/health` →
`{"status":"ok","database":"connected"}`, banner `Running on: http://localhost:5050`. Then frontend — `npm run dev`
from `frontend/` → **Vite v6.4.3**, **PID 7688**, `http://localhost:3000/`. The existing proxy already targets 5050.

**Verification.**
- Backend health direct `http://127.0.0.1:5050/api/health` → `{"status":"ok","database":"connected"}`.
- Frontend `http://localhost:3000/` → HTTP 200, `<title>KSRCE Mentoring | K.S.R. College of Engineering</title>`,
  entry `/src/main.tsx`. (Vite binds `::1` only, so `127.0.0.1:3000` is refused by design; `localhost`/`[::1]` work.)
- **Proxy reaches the fresh backend:** `http://localhost:3000/api/health` → `{"status":"ok","database":"connected"}`
  (only one backend exists — PID 19744); `POST /api/auth/login` (`Ksrce@admin`) via the proxy → 200 with a token;
  `GET /api/pdf/student/73152421125?mode=full` and `.../73152421002` via the proxy → **200, `application/pdf`,
  `%PDF-` magic, ~137 KB / ~136 KB** — so the SPA and the PDF endpoint both use the freshly started process.
- Both server logs clean (no startup errors): backend printed the store verification (1317 records) + health URL;
  frontend printed `VITE v6.4.3 ready in 486 ms` + `Local: http://localhost:3000/`.
- **Nothing deleted/reset:** no source, `.env`, `backend/data/`, `backend/storage/uploads/`, `node_modules`, Git
  history or uncommitted changes were touched. The 129 students / 1032 academic records / 5 documents / 148 users
  were re-verified by the backend's own boot check.

**Startup commands for next time:** backend → `cd backend && npm run dev` (port 5050); frontend →
`cd frontend && npm run dev` (port 3000). No commit/push made.

### Student record book — vertical layout/readability fix ("content compressed at the top") — PASS (2026-10-11)

**Symptom (from the user's screenshot of the real generated PDF).** The college header, tables and student
details appeared squashed into the upper portion of the page with a large unnecessary blank area below the
signature section, while the header + diagonal `K S R C E` watermark were correct.

**Reproduced on the real path.** Logged in exactly like the browser (`POST /api/auth/login` as `Ksrce@admin`) and
pulled `GET /api/pdf/student/73152421125?mode=full` from the running app; rendered every page to PNG and measured
per-band ink occupancy + MuPDF line geometry.

- Actually, **page 1 was already well-filled** (content to y≈737 pt of the ~796 pt content box) — the complaint
  is the **last page**. For the real short records page 2 used only ~44% of its height: section 5 (mentor
  lineage), 6 (meetings — empty), 7 (counselling — empty), 10 (documents), the note, then a tiny signature block
  with the heading at **y≈297 pt** and the four captions at **y≈340–353 pt**, leaving **~440 pt (56%) blank**
  below the signatures. So the page read as "everything crammed at the top, huge void under the signature".

**Root cause.** Two compounding, non-obvious things — neither a stray `zoom`/`scale`, a fixed height, nor a print
flag (all checked and ruled out):
1. **Small, tight print type.** `body { font-size: 9pt; line-height: 1.32 }`, table cells `8pt` with only
   `1.1mm` padding, banner rows `8.6pt`, the signature drawn as a bare `____________` followed by a caption.
   Everything was legible but dense, so a sparse page looked "compressed".
2. **A genuinely short record leaves a sparse final page.** Pagination fills page 1 first; the leftover
   sections + signature land at the top of page 2 with the rest empty. This cannot be "filled" without faking —
   the user explicitly asked not to stretch rows or add filler — so the fix was to make the type/spacing
   professional and pull the signature block down to a natural resting place.

**Changes** — `backend/src/modules/pdf/record-book-html.service.ts` (PRINT_CSS + the signature-block markup):
- Body `9pt/1.32` → **`10pt/1.42`**; section tables: cells `8pt` @ `1.1mm 1.4mm` → **`9pt` @ `1.5mm 1.8mm`**,
  column headers `7.6pt` → `8.8pt`, section-title rows `8.2pt` → `9.5pt`, `td.sub` `7.4pt` → `8.2pt`, table
  margin `2.4mm` → `3.2mm`.
- Banner: padding `2.2mm 3mm` → `2.6mm 3.2mm`, row padding `0.6mm` → `0.9mm`, text `8.6pt` → `9.5pt`, name
  `10pt` → `11pt`; added `break-inside: avoid`.
- Photo montage frame `42mm` → `44mm`, captions `7pt` → `7.8pt`, cell padding `1.2mm` → `1.4mm`.
- Annexure heading `9.5pt` → `10.5pt`, meta `7.6pt` → `8.3pt`; note `7.6pt` → `8.3pt`, `.small` `7pt` → `7.8pt`.
- **Signature block redesigned:** top margin `14mm` → `16mm`, heading `8.6pt` → `10pt` with a `12mm` gap, and the
  crammed `____________`/caption replaced by a uniform **`7.5mm` `.sigline` + `8.3pt` caption** per column so each
  signatory has real space; `break-inside: avoid` on `.signatures` so the block never splits across pages.
- Unchanged on purpose: the `@page { margin: 35mm 12mm 16mm }` header band, the pdf-lib `stampPageFurniture`
  per-page header/footer, the `position: fixed` z-index-0 `K S R C E` watermark (`translateY(-9.5mm)
  rotate(45deg)`), and `table.grid thead { display: table-header-group }`.

**Verification (real renders, geometry + pixel, not build-only).**
- **Two real live students (73152421125, 73152421002):** still exactly **2 pages**; page 1 fills to ~776 pt; page 2
  now carries sections 5–10 spread with the signature heading at **y≈508 pt** and captions at **y≈582–593 pt**
  (was 297 / 340–353) → the blank tail is cut from ~440 pt to ~200 pt and no third (nearly-empty) page is created.
  Bounding boxes show nothing in the header band (body starts ≥ y≈104 pt < 30.6 mm rule) and nothing past the
  16 mm bottom margin; footer `Page X of 2` at y≈811 pt on both pages.
- **Long record (synthetic 120-row book, `test:record-book-header`):** grew 7 → **9 pages** with the larger type;
  the long IA table still repeats its column headers on **all 8 subject-row continuation pages**, the header stays
  in its band on all 9, the watermark is centred on the physical page on all 9, and no body text is clipped
  (max body bottom 788 pt < 797 pt limit).
- **Rendered page screenshots** before (`pages-21125/`) and after (`pages-21125-after2/`) plus the live PDFs are
  saved under `.runtime-verify/layout-before/` for human inspection. (Honest note: this agent cannot display raster
  images, so the "before/after" comparison was done with MuPDF per-line geometry, per-band ink occupancy and
  watermark pixel-diff — not by eye.)
- **One renderer assertion corrected (measurement fix, not a weakened guarantee):** the old "watermark is centred"
  check derived the mark's centre from a *pixel-diff bounding box*, which is biased on sparse pages because opaque
  table cells/banner are painted **above** the background layer and hide whatever part of the mark sits under them
  (it reported y≈452 pt on the last page). The check now measures the watermark's **own PDF text geometry**, which
  overpainting cannot hide (reports the true centre, y≈419 vs page centre 421 pt, on every page). It still fails
  hard if the mark is missing or off-centre by > 20 pt; the "true background layer" and `\` diagonal pixel checks
  are unchanged.
- **Regression matrix re-run:** `test:record-book-header` **68/68**, `test:runtime` **38/38**,
  `test:document-watermark` **44/44**, `test:document-watermark-runtime` **46/46**, `test:internal-marks`
  **97/97**, `test:critical` **12/12**; backend `tsc --noEmit` **exit 0**; backend `npm run build` **exit 0**.
  Frontend untouched.

**Files changed:** `backend/src/modules/pdf/record-book-html.service.ts` (CSS + signature markup),
`backend/src/tests/record-book-header.test.ts` (centring measurement). Temp inspection scripts were deleted
afterwards.

**Honest limitations (unchanged behaviour, not defects):** a genuinely short record's last page will always have
some blank space at the bottom — the fix reduces it and makes it deliberate, it does not (and should not) fabricate
content to fill it; uploaded originals are still never modified. The legacy jsPDF fallback (only used when no
headless Chromium is installed) does not repeat table headers on `autoTable` page breaks.

### Full security, bug-fix & regression audit — PASS (2026-10-11)

**Scope.** A single end-to-end security + correctness pass over every role (STUDENT / FACULTY / HOD
/ ADMIN / PRINCIPAL), every page and API, the authz matrix, uploads, PDF/Excel generation, the
grammar & AI assistant, reports and exports. All 28 backend suites were re-run sequentially against
their own ports; every suite that exercises HTTP login, marks templates, marks import, or record-book
generation was re-run again after the fixes below.

**Findings (confirmed) and fixes.**

1. **Login brute force unlimited (HIGH, fixed).** `POST /api/auth/login` accepted unlimited
   credential attempts. New dependency-free middleware `backend/src/middleware/login-rate-limit.middleware.ts`
   tracks a sliding window of failed attempts per `(client IP + username)` (default 10) and per
   client IP (default 60), both per 15 minutes, env-tunable (`LOGIN_MAX_ATTEMPTS`,
   `LOGIN_MAX_IP_ATTEMPTS`, `LOGIN_WINDOW_MS`). Only 401 responses count; a 2xx login resets the
   per-identity counter, so normal use is never locked out. When either threshold is reached the
   middleware answers **429 with `Retry-After`**. Wired at the top of `auth.routes.ts`
   (`router.post('/login', loginRateLimit, login)`). Verified by `test:security-hardening` checks
   4–5 + 7 (also proves per-identity isolation and reset-on-success).

2. **Marks Excel template leaks other departments (HIGH, fixed).** `generateMarksTemplate` ignored
   the requesting HOD's department when listing students. It now takes `departmentId` and includes it
   in the roster query (`marks-bulk-upload.service.ts`); `hod.controller.ts` passes
   `scope.departmentId` (never the request body). A CSE template can no longer contain ECE register
   numbers. Verified by `test:security-hardening` check 1.

3. **Bulk import trusts client rows (HIGH, fixed).** `executeMarksImport` persisted rows from the
   Excel client with minimal server-side sanity. It now re-validates each row against the real
   `MARK_TYPES` (`isMarkType`), requires an integer semester 1–8, and re-checks marks against the
   stored `maxMarks` range; every created mark/record persists the owning `student` and existing
   `InternalMark.record` rows are recognised, so repeated imports do not silently orphan rows.
   Cross-department register numbers are refused 400. Verified by `test:security-hardening` checks
   2–3.

4. **JWT secret shipped as a hardcoded literal (HIGH, fixed).** `auth.middleware.ts` now resolves
   `JWT_SECRET` from the environment only (dotenv first), throws at boot in `NODE_ENV=production`
   when unset, and falls back to a fresh random development-only secret otherwise (logged; sessions
   do not survive restart in dev without a configured secret). No literal fallback remains. `.env`
   / `.env.example` already carried the dev secret; the new `LOGIN_*` knobs were documented in
   `.env.example`. Verified by `test:security-hardening` check 6.

5. **Record book drops every uploaded image (HIGH, pre-existing — fixed).** The HTML/CSS record-book
   renderer's decode pre-check called `sharp(dataUrl.replace(/^data:.*;base64,/, ''))` — i.e. it
   passed the **raw base64 string** to a library that treats strings as file paths, so the check
   always threw and every valid `image/png` document was pushed to the "could not be decoded"
   annexure notice and never embedded. Root cause proven with a temporary harness (file located,
   sniffed `image/png`, `sharp(path).metadata()` decoded 137×89 fine; the base64-string call threw).
   Fixed by passing `Buffer.from(dataUrl.split(',')[1], 'base64')` — a genuine byte buffer — to
   `sharp().metadata()`. `test:runtime` went from 37/38 to **38/38** (check 23 now embeds the
   137×89 XObject at its intrinsic size); `test:document-watermark-runtime`, `test:mentoring-evidence`,
   `test:evidence-location` and `test:evidence-location-runtime` re-verified green.

6. **Stale test contract vs deliberate DELETE_HOD feature (LOW, pre-existing — test updated).**
   `test:faculty-dept-reassign` asserted `AdminHodManagement.tsx` must not reference
   `api.admin.deleteHod`. That assertion predated the deliberate, backend-supported permanent
   deletion safety valve (`DELETE /api/admin/hods/:hodId`, restricted to **inactive verified demo
   HODs**, with dependents scanned and a `DELETE_HOD` audit event). The assertion now requires the
   reference to be gated behind `confirmDeleteHod` + `is_verified_demo` instead — i.e. "Remove HOD
   de-activates" stays enforced while the gated safety valve is accepted. Suite back to **18/18**.

**New suite.** `backend/src/tests/security-hardening.test.ts` (port 5119) — 7/7 PASS: template
department isolation; import persists owning student; cross-department import refused; login 429 +
Retry-After; success resets the counter; JWT source contract (no old literal); login middleware wired.
Script `test:security-hardening` added to `backend/package.json`.

**Regression re-runs (all EXIT 0).** `test:hod`, `test:hod-class-management`, `test:internal-marks`,
`test:bulk-upload`, `test:admin`, `test:admin-routes`, `test:hod-admin`, `test:hod-delete`,
`test:principal`, `test:admin-auth`, `test:critical`, `test:document-watermark-runtime`,
`test:evidence-location`, `test:evidence-location-runtime`, `test:mentoring-evidence`,
`test:faculty-dept-reassign`, `test:runtime` (38/38), `test:security-hardening` (7/7). Backend
`tsc --noEmit` + `npm run build` PASS; frontend `tsc --noEmit` PASS.

**Pre-existing / environment-dependent — documented, not changed (the first entry is superseded by
the follow-up pass below).**
- OUTDATED (superseded 2026-10-11 — see "Full security audit — follow-up pass" below) —
  `test:ai-assistant` requires a live Ollama host on `127.0.0.1:11434`. No such host exists in this
  sandbox; outbound connects hang to timeout, so the suite cannot complete or be verified here. It is
  an environment dependency, not a code failure. Re-run on a host with Ollama before claiming it.
- Marks **bulk upload** intentionally bypasses the admin-controlled mark-entry window (an HOD /
  trusted uploader may import directly). Documented as a design decision; not changed.
- The login throttle state is in-process only. Correct for the single-instance local-store deployment;
  a multi-instance deploy must move the bucket to a shared store.

### Full security audit — follow-up pass (2026-10-11, same audit)

**Goal.** Nothing new broke. Two loose ends from the initial pass were closed with real fixes and
fresh evidence.

1. **`test:ai-assistant` hang — root cause found and fixed (test-harness defect, not app code).**
   The suite never needed a live Ollama host: it starts an **in-process mock Ollama** (binds
   `127.0.0.1:0`, sets `OLLAMA_BASE_URL` to that port before `await import('../index.js')`, and the
   Ollama client reads config on every call). It passed **all 47 checks** and then never exited: the
   imported Express listener plus the 1-hour meeting-reminder interval keep the Node event loop
   alive, and the suite only called `process.exit(1)` on failure. Added the explicit
   `process.exit(0)` after teardown — the same pattern every other backend suite that boots
   `src/index.js` already uses. Suite now **47/47 PASS, EXIT 0, port 5297 freed**. The earlier
   "requires a live Ollama at 127.0.0.1:11434" conclusion was based on this hang, not on a real
   dependency; the AI module itself (`src/modules/ai/*`, `ollama.service.ts`) is untouched.
2. **Marks bulk import had no audit trail (LOW / audit-integrity, fixed).** Every manual marks save
   writes `UPDATE_INTERNAL_MARK_HOD` (`hod.controller.ts`), but `executeMarksImport` — the HOD bulk
   path, including direct-file imports — wrote no audit row, so a bulk load left no record of who /
   what / when. `marks-bulk-upload.service.ts` now writes one `IMPORT_MARKS_BULK` audit row per run
   through the existing failure-tolerant `logAudit()`: outcome summary
   (total/imported/updated/skipped/failed), up to 50 register numbers and up to 20 subject codes,
   never passwords/tokens/hashes. The write happens after the per-row loop, so a fully-refused
   import is audited too (`failed=1/imported=0`). `test:security-hardening` grew a regression check
   (3b) that asserts ≥2 rows after the suite's two import calls and scans them for leaked secret
   fields. Suite is now **8/8, port 5119**.

**Verification (this follow-up).** Full 28-suite matrix re-run sequentially from `backend`
   (`npm --prefix backend run test:X`): **28/28 EXIT 0** — including `test:runtime` (38/38),
   `test:faculty-dept-reassign` (18/18) and `test:ai-assistant` (47/47); `test:security-hardening`
   8/8. Backend `tsc --noEmit` + `npm run build` PASS; frontend `tsc --noEmit` + `vite build` PASS
   (pre-existing chunk-size warning only). Static scans (Phase 2): no hardcoded secrets outside test
   fixtures; `JWT_SECRET` env-driven with production fail-closed and a random dev fallback; upload
   path resolution rejects traversal (`relativeUploadPath` refuses `.`/`..` and non-`uploads`
   prefixes, `resolveStoredUploadPath` re-checks containment). Marks bulk-upload security path
   re-traced: HOD-only routes with `departmentId` claim, template filtered by `scope.departmentId`,
   10 MB multer cap + xlsx/MIME filter, per-row server-side re-validation (assessment type, semester
   1–8, stored max range), dept-scoped student re-check, per-row Fail never throws. No probe/temp
   artifacts left in the repo; branch `temp` uncommitted.

### Full browser E2E verification + two confirmed UI defects fixed — PASS (2026-10-11)

**Method (real browser, disposable sandbox).** The prior passes could not do a
click-through because no headless-browser package is installed. This pass drove a **real headless
Chromium over the Chrome DevTools Protocol** using Node 24's built-in global `WebSocket` (no new
dependency added to the repo). It ran against a **disposable sandbox** so the working environment was
never touched: a second backend on port **5056** over a freshly seeded temporary store
(`E2E_SCRATCH=e2e-store`, re-seeded before the run), and the SPA rebuilt to a temp out-dir with
`VITE_API_URL=http://localhost:5056` and served on port 4174. The developer's live servers (backend
5050, Vite 3000) were left running and untouched; the sandbox source/store are gitignored and were
removed afterwards. **Result: 42 / 42 checks PASS** across sections A–J.

**Confirmed defects found and fixed (both by the browser, not by static reading).**

1. **Silent failed login (MEDIUM, pre-existing — also present on `HEAD`).** On the login page a wrong
   username/password left the form frozen with **no error shown**. `AuthContext.login` called
   `setIsLoading(true)` synchronously *before* its `await`; `App.tsx`'s top-level `if (isLoading)`
   gate then swapped the whole tree for the boot screen and **unmounted `LoginPage`**, so the 401's
   `setError` hit an unmounted component and the freshly remounted page rendered no alert. Fixed by
   removing the global `setIsLoading(true)` / `finally { setIsLoading(false) }` from `login()` (the
   submit button keeps its own local `loading` state); `isAuthenticated` is still derived from the
   user. Verified by the browser: no boot-screen flash, `.login-alert` (`role="alert"`) now renders
   the failure message, and the typed username is preserved.
2. **HOD Marks selection wiped by any toast (MEDIUM, confirmed).** On HOD **Marks Management**, any
   toast — including the harmless "IA1 template downloaded." — cleared the chosen class / subject /
   semester and re-fetched, which collapsed the action buttons (`.btn-gold`) and made bulk upload
   fail intermittently. Root cause: `useToast()` returned the **whole context value object**, which
   `ToastProvider` recreated on every render (it carried the live `toasts` array), so the `toast`
   identity changed on every toast; the `loadSubjects` effect listed `toast` in its dependency array
   and therefore re-ran, calling `setSubject('')` / `setSemesterNumber('')`. Fixed at the root in
   `frontend/src/context/ToastContext.tsx`: the value is now `useMemo`-ised and made **actions-only**
   (the `toasts` array is only ever read inside the provider for rendering, so it was removed from the
   public context type/value). Consumers now receive a stable reference; no dependency array needed
   editing. Verified by the browser: the selection survives the success toast and the following bulk
   upload succeeds (new regression assertion).

**Browser evidence (sections A–J, 42/42).** A login page render/fields/styling/logo/password-toggle;
B invalid-credential error alert; C Admin login → dashboard → API-backed Admin Overview → logout
(clears token); D Student login, profile-complete card, and RBAC refusals (403 on admin/HOD/marks);
E HOD nav scope, own-department subjects (CS8491), Class Management year cards, admin endpoints
refused; F the full marks workflow (page opens, subject list, template + bulk actions, Excel template
download **200 xlsx**, selection survives the toast, valid workbook previews 1 row, import writes
exactly one row, the imported IA1 mark **persists** as 40, and a corrupt `.xlsx` is rejected with no
preview); F2 ECE HOD cannot see CSE data; G FACULTY nav + RBAC; H Principal first-login forced
password change → read-only dashboard, no management surfaces, reads 200 / writes 403; I no horizontal
overflow at 1440×900, 1024×768 and 390×844 (and login fits at mobile); J zero uncaught page exceptions
and zero unexpected console errors (the only console output is the deliberate 401/403/400 from the
negative tests plus the benign notifications 403 during the Principal's forced-password-change window).

**Verification (actual results, this pass).**
- Browser E2E (headless Chromium, sandbox): **42/42 PASS**, 0 failed.
- Backend full matrix re-run sequentially from `backend` (`npm --prefix backend run test:X`):
  **29/29 EXIT 0** — `critical, directory, export, grammar, grammar-safety, grammar-api, hod,
  hod-class-management, faculty-notifications, admin-routes, hod-admin, hod-delete,
  faculty-dept-reassign, bulk-upload, admin, mentoring-evidence, document-watermark,
  document-watermark-runtime, evidence-location, evidence-location-runtime, internal-marks, placement,
  leaderboard, runtime (38/38), state-machine, admin-auth, principal, ai-assistant (47/47),
  security-hardening (8/8)`.
- Backend `npm run build` (tsc) → **exit 0**; frontend `npm run build` (`tsc && vite build`) →
  **exit 0** (pre-existing chunk-size warning only).
- Static scans re-confirmed: no hardcoded secrets outside test fixtures; `.env`, `dist/`, `.test-data/`
  and uploads all gitignored. Changes remain **uncommitted** on branch `temp` (no commit/push made).

### Student documents — repeating KSRCE institutional header on every page — PASS (2026-10-11)

**Requirement.** Every page of the student-generated documents (the record book and the two other
`?mode=` downloads) must carry the same KSRCE institutional header — college name, autonomous/AICTE/
Anna University affiliation line, Tiruchengode address and the verified college logo — on page 1 **and
every subsequent page**, in the existing navy-and-gold style, with a subtle divider, without ever
overlapping the body and without disturbing the existing `K S R C E` watermark.

**Why a CSS `position: fixed` header could not be used (measured, not assumed).** Chrome's print engine
supports neither `@page` margin boxes nor a fixed header that reserves its own space: a probe with
`@page { margin: 34mm 12mm 16mm }` and a `position: fixed` band placed the header text at **y≈107pt**
while body text started at **y≈96pt** — the fixed layer is painted at the CONTENT-box top on every
page, so it overlapped the body. That is precisely why the pre-existing code emitted the header **once**
in normal flow and it therefore appeared on page 1 only.

**Fix (the renderer's own per-page mechanism).** `backend/src/modules/pdf/record-book-html.service.ts`:
- `@page { size: A4; margin: 12mm }` → `margin: 35mm 12mm 16mm`, reserving a real top band for the
  header on **every** page (and clean space for the footer at the bottom).
- The one-off in-flow `headerHtml()` is **removed**, together with its now-unused `.topbar` / `.insthead`
  / `.collegename` / `.autoline` / `.addrline` / `.doctitle` / `.instrule` CSS.
- `stampPageFooters()` → **`stampPageFurniture()`**, which on every Chrome-rendered page (limit =
  `basePageCount`) now draws BOTH the repeating header — navy top rule, the verified
  `assets/ksrce-logo.png` (embedded once, aspect-fitted into a 15mm box), centred college name,
  affiliation line and address, the gold document title, and a subtle divider at 30.6mm — **and** the
  existing footer ("… | Reg No: … | Generated on: …" + "Page X of Y"). `pdf-lib` was already a
  dependency; no new dependency was added.

**Scope / non-changes.** Applies to all three modes (`full`, `internal`, `mentor-documents`) because they
all render through `renderRecordBookHtmlToPdf`. Appended verbatim PDF annexure pages and their jsPDF
sheets keep their own native layout (stamped pages = `basePageCount` only), matching the footer rule.
The legacy jsPDF fallback (`pdf.service.ts`) is untouched — it already draws a header on each page it
creates and is only used when no browser is installed. Unrelated reports, login/dashboard pages and the
`K S R C E` watermark are unchanged.

**Files changed (all this task):** `backend/src/modules/pdf/record-book-html.service.ts` (header CSS
removed, margin reserved, `stampPageFurniture` added), `backend/src/tests/helpers/pdf-text.ts` (new
`pdfPageLines()` line-bounding-box helper), `backend/src/tests/runtime-verification.test.ts` (asserts the
header on every footered page of the image-bearing book), `backend/src/tests/record-book-header.test.ts`
(new suite), `backend/package.json` (`test:record-book-header` script), `PROJECT_PROGRESS.md`.

**Verification (real multi-page PDF inspected, programmatically — page 1 + later pages).**
- `backend/src/tests/record-book-header.test.ts` (new; `npm run test:record-book-header`) renders a
  realistic full record book with a **120-row** internal-assessment table → **7 pages**, and asserts per
  page from the actual PDF via MuPDF text + line bounding boxes + image XObjects: the header is present;
  it sits inside the reserved top band (header top **y=35.0pt**); **no non-header text line starts above
  the divider** (30.6mm) → zero body/header overlap; the footer reads the correct "Page X of Y"; the
  `K S R C E` watermark is present; and the 205×190 college logo image object is embedded. The long table
  flows across **6 distinct pages**. The `internal` and `mentor-documents` modes are rendered and checked
  the same way (header + footer on every page). **50/50 PASS.**
- Pixel inspection of the first/middle/last pages (`sharp` raw scan): navy top bar at ~10–14mm, gold
  title present, header ink ends ~28mm, a blank gap follows, and body ink begins at exactly **35mm** —
  identical on pages 1, 4 and 7.
- Real HTTP pipeline: `runtime-verification.test.ts` now asserts the header on **every footered page** of
  the image-bearing record book, including the NSS photo annexure page. `test:runtime` **38/38**.
- Full backend matrix re-run sequentially from `backend`: **30/30 EXIT 0**. Backend `tsc --noEmit` +
  `npm run build` exit 0; frontend `tsc --noEmit` exit 0 (frontend was not modified).

**Remaining limitation (documented, not fixed).** The legacy jsPDF fallback renders its header in normal
flow after each `addPage()`; pages produced by an `autoTable` internal page break on a machine with **no
browser** would not carry the header. The default/primary HTML renderer (used whenever a browser is
present, as in this environment) repeats the header on every page. Changes remain **uncommitted** on
branch `temp`.

### Student PDF — watermark, header and content overlap — final layout pass — PASS (2026-10-11)

**Requirement.** Make the generated student PDF correct: the `K S R C E` watermark is a light, semi-transparent
background layer on **every** page; the KSRCE institutional header repeats on every page; and no content is
hidden, clipped or overlapped. Preserve all existing record-book content, the persistence architecture, upload
permissions and the separate-watermarked-copy workflow for uploaded documents.

**Root cause (confirmed by rendering the real service output, not assumed).**
1. **Header overlap / missing on pages 2+.** Chrome's print engine supports neither `@page` margin boxes nor a
   `position: fixed` header that reserves its own space — a fixed band is painted at the CONTENT-box top on
   every page and overlaps the body (measured: header text y≈107pt vs body y≈96pt at a 34mm top margin). The
   pre-existing code therefore emitted the header **once in normal flow**, so it appeared on page 1 only and
   pages produced by a long-table page break started body text at the very top of the page.
2. **Watermark off-centre.** In the HTML renderer the `position: fixed` watermark was centred in the @page
   **content box** (top 35mm / bottom 16mm margins), so the diagonal sat ≈9.5mm below the physical page centre
   (inked bbox centre y≈451pt vs page centre 421pt). It was already a genuine background layer (z-index 0 under
   `.content`), but the earlier "watermark covers text" symptom came from the now-removed foreground-overlay
   heuristic in `document-watermark.service.ts` (fixed 2026-10-10 for uploaded documents); this pass proves the
   same background guarantee holds for the HTML record book, pixel by pixel.
3. **Content / tables.** Long tables split across pages without repeating their column headers, so continuation
   pages showed unlabelled columns; with no reserved top band, pages after the first had body ink flush to the
   page top.

**Files changed (final state of this task; the repeating-header mechanism was already in the working tree and was
completed, hardened and independently verified in this pass).**
- `backend/src/modules/pdf/record-book-html.service.ts`:
  - `@page { size: A4; margin: 35mm 12mm 16mm }` — reserves a real top band (per-page header) and bottom band
    (per-page footer) on EVERY page.
  - No in-flow header is emitted. `stampPageFurniture` (pdf-lib, the mechanism the footer already used) stamps
    the repeating college header — navy top rule, verified `assets/ksrce-logo.png` (embedded once, aspect-fitted
    in a 15mm box), centred college name, autonomous/AICTE/Anna University affiliation line, Tiruchengode address,
    gold document title, subtle divider at 30.6mm — and the footer ("… | Reg No: … | Generated on: …" + "Page X
    of Y") onto every Chrome-rendered page.
  - Watermark: `.wm` stays a `position: fixed` background layer (`z-index: 0`, `pointer-events: none`,
    `user-select: none`, light grey at 8% opacity) with `transform: translateY(-9.5mm) rotate(45deg)` — the
    `-9.5mm` shift accounts for the top/bottom margin asymmetry so the diagonal is centred on the physical A4
    page, and CSS-positive rotation gives the required bottom-right → top-left `\` diagonal. It is drawn strictly
    beneath `.content`, so text, tables, the student banner, signatures and the stamped header always paint on
    top. Uploaded photos are content: the mark sits behind them (and can only ever appear in white space), i.e.
    the watermark is never added to the photographs themselves.
  - Tables: `gridTable` (every grid table, including the long internal-assessment table) and the photo montage
    now wrap their section title + column headers in a real `<thead>`, and the stylesheet adds
    `table.grid thead { display: table-header-group }`, so Chrome repeats the headers at the top of every
    continuation page. Rows keep `break-inside: avoid` (short rows are not split across pages) and content flows
    naturally onto later pages; no fixed-height containers remain.
- `backend/src/tests/record-book-header.test.ts` — extended from 50 → **56 checks** with three new sections:
  G. every page a long table continues onto repeats its column headers; H. no body line is clipped below the
  page content box (bottom margin 16mm); I. pixel-diff of the watermarked render against an identical
  un-watermarked control — the document ink is unchanged (a foreground watermark would shift every text pixel),
  the watermark ink runs the `\` diagonal (slope ≈ +0.95 in screen coordinates), and its inked bbox is centred
  on the physical page (y≈424pt vs 421pt; ≈3pt glyph-ink asymmetry).
- `backend/src/tests/helpers/pdf-text.ts`, `backend/src/tests/runtime-verification.test.ts`,
  `backend/package.json` (`test:record-book-header`) — the header/geometry helpers and the HTTP-level "header on
  every footered page incl. the image annexure" assertion (already in the working tree, preserved and re-run).

**Verification — real multi-page PDFs inspected programmatically (pixel + geometry, not build-only).**
- `test:record-book-header`: **56/56 PASS** — synthetic full record book = **7 pages**; the 120-row
  internal-assessment table spans **7 pages**; per page 1→7: institutional header present inside the reserved
  band (header top y=35.0pt), zero body/header overlap (every body line starts below the 30.6mm divider),
  correct footer "Page X of 7", `K S R C E` present, college logo (205×190) XObject embedded, column headers
  repeated, and no body text below the content box (min margin 5.5pt). `internal` mode = 6 pages and
  `mentor-documents` mode = 1 page, both carrying header + footer on every page.
- `test:runtime` **38/38** — real HTTP pipeline; header asserted on every footered page of the image-bearing
  record book including the NSS-photo annexure page.
- `test:document-watermark` **44/44** and `test:document-watermark-runtime` **46/46** — uploaded-document
  watermark service unchanged: background layer on every page, originals byte-for-byte preserved.
- Regressions `test:internal-marks` **97/97** and `test:critical` **12/12**.
- Backend `tsc --noEmit` **exit 0**; backend `npm run build` **exit 0**. Frontend untouched.

**Remaining layout notes (documented, not defects).**
- Appended verbatim PDF annexure pages and their jsPDF cover sheets keep their own native layout (never stamped
  with the record-book header/footer/watermark), which matches the existing footer rule and "preserve original
  uploaded documents".
- A page whose content is one opaque object (a full-page scan) hides the underlaid watermark behind that paint —
  deliberate, since the watermark must never sit in front of content.
- The legacy jsPDF fallback (only used when no browser is installed) draws the header on the pages it creates but
  not on `autoTable` internal page breaks — pre-existing limitation.
- Changes remain **uncommitted** on branch `temp` (no commit/push made).

### Gemini Integration into AI Assistant (Chatbot) — PASS (2026-10-15)

**Scope & Requirements:** Integrate Google Gemini API into the existing role-aware AI Assistant (`/api/ai/*`). Preserve React+TypeScript+Vite + Node+Express+TS backend and the local JSON storage architecture. Reuse and improve the existing chatbot (do not duplicate). Backend-only secret; never expose API key to browser, API responses, or logs. Support loading/empty/API failure/quota/timeout/retry states in the UI. Run typechecks, builds, and tests.

**Implementation:**
- Added `backend/src/services/gemini.service.ts` using the official `@google/genai` SDK 2.30.0: config read at call time, `models.get` probe for availability, `models.generateContent` for chat, maps 401/403→INVALID_KEY, 429→QUOTA, 5xx→HTTP, timeouts→TIMEOUT, malformed/parse→MALFORMED, disables SDK auto-retry (attempts=1) to prevent duplicate billable requests.
- Added `backend/src/services/ai-provider.service.ts`: deterministic provider selection (Gemini if `GEMINI_API_KEY` set and non-empty, else Ollama), shared error kinds/status mapping, safe user-facing messages; exposes `getAiProviderStatus()` and `generateAiReply()`.
- Controller (`backend/src/modules/ai/ai-assistant.controller.ts`): `getAiStatus()` reports provider/model/available/configured; `sendChatMessage()` uses provider abstraction; maps `AiProviderError` to HTTP statuses (429 for QUOTA, 504 for TIMEOUT, 502 for HTTP, 503 for others). Routes header updated.
- Env: `backend/.env` has `GEMINI_API_KEY=` (empty); `backend/.env.example` documents Gemini config. `.env` remains gitignored.
- Frontend: `AiAssistant.tsx` adds retry, richer error classification (quota/offline/timeout/busy/generic), restores text on failure, Retry button in banner, quota-specific placeholder; `api/client.ts` `ai.status` accepts optional `provider`.
- Tests: `backend/src/tests/gemini-integration.test.ts` (38 checks) boots real app against mock Gemini (GET models, POST generateContent), verifies key sent only as `x-goog-api-key`, never leaked in bodies/logs, exactly one request per message, correct mappings (429/502/503/504), role scoping preserves own data, missing key → NOT_CONFIGURED (unit). Added `test:gemini` script. `ai-assistant.test.ts` explicitly clears `GEMINI_API_KEY` for determinism; still passes (47/47).

**Verification:**
- Backend typecheck: `tsc --noEmit` → exit 0.
- Frontend typecheck: `tsc --noEmit` → exit 0.
- Root build: `npm run build` (backend + frontend) → exit 0 (frontend bundles produced, e.g., index 342.90 kB).
- Tests: `test:ai-assistant` 47/47 PASS; `test:gemini` 38/38 PASS.
- Manual probe: SDK calls `POST /v1beta/models/{model}:generateContent`, sends `x-goog-api-key`, correct body shape; timeout/malformed/429/401/500 all mapped correctly with exactly 1 upstream request.

**How to configure locally:**
1. Backend `.env` (`backend/.env`) — set `GEMINI_API_KEY=<your_google_genai_key>`. Leave empty to use local Ollama. Optionally set `GEMINI_MODEL` (default `gemini-2.5-flash`), `GEMINI_TIMEOUT_MS` (default 45000), `GEMINI_BASE_URL` (for offline tests).
2. The key must never be committed; `.env` is gitignored. Never put it in frontend `.env` or any source file.
3. To test with a valid key: run backend `npm run dev` (tsx watch), frontend `npm run dev`; open the AI Assistant. With an empty key, it falls back to Ollama (requires `OLLAMA_BASE_URL` etc.).
4. Run tests: `cd backend && npx tsx src/tests/gemini-integration.test.ts` and `npx tsx src/tests/ai-assistant.test.ts`.

**Remaining issues:** None specific to this integration. The chatbot remains advisory/read-only and preserves all existing behavior when Ollama is used. No commit/push made.

**Symptom.** Despite the final-layout pass above (56/56 renderer checks, HTTP-level runtime 38/38) the user
reported the record book was STILL wrong in the actual running application. The previous pass had verified the
working tree and the test pipeline, but **never the live 5050 process the browser actually talks to**.

**Root cause (investigated, then eliminated by restart — honestly reported).**
1. **The live backend was executing a frozen snapshot.** The running process on 5050 was the `tsx watch`
   **child** (PID 17128) of watcher PID 32920. Its start time (21:36:53) was the *same second* as the last
   write to `backend/src/modules/pdf/record-book-html.service.ts` — the child had restarted at the moment of
   the final save, so it was running code from just before/at that instant. Whether it loaded the final bytes
   cannot be proven after the fact (mtime ≡ start time); what is certain is that the fix had never been proven
   on the running server and the browser had been consuming that process's output. Restarting 5050 with the
   current code — explicitly authorized — removed the ambiguity, and the real endpoint then returned fixed PDFs.
2. **No stale stored-form artifacts** — `uploads/` contained no previous Student Details Form copies, so the
   cached-`syncStudentDetailsPdf` path could not be serving old layout either.
3. **Live data is short.** `backend/data` has no internal-marks rows, so online record books are 1–2 pages;
   multi-page/continuation behaviour can only be exercised with representative seeded data (done on an isolated
   scratch instance).

**What was done.**
- Killed the stale watcher + child (32920 / 17128) and restarted `npm run dev` (`tsx watch src/index.ts`) on
  5050; `/api/health` 200. The browser's Vite proxy (`/api` → `localhost:5050`) now hits the fresh server.
- **Live end-to-end, exactly the browser path:** `POST /api/auth/login` (real `Ksrce@admin`) →
  `GET /api/pdf/student/:id?mode=full` for three real live students incl. 73152421125. Inspected the returned
  PDFs page by page (MuPDF text + geometry): every page carries the college header, `Page X of Y` and the
  `K S R C E` watermark; body text starts at y0 102–107 pt (below the 30.6 mm header rule); nothing broken past
  the 16 mm bottom margin. Copies: `.runtime-verify/live-app/*-full.pdf`.
- **Multi-page over the same endpoint** on an isolated scratch instance (port 5098, temp `DATA_DIR`/`UPLOADS_DIR`
  — the developer's live store and `storage/uploads` untouched) seeded with 120 internal-marks rows
  (8 semesters × 15), 8 academic records, 40 meetings, 5 counselling records, 8 monthly progress entries,
  3 evidence photos, 2 JPEG certificate scans and a real 3-page PDF annexure:
  - `full` = **19 pages**: all **15 Chrome-rendered pages** show the header inside the reserved band, the correct
    `Page X of 19` footnote and the `K S R C E` watermark, with **zero body lines inside the header band** and no
    content past the content box; the long IA table flows across **5 pages** and its column headings
    (`Subject Code / Subject Name / IA1 … End Sem / Total`) **repeat on every continuation page**; the uploaded
    photos, scans and the 3-page PDF are reproduced untouched (photos + scans verified **byte-identical** on disk
    after generation — never watermarked or modified); the PDF annexure appears verbatim behind its jsPDF cover
    sheet (native layout preserved — documented limitation).
  - **Watermark proof (pixel-diff vs an un-watermarked control rendered from the same store):** document ink
    unchanged (ink+ ≈0.12–0.81%, far under the 5% threshold) → genuine background layer behind all text/tables/
    signatures; slope ≈ +0.95 → the required bottom-right → top-left `\` diagonal; ink bbox centre ≈424 pt vs
    page centre 421 pt → centred on the physical A4 page.
  - `internal` = 8 pages (4 Chrome pages furnished + annexure tail preserved); `mentor-documents` = 14 pages
    (10 Chrome pages furnished + annexure tail preserved).
- **Regression matrix re-run:** `test:record-book-header` **56/56**, `test:runtime` **38/38**,
  `test:document-watermark` **44/44**, `test:document-watermark-runtime` **46/46**, `test:internal-marks`
  **97/97**, `test:critical` **12/12**; backend `tsc --noEmit` **exit 0**; backend `npm run build` **exit 0**.
  Frontend untouched.

**Files changed in this follow-up:** none (product code was already correct in the working tree). This pass
restarted the dev process and verified real HTTP output. Temp verification scripts were removed afterwards.

**Honest limitations (unchanged behaviour, documented, not defects):** appended verbatim PDF annexure pages and
their cover sheets keep the uploaded document's own native layout (never stamped with the record-book
header/watermark — that matches "preserve original uploaded documents"); a page filled by one opaque object (a
full-page scan) hides the underlaid watermark behind that paint (deliberate — the mark must never sit in front
of content); the legacy jsPDF fallback (only used when no headless Chromium is installed) does not repeat table
headers on `autoTable` internal page breaks. The live store's record books are short (no internal marks stored),
so on-5050 multi-page output cannot be exercised with real data; multi-page correctness was therefore proven on
the isolated scratch instance through the identical HTTP route.

### HOD Class Management — Filter Removal & Year-Wise Section Cards — PASS (2026-10-11)

**Scope:** Removed the "Select Academic Year & Year" filter card from HOD Class Management and
rebuilt the page as a year-wise (I–IV) section-card layout driven entirely by stored department
data, with distinct **View Class** (roster + analytics) and **Manage Marks** (full marks workflow)
actions. No unrelated page was changed; all pre-existing uncommitted work was preserved.

**UI — filter card removal:**
- The entire selection card (heading, Academic Year dropdown, Year dropdown, its loading text and
  the wrapped year list) was deleted from `HodClassManagement.tsx`. No empty container or leftover
  spacing remains — the page opens straight into the year sections.

**UI — year-wise section cards:**
- Sections are fetched once with **no filters** via `api.hod.marks.getClasses()` →
  `GET /hod/class-management/classes`. The backend groups department students by `(year, section)`,
  so a section appears exactly once under its year.
- All four study years (I, II, III, IV) render as clearly separated year blocks with a total
  section count; a year without data shows its own empty-state message rather than a blank.
- Each section is an individual card (responsive grid: multi-column desktop, two-column tablet,
  one-column mobile) showing section name, the derived cohort badge, real student count, real
  subject count, and bottom-aligned **View Class** / **Manage Marks** buttons in the navy/gold
  design system.
- If the department has no classes at all, a single empty state is shown.

**Functionality:**
- **View Class** opens the class detail view in "Class Overview" mode: analytics panel (total
  students + IA1/IA2/End-Sem averages and recorded/pending counts, all derived from the marks
  report) plus the full student roster (register number, name, batch, year, section) with search
  and loading/empty states.
- **Manage Marks** opens the same class in "Marks Entry" mode and automatically applies the class
  by selecting its first available subject + semester. IA1 / IA2 / End-Sem are supported.
- **Inline editing + saving** is now implemented (previously `readOnly`): edited cells are
  validated against the max marks, highlighted, and saved via `api.hod.marks.saveMarks`. A blank
  cell is sent as `null`, which the server treats as "leave the stored mark unchanged" — existing
  marks are never silently erased.
- **Excel template download** (IA1/IA2/End Sem), **bulk upload** (`.xlsx` only), **server-side
  validation preview** (per-row VALID/INVALID/DUPLICATE/ALREADY_EXISTS + reason), **import of VALID
  rows only**, and **Excel export** are all preserved and wired to the real backend.
- Existing HOD department scoping is enforced server-side by `loadScope()` on every endpoint.

**Backend / API changes:**
- `GET /hod/class-management/classes` (`getClassesForYear`) — `academicYear` and `year` are now
  **optional**; with neither, it returns every year/section for the department. Groups by
  `(year, section)`, derives the cohort label from the students' batch names, and returns
  `studentCount` + subjects derived from recorded marks. Invalid `year` → 400.
- `GET /hod/class-management/students` (`getClassStudents`, new) — department-scoped roster for one
  `year` + `section` (optional `academicYear`), sorted by register number; no marks returned.
  Registered in `hod.routes.ts`.
- `frontend/src/api/client.ts` — `getClasses` now accepts optional params; added `getClassStudents`.

**Components (new / changed):**
- `frontend/src/pages/hod/HodClassManagement.tsx` — rewritten orchestration (year list + detail).
- `frontend/src/pages/hod/ClassManagementClassCard.tsx` — card with View/Manage actions.
- `frontend/src/pages/hod/ClassManagementYearSection.tsx` — new year block.
- `frontend/src/pages/hod/ClassAnalyticsPanel.tsx` — new analytics panel.
- `frontend/src/pages/hod/ClassRosterPanel.tsx` — new roster table.
- `frontend/src/pages/hod/MarksEntryTable.tsx` — new editable marks table.
- `frontend/src/pages/hod/BulkMarksUploadModal.tsx` — new self-contained upload workflow.
- `backend/src/modules/hod/hod.controller.ts`, `backend/src/modules/hod/hod.routes.ts`,
  `backend/src/tests/hod-class-management.test.ts` (new), `backend/package.json` (new script).

**Verification (actual results):**
- Frontend `npx tsc --noEmit` → **exit 0**.
- Frontend `npm run build` (`tsc && vite build`) → **exit 0**, 1670 modules transformed.
- Backend `npx tsc --noEmit` → **exit 0**; `npm run build` → **exit 0**.
- `test:hod` → **33/33 PASS**; `test:internal-marks` → **97/97 PASS**.
- New `test:hod-class-management` → **8/8 PASS** (unfiltered grouping exactly once; year filter;
  cohort filter; invalid-year 400; roster sorted + scoped; roster requires year+section; department
  boundary; HOD-only role gate).
- No `@ts-nocheck` under `frontend/src`.

**Remaining issues (not addressed in this scoped pass):**
- Browser/E2E click-through was not performed — no headless-browser package
  (puppeteer/playwright) is installed in the repo. Verification is static type-check + production
  build + backend contract suites only. **Superseded 2026-10-11:** a real headless-Chromium browser
  pass (no repo dependency added — Node's built-in `WebSocket` + CDP) now click-verifies this page and
  the whole app; see the "Full browser E2E verification" subsection.
- Subjects (and therefore the template/bulk-upload subject dropdown) are still derived from
  existing `InternalMark` records, so a class with no recorded marks has no selectable subject
  until one is entered — a pre-existing design constraint, unchanged here.
- Changes remain **uncommitted** (no commit/push made).

### HOD Class Management — Frontend JSX/Parser Repair & TS Hardening — PASS (2026-10-11)

**Scope:** Repair the new HOD `Class Management` page so it compiles cleanly. No backend behavior
or unrelated page was changed; all existing uncommitted work was preserved.

**Root cause of the parser errors (`frontend/src/pages/hod/HodClassManagement.tsx`):**
The `return (...)` of `HodClassManagement` used a bare sibling pattern
`{viewClassDetails && (<div className="class-details-view">…)}` followed by
`{!viewClassDetails && (<div> … <div className="card">…`. The second conditional opened a wrapper
`<div>` and a selection-card `<div>` that were **never closed**, and the `{!viewClassDetails && (`
parenthesis was never closed either — the code jumped straight from the selection form to
`{/* Upload Modal */} <Modal>`. That single missing `</div></div>)}` cascaded into the reported
TypeScript/JSX parser errors (`JSX element 'div' has no corresponding closing tag`,
`'}' expected`, `Unexpected token`, `'</' expected`), plus a secondary
`Block-scoped variable 'handleViewClass' used before its declaration` because the
`yearSectionsContent` `useMemo` referenced `handleViewClass` (declared much later) in its
dependency array. A `// @ts-nocheck` line-1 directive had been added and was masking the file.

**Components refactored:**
- `frontend/src/pages/hod/ClassManagementClassCard.tsx` — rewritten as a clean presentational card.
  Now exports the shared `ClassInfo` and `SubjectOption` interfaces, takes a typed
  `{ cls: ClassInfo; onViewClass: (cls: ClassInfo) => void }` prop and invokes `onViewClass(cls)`
  (the previous version imported the non-existent `handleViewClass` and wired empty `onClick`s).
- `frontend/src/pages/hod/HodClassManagement.tsx` — removed `// @ts-nocheck`; replaced the
  two sibling `&&` blocks with a single `viewClassDetails ? (details) : (main + year list)`
  ternary so the JSX is balanced; deleted the `yearSectionsContent` `useMemo` (and its TDZ
  `handleViewClass` reference) and render the I–IV year groups inline via a `YEAR_ORDER.map(...)`
  that uses the extracted `<ClassManagementClassCard>`; corrected upload modal prop
  `size="lg"` → `maxWidth="900px"` (the shared `Modal` has no `size` prop); removed unused
  imports/states. All handlers, effects, analytics and the bulk-upload/template/export workflow
  are preserved.

**API integration corrections (surfaced once `@ts-nocheck` was removed):**
- `loadClasses` previously called `api.hod.marks.getStudents({ academicYear, year, section: '' })`,
  which is the wrong contract (that endpoint requires `subjectCode` + `semesterNumber`) and would
  never return sections. It now calls the dedicated
  `api.hod.marks.getClasses({ academicYear, year })` → `GET /hod/class-management/classes`
  (department-scoped sections + student counts + subjects).
- `loadClassAnalytics` no longer calls `getStudents` without a subject; it derives `totalStudents`
  from the selected class `studentCount` and computes per-assessment recorded/pending/average from
  `api.hod.marks.getReport(...)` (real marks only — no placeholder numbers, pending is
  `max(0, totalStudents × subjects − recorded)`).
- `academicYears` extraction now narrows with `(y): y is string => y !== null` (was
  `(string | null)[]` → `string[]`).

**Verification (actual results):**
- Frontend `npx tsc --noEmit` → **exit 0** (0 errors).
- Frontend `npm run build` (`tsc && vite build`) → **exit 0**, 1665 modules, `vite build` PASS.
- Backend `npx tsc --noEmit` → **exit 0**.
- `test:hod` → **33/33 PASS**; `test:internal-marks` → **97/97 PASS**.
- No `@ts-nocheck` remains anywhere under `frontend/src` (grep clean).

**Remaining issues (not addressed in this scoped pass):**
- Browser/E2E render verification was not performed in this session — no headless-browser package
  (puppeteer/playwright) is installed in the repo. Static type-check + production build + backend
  contract suites passed, but a live HOD login → Class Management click-through is still unverified.
  **Superseded 2026-10-11:** a real headless-Chromium browser pass now performs exactly this
  click-through; see the "Full browser E2E verification" subsection.
- The marks table inputs are `readOnly` (display only); true inline editing + `saveMarks` wiring was
  never implemented and remains outstanding.
- The original "two cards per class" requirement is currently one section card per class with
  View/Manage actions; analytics live in the class detail view. Left as-is to avoid scope creep.

### HOD Marks Management — Dropdown Data Loading & UI Fixes — PASS (2026-10-11)

**Root Cause:** The HOD Marks Management page had functional bulk upload, template download, and export features, but they were not visible or usable due to:

1. **Silent API failures** — `loadAcademicYears()` called `api.hod.departmentOverview()` but silently caught errors (only `console.error`). If the API failed (e.g., 403 because HOD has no `departmentId`), `academicYears` stayed empty, leaving all dropdowns empty with no user feedback.

2. **Action buttons hidden until `marksData` loaded** — Download Template, Upload Marks (Bulk), and Export Marks buttons were inside `{marksData && ...}` block, so they only appeared after selecting subject AND semester AND loading marks data.

3. **Template download required `marksData`** — Template buttons were inside `marksData &&` block, but only need subject selection (subjectCode, subjectName, semesterNumber from dropdowns).

4. **Export Marks button missing from Marks Report section** — The Marks Report section had "View Report" but no "Export Marks" button.

5. **Export Marks button disabled** — Button was disabled when `!academicYear`, but academic year dropdown was empty due to silent API failure.

**Changes Made:**

**Frontend** (`frontend/src/pages/hod/HodMarksManagement.tsx`):
- Added `loadingAcademicYears` state and loading indicator in Academic Year dropdown
- Added proper error handling with toast notifications in `loadAcademicYears()` instead of silent failures
- Moved action buttons (Download Template, Upload Marks (Bulk), Export Marks) to show when `subject && semesterNumber` are selected (instead of waiting for `marksData`)
- Added `templateAssessmentType` state for template dropdown selection
- Added Export Marks button to Marks Report section
- Template download now uses `subjects` array to find subject details (works without `marksData`)
- Upload modal validates subject/semester before opening
- Upload validation/import use `subjects` array instead of `marksData`
- Export Marks button added to Marks Report section with proper filters
- Export Marks button enabled when `academicYear` is selected (not just when `marksData` exists)

**Frontend** (`frontend/src/api/client.ts`): Export report already supports `semesterNumber` parameter (no changes needed)

**Verification:**
- Backend `tsc --noEmit` → PASS
- Backend `npm run build` → PASS
- Frontend `tsc --noEmit` → PASS
- Frontend `npm run build` → PASS
- `test:internal-marks` → 97/97 PASS
- `test:hod` → 33/33 PASS
- `test:admin-routes` → 8/8 PASS
- `test:critical` → 12/12 PASS
- All existing HOD and internal marks features remain functional

### HOD Marks Management: Excel Bulk Upload & Export — PASS (2026-10-11)

**Scope:** Completed the remaining HOD Internal Marks features: Excel bulk upload with validation/preview and Excel export with formatting.

**Backend Changes (`backend/src/modules/hod/`):**
- New service `marks-bulk-upload.service.ts` with:
  - `generateMarksTemplate()` — Creates assessment-specific Excel templates with student data pre-populated, instructions sheet, and reference values sheet
  - `validateMarksExcel()` — Validates uploaded Excel files: checks file format, headers, student register numbers against department class, assessment types (IA1/IA2/END_SEM), marks range (0 to max), duplicate detection, existing marks detection
  - `executeMarksImport()` — Imports validated rows: upserts marks (creates new or updates existing), enforces department scope, audit logging
  - `exportMarksExcel()` — Generates formatted Excel export with proper column types, frozen headers, auto-filters, percentage calculation, meaningful filename
- New endpoints in `hod.controller.ts`:
  - `GET /hod/marks/template` (enhanced) — Download assessment-specific template
  - `POST /hod/marks/upload/validate` — Validate Excel file with multer middleware (10MB limit, .xlsx only)
  - `POST /hod/marks/upload/import` — Import validated rows or direct file import
  - `GET /hod/marks/export` — Export marks report as formatted Excel
- Routes in `hod.routes.ts` with multer middleware and HOD-only auth

**Frontend Changes:**
- Enhanced `HodMarksManagement.tsx` with:
  - Assessment-type template dropdown (IA1/IA2/END_SEM)
  - Upload button opening modal with file selection → validation preview → import confirmation
  - Validation preview table with color-coded status (VALID/INVALID/DUPLICATE/ALREADY_EXISTS), row-level error messages
  - Import valid rows with progress, summary toast (imported/updated/skipped/failed counts)
  - Export button with filters (academic year, year, section, subject, semester)
  - Per-assessment template download
- API client methods in `frontend/src/api/client.ts`: `validateUpload`, `importRows`, `importUpload`, `exportReport`, `downloadTemplateEnhanced`

**Verification:**
- Backend `npx tsc --noEmit` → PASS
- Backend `npm run build` → PASS
- Frontend `npx tsc --noEmit` → PASS
- Frontend `npm run build` → PASS
- `test:internal-marks` → 97/97 PASS
- `test:hod` → 33/33 PASS
- `test:admin-routes` → 8/8 PASS
- `test:critical` → 12/12 PASS
- All existing HOD and internal marks features remain functional

### HOD Marks Management UI Visibility Fix — PASS (2026-10-11)

**Root Cause:** The HOD Marks Management page had bulk upload, template download, and export functionality implemented but with visibility issues:

1. **Action buttons hidden until marksData loaded** — The Download Template, Upload Marks (Bulk), and Export Marks buttons were inside `{marksData && ...}` block, so they only appeared after selecting a subject AND semester AND loading marks data.

2. **Template download required marksData** — The template dropdown and download button were inside the `marksData &&` block, but they only need subject selection (not marks data).

3. **Export Marks button missing from Marks Report section** — The Marks Report section had "View Report" but no "Export Marks" button.

4. **Template download required marksData** — The template download buttons were inside `marksData &&` block, but they only need subject selection.

**Changes Made:**
- **Frontend** (`HodMarksManagement.tsx`): 
  - Moved action buttons (Download Template, Upload Marks (Bulk), Export Marks) to show when `subject && semesterNumber` are selected (instead of waiting for `marksData`)
  - Added `templateAssessmentType` state for template dropdown selection
  - Added Export Marks button to Marks Report section
  - Template download now uses `subjects` array to find subject details (works without marksData)
- **Frontend** (`api/client.ts`): Export report already supports `semesterNumber` parameter

**Verification:**
- Backend `tsc --noEmit` → PASS
- Backend `npm run build` → PASS
- Frontend `tsc --noEmit` → PASS
- Frontend `npm run build` → PASS
- `test:internal-marks` → 97/97 PASS
- `test:hod` → 33/33 PASS
- `test:admin-routes` → 8/8 PASS
- `test:critical` → 12/12 PASS
- All existing HOD and internal marks features remain functional

### HOD Marks Management & Dashboard Alignment Fixes — PASS (2026-10-10)
 
**Scope:** Implemented comprehensive marks management for HODs and fixed alignment issues in the 30-Day Report section of the HOD Department Reports page.
 
**Backend Changes (`backend/src/modules/hod/`):**
- Added new endpoints in `hod.controller.ts`:
  - `GET /hod/marks/subjects` — List subjects for academic year, year, section
  - `GET /hod/marks/students` — List students with existing marks for a subject
  - `GET /hod/marks/class-subject` — Get marks data with max marks info
  - `POST /hod/marks/class-subject/save` — Save marks for multiple students with validation
  - `GET /hod/marks/template` — Download Excel template for marks entry
  - `GET /hod/marks/report` — Marks report with filters
- Added routes in `hod.routes.ts` with HOD-only authentication and department scoping
- Marks validation enforces: numeric values, non-negative, max limits (IA1: 50, IA2: 50, End Sem: 100)
- Server-side permission window check via `MarkEntryPermission` before saving
- Department scoping enforced — HODs can only access their department's students
- Audit logging for all marks operations
 
**Frontend Changes:**
- New `HodMarksManagement` component (`frontend/src/pages/hod/HodMarksManagement.tsx`) with:
  - Academic year, year, section, subject selection flow
  - Editable marks table with inline editing for IA1, IA2, End Sem
  - Real-time validation with error display
  - Save all changes with confirmation summary
  - Excel template download
  - Marks report viewer
- Added "Marks Management" tab to HOD sidebar navigation (`Sidebar.tsx`)
- Integrated into `HodDashboard.tsx`
- Added API client methods in `frontend/src/api/client.ts`
 
**HOD Dashboard 30-Day Report Alignment Fixes (`frontend/src/styles/index.css`):**
- New `.report-metric-grid` and `.report-metric-card` classes for 5 balanced columns on wide screens
- Responsive grid: fewer columns on tablets/mobile via `auto-fit, minmax(180px, 1fr)`
- Consistent card heights with `min-height: 120px` and flexbox centering
- Label/value overlap prevention with `overflow-wrap: anywhere`
- Weekly Progress section alignment with `.weekly-progress-section`
- Mentor-wise report table horizontal scrolling with `.mentor-report-table`
- All using existing design tokens (navy/gold/slate)
 
**Verification:**
- Backend `npx tsc --noEmit` → PASS
- Backend `npm run build` → PASS
- Frontend `npx tsc --noEmit` → PASS
- Frontend `npm run build` → PASS
- `test:hod` → 33/33 PASS
- `test:internal-marks` → 97/97 PASS
- `test:admin-routes` → 8/8 PASS
- `test:critical` → 12/12 PASS
- All existing HOD dashboard features remain functional

**Remaining Work:**
- None — all planned features completed
 
### Login Page Background Enhancement — Pure CSS premium institutional background with architectural silhouettes, digital network lines, and gold ambient lighting — PASS (2026-10-10)

**Scope:** presentation-only enhancement of the login page background in `frontend/src/styles/index.css`. No auth logic, API integration, validation behavior, or PWA installation flow was modified. The existing two-column layout and all login card functionality preserved. **No external images required** — all effects achieved via CSS gradients and inline SVG data URIs.

**Changes made (`frontend/src/styles/index.css` only):**

1. **Removed the `--login-campus-image` custom property** — Replaced the optional campus photo approach with a fully self-contained CSS-only background.

2. **Multi-layered premium background system** (bottom to top):
   - **Layer 1 — Deep navy base:** `radial-gradient(ellipse 120% 100% at 0% 0%, var(--color-navy-700) 0%, var(--color-navy-800) 35%, var(--color-navy-900) 65%, var(--color-navy-950) 100%)`
   - **Layer 2 — Bottom-left gold ambient glow:** `radial-gradient(ellipse 55% 45% at 0% 100%, rgba(212, 175, 55, 0.06) 0%, transparent 70%)`
   - **Layer 3 — Abstract architectural silhouettes (lower-left):** Inline SVG data URI with layered building/spire shapes at `rgba(255,255,255,0.018)` and `rgba(255,255,255,0.012)` opacity, positioned `left bottom / 100% auto`
   - **Layer 4 — Digital network lines (tech theme):** Inline SVG data URI with subtle curved connection lines in gold (`rgba(212,175,55,0.025)`) and blue (`rgba(59,130,246,0.02)`) at 0.3/0.2px stroke width
   - **Layer 5 — Soft vertical fade:** `linear-gradient(180deg, transparent 35%, var(--color-navy-950) 95%)` for content blending
   - **Layer 6 — Top-right gold accent glow** (via `::before`): enlarged to 480px at `rgba(212, 175, 55, 0.1)`
   - **Layer 7 — Geometric grid texture** (via `::after`, desktop ≥961px): 70px grid at `rgba(255,255,255,0.012)` with 60% opacity
   - **Brand panel enhancements:** Enhanced `::after` gold glow (400px), added subtle scanline texture via `::before` (desktop only)

3. **Preserved all existing content and functionality** — College logo, institutional name, hero heading with Cinzel/gold accent, feature list with icons, login card, form fields, password toggle, Sign In button, PWA install button, footer text. Responsive breakpoints (desktop ≥961px two-column, tablet 961–1180px, mobile ≤640px stacked) and `prefers-reduced-motion` guard unchanged.

**Verification:**
- Frontend `npx tsc --noEmit` → **PASS** (0 errors)
- Frontend `npm run build` → **PASS** (1662 modules, CSS 101.7 kB, gzip 19.0 kB)
- Dev server (`npm run dev`) on `http://localhost:3003` → serves HTML + HMR correctly
- Production preview (`npm run preview`) on `http://localhost:4176` → serves `index-DC3PR_q0.css` + JS bundles correctly

### Login Page Premium Polish — Enhanced two-column design with Cinzel typography, gold accents, and refined form controls — PASS (2026-10-10)

**Scope:** presentation-only enhancement of the existing `LoginPage.tsx` component. No auth logic, API integration, validation behavior, or PWA installation flow was modified. The existing two-column layout (brand panel left, login card right) was preserved and refined.

**Changes made (`frontend/src/styles/index.css` only):**

1. **Added missing `.login-hero-line` and `.login-hero-gold` classes** — The component used these classes for deliberate line breaks in the hero heading (`Digital Mentor–Mentee` on line 1, `Management System` on line 2, with `Mentor–Mentee` highlighted in gold) but they were absent from the stylesheet. Added:
   - `.login-hero-title` as `flex-direction: column` with `gap: 0.15em` for controlled line spacing
   - `.login-hero-line` as `display: block` to enforce line breaks
   - `.login-hero-gold` for the gold accent color on "Mentor–Mentee"

2. **Added missing `.login-password-toggle` class** — The password visibility toggle button (eye/eye-off icon) was rendered but unstyled. Added absolute positioning inside the input (`right: 0.75rem; top: 50%; transform: translateY(-50%)`), hover/focus states with gold focus ring, and proper cursor/transition.

3. **Verified the existing premium design system remains intact** — Deep navy gradient background with restrained gold glows, Cinzel serif for institutional headings, Inter for form labels, 46px touch-friendly inputs with navy border + gold focus ring, 46px navy Sign In button with hover lift + shadow + right arrow icon, PWA button as gold-outline secondary action, responsive breakpoints (desktop ≥961px two-column, tablet 961–1180px, mobile ≤640px stacked), `prefers-reduced-motion` guard.

**Verification:**
- Frontend `npx tsc --noEmit` → **PASS** (0 errors)
- Frontend `npm run build` → **PASS** (1662 modules, CSS 99.3 kB, gzip 18.4 kB)
- Dev server (`npm run dev`) on `http://localhost:3001` → serves HTML + HMR correctly
- Production preview (`npm run preview`) on `http://localhost:4174` → serves `index-CdQ_sdbj.css` + JS bundles correctly
- All existing backend regression suites pass: `test:critical` 12/12, `test:admin-routes` 8/8, `test:runtime` 37/38

### K S R C E watermark is now ALWAYS a true background layer — foreground-overlay regression fixed — PASS (2026-10-10)

**Reported symptom:** the `K S R C E` watermark was painting **in front of** the document. Tables,
headings, student details and signature lines were being darkened/overlapped by the diagonal on
generated and uploaded PDFs, instead of the watermark sitting quietly behind the content.

**Root cause (confirmed by rendering the real service output, not assumed):** the immediately
preceding fix (`8baa758`) added a heuristic `hasOpaqueFullPageBackground()` that was meant to keep
the watermark visible on genuine scanned pages (where a behind-layered mark is hidden by the opaque
image). It scanned each page's decoded content for a near-full-page `cm` transform (image/form
XObject) **or** a near-full-page filled `re` rectangle, and when it matched, it *skipped*
`placeWatermarkBehindContent()` so the watermark stayed **on top**. That heuristic
false-positived on ordinary vector pages — any page with a full-page background fill/shaded panel,
or a full-page container rect, matched the `re` branch — so those pages fell through to the
foreground overlay and the watermark covered their text and tables.

**Fix (`backend/src/services/document-watermark.service.ts` only):** removed the heuristic
entirely (`hasOpaqueFullPageBackground`, its helper `drawnContentText`, the now-unused `pdf-lib`
content-stream imports) and **always** call `placeWatermarkBehindContent(page)` after drawing. Every
page now gets a genuine underlay: the watermark stream is moved to index `0` of the page's
`/Contents` array, so all original operators paint over it. No top-overlay path remains for PDFs.

**Tradeoff (documented, deliberate):** on a page whose content is one opaque object covering the
whole page (a scanned/photographed certificate, or a full-page opaque background fill), the
underlaid watermark is hidden behind that paint — it is present but not visually prominent. This is
accepted because the hard requirement is that the watermark must **never** sit in front of document
content; the old foreground overlay is exactly what made dense tables/headings unreadable, and no
original content is altered to force the watermark visible. The image (JPEG/PNG) path is unchanged
(composited, same direction/opacity).

**Verification (programmatic render + pixel analysis; the model cannot view images):** rendered the
service output with MuPDF at 2x and diffed raw pixels with `sharp` — form pages `contentChanged=0`
(original ink byte-identical, watermark present only in white space, `contentMaxDiff=0.0`), `styled`
full-page-background page `0` content pixels darkened (previously 30), `scantext` `0` text pixels
darkened (previously 281), direction check `\` bottom-right → top-left PASS on 5/5 pages. Unit
suite `test:document-watermark` **44/44** (section F now asserts the scan page is behind-layered;
new section G asserts a full-page-background + dense-text page stays behind); runtime suite
`test:document-watermark-runtime` **46/46** (new `watermarkStreamIndex()` assertions prove the
served bytes are behind-layered for single-page, multi-page and regenerated pre-fix documents);
regressions `test:runtime` 38/38 and `test:evidence-location-runtime` 74/74 green. Backend
`tsc --noEmit` clean, `npm run build` exit 0. Exactly 3 files changed; no commit/push made.

### Sidebar / navigation independent scrolling + truly-fixed header — whole-page-scroll root cause fixed — PASS (2026-10-09)

**Reported symptom:** scrolling with the wheel anywhere (including over the sidebar nav) moved the
**whole page** — the header, the sidebar and the main content all slid together — instead of only the
sidebar navigation list scrolling inside a stationary shell.

**Root cause (two independent defects, both confirmed by live `getBoundingClientRect()` probes on a
rebuilt bundle in headless Chromium):**
1. **`html, body { overflow-x: hidden }` silently disabled `position: sticky`.** The global mobile
   safeguard (`frontend/src/styles/index.css`, "GLOBAL MOBILE SAFE-GUARDS") turned `html`/`body` into a
   scroll container, so the top header and the sidebar stopped sticking to the viewport. They still
   *computed* `position: sticky`, which is why this was never caught. Evidence: after `scrollTo(0,600)`
   the header's `getBoundingClientRect().top` was **-600** (it scrolled away); injecting
   `html,body{overflow-x:visible}` or `{overflow-x:clip}` restored `top: 0`, and re-injecting
   `{overflow-x:hidden}` broke it again (**-600**).
2. **The sidebar was never height-constrained.** `.app-container` is `min-height: 100vh` and the
   sidebar sits in a `display:flex` row that grows with the page content, so the rail was always as
   tall as the content. `.sidebar-nav` already had `flex: 1; overflow-y: auto` but never received a
   bounded height, so it never scrolled internally and wheel events over it bubbled to the page.
   A third, related defect surfaced while verifying: `.sidebar-nav` children are column-flex items, so
   in the collapsed 76px rail they were compressed to fit instead of overflowing (scrollHeight ==
   clientHeight), which also prevented the nav from scrolling.

**Fix (smallest safe layout/CSS change; no new dependency, no new scroll container):**
- `index.css` global safeguard: `overflow-x: hidden` → **`overflow-x: clip`** (clips horizontal
  overflow the same way but does **not** create a scroll container, so sticky works again).
- `index.css` appended, scoped block:
  - `.sidebar-nav { min-height: 0; overflow-x: hidden; }` — lets the nav shrink below content and
    scroll in every layout (desktop rail and the already-constrained ≤960px drawer).
  - `.sidebar-nav > .nav-item, .sidebar-nav > .nav-section-label { flex-shrink: 0; }` — nav rows keep
    their own height so the list overflows and scrolls instead of being squashed.
  - `@media (min-width: 961px) { .sidebar { position: sticky; top: var(--header-hpx);
    height/max-height: calc(100vh - var(--header-hpx)); overflow: hidden; align-self: flex-start; } }`
    — pins the rail flush under the sticky header for exactly the visible viewport height; only the
    nav list scrolls inside it. The main column still scrolls the page normally, and **no** overflow
    is added around `.main-content`/`.page-body`, so the non-portaled `position: fixed` modal
    overlay, dropdowns and toasts are never clipped.
- **Modal overflow leak (found by the verification):** `Modal.tsx` and `MentorAiBotModal.tsx` cleanup
  did `document.body.style.overflow = 'auto'` (hardcoded) instead of restoring the previous value, so
  closing *any* modal left a stale inline `overflow: auto` on `<body>` (turning it back into a scroll
  container). Both now capture `previousOverflow` on open and restore it on close. Async
  `SearchableSchoolDropdown.tsx` already restored `''` and was left untouched.

**Verification (real pipeline — sandboxed backend on a fresh store + headless Chromium against rebuilt
bundles; 53/53 checks, 0 failures, 0 page/console errors):**
- Desktop 1440×900 (Admin, 21 nav items): rail is `sticky`, sits at y=66, height 834 (= 100vh − 66),
  bottom exactly 900; nav overflows (scrollH 1211 / clientH 700) and scrolls internally
  (`scrollTop 0→400`) while the page stays put (`scrollY` unchanged); with the page at 600 scrolling
  over the nav leaves `scrollY` at 600; wheel over main scrolls the page (600→900); header stays at
  `top:0` and rail at `top:66` while the page scrolls; last nav item scrolls fully into view (no
  clipping); collapse → 76px rail still overflows (scrollH 1044 / clientH 717) and scrolls; expand
  restores 264px.
- Modal regression: the fixed overlay still spans the full viewport (0,0,1440,900) — not clipped by
  any ancestor overflow.
- Tablet 900×700 and mobile 390×844: drawer `fixed` below the header, backdrop + header layering,
  drawer nav overflows and scrolls independently (page stays put), Escape / X / backdrop all close,
  no horizontal overflow.
- **Before/after root-cause probes:** with the sidebar fix disabled, `.sidebar-nav` stops overflowing
  (scrollH == clientH == 1211) and the wheel cannot scroll it (the page is what moved); with the old
  `html,body{overflow-x:hidden}` re-injected, the header's top becomes -600 (bug reproduced); the
  shipped value computes `overflow-x: clip` on both `html` and `body`.
- `npx tsc --noEmit` exit 0; `npm run build` (tsc + vite) PASS, 1659 modules; canonical `frontend/dist`
  rebuilt (`index-JcWmmNV8.css`) and all new selectors confirmed present in the emitted CSS. No
  sandbox ports left listening. No commit/push made.

### Student Dashboard Overview UI + Profile Completion card "always Incomplete" bug — PASS (2026-10-09)

**What it was (confirmed bug):** after a student completes and saves their profile, the Overview's
Profile Completion stat card still showed **Incomplete**. Live API evidence (before the fix) proved
the dashboard read a field that does not exist in the payload: the detail endpoint
`GET /api/students/:id` returns `profile_completed: 0|1` (+ `profile_completed_at`) — it has **no
`profileCompleted` key** — while `StudentDashboard.tsx` lines 726-727 read
`profile?.profileCompleted`, so the card was always `undefined`-driven. The dashboard was otherwise
correct: `/auth/me` and the login JWT carry the camelCase flag (used by the `App.tsx` wizard gate),
and the directory listing (`getStudents`) already computed a four-bucket percentage.

**Root cause fix (minimal + shared calculation, no data invented):**
- New `backend/src/utils/profile-completion.util.ts` — `calculateProfileCompletion(student)` is the
  single source of truth for the four equally-weighted buckets exactly as the directory always used:
  identity `(fullName && registerNumber)`, contact `(mobileNumber && email && dob)`, family
  `(parent.fatherName || parent.motherName)`, school `(school.tenthMark || school.twelfthMark)`;
  `profileCompleted` (the onboarding wizard flag) is authoritative and forces 100%. Returns
  `{ percentage, missing[] }`.
- `student.controller.ts` — `getStudents` now calls the helper instead of its inline copy (output
  unchanged, `profile_completion_percentage` value identical); `getStudentById` additionally emits
  `profile_completion_percentage` and `profile_completion_missing` (additive fields only — all
  existing keys/status codes/RBAC unchanged).
- `StudentDashboard.tsx` — the card now reads the real server fields: `profile_completed === 1 ||
  profileCompleted === true` (percent forced to 100 when flagged), otherwise the real
  `profile_completion_percentage`; "Incomplete" shows that percentage on a progress bar plus the
  server's `Missing: …` bucket labels. No percentage is ever invented — without a numeric field the
  card falls back to the state alone.

**Part 1 UI overhaul (same navy/gold tokens, scoped `sd-` CSS appended to `index.css`):**
- Banner: `sd-banner` — identity block (badge, welcome name, register no • department • batch in a
  wrapping meta row) + balanced action column; prominent-but-balanced **Download My Record Book
  (PDF)** button with the **Internal Assessment** / **Mentor Documents** actions aligned in one row
  beneath; mobile ≤640px stacks the actions full-width.
- Quick metrics: uniform `sd-stat` cards (44px icons, consistent padding, `overflow-wrap` so long
  values like "Incomplete" can never overflow); Profile Completion card gains the real progress bar
  (`role="progressbar"`), 100% bar + "Complete", or percent + "Missing: …" list when incomplete; the
  emoji-only status text is replaced with restrained colour + text.
- Balanced two-column grid: `sd-grid-2` is `repeat(2, minmax(0,1fr))` and now actually collapses to
  one column ≤900px (the previous `1fr 1fr` never did), with the Meeting Schedule card (`Friday` /
  `Saturday` phase badge) and Assigned Faculty Mentor card stretching to equal height. Mentor shows
  name / designation / cabin / phone / email **only when present** (empty rows hidden, no invented
  "N/A"), "Active Mentor" badge only when a mentor exists, and a readable empty state otherwise.
- Recent Saturday Mentoring Log: kept heading + table structure; records badge, moderate-height
  empty state (icon + one line) that never leaves a large blank area.
- Responsive: verified desktop 1440 / tablet 900 / mobile 390 — no horizontal overflow, consistent
  card, no console errors.

**Verification (real pipeline — sandboxed backend on a fresh store seeded via the real API +
headless Chromium against rebuilt bundles):**
- **8/8 case checks PASS:** (1) incomplete payload → "Incomplete" + 25% bar + missing labels;
  (2) all required filled + saved (optional fields left empty) → "Complete", `profile_completed=1`,
  `profile_completion_percentage=100`, `missing=[]`; (3) page refresh keeps "Complete";
  (4) sign-out / sign-in (fresh token) keeps "Complete"; (5) save failure (invalid mobile → HTTP 400)
  never flips the card, stored flag stays 0; (6) optional empty fields never block completion;
  (7) backend format: detail carries `profile_completed`, `profile_completed_at`,
  `profile_completion_percentage`, `profile_completion_missing`, and the directory row and detail
  percentage agree (100 == 100); (8) responsive/console hygiene.
- **Before/after browser evidence:** with the pre-fix bundle the card read "PROFILE COMPLETION
  Incomplete" at every viewport even though the API reported `profile_completed:1` / 100%; with the
  fixed bundle it reads "Complete".
- **Builds:** frontend `npx tsc --noEmit` exit 0; backend `npx tsc --noEmit` exit 0; `npx vite
  build` PASS; canonical `frontend/dist` rebuilt with the production `VITE_API_URL=localhost:5050`
  baked in (bundle contains the fix; no sandbox port leaked).
- **Suites re-run green:** `test:directory` 16/16, `test:critical` 12/12, `test:runtime` 38/38
  (only the suites touching profile completion / response contracts were re-run; nothing else was
  changed). The directory suite still asserts the row keys `profile_completed` /
  `profile_completion_percentage` — both present.
- No commit/push made (as with prior passes).

### Admin Mentoring Dashboard — College Mentoring Split + Weekly Progress — focused refinement PASS (2026-10-09)

**Scope:** a presentation-only **second pass** over exactly two panels on `AdminMentoringDashboard.tsx`
(`CoveragePie` + `WeeklyProgressList`, both college and dept drill-down contexts). No API call, route,
RBAC rule, calculation, data-fetching path, dependency or unrelated card changed; every figure still
comes straight from the `/api/admin/overview/*` response.

- **Split card (`CoveragePie`):** refined the coverage ring — clear centered percentage
  (`.ring-pct`) + `COVERAGE` label, track + gold `stroke-dashoffset` fill computed from the server's
  de-duplicated `pie`; two stat rows in a restrained palette — green **Mentored** and
  red/amber **Pending** — each carrying the server count and its percentage in one consistent
  format, and a subtle footer naming the reporting month and the de-duplicated student total
  (`Reporting month: 2026-10 · 1 students, each counted once`). No malformed characters.
- **Weekly card (`WeeklyProgressList`):** consistent `DATE RANGE | BAR | COUNT` rows — compact
  one-line ranges (`Aug 17 – Aug 23`, derived from `weekStart`/`weekEnd` via `formatWeekRange`,
  server `weekLabel` as fallback) in a fixed-width date label column; flexible low-attention bars on
  a subtle track with the theme fill scaled to the busiest week (gold `is-busiest` accent);
  a clean zero-session state with a visible dashed stub (never a missing row); subtle row
  separators + hover feedback; counts straight from the backend.
- **Layout/CSS:** the two split blocks share one `.mentoring-split-wide` grid
  (`minmax(300px, 1fr) 1.6fr`), cards stretch to **equal height**, and the grid collapses to a
  single column at ≤1024px; the scoped CSS block (`.mentoring-split-wide`, `.mentoring-panel`,
  `.split-*`, `.weekly-*`, `.ring-*`) lives in `frontend/src/styles/index.css`.
- **Verification (performed on the real pipeline, isolated backend):**
  - `frontend` `npx tsc --noEmit` PASS; `npm run build` (`tsc && vite build`) PASS.
  - Headless-Chromium over desktop 1440×900 / tablet 1024×768 / mobile 390×844 against a rebuilt
    SPA pointed at an isolated backend on :5090 using a seeded copy of the store (21 counselling
    records → pie `1/0/1` at 100% coverage, weekly sessions `[2,3,0,5,1,0,4,6]`, zero weeks on
    Aug 31–Sep 6 and Sep 21–27) — **all assertions PASS, 0 failures**: equal card heights
    (394.72/394.72), ring % = API coverage (100%), ring arc offset = expected, Mentored/Pending
    count+pct rows match the API, 8 rows, one-line date labels matching API-derived ranges, zero
    stubs = 2, bar widths = count/busiest %, busiest highlighted, row hover feedback, no horizontal
    overflow on any viewport, tablet/mobile stacked layouts, no mojibake on the overview or the
    Comparison / 30-Day tabs, bundle-level `·` + mojibake scan clean, **0 page errors / 0 console
    errors per viewport**. Dept drill-down (Information Technology, the populated dept) re-verifies
    the same components: ring 100%, 8 rows, counts/zeros/busiest identical to the dept detail API.
    The empty dept (AIDS) drill shows the intended `EmptyState`.
  - **Pre-existing issue found during verification (NOT fixed — outside this pass's scope):** the
    30-Day Report tab never loads its content. The `loadReport` effect compares
    `currentTab === 'reports'` but the parent (`AdminDashboard.tsx`) supplies prefixed values
    (`currentTab.startsWith('mentoring-')`, tab click maps `reports` → `mentoring-reports`), so the
    effect never fires and the report stays null → the tab renders the "Report unavailable" empty
    state. The API itself is fine (`/api/admin/overview/report-30-day?weeks=5` → 200 with full
    payload). This predates this pass and touches the reports tab (out of scope); flagged for the
    user to decide.
- Staged with `git add -A` only; **no commit/push made**.

### Admin Mentoring Dashboard — split ring + weekly progress polish — PASS (2026-10-09)

**Scope:** presentation-only refinement of two panels on `AdminMentoringDashboard.tsx`. No API call,
route, RBAC rule, calculation or stored field was changed; every figure still comes straight from the
`/api/admin/overview/*` response.

- **College / department split (`CoveragePie`):** replaced the two-slice pie with a **coverage ring**
  (inline SVG, no charting dependency) that draws only the mentored fraction of the reporting month,
  plus two stat rows — **Mentored** and **Pending** — each showing the server count and its
  percentage, and a foot line naming the reporting month and the de-duplicated student total. The
  ring is decorative-but-labelled (`role="img"`, descriptive `aria-label`) and renders an
  `EmptyState` when there is nothing to report.
- **Weekly progress (`WeeklyProgressList`):** new list presentation — bars scaled against the busiest
  week of the window (busiest week accent-highlighted in gold), a dashed placeholder for a
  zero-session week, and compact `Aug 17 – Aug 23` labels derived from `weekStart`/`weekEnd` with the
  server `weekLabel` as a fallback.
- **Layout:** both `minmax(280px, 1fr) 2fr` inline-grid split blocks (department drill-down and
  college overview) now share one `.mentoring-split-wide` class; cards stretch to equal height and
  collapse to a single column at ≤1024px.
- **Styles:** one scoped block appended to `frontend/src/styles/index.css`
  (`.mentoring-split-wide`, `.mentoring-panel`, `.ring-*`, `.split-*`, `.weekly-*`) with ≤1024px and
  ≤480px refinements, all in existing design tokens.
- **Encoding:** the remaining mojibake in this file (`â€"`, `Â·`) was replaced with the real `—` / `·`.

**Verification:** frontend `npx tsc --noEmit` PASS; `npx vite build` PASS (1659 modules, CSS
89.20 kB); the new selectors were confirmed present in the emitted CSS bundle. No commit/push made.

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

**Geo-tagging (SUPERSEDED 2026-10-09 — location is now optional and never blocks the upload; see the evidence-location entry below)** — `utils/geotag.util.ts` validates every upload server-side. Coordinates are never
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

**Frontend** — `EvidenceUploader` (capture + optional device location + compress + explicit
detach/undo; superseded on 2026-10-09 so a denied/unavailable fix never blocks the upload),
`EvidenceGallery` (authenticated view, device-reported location label, download), `DiscussionWithSelect`,
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

**FIXED and verified — two Record Book headings removed; leftover blank space reclaimed (2026-10-12).**

- **The request:** remove `INSTITUTIONAL VERIFICATION & DIGITAL ENDORSEMENT` and `OFFICIAL DIGITAL MENTOR–MENTEE RECORD BOOK` completely from the generated Student Record Book PDF (not just hide them), reclaim the blank space they left, and leave the logo / college name / details / tables / watermark / signatures / footer / page numbers and the other document types untouched.
- **Where each heading was emitted:** (1) **signature heading** — the `.sigheading` div inside `signatureBlockHtml()` (the invisible reserve copy), the pdf-lib `drawText` in `stampPageFurniture` (visible, y≈49 mm), and the jsPDF fallback `pdf.service.ts`; (2) **full-mode document title** — `docTitleFor('full')` (drawn as the header's gold line by `stampPageFurniture`) and the jsPDF fallback's `docTitle`.
- **Fix:** the signature heading is deleted from all three sites and the full title from `docTitleFor('full')` (now `''`) + the fallback. `stampPageFurniture` skips the title when it is empty. **Both headings are gone from the actual PDF bytes.**
- **Blank reclamation:** the signature reserve `margin-top` drops 16 → 9 mm (and the heading + its 12 mm margin are gone), so a full final page can hold more content; the full book's header band shrinks (top margin **35 → 31.5 mm**, divider **30.6 → 28.4 mm**) so the removed title line leaves no gap. The other two modes keep 35 mm / 30.6 mm and their own titles. The watermark shift is derived from the band so the mark stays centred on the physical page.
- **Other modes deliberately unchanged:** `internal` still prints `OFFICIAL INTERNAL ASSESSMENT REPORT` and `mentor-documents` still prints `MENTORING RECORDS & DOCUMENT ARCHIVE` — both asserted present on every page.
- **Stored-form regeneration:** the `StudentDocument.renderVersion` stamp was bumped to `2026-10-12-removed-headings`; the stale stored Student Details Form is regenerated in place on list access (verified: re-written and now free of both headings).
- **Verified on the real HTTP path:** `GET /api/pdf/student/73152421125?mode=full|internal|mentor-documents` → neither removed heading present on any page; college name/logo header, `K S R C E` watermark on every page, `Page X of Y`, and all four signing captions intact; page counts unchanged (full 2 pp, internal 1 p, mentor-documents 1 p; long synthetic still 9 pp). Suites: `test:record-book-header` 74/74, `test:runtime` 38/38, `test:critical` 12/12, `test:document-watermark` 44/44, `test:document-watermark-runtime` 46/46; `tsc` + build clean.
- **Honest limitation:** the signing block remains bottom-anchored (per the earlier fix), so on a genuinely sparse final page the empty area still sits *between* the content and the bottom-anchored signatures — that space is inherent to short data, not to the removed headings. The removed headings no longer reserve any space.

**FIXED and verified — Student record book signature block floated up, leaving a large void below it (2026-10-11).**

- **The bug report (user, repeated):** "the student document PDF is still broken after multiple fixes, backend restarts, localhost restarts, and successful automated tests" — the visible symptom was page content compressed into the top of the last page with a big empty area beneath the signatures.
- **Reproduced on the real app:** logged in as the student-facing admin and downloaded `GET /api/pdf/student/73152421125?mode=full|internal|mentor-documents` (the exact route the `Download My Record Book (PDF)` / `DOWNLOAD OFFICIAL PDF` buttons call; `frontend/src/api/client.ts::downloadStudentPdf`). The `full` book was 2 pages whose page 2 ended at y≈593/797 (**204 pt blank below the signature**); the single-page `internal` report ended at y≈394/797 (**403 pt blank**).
- **Root cause:** the signature block was emitted **in normal flow** immediately after the content (`signatureBlockHtml()`, `.signatures { margin-top: 16 mm; break-inside: avoid }`). On a short final page it therefore rested wherever the content stopped, leaving the page's unused height *below* it. The previous "fix" had only increased `margin-top` 14→16 mm, which nudged it from y≈353 to y≈593 but never actually moved it to the bottom.
- **Fix (`backend/src/modules/pdf/record-book-html.service.ts`):** the HTML block is now an invisible, geometry-identical `.signatures.sig-reserve` placeholder (`visibility: hidden`) that still reserves its exact height so pagination/page count are unchanged and the content can never reach the signature band; `stampPageFurniture` then draws the **visible** block once, with pdf-lib, at the bottom of the last Chrome-rendered page — heading y≈692, signing lines y≈757, captions y≈764–775, columns at x≈34/169/304/439.
- **Two "old PDF served" vectors also closed:** (a) `backend/src/modules/pdf/pdf.controller.ts` now sends `Cache-Control: no-store, no-cache, must-revalidate` + `Pragma`/`Expires` on the live download so a browser cannot replay a stale copy; (b) the **stored Student Details Form** (written once by `syncStudentDetailsPdf`, then served from disk by the document endpoints) was stale — original 201 893 B (08 Oct) and watermarked copy 200 479 B (09 Oct), both showing the old layout. Added a `renderVersion` field to `StudentDocument`; `getStudentDocuments` now regenerates the derived form in place when the stamp is out of date (idempotent).
- **Verified after the fix (real HTTP path):** `full` 2 pages, last page body ends y≈775 with signatures at the bottom; `internal` 1 page y≈775; `mentor-documents` 1 page y≈775; page counts unchanged; long 120-row synthetic still 9 pages with the signature on the last. The stored Details Form refreshed from 201 893 B → 136 463 B (original) / 137 350 B (watermarked), signature captions y≈764.

**FIXED and verified — Global Styling Failure Across Entire Website (2026-10-10).**

- **The bug report:** the entire website — not just the login page — was rendering without its expected styling. Pages that previously had dark navy navigation bars, sidebars, cards, spacing, buttons, typography, and responsive layouts now appeared like plain HTML. The frontend production build reportedly succeeded, but the browser still showed the problem.

- **Root cause:** the file `frontend/src/styles/index.css` had been **completely overwritten** and contained only the AI Assistant floating chat styles (~380 lines), losing the entire ~5,200-line KSRCE Design System (navy/gold/slate color primitives, semantic aliases, sidebar, topbar, page headers, buttons, forms, tables, modals, toasts, boot splash, two-column login, student dashboard scoped styles, sidebar independent scrolling fix, leaderboard, bulk upload, and all responsive/accessibility rules). The `main.tsx` correctly imported `./styles/index.css`, but the imported file no longer contained the design system.

- **How it happened:** a recent change (likely an AI-assisted edit) replaced the entire stylesheet instead of appending to it. The git history shows the design system was intact at HEAD (`git show HEAD:frontend/src/styles/index.css` = 5,257 lines), but the working tree had only the AI Assistant block.

- **Fix (`frontend/src/styles/index.css` only):** restored the complete design system from `HEAD` (5,257 lines) and **appended** the AI Assistant styles (~336 lines) at the end, preserving both. The combined file is now 5,593 lines with all CSS variables (`--color-navy-*`, `--color-gold-*`, `--primary-*`, `--accent-*`, etc.), all component classes (`.sidebar`, `.ksrce-header`, `.app-boot`, `.login-page`, `.card`, `.btn`, `.page-header`, `.sd-*`, `.lb-*`, `.bu-*`, `.ai-assistant-*`), and all responsive/media queries intact.

- **Encoding fix:** after appending via PowerShell, the file had UTF-16/null-byte encoding issues causing Vite CSS warnings. Fixed by rewriting the file as clean UTF-8 (`[System.IO.File]::WriteAllText(..., [System.Text.Encoding]::UTF8)`).

- **Verified:**
  - Frontend `npx tsc --noEmit` → **PASS** (0 errors)
  - Frontend `npm run build` → **PASS** (1659 modules, CSS 98.7 kB gzip 39.9 kB, all design system selectors confirmed in output)
  - Dev server (`npm run dev`) on `http://localhost:3000` → serves HTML + HMR, proxies `/api` to backend
  - Backend (`npm run dev`) on `http://localhost:5050` → health 200, login 200 for `Ksrce@admin` / `Ksrce@1234`
  - Production preview (`npm run preview`) on `http://localhost:4173` → serves `index-BGcjdteG.css` + JS bundles correctly
  - Backend regression suites: `test:critical` 12/12, `test:admin-routes` 8/8, `test:runtime` 37/38 (1 pre-existing image-in-PDF failure unrelated)

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

### Kavitha 3D robot launcher added to the AI assistant (2026-10-16)

**Report:** Replace the previous flat lucide `<Bot>` launcher with the approved 3D Kavitha robot design as the final visual reference.

**Changes**
- **Image asset:** `frontend/public/assets/kavitha-3d-robot.png` (385×405 RGBA, 238,757 bytes) — verbatim approved 3D Kavitha robot (white robot, glowing blue face, cyan accents, deep-navy circular badge, soft electric-blue glow).
- **Component (`frontend/src/components/ai/AiAssistant.tsx`):**
  - Added `ROBOT_IMAGE`, `ROBOT_IMAGE_WIDTH=385`, `ROBOT_IMAGE_HEIGHT=405`.
  - Launcher: circular button fixed bottom-right; renders `<img>` inside `.ai-assistant-robot-mask` → `.ai-assistant-robot-float` → `.ai-assistant-robot` (decorative `alt=""`, `draggable=false`, `decoding="async"`); tooltip `.ai-assistant-button-tooltip` = `Kavitha — AI Assistant`; `aria-label` toggles Open/Close; `aria-expanded`, `aria-haspopup="dialog"`, `type="button"`, focus-visible outline.
  - Header: uses header robot image and title `Kavitha — AI Assistant`; panel has `role="dialog"`, `aria-label="Kavitha — AI Assistant"`.
  - Empty state: uses robot image + greeting `Hi! I'm Kavitha, your AI assistant. How can I help you today?`.
  - Removed `Bot` and `RefreshCw` lucide icons; improved error handling (retryText, errorKind, `fail()`, `classifyError()`, `handleRetry()`).
- **Styles (`frontend/src/styles/index.css`):**
  - CSS vars: `--ai-launcher-size` 72px mobile / 88px ≥768px, `--ai-launcher-gap` 16/24px.
  - `.ai-assistant-button`: fixed bottom-right, circular navy gradient border + layered blue glow (`box-shadow`), `kavitha-glow` pulse; hover lift + scale.
  - `.ai-assistant-robot-mask`: circular clip (inset 3px) over deep navy background.
  - `.ai-assistant-robot-float`: `animation: kavitha-float 3.8s ease-in-out infinite`; hover `.ai-assistant-robot` scale/brightness.
  - `.ai-assistant-button-tooltip`: shows on hover/focus.
  - `@media (prefers-reduced-motion: reduce)`: disables float/glow/transitions.
  - `.ai-assistant-panel`: positioned above launcher (bottom = gap+size+12px), responsive width/height with `dvh` units.
- **Verification (`.runtime-verify/kavitha/robot-verify.mjs`, fixed for ESM + proper checks):** live headless Chrome CDP against scratch backend (5057) + Vite frontend (3010) with real Gemini; **25/25 PASS** — launcher visible, robot image loaded (naturalWidth>0), src `http://localhost:3010/assets/kavitha-3d-robot.png`, mask/float, tooltip, a11y labels, sizes 88px (desktop) / 72px (mobile), `launcherTop` true, panel open/close (single), header "Kavitha — AI Assistant" + header robot loaded, chat request issued (`/api/ai/chat`) + real assistant reply, typing indicator, retry on blocked request works, panel fits mobile, prefers-reduced-motion honoured (`animationName: "none"`), 0 console errors/exceptions, asset HTTP 200; image `GET /assets/kavitha-3d-robot.png` → 200 image/png 238,757 bytes. Also fixed 4 latent harness bugs (implicit globals, uninvoked arrow IIFE, missing `assistantHasContent`, 3 incorrect assertions).

**Build/Typecheck:** frontend `tsc --noEmit` exit 0; `npm run build` exit 0.

**Scope:** preserves conversation history, existing chatbot, and other pages/functionality. Robot image is the actual approved asset (analyzed: deep-navy corners, glowing blue centre, 9.7% white, 6.4% cyan, 0% red). Branch `temp`, uncommitted (no commit/push).

### College PDF header consolidated + diagonal watermark corrected (2026-10-15)

**Report:** the college heading was reported as missing/incorrectly positioned and the `K S R C E` watermark was reported as too pale and running the wrong way; it must run bottom-left → top-right, be clearly visible but translucent, and stay behind the content.

**Header root cause / defect:** the header was drawn **three times** with drifting geometry — the Chrome-rendered record book's per-page pdf-lib stamp, the record-book annexure cover sheet (jsPDF), and the legacy jsPDF fallback. They disagreed on the logo box (15 vs 17mm), the college-name size (13 vs 14pt), the divider y (28.4 / 28.5 / 33mm) and the side margin (12 vs 14mm), and the **annexure cover omitted the affiliation subtitle and the address entirely** — so the institutional header was not the "shared template" it needed to be.

**Fix:** new single source of truth `backend/src/modules/pdf/institutional-header.ts` — header texts, colours, geometry (all mm from the page top) and the reserved band/divider, plus two drawers: `drawInstitutionalHeaderPdfLib` (y-up) and `drawInstitutionalHeaderJsPdf` (y-down). Wired into `record-book-html.service.ts` (`stampPageFurniture` + `appendPdfAnnexures`; `headerBandMm`/`headerRuleMm` now delegate to the shared spec) and `pdf.service.ts` (`renderHeader` + its annexure sheet). The cover sheet now prints the **same full header** as every other page, with the `Annexure N` label as the header's title line (below the college name) and the record-book cover margin aligned to the base pages (12mm).

**Watermark fix:** the record-book CSS background layer changed from `rgba(128,128,128,0.08)` @ `rotate(45deg)` (a `\` diagonal compositing to ≈245 on white — effectively invisible) to `rgba(102,102,102,0.26)` @ `rotate(-45deg)`. CSS `rotate` is positive-clockwise with the y-axis down, so `-45deg` is the `/` bottom-left → top-right diagonal. Still painted strictly beneath `.content` (z-index 0 < 1). The switchable "background layer" contract and centring are unchanged.

**Scope note:** the upload-time document watermark service (`backend/src/services/document-watermark.service.ts`, used by the Student Details Form + My Documents watermarking) was **deliberately left unchanged** — it is a different subsystem (stored copies generated at upload) with its own deliberate, test-covered `.12`-alpha subtlety; changing it would leave already-stored watermarked copies inconsistent. This task is the PDF **generation** path, whose watermark typography (88pt bold, `K S R C E`) is preserved.

**Verified on the REAL generated PDF** (live backend `:5050`, harness `.runtime-verify/pdf/live-header-watermark.mjs`, files `.runtime-verify/pdf/live-full.pdf` / `live-mentor-documents.pdf`):
- Record book `mode=full`: header centred on every page — `K.S.R. COLLEGE OF ENGINEERING` y 12.3mm `midOff=+0pt`, subtitle 18.3mm, address 21.2mm; navy bar + logo (205×190 image) top-left; divider at 28.4mm.
- Annexure cover: `Annexure 1` at 24.7mm **below the college name** (subtitle 18.3mm + address 21.2mm now present), divider at 30.6mm, content heading at 33.5mm; the verbatim certificate is the next page (landscape 841.9×595, **no** header — correct).
- `mode=mentor-documents`: its own title at 24.7mm on every page + the same header.
- Watermark: measured direction `upper-half meanX=108mm → lower-half meanX=88mm` = `/` (bottom-left → top-right); `minGray=216` (was 221) = clearly visible; pixel-diff slope ≈ −0.95; document ink unchanged (true background layer); centred on the physical page.

**Tests / build:** `test:record-book-header` **75/75** (added a "clearly visible but translucent" assertion), `test:record-book-certificates` **27/27**, `test:runtime` **38/38** (incl. header on the image-annexure page), `test:certificate-visibility` **22/22**, `test:document-watermark` **44/44**, `test:document-watermark-runtime` **46/46**, `test:leaderboard` **35/35**, `test:state-machine` **137/137**, `test:security-hardening` **8/8**; backend + frontend `tsc --noEmit` clean; backend + frontend `npm run build` exit 0.

**Files changed:** `backend/src/modules/pdf/institutional-header.ts` (new), `backend/src/modules/pdf/record-book-html.service.ts`, `backend/src/modules/pdf/pdf.service.ts`, `backend/src/tests/record-book-header.test.ts`, `PROJECT_PROGRESS.md`, `DEBUG_NOTES.md`.

### Official Record Book (PDF) — uploaded achievement certificates now listed and reproduced (2026-10-15)

**Report:** certificates a student uploaded through **My Progress & Achievements** did not appear in the downloaded **Official Record Book (PDF)**; the achievement points system is working and must not change.

**Root cause:** the record-book collector read only `StudentDocument`, where every row on a real record is the auto-generated `student_details_form` (listed but never self-embedded) — the actual certificate lives in `StudentProgress`, so it was neither listed nor attached. The legacy jsPDF fallback had the same defect.

**Fix:** new shared collector `collectStudentDocumentArchive` in `backend/src/modules/pdf/record-book-html.data.ts` reads both `StudentDocument` and `StudentProgress` and de-duplicates by one shared stored-file identity rule (`backend/src/utils/uploaded-file-key.util.ts`); `collectRecordBookData` and `pdf.service.ts` both use it. Records with no file attached get a clear "no certificate file attached" message; the annexure cover sheet names the real upload channel; `internal` mode no longer appends document annexures (matching the legacy renderer). No duplicate records, no re-upload; original files untouched.

**Points system untouched.** No point value, eligibility, ranking, verification or scoring code changed; leaderboard verified identical (rank 1, totalPoints 5, achievementCount 1) before and after.

**Verified on the real generated PDF:** `mode=full` 3 → **5 pages** with the certificate listed and its original text **reproduced verbatim**; `mode=mentor-documents` 2 → **4 pages**; live upload→regenerate→delete round trip **17/17** (PDF restored byte-identical, file removed, rows restored, points unchanged); new `test:record-book-certificates` **27/27**; `test:record-book-header` 74/74, `test:certificate-visibility` 22/22, `test:runtime` 38/38, `test:document-watermark-runtime` 46/46, `test:leaderboard` 35/35, `test:state-machine` 137/137, `test:security-hardening` 8/8; backend + frontend `tsc` clean; backend + frontend `npm run build` exit 0.

**Known pre-existing issues (reported, not touched):** one orphaned `StudentProgress` row (KAVIN S, `731523205099`) references a non-existent student and a missing file; `backend/data/achievements.json` contains a `PROBE Workshop Attendance` (5 pts) test artifact — removing it would change the leaderboard, so it was left as-is.

### Achievement certificates missing from "My Documents" — connected to the participation ledger (2026-10-15)

**Report:** uploaded achievement certificates did not show in the student's **My Documents**; the achievement points system is working and must not change.

**Root cause:** the certificate is stored in `StudentProgress` (the achievement/participation ledger that **My Progress** writes to), a different collection from the `StudentDocument` rows that `getStudentDocuments` returned; the file endpoints also resolved only `StudentDocument` ids, so the file could not be served.

**Fix:** `backend/src/modules/documents/document.controller.ts` — `getStudentDocuments` merges the student's achievement certificates onto the document list by reusing the canonical de-duplicating routine already used by the mentor review screen (`buildUnifiedProgressRecords`) and normalising them to the document shape (`source:'progress'`, real `verificationStatus`, `fileAvailable`, read-only capabilities); `streamDocumentFile` resolves `StudentProgress` ids under the same `checkStudentAccess` ownership rule and serves the original bytes. `frontend/src/components/documents/StudentDocumentsManager.tsx` tags them "From My Progress" and disables View/Download with a clear note when the file is genuinely missing. No duplicate record is ever created; a file already in the document store is listed once.

**Points system untouched.** No point value, eligibility, ranking, verification or scoring code changed; leaderboard totals verified identical before and after.

**Verified:** headless-Chrome CDP check **14/14 PASS** (certificate displayed, tagged, exactly one, previews the certificate via a secure blob iframe, no console errors/exceptions); live API probes (owner 200, anonymous 401, other student 403, no duplicate, upload→appears→cleanup); new `test:certificate-visibility` 22/22, `test:runtime` 38/38, `test:document-watermark-runtime` 46/46, `test:leaderboard` 35/35, `test:state-machine` 137/137, `test:security-hardening` 8/8; backend `tsc` and frontend `tsc`/`vite build` clean.

**Known pre-existing issues (reported, not touched):** one orphaned `StudentProgress` row (KAVIN S, `731523205099`) references a non-existent student and a missing file; `backend/data/achievements.json` contains a `PROBE Workshop Attendance` (5 pts) test artifact from an earlier verification probe — removing it would change the leaderboard, so it was left as-is.

### Achievement Leaderboard "Something Went Wrong" — Rules-of-Hooks violation fixed (2026-10-15)

- **File:** `frontend/src/components/leaderboard/LeaderboardView.tsx` (only product file).
- **Problem:** the `useMemo` that memoises the derived presentation was declared **after** the `if (error) return …` and
  `if (!data) return <LeaderboardSkeleton />` early returns, so the hook count changed from the loading render (5 hooks)
  to the loaded render (6) → `Rendered more hooks than during the previous render` → KSRCE `ErrorBoundary` → the
  "Something Went Wrong" page, despite `/api/leaderboard` returning 200.
- **Fix:** `entries` + `derived = useMemo(…)` hoisted above both early returns and made null-safe (`data?.entries ?? []`,
  `(data?.verifiedAchievements ?? 0) > 0`, `data?.me ? … : null`); duplicate block removed; explanatory comment added.
- **Verified:** pre-fix defect reproduced in a real browser and post-fix **8/8 PASS** (`.lb-root` rendered, 157 students in
  scope, 0 error-boundary, 0 exceptions, 0 console errors); `test:leaderboard` 35/35; frontend `tsc --noEmit` exit 0;
  `vite build` exit 0. Harness: `.runtime-verify/achv/verify.mjs`.

### Subject Management — multi-select scope (departments · semesters · academic years · regulations) (2026-10-15)

- **Added:** `frontend/src/components/common/MultiSelect.tsx` (reusable accessible chip multi-select with search,
  select-all/clear-all, creatable mode, drop-up placement).
- **Changed:** `backend/src/models/Subject.model.ts` (array scope + scalar mirrors + `subject*`/`normaliseSubjectScopes`/
  `subjectAppliesTo`/`backfillSubjectScopes`), `database/migrate.ts` (run the idempotent backfill at boot),
  `modules/subjects/subject.controller.ts` (array + legacy input parsing, overlap uniqueness 409, JS-side array
  filtering, usage across combos, `loadDepartmentSubjects`), `modules/hod/hod.controller.ts` (`getSubjectsForClass`
  expands a subject across its semesters), `modules/hod/marks-bulk-upload.service.ts` (`resolveUploadSubject` matches
  code + `semesters` + `academicYears`; `academicYear` threaded through validate/import),
  `frontend/src/api/client.ts` (`SubjectRow`/`SubjectInput` multi-select shape),
  `frontend/src/pages/admin/AdminSubjectManagement.tsx` (four `MultiSelect`s + chips in the table),
  `frontend/src/styles/index.css` (`.ms-*`, `.subj-tag`), `backend/src/tests/subject-management.test.ts`,
  `.runtime-verify/subjects/verify.mjs`.
- **Key rule:** a subject's canonical scope is the arrays; the original scalars are kept as the **first element** of
  each array (preserves the unique index, API shape and readers). Two subjects may share a code only with **disjoint**
  (department, semester, academic-year) scopes; any overlap is a 409.
- **Verification:** `test:subject-management` **26/26** (17 original + 9 multi-select); UI harness **16/16** (headless
  Chrome, scratch store, 0 runtime exceptions); regressions `security-hardening` 8/8, `bulk-upload` 23/23,
  `hod-class-management` 8/8, `hod-scope` 33/33, `internal-marks` 97/97, `admin-routes` 8/8, `admin-auth` 13/13;
  backend + frontend `tsc --noEmit` exit 0; `vite build` exit 0. Branch `temp`, uncommitted, no commit/push.
- **Not enforced:** regulation is stored/displayed/filterable but is not compared during uploads (no
  `Student.regulation`); scope filtering is JavaScript-side against the full-scan local store.

### Admin Subject Management + subject-aware marks upload (2026-10-15)

- **Added:** `backend/src/models/Subject.model.ts`; `backend/src/modules/subjects/subject.{controller,routes}.ts`;
  `frontend/src/pages/admin/AdminSubjectManagement.tsx`; `backend/src/tests/subject-management.test.ts`;
  `.runtime-verify/subjects/verify.mjs`.
- **Changed:** `models/index.ts`, `database/migrate.ts` (Subject → `ALL_MODELS` + `PERMANENT_MODELS`), `index.ts`
  (`/api/admin/subjects` mounted before `/api/admin`), `hod/hod.controller.ts` (`getSubjectsForClass` union),
  `hod/marks-bulk-upload.service.ts` (additive per-department catalogue enforcement in validate + import),
  `frontend/src/api/client.ts`, `pages/admin/AdminDashboard.tsx`, `components/common/Sidebar.tsx`,
  `pages/hod/HodMarksManagement.tsx`, `pages/hod/HodClassManagement.tsx`, `pages/hod/ClassManagementClassCard.tsx`,
  `backend/package.json` (`test:subject-management`).
- **Key rule:** the catalogue is **additive** — enforcement only once a department has ≥1 catalogue subject; departments
  with none keep the legacy free-form behaviour (so the `SEC201` security test still imports).
- **Verification:** `test:subject-management` 17/17; UI harness 12/12 (headless Chrome, scratch store, 0 runtime
  exceptions); regressions `security-hardening` 8/8, `hod-class-management` 8/8, `internal-marks` 97/97, `bulk-upload`
  23/23, `hod-scope` 33/33, `admin-routes` 8/8, `admin-auth` 13/13; backend + frontend `tsc --noEmit` exit 0;
  `vite build` exit 0. Branch `temp`, uncommitted, no commit/push.

### Login page — reference-match pass (64/36 · 420 px card · `OR` separator) (2026-10-15)

- **Changed:** `frontend/src/styles/index.css` (`.lg-*` only) — `.lg-page` grid `62fr/38fr` → `64fr/36fr`; `.lg-card`
  `max-width` `440` → `420 px`; new `.lg-or-sep`/`.lg-or-line`/`.lg-or-text`; tightened card rhythm (head margin
  1.6→1.4, college 0.9→0.8, divider 1/0.8→0.85/0.7, form-group 1.15→1.05, pwa-row 1.15→0.9, foot 1.25/1→1.05/0.9 rem).
  `frontend/src/pages/auth/LoginPage.tsx` — added the `OR` separator above the (conditional) PWA button.
- **Reference image:** `A:\movies\K.S.R.C.E. Campus at Twilight.png` verified byte-identical (SHA-256) to the existing
  `frontend/public/assets/ksrce-campus-twilight.png`; already referenced via `/assets/ksrce-campus-twilight.png`.
- **Preserved:** login API/payload/fields/errors, `useAuth`/session/role redirects, password toggle, PWA install, campus
  asset, other pages; `.login-*` (`ChangePasswordPage`) untouched; no dependency; no hardcoded credentials; remember-me /
  forgot-password intentionally not added (no real functionality).
- **Verification:** running app in headless Chrome (CDP) at the reference **1490×810** → split **64/36** (954/536), card
  **420×682** centred (Δ0), hero left x=48, gaps 88/28/29/88, heading 31.2 px, lead 3 lines, four 36×36 icons; 1440×900
  → 922/518 card 420×681; 1024×768 → 655/369 card 313×695; 390/320 stacked, no horizontal overflow; campus `200`
  (2,580,028 B) + logo `200`; toggle / wrong-password alert / successful login / PWA all work; **0 console
  errors/exceptions**; `tsc --noEmit` + `vite build` exit 0 (CSS 138.91 kB). **No image input → the attached reference
  screenshot could not be visually compared**; matched to the spec's stated text/dimensions via computed styles +
  geometry + sharp pixel stats. Branch `temp`, uncommitted, no commit/push.

### Login page — hero refinement (smaller headline · balanced lead · feature contrast) (2026-10-15)

- **Changed:** `frontend/src/styles/index.css` (scoped `.lg-*` block only) — `.lg-hero-title` desktop font-size
  `clamp(1.5rem,2.5vw,2.1rem)` → `clamp(1.42rem,2.3vw,1.95rem)` (33.6 → 31.2 px) and tablet
  `clamp(1.35rem,2.15vw,1.85rem)` → `clamp(1.28rem,2vw,1.72rem)` (22.02 → 20.48 px); `.lg-hero-text` `margin-top`
  `clamp(1.4rem,2.8vh,1.9rem)` → `clamp(1.75rem,3.4vh,2.4rem)` and `max-width` `min(52ch,100%)` → `min(40ch,100%)`
  (tablet `44ch` → `40ch`) so the lead wraps into three balanced lines (317/294/362 px); `.lg-brand-body::before` scrim
  widened to `radial-gradient(150% 125% at 0% 52%, rgba(6,27,54,.66) 0%, …0 74%)` for feature-list contrast.
  `LoginPage.tsx` untouched this pass.
- **Preserved:** login API/payload/fields/errors, `useAuth`/session/role redirects, password toggle, PWA install, the
  campus asset, the right-hand card (440×670, centred) and the other pages. `.lg-*` is the only selector family touched.
- **Verification:** running app in headless Chrome (CDP) — 1440: headline 31.2 px / 4 lines / lh 37.44 px, lead 3 lines
  at 383.6 px, gaps 130/31/32/129 px, icons 36×36 @x46, titles @x96, card 440×670 Δ≤1; 1024: headline 20.48 px, lead 3
  lines at 353.3 px, gaps 106/28/26/106 px, icons @x32, card Δ0; 390/320 stacked, no horizontal overflow, vertical
  scroll (docH 944/992); campus photo + logo both `200`; gold line fits 280→1440 px; toggle / wrong-password alert /
  successful login / PWA all work with **0 console errors/exceptions**; `tsc --noEmit` + `vite build` exit 0
  (CSS 138.62 kB). Screenshots were captured but **not** visually reviewed (no image input in this environment).

### Login page — final UI polish (hero alignment · spacing · panel cleanup) (2026-10-15)

- **Changed:** `frontend/src/pages/auth/LoginPage.tsx` — crest + hero copy + feature list + tagline wrapped in one
  shared `<div className="lg-brand-inner">`; the `<span className="lg-panel-decor">` removed.
  `frontend/src/styles/index.css` (scoped `.lg-*` block) — new `.lg-brand-inner`; `.lg-brand` background-position
  `46% 42%`; lighter `.lg-brand-veil`; heading `line-height` 1.2, heading→paragraph gap 25 px, paragraph→features
  33 px, feature-row gap 17.1 px; `.lg-panel-decor` rules deleted.
- **Preserved:** login API/payload/fields/errors, `useAuth`/session/role redirects, password toggle, PWA install, the
  campus asset and the other pages. `.lg-*` is the only selector family touched, so the shared `.login-*`
  (`ChangePasswordPage`) rules are untouched; no new dependency; no credential hardcoded.
- **Verification:** the running app driven in headless Chrome (CDP) — hero blocks share one left edge (x=46 / 32 / 18 at
  1440 / 1024 / stacked); heading→paragraph 25 px and paragraph→features 33 px; four headline lines identical size /
  line-height with `MENTOR–MENTEE` gold + nowrap; four icons 36×36 at the same x with one text column (x 96 / 82);
  `.lg-panel-decor` gone; card 440×670 centred (delta ≤1 px); 62/38 split at 1440 & 1024; no horizontal overflow at
  1440/1024/768/390/320; vertical scroll on short screens; hero-region mean R 65 → 71 with text background luminance
  38–53 and the sunset band ~132; toggle password→text→password; wrong password → `Invalid username or password.`;
  correct → token + app shell + sidebar; **0 console errors/exceptions**; `tsc --noEmit` + `vite build` exit 0
  (CSS 138.62 kB); campus asset `200 image/png` 2,580,028 B. Screenshots were captured but **not** visually reviewed
  (no image input in this environment).

### Login page — right-panel premium navy + left-hero alignment fix (2026-10-15)

- **Changed:** `frontend/src/pages/auth/LoginPage.tsx` — the entire `MENTOR–MENTEE` headline line is gold
  (`.lg-hero-accent`) instead of only `MENTEE`. `frontend/src/styles/index.css` (scoped `.lg-*` block) — the
  transparent `.lg-panel` now paints its own full deep-navy → midnight gradient edge-to-edge; the oversized decorative
  circles were replaced by a soft gold radial bloom + faint masked dot grid; the card got a thin gold border
  (`rgba(245,189,53,.42)`), 20 px radius and a layered navy shadow; the hero gained four explicit `.lg-hero-line`
  blocks on one left edge/line-height, a `min(52ch,100%)` paragraph, 36×36 feature icon boxes with a fixed gap, a
  bottom-left tagline, plus `min-height:100dvh`, safe-area padding, `overflow-x: clip` and a ≤960px stack.
- **Preserved:** login API/payload, auth/session/role redirects, validation/errors, password show/hide, loading/disabled
  states, PWA install workflow, storage, the campus asset and the other dashboards. `.lg-*` is the only selector family
  touched, so no shared style changed and the `.login-*` (`ChangePasswordPage`) rules are untouched; no new dependency;
  no credential hardcoded.
- **Verification:** the running app driven in headless Chrome (CDP) — 62/38 split at 1440 & 1024; panel
  `rgb(6,27,54)` + gradient with navy corners (13,42,77)/(32,62,90)/(4,16,31); card 440×670 centred on the panel centre
  (x 946–1386, y 115–785) with white samples; `MENTOR–MENTEE` `rgb(245,189,53)`; all hero lines share one left x and one
  line-height (38.98 px @ 33.6 px); feature icons 36×36 with a consistent text x; no horizontal overflow at
  1440/1024/768/390/320; toggle password→text; wrong password → `Invalid username or password.`; correct
  (`Ksrce@admin` / `Ksrce@1234`) → token + app shell; real API 401/200 (ADMIN + token); **0 console errors**;
  `tsc --noEmit` + `vite build` exit 0 (CSS 139.08 kB). Screenshots were captured but **not** visually reviewed (no
  image input in this environment).

### Login page — premium redesign aligned to the latest navy/gold reference (2026-10-14)

- **Changed:** `frontend/src/pages/auth/LoginPage.tsx` — feature items gained a short description (icon + title +
  description) and a `.lg-panel-decor` element; `frontend/src/styles/index.css` (scoped `.lg-*` block) — 62 / 38 split,
  uppercase hero title + `WELCOME BACK`, feature description styles, and clipped gold decorative arcs on the sign-in
  panel with `.lg-card { z-index: 1 }`.
- **Preserved:** login API/payload, auth/session/role redirects, validation/errors, password show/hide, loading/disabled
  states, PWA install workflow, storage and the other dashboards. `.lg-*` is the only selector family touched, so no
  shared style changed and the `.login-*` (`ChangePasswordPage`) rules are untouched; no new dependency; no credential
  hardcoded.
- **Verification:** the running app driven in headless Chrome (CDP) — 62 / 38 split; uppercase title and `WELCOME BACK`;
  4 feature rows with descriptions; gold 1 px card border, 20 px radius; navy-gradient primary with gold border +
  arrow; campus image loaded (1 672 × 941) and clearly visible (left-panel mean luminance ≈ 66–77); no horizontal
  overflow at 1440 / 1024 / 390; password toggle works; invalid → error alert; valid → token + dashboard;
  **0 console errors**; `tsc && vite build` exit 0. Screenshots were captured but **not** visually reviewed (no image
  input in this environment).

### Grammar engine — broad vocabulary, modular rules, optional local model (2026-10-13)

- **Changed:** the grammar engine became a modular package. New `vocabulary/morphology.ts`, `domain-vocabulary.ts`,
  `lexicon.ts` (licensed, cached 370,103-word dictionary + 50,000-word frequency ranking), `grammar.rules.ts`
  (ordered broad rules), `grammar.spelling.ts` (conservative dictionary-backed typo correction) and
  `grammar.context.ts` (optional Ollama adapter, OFF by default). `grammar.service.ts` and
  `ai-assistant.service.ts` wired to the new pipeline; `index.ts` warms the lexicon at boot;
  `scripts/copy-grammar-data.cjs` + `postbuild` copy the data into `dist/`.
- **Vocabulary / licences:** `dwyl/english-words` `words_alpha.txt` (**The Unlicense**) and
  `hermitdave/FrequencyWords` `en_50k.txt` (**MIT**), recorded in `vocabulary/data/SOURCES.md`;
  `first20hours/google-10000-english` was rejected for an unclear licence. Nothing is fabricated.
- **New rules:** plural-subject agreement (+ `of`-guard), be/have/do closed forms, missing `did`, missing-verb
  fragments, `there is/are`, quantifier & partitive plurals, a/an, adjective+preposition collocations, doubled words.
- **Optional local model:** enable with `GRAMMAR_LOCAL_MODEL=true` + `OLLAMA_BASE_URL`/`OLLAMA_MODEL`; any failure
  (off / unreachable / timeout / junk / value-dropping) silently falls back. No model is installed here, so it is
  verified against a mock server only.
- **Verification:** `test:grammar-coverage` **1084/1084**, `test:grammar-context` **35/35**, `test:grammar-api`
  **63/63**, `test:grammar-dataset` **85/85**, `test:grammar-safety` **45/45**, `test:grammar` green, `tsc` +
  `npm run build` exit 0. Benchmark: lexicon load **~614 ms / ~49.5 MB**, **~3,544 corrections/s**, 2,498-char
  paragraph **~3 ms** p95 ~4.6 ms. UI, RBAC, API contract and storage unchanged. Branch `temp`, uncommitted.

### Grammar engine — missing-auxiliary repair covers "coming" (`he not coming tomorrow`) (2026-10-13)

- **Root cause:** `coming` was absent from the curated `MISSING_AUX_GERUNDS` list, so `subject + not + coming` never
  matched `fixMissingAuxiliaryVerbs` and only the mechanical capitalisation/punctuation step ran. The rule order in
  `grammar.service.ts` was already correct.
- **Changed:** added `coming` (and a curated group of other unambiguous action participles) to
  `backend/src/modules/grammar/grammar.dataset.ts`; in `backend/src/modules/grammar/grammar.structure.ts` the
  object-plural normalisation now applies only when the clause continues past the bare object, so
  `she not attending class` → `She is not attending class.` while `…attending class regularly` →
  `…attending classes regularly.` is preserved.
- **Result:** `he not coming tomorrow` → `He is not coming tomorrow.`; `student not coming tomorrow` →
  `The student is not coming tomorrow.`; `they not submitting assignments` → `They are not submitting assignments.`;
  an existing auxiliary (`He is not coming tomorrow.`) is never rewritten.
- **Verification:** `test:grammar-dataset` **85/85**, `test:grammar-safety` **45/45**, `test:grammar-api` **63/63**,
  `test:grammar` green, backend `tsc` + frontend `vite build` exit 0, and the **live** server (via the frontend
  proxy) returns the corrected output for the exact reported input. Branch `temp`, uncommitted.

### Login page — premium polish pass (2026-10-13)

- **Changed:** `frontend/src/pages/auth/LoginPage.tsx` (the submit button gains `aria-busy={loading}`) and the scoped
  `.lg-*` block in `frontend/src/styles/index.css` — a lighter, localised campus scrim (image far more visible, text
  still readable via stronger shadows), crest/typography refinement, a premium card (padding/border/layered shadow),
  50 px inputs with a gold `:focus`/`:focus-visible` ring, a 38×38 password toggle, a prominent 52 px Sign-In button
  with polished hover/focus/disabled/loading states, a quieter-but-accessible PWA button, softer grid/arc accents, and
  a compact mobile banner with a full-width (100%) form at ≤480 px. The shared `.login-*` rules
  (`ChangePasswordPage`) are untouched.
- **Unchanged:** auth (`useAuth`, the `POST /api/auth/login` shape, errors, role redirects), PWA install, show/hide
  password, storage, every other role's dashboard; no new dependency; no hardcoded credentials.
- **Verification:** live `3000` → 200; campus PNG served **200 image/png 2 728 283 B** (byte-identical);
  `POST /api/auth/login` via the dev proxy → **200 (ADMIN + token)** and wrong password → **401**; `tsc && vite build`
  **exit 0**. Branch `temp`, uncommitted.

### Grammar engine — missing-verb fragment repair (2026-10-13)

- **Root cause:** only word/phrase substitution rules existed, so *subject + `not` + participle*
  (`student not attending class regularly`, `he not attending classes regularly`, `she not submitting assignments`)
  and *subject + participle* (`student facing difficulty in mathematics`) fell through to capitalisation + terminal
  punctuation. No curated exact/approximate entry covered them.
- **New `backend/src/modules/grammar/grammar.structure.ts`:** `fixMissingAuxiliaryVerbs` — sentence-anchored, curated
  subject + curated participle, inserts the article/auxiliary (`The student is …`, `They are …`), pluralises a small
  curated set of singular objects only inside a clause it actually rebuilt, and bails out entirely when a curated
  finite verb/modal follows the participle (reduced relative) so correct clauses are untouched.
- **`backend/src/modules/grammar/grammar.dataset.ts`:** added `MISSING_AUX_GERUNDS`, `MISSING_AUX_SUBJECTS`,
  `MISSING_AUX_NOUN_SUBJECTS`, `FINITE_VERB_MARKERS`, `MISSING_AUX_OBJECT_PLURALS`.
- **`backend/src/modules/grammar/grammar.service.ts`:** runs the repair after word corrections and before
  `PHRASE_RULES`; records a `sentence-structure` note.
- **Tests:** new section in `dataset-grammar.test.ts` (four target patterns, plural subject, already-correct +
  reduced-relative guards, protected values, dataset integrity) and a full-stack case in `grammar-api.test.ts` for the
  exact screenshot input.
- **Verification:** `test:grammar-dataset` **73/73**, `test:grammar-safety` **45/45**, `test:grammar-api` **54/54**
  (real `src/index.ts` boot; exact input returns `The student is not attending classes regularly.`,
  `RULES_APPLIED`), `test:grammar` green; backend + frontend `tsc` and frontend `vite build` exit 0. No
  route/RBAC/storage/API-shape change. Branch `temp`, uncommitted — no commit/push.

### Dataset-based grammar engine — deterministic, conservative, extensible (2026-10-13)

- **New `backend/src/modules/grammar/grammar.dataset.ts`:** `EXACT_CORRECTIONS` (16 curated whole sentences with
  stored correct forms; only the same-topic ones — `wrong`/`right` content-token overlap ≥ 0.5 — carry
  `allowApproximate`), extensible `WORD_CORRECTIONS`
  (mentoring misspellings + proper nouns/weekdays), ordered `PHRASE_RULES` (contraction spelling, subject–verb
  agreement, bare infinitive, pluralisation, articles, fixed prepositions, structural errors, spacing) and the
  thresholds/confidences (`APPROX_MATCH_THRESHOLD` 0.9, `AMBIGUOUS_THRESHOLD` 0.7, `APPROX_TOPIC_FLOOR` 0.5).
- **New `backend/src/modules/grammar/grammar.normalize.ts`:** matching-only normalisation (`normalizeForMatching`),
  `tokenize`, `contentTokens`, `tokenSetSimilarity`, `levenshtein`, `similarityRatio`.
- **New `backend/src/modules/grammar/protected-values.ts`:** official-value guard moved here
  (`extractProtectedValues`, `preservesProtectedValues`, `isOfficialToken`), shared by both engines.
- **New `backend/src/modules/grammar/grammar.service.ts`:** `correctText` orchestrator and the `GrammarStatus`
  contract; returns the input unchanged with an explicit status when no reliable correction exists.
- **`backend/src/modules/counselling/ai-assistant.service.ts`:** removed the inline rule engine and duplicated guard;
  delegates to `correctText`, re-exports the protected-value helpers; optional external-LLM path preserved.
- **`backend/src/modules/counselling/counselling.controller.ts`:** `grammarCheckController` (blank + normal) now
  returns `status`.
- **New `backend/src/tests/dataset-grammar.test.ts`** + `test:grammar-dataset` script; existing
  `grammar-safety.test.ts` field-set assertion widened to include `status`.
- **`frontend/src/api/client.ts`:** `checkGrammar` return type gains `status`.
- **`frontend/src/components/mentor/GrammarAssistField.tsx`:** status-driven message instead of a false
  "no grammar issues"; still applies only after **Apply Correction**.
- **Verification:** `test:grammar-dataset` 59/59, `test:grammar-safety` 45/45, `test:grammar-api` 49/49,
  `test:grammar` green; backend + frontend `tsc` and frontend `vite build` exit 0. No route/RBAC/storage change.
  Branch `temp`, uncommitted — no commit/push.

### User-facing "Counselling" → "Mentoring" — remaining mentoring-workflow labels cleared (2026-10-12)

- **`frontend/src/components/common/Sidebar.tsx`:** `Counselling Records` → `Mentoring Records`; `5-Domain Counselling`
  → `5-Domain Mentoring`; student `Mentoring & Counselling` → `Mentoring History`.
- **`frontend/src/pages/mentor/MentorStudentProfileView.tsx`:** tab `6. Counselling` → `6. Mentoring`; summary card
  `Counselling Sessions` → `Mentoring Sessions` (+ aria-label); `Mentee Counselling Records & Dossier` → `Mentee
  Mentoring Records & Dossier`; record `Counselling Date` → `Mentoring Date`; `Edit Counselling Record` → `Edit
  Mentoring Record`; empty state + copy; add/edit modal title/subtitle and `Mentoring Date` / `Mentoring Category`
  labels + validation messages.
- **`frontend/src/pages/faculty/FacultyDashboard.tsx`:** `Add/Pending/Recent Counselling` → `… Mentoring`;
  `5-Domain Counselling` → `5-Domain Mentoring`; mentoring-record table + `Open Counselling Desk` → `Open Mentoring
  Desk`; quick-add modal.
- **`frontend/src/components/mentor/CounsellingCategorySelect.tsx`:** `Counselling Category` → `Mentoring Category`,
  placeholder + validation.
- **`frontend/src/pages/admin/AdminDashboard.tsx`:** `Counselling Sessions` → `Mentoring Sessions`; `Institutional
  5-Domain Counselling Hub` → `… Mentoring Hub`; `Student Counselling Directory` → `Student Mentoring Directory`;
  `Counselling Action` → `Mentoring Action`; `View Student Counselling` → `View Student Mentoring`; retention/delete
  copy.
- **`frontend/src/components/faculty/FacultyDetailView.tsx`:** `Counselling History` → `Mentoring History`;
  `Counselling records` → `Mentoring records`; `Last Counselling` → `Last Mentoring`; `Counselling provided` →
  `Mentoring provided`; empty state.
- **`frontend/src/pages/principal/PrincipalDashboard.tsx`**, **`…/principal/PrincipalActivity.tsx`**,
  **`…/principal/PrincipalCharts.tsx`**, **`frontend/src/pages/hod/HodDashboard.tsx`:** KPI hint, `Last mentoring`
  column, note and empty-state copy.
- **`frontend/src/pages/student/StudentDashboard.tsx`:** `5-Domain Counselling & Mentoring History` → `5-Domain
  Mentoring History`; card + PDF-download copy. **Kept:** the `Counselling (Govt Quota)` admission option (also in
  `frontend/src/pages/student/CompleteProfileWizard.tsx`).
- **`frontend/src/components/ai/AiAssistant.tsx`**, **`…/mentor/MentorAiBotModal.tsx`**,
  **`frontend/src/pages/auth/LoginPage.tsx`:** prompt / tagline copy.
- **Not changed:** all internal identifiers (tab keys, `/counselling/*`, `counselling*` fields, `CounsellingRecord`,
  component/type names, comments) and backend / PDF text. **Verification:** frontend `tsc` + `vite build` clean;
  bundle + running dev server contain only the two `Counselling (Govt Quota)` strings; no backend/data change. Branch
  `temp`, uncommitted.

### Bulk Upload & Assign Mentees to Faculty Mentors — ADMIN college-wide / HOD own-department (2026-10-12)

- **New `backend/src/modules/mentorship/bulk-assignment.service.ts`:** template generation (`generateAssignmentTemplateXlsx`
  / `generateAssignmentTemplateCsv`), CSV + XLSX parsing into a shared string matrix (`parseAssignmentFile` /
  `matrixToRawRows`, header aliases, `#` comments, blank rows skipped), server-side `validateAssignmentRows`
  (`VALID` / `WARNING` / `INVALID` / `DUPLICATE` / `ALREADY_ASSIGNED` / `REASSIGNMENT_REQUIRED` + summary),
  `executeBulkAssignment` (per-row writes mirroring `assignMentor`/`reassignMentor`, compensating revert,
  notifications via `safeNotify`, audit), and `generateAssignmentReport` (CSV/XLSX). `BULK_ASSIGN_MAX_FILE_BYTES`
  5 MB, `BULK_ASSIGN_MAX_ROWS` 1000.
- **New `backend/src/modules/mentorship/bulk-assignment.controller.ts`:** multer memory storage (5 MB, `.xlsx`/`.csv`
  filter), `ensureAssignerRole`, handlers for template/validate/assign/report with clear 400s.
- **New `backend/src/modules/mentorship/bulk-assignment.routes.ts`:** `GET /template`, `POST /validate`,
  `POST /assign`, `POST /report`, each `authorize(ADMIN, HOD)`; `authenticate` at the router level.
- **`backend/src/modules/mentorship/mentorship.routes.ts`:** imports and mounts `router.use('/bulk', bulkAssignmentRoutes)`
  **before** the single-student routes. No `index.ts` change needed.
- **`backend/package.json`:** added `test:bulk-assignment`.
- **New `backend/src/tests/bulk-assignment.test.ts`:** real-server HTTP suite, **29/29 PASS**.
- **`frontend/src/api/client.ts`:** added the `BulkAssign*` types and the `bulkAssignment` API block
  (`downloadTemplate`, `validate`, `assign`, `downloadReport`).
- **New `frontend/src/components/mentorship/BulkAssignMentees.tsx`:** the 4-step modal flow (template downloads,
  dropzone, preview table + filters/search, validation-report download, confirmation dialog with reassignment
  authorisation + required reason, results table, CSV/XLSX results download).
- **`frontend/src/pages/admin/AdminDashboard.tsx`** and **`frontend/src/pages/hod/HodDashboard.tsx`:** added the
  **Bulk Assign Mentees** trigger button and modal render (Admin assignment tab; HOD reassignment tab). The existing
  single-student actions are unchanged.
- **`frontend/src/styles/index.css`:** appended a scoped `ba-*` block only; the shared `bu-*` primitives are reused.
- **No change** to the existing single-student assign/reassign controllers, the models, the role permissions, or any
  unrelated page. All new styling is scoped to the new component.
- **Verification:** `npm --prefix backend run test:bulk-assignment` 29/29; `test:critical` 12/12, `test:bulk-upload`
  23/23, `test:bulk-actions` 15/15, `test:hod` 33/33, `test:admin` 23/23, `test:security-hardening` 8/8; backend and
  frontend TypeScript clean; frontend `vite build` clean. Branch `temp`, uncommitted — no commit/push.

### Principal dashboard — oversized banner removed, compact heading + mentor analytics series (2026-10-12)

- **`frontend/src/components/principal/PrincipalHeader.tsx` (rewritten):** the hero banner became a compact
  `.pd-pagehead` — `Principal Dashboard` + `Institutional performance at a glance` + a small current-date chip. Removed
  the gradient card, the in-banner heading/tagline, both badges, repeated college branding, the welcome message and the
  in-banner date.
- **`frontend/src/pages/principal/PrincipalDashboard.tsx`:** KPI section retitled "Key institutional metrics"; the
  distribution chart now passes the real `mentors` field and is titled "Students, faculty & mentors by department".
- **`frontend/src/components/principal/PrincipalCharts.tsx`:** `DistributionRow` gained `mentors`; a third series +
  legend entry is rendered from real data. **`PrincipalDashboardSkeleton.tsx`:** hero skeleton replaced by a compact
  heading skeleton; analytics skeleton height aligned.
- **`frontend/src/styles/index.css`:** deleted the `.pd-header*` / `.pd-chip*` rules; added scoped `.pd-pagehead*` rules
  and the `.page-body:has(> .pd-root)` top-padding trim; gave `.pd-dist-fill` a width transition. No shared selector is
  changed in a way that affects any other role.
- **No backend / API / permission change.** Data remains the existing Principal-allowed `/api/admin/overview/*` surface,
  rendered as-is (no client arithmetic, no fabricated trends).
- **Verification:** real headless-Chromium run over the built SPA + real backend **50/50 PASS**; `test:principal` 53/53,
  `test:admin` 23/23, `test:hod` 33/33, `test:critical` 12/12, `test:bulk-actions` 15/15; frontend `tsc --noEmit` +
  `npm run build` clean. Branch `temp`, uncommitted — no commit/push.

### Principal executive dashboard — premium Principal-only redesign (2026-10-12)

- **Page (`frontend/src/pages/principal/PrincipalDashboard.tsx`, rewritten):** no longer re-exports
  `AdminMentoringDashboard`; it is a self-contained executive dashboard with an in-page header + `pd-tabs`, 8 KPI cards,
  SVG/CSS analytics, department cards with the existing read-only drill-down, and a real activity + attention panel.
  Sidebar tab keys (`mentoring-dashboard` default, `mentoring-hods`, `mentoring-departments`, `mentoring-comparison`,
  `mentoring-reports`) are unchanged.
- **New components (`frontend/src/components/principal/`):** `PrincipalHeader.tsx`, `PrincipalKpi.tsx`,
  `PrincipalCharts.tsx`, `PrincipalDepartmentCard.tsx`, `PrincipalActivity.tsx`, `PrincipalDashboardSkeleton.tsx`.
- **Styling (`frontend/src/styles/index.css`):** one appended scoped `pd-*` block (header, chips, tabs, sections,
  KPI grid + tone tiles, cards, analytics grid, bars / weeks / ring / distribution, department cards, activity, alerts,
  toolbar / search / input, crumbs, badges, responsive + reduced-motion). No shared selector changed.
- **No backend / API / permission change.** Data is the existing Principal-allowed `/api/admin/overview/*` surface;
  values are server-computed and rendered as-is (no client arithmetic, no fabricated trends). Attendance / academic /
  announcements are omitted (no endpoint). View-only is enforced by the server allow-list, not the UI.
- **Verification:** real headless-Chromium run over the built SPA + real backend
  (`backend/.runtime-verify/principal-dashboard-browser.mts`, scratch) **47/47 PASS**; frontend `tsc --noEmit` +
  `npm run build` clean; `test:principal` 53/53, `test:admin` 23/23, `test:hod` 33/33, `test:critical` 12/12,
  `test:bulk-actions` 15/15. Admin and HOD portals confirmed free of any Principal-only markup. Branch `temp`,
  uncommitted — no commit/push.

### Faculty Mentor Cards + click-through full-process detail — HOD "Department Faculty Mentors" (2026-10-12)

- **Cards replace the table (`frontend/src/components/faculty/FacultyMentorCard.tsx`, new; wired into
  `frontend/src/pages/hod/HodDashboard.tsx`):** name, employee ID, email, designation, department, cabin, contact
  number (when present), current mentee count, coverage % and active/inactive status, with **View Details** / **Edit**
  actions and the existing **Add Faculty** button. 3 / 2 / 1 columns (≤1180px / ≤700px) via an appended scoped
  `faculty-*` CSS block; loading, empty and error states; no hardcoded faculty data. The card root is
  `role="button"` + `tabIndex=0` with Enter/Space activation; inner actions call `stopPropagation()` so Edit never
  also opens the detail.
- **Detail dialog (`frontend/src/components/faculty/FacultyDetailView.tsx`, new):** one wide `Modal`
  (`maxWidth="1100px"`) with tabs **Overview / Mentees / Counselling History / Meetings / Documents / Assignment
  History** — only sections the app supports — each backed by real data with a clear empty state. Mentees shows
  name, register number, class/section/year, assignment status, counselling session count, last counselling date and
  progress, and can open the mentee's existing student page.
- **Backend (`backend/src/modules/hod/hod.controller.ts` — extend, no new route):** `getMentorDetail`
  (`GET /api/hod/mentor/:mentorId`) keeps resolving the mentor inside `loadScope` (foreign-department id → 404) and
  now also returns dept-scoped `assignments` (ACTIVE **and** historical `MentorAssignment` rows for that mentor),
  `counselling` (records authored by `mentor === mentorId`), `meetings` (that mentor's meetings) and `documents`
  (`StudentDocument` metadata for the current mentees). Relationships are keyed by stable ids, current vs historical
  is explicit by status, reassigned students are not duplicated, and no raw geo-tagged evidence photos are emitted.
- **Types (`frontend/src/api/client.ts`):** new `HodMentorAssignmentRow` / `HodMentorCounsellingRow` /
  `HodMentorMeetingRow` / `HodMentorDocumentRow` and an extended `HodMentorDetail`.
- **Verification:** real headless-Chromium run over the built SPA + real backend
  (`backend/.runtime-verify/faculty-cards-browser.mts`, scratch) **34/34 PASS**; backend `tsc --noEmit` + `npm run
  build` clean; frontend `tsc --noEmit` + `npm run build` clean; `test:hod` 33/33, `test:critical` 12/12,
  `test:bulk-actions` 15/15. Branch `temp`, uncommitted — no commit/push.

### Principal role end-to-end — read-only college-wide dashboard + forced first-login password change (2026-10-10)

- **Provisioning (`backend/src/database/bootstrap.ts`, section 5b):** a single Principal account is
  created **if and only if no `PRINCIPAL` user exists** — username/email/password come from
  `PRINCIPAL_USERNAME` / `PRINCIPAL_EMAIL` / `PRINCIPAL_PASSWORD` (defaults `Principal` /
  `Principal@ksrce.ac.in`; the default password is the shipped bootstrap default, env-overridable,
  and never printed in logs). The password is stored bcrypt-hashed only. Later boots **never**
  duplicate, re-hash, overwrite identity or re-arm the flag — restart ×3 leaves one account and a
  byte-identical hash.
- **Forced first-login password change:** the login token carries a signed `mustChangePassword` JWT
  claim; `enforcePasswordChange` is mounted at `/api` before every business router and allow-lists
  only `/health`, `/auth/login`, `/auth/me`, `/auth/change-password`. Until the account changes its
  password, every protected route answers **403** — the college dashboard, admin/HOD routes, settings
  and all exports included (only the dashboard *reads* to `/auth/me` stay 200 so the UI knows who it
  is). `changePassword` validates current + new + confirmation (400 on mismatch / too-short /
  same-as-current / wrong-current), persists a fresh hash, clears the flag and returns a fresh
  unflagged `{token, user}`; the old flagged token is inert, and afterwards only the new password
  logs in. Exactly the same flow is enforced in the frontend `ChangePasswordPage` (forced right
  after login), with show/hide toggles and client-side validation before the API call.
- **Read-only Principal portal:** a dedicated `/principal/*` route (guarded in `App.tsx`) renders
  `PrincipalDashboard`, which reuses the verified `AdminMentoringDashboard` over the existing
  GET-only `/api/admin/overview/*` — widened to `authorize(ADMIN, PRINCIPAL)`. The sidebar gains a
  PRINCIPAL nav group bound to the `mentoring-*` tabs. The Principal exposes **no** write, manage,
  approve/reject, HOD/user management, settings, or download/export surface (backend-allow-list
  enforced), and holds no Admin privileges.
- **Security gap found and closed by the new suite:** `downloadStudentPdf` had no explicit PRINCIPAL
  rule, so it fell through to the allow-list's silent *allow* — a Principal could have downloaded any
  student's record book. An explicit PRINCIPAL deny was added in `pdf.controller.ts`; the suite
  asserts 403 by register number and by id.
- **Verification:** new `test:principal` **53/53** — provisioning, idempotency (no duplicate, no
  reset, no flag re-arm), hashed-only (no plaintext stored/logged), flagged login, pre-change 403
  matrix + `/auth/me` 200, invalid-change 400 variants, correct change → fresh unflagged token /
  stale token inert / new password works and old fails, full read-only 403 matrix incl. both PDF
  denies, restart ×3 preserving one account + hash, and ADMIN/HOD flows untouched. Regressions
  `test:admin` 23/23, `test:admin-routes` 8/8, `test:admin-auth` 13/13, `test:hod-admin` 22/22;
  backend `npm run build` PASS; frontend `tsc --noEmit` + `vite build` PASS. PROJECT_PROGRESS.md
  updated; no commit/push made.

### K S R C E watermark always behind content — foreground-overlay regression fixed (2026-10-10)

- **Task:** make the `K S R C E` watermark a genuine background layer on every PDF page (behind
  text, tables, headings and signatures) for both generated and uploaded documents, and prove it.
- **Root cause:** commit `8baa758` added `hasOpaqueFullPageBackground()` to keep the watermark
  visible on genuine scans, but it false-positived on ordinary vector pages — a near-full-page
  filled `re` rectangle (background fill / shaded panel / container rect) or a full-page `cm` image
  transform matched — so those pages skipped `placeWatermarkBehindContent()` and the watermark
  stayed **on top** of the content.
- **Fix (`backend/src/services/document-watermark.service.ts` only):** removed the heuristic and
  its helper `drawnContentText` (plus the now-unused `pdf-lib` content-stream imports) and now
  **always** call `placeWatermarkBehindContent(page)`, moving the watermark stream to index `0` of
  each page's `/Contents`. No top-overlay path remains for PDFs; the JPEG/PNG path is unchanged.
- **Accepted tradeoff:** on a page that is one opaque full-page scan/fill, the underlaid watermark
  is hidden behind that paint (present but not prominent) instead of covering content.
- **Verification:** programmatic MuPDF 2x render + `sharp` raw-pixel diff — form pages
  `contentChanged=0`, `contentMaxDiff=0.0` (original ink byte-identical); the previous
  false-positive `styled` page now darkens 0 content pixels (was 30) and `scantext` darkens 0 (was
  281); direction `\` bottom-right → top-left PASS 5/5. `test:document-watermark` **44/44**,
  `test:document-watermark-runtime` **46/46**, `test:runtime` 38/38, `test:evidence-location-runtime`
  74/74; backend `tsc --noEmit` clean; `npm run build` exit 0. PROJECT_PROGRESS.md updated; no
  commit/push.

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

- PENDING — Bulk Upload & Assign Mentees is verified end-to-end over the **real HTTP stack** (29/29) and the frontend
  compiles + builds, but the new modal's mouse/keyboard interactions (template download, drag-drop, preview filters,
  confirmation dialog, report download) have **not** yet been driven in a headless-Chromium session. Run the browser
  pass on the built SPA (Admin + HOD) before considering the UI fully verified.
- PENDING — Bulk actions UI (Student Master + Faculty / Mentors) is build-verified and the bulk **APIs**
  were verified on the running app, but the new multi-select / action-bar / confirmation-modal
  interactions have not yet been driven in a headless-Chromium browser session. Run the browser pass
  (select single / multiple / all, deselect + clear, pagination + filters, bulk delete valid + invalid
  ids, unauthorized denial, ZIP for students/mentors, missing-doc + partial failures, mobile layout)
  before considering the feature fully verified.
- PENDING — Faculty / Mentor bulk download returns an explicit "no documents available" result because
  the system has no faculty document store. If faculty uploads are added later, extend
  `faculty-bulk.controller.ts` to feed real documents into the same ZIP/manifest pipeline.
- RESOLVED (2026-10-11) — `test:ai-assistant` does not need a live Ollama host: the suite ships an
  in-process mock Ollama server (env `OLLAMA_BASE_URL` set before the app boots; config read per
  call). Its failure to complete was a test-teardown defect — after 47/47 checks it never exited
  because the imported backend's HTTP listener + reminder interval keep the event loop alive and the
  suite only called `process.exit(1)`. The explicit `process.exit(0)` was added (the pattern every
  other suite uses) and the suite is verified **47/47 EXIT 0**. The AI module itself (`src/modules/ai/*`,
  `ollama.service.ts`) was never changed.
- PENDING — Marks **bulk upload** bypasses the admin-controlled internal-marks entry window (an HOD /
  trusted uploader may import directly). Deliberately retained as a design decision during the audit;
  revisit if the college requires the upload path to honour the window.
- PENDING — Login throttling state lives in-process (per-identity + per-IP failure windows). Correct
  for the single-instance local-store deployment; a multi-instance deploy must move these buckets to
  a shared store or the throttle resets per instance.
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
- PENDING — The grammar engine is now **broad but still rule-gated, not exhaustive** (2026-10-13 update). Sentences the
  ordered rules can prove are corrected; anything else returns `NO_RELIABLE_CORRECTION` (or `AMBIGUOUS_INPUT` when it is
  merely similar to a curated sentence) **by design**. Grow coverage by extending the ordered rules and the curated
  sets in `backend/src/modules/grammar/` (`grammar.rules.ts`, `vocabulary/domain-vocabulary.ts`) and re-running
  `test:grammar-coverage` + `test:grammar-dataset`; it must never be "completed" by generating a synthetic corpus or by
  silently substituting a similar sentence. The large `vocabulary/data/*.txt` lists only gate *spelling/vocabulary*, not
  grammar.
- PENDING — Missing-verb / missing-auxiliary repair recognises **curated** subject, participle and past-form sets
  (`grammar.structure.ts`, `grammar.dataset.ts`, `vocabulary/morphology.ts`); extend those and re-run the grammar suites
  to widen coverage, never with an open-ended "any -ing word" rule (that would misfire on during/morning/building/…). A
  fragment that is only similar to a curated sentence (below the approximate threshold) still returns
  `AMBIGUOUS_INPUT` unchanged by design. Known residual gaps (documented as limitations): missing copula
  (`he able to solve`, `the student good in maths`) and generic `want/need + noun`.
- PENDING — Whole-sentence approximate matching is intentionally narrow: only curated entries flagged
  `allowApproximate` whose `wrong`/`right` content-token overlap is ≥ `APPROX_TOPIC_FLOOR` (0.5) participate, so
  heavily rewritten pairs (`student is not good in communication…`, `he is having arrear…`, `she dont attended…`)
  correct on an exact match and via rules but not from a merely similar input.
- PENDING — A sentence typed entirely in capitals skips the whole-sentence dataset path (a short all-caps token may be
  an official code such as `CSE`/`CGPA`), so it is corrected by the case-insensitive rules only. This is a deliberate
  conservatism; revisit only with a reliable way to separate emphasis capitals from codes.
- PENDING — `Editing` remains an unreachable state: there is no begin-edit endpoint that moves an
  APPROVED record into EDITING. Deliberately left; the state exists in the machine for the documented
  workflow but nothing enters it yet.
- PENDING — Mentoring evidence photos inherit the same ephemeral-filesystem problem as the existing
  uploads: they live under `backend/storage/uploads/counselling/` and do **not** survive a Render
  redeploy. Same design decision as the certificate uploads above — durable object
  storage is required before evidence can be treated as an official record.
- PENDING — Evidence location is device-reported and validated only for plausibility (range and
  numeric type); nothing verifies the device was physically at the mentoring venue, and a mentor can
  capture elsewhere or deny the request. This is deliberate: the coordinates are labelled
  "device-reported, not independently verified", and a denied/unavailable/timed-out fix is stored
  honestly and never blocks the upload, so desktop browsers (which usually have no location) can
  still submit evidence. The honest status is always shown to the mentor.

---

- PENDING — Mentor visibility of internal marks outside the entry window is read-only plus a
  correction request. If the college wants bulk import of marks (e.g., from an academic portal
  CSV) or exports of the official IA sheet, add that as a new task.

## Verification

> **2026-10-15:** the Record Book PDF now includes uploaded achievement certificates. New suite
> `test:record-book-certificates` **27/27** (real HTML/CSS → headless-Chromium → pdf-lib renderer, read back with MuPDF):
> the certificate row is listed, the uploaded PDF's text is reproduced **verbatim** on its own page, an uploaded image is
> inline at its real dimensions (240×160), the system Student Details Form is listed but never self-embedded, another
> student's certificate never appears, a file referenced by both stores is listed and reproduced **exactly once**, missing /
> unsupported / no-file records produce clear distinct reasons (and a lost in-tree file is never mislabelled "administrator
> repair"), `internal` mode is document-free, and generation is read-only (original file hashes + record fingerprints
> unchanged). Regressions: `test:record-book-header` **74/74**, `test:certificate-visibility` **22/22**, `test:runtime`
> **38/38**, `test:document-watermark-runtime` **46/46**, `test:leaderboard` **35/35**, `test:state-machine` **137/137**,
> `test:security-hardening` **8/8**. Real HTTP path: `GET /api/pdf/student/73152421125?mode=full` 3 → **5 pages** with the
> certificate listed and its original text reproduced; `mode=mentor-documents` 2 → **4 pages**; live upload→regenerate→delete
> round trip `.runtime-verify/pdf/probe-live-e2e.mjs` **17/17** (PDF restored byte-identical, file removed, rows restored,
> leaderboard unchanged). Backend + frontend `tsc --noEmit` exit 0; backend + frontend `npm run build` exit 0.

> **2026-10-13 (later):** the grammar engine was scaled to a modular broad-coverage engine with a licensed vocabulary
> (`backend/src/modules/grammar/vocabulary/*`) and an optional, OFF-by-default local-model adapter. New suites:
> `test:grammar-coverage` **1084/1084** (hundreds of varied cases across every supported construction, official-value
> preservation, already-correct text and unknown/ambiguous text) and `test:grammar-context` **35/35** (real in-process
> mock Ollama server: off-by-default sends nothing; valid output used; unchanged / value-dropping / commentary /
> HTTP 500 / malformed / empty / timeout / unreachable all fall back to the deterministic engine; no internals leak).
> Regressions: `test:grammar-api` **63/63** (real `src/index.ts` boot + real HTTP), `test:grammar-dataset` **85/85**,
> `test:grammar-safety` **45/45**, `test:grammar` green. `npx tsc --noEmit` and `npm run build` (tsc + `postbuild`
> vocabulary copy) exit 0. Benchmark `bench:grammar`: lexicon load **~614 ms / ~49.5 MB**, **~3,544 corrections/s**,
> 2,498-char paragraph **~3 ms** (p95 ~4.6 ms). No local model is installed on this machine, so it is never claimed to
> be running. No route, RBAC, API-contract or storage change (see Completed).

> **2026-10-13:** the dataset-based grammar engine replaced the inline rule function. A same-day follow-up added the
> sentence-anchored missing-verb fragment repair. New suite `test:grammar-dataset` (**73/73**; script in
> `backend/package.json`) plus `test:grammar-safety` **45/45**, `test:grammar-api` **54/54** (real `src/index.ts` boot;
> exact screenshot input `student not attending class regularly` → `The student is not attending classes regularly.`)
> and `test:grammar` green; backend `tsc --noEmit`, frontend `tsc --noEmit` and `vite build` all exit 0. No route, RBAC
> or storage change (see Completed).

> **2026-10-12:** the bulk selection / delete / document-download pass added `test:bulk-actions`
> (**15/15**, port 5099, temp store) — see Completed. Backend `tsc --noEmit` + `npm run build` and
> frontend `tsc --noEmit` + `vite build` all exit 0 on that change. The bulk **APIs** were also
> exercised against the live running backend (5050); the bulk **UI** still needs a headless-browser
> click pass (see Pending).

Backend and frontend both build clean (`tsc` / `vite build`). All 20 suites, run against the local
file store (re-run in full on 2026-10-08 after the Placement / Achievement / Leaderboard pass; the
new `test:faculty-dept-reassign` suite was added in the Admin features pass that day,
`test:bulk-upload` was added in the Bulk Upload pass on 2026-10-09 and
`test:hod-delete` in the Admin-only permanent HOD deletion pass on 2026-10-09). The
`test:document-watermark` and `test:document-watermark-runtime` suites were updated in the
always-behind watermark pass on 2026-10-10 (44/44 and 46/46), and the new `test:principal` suite
was added in the Principal role pass the same day (53/53). A **full security/bug-fix/regression
audit re-run on 2026-10-11** confirmed every suite green: the audit added `test:security-hardening`
(now 8/8, port 5119 — the follow-up pass same day added the marks bulk-import audit-trail check),
fixed `test:runtime` back to 38/38 (record-book image embedding — see Completed), and updated one
stale assertion in `test:faculty-dept-reassign` (18/18). The follow-up pass also root-caused
`test:ai-assistant`: it never needed a live Ollama host — it drives an in-process mock Ollama and
only "could not complete" because it hung at teardown (missing explicit exit); now **47/47 EXIT 0**
(see Completed → follow-up pass). Full 29-suite matrix re-run 2026-10-11 (final, after the browser
pass; nothing new failed): **29/29 EXIT 0**. A **real headless-Chromium browser pass** the same day
(disposable sandbox: backend on 5056 over a fresh temp store, SPA rebuilt with a temp `VITE_API_URL`,
the live 5050/3000 servers untouched) additionally click-verified all five roles and the HOD
marks/Excel/bulk-upload workflow: **42/42 checks PASS** (see Completed → browser E2E verification; two
confirmed UI defects fixed — a silent failed login and the toast-driven HOD marks selection reset):

| Script | Result |
|---|---|
| `test:state-machine` | PASS — 137 passed, 0 failed |
| `test:hod` | PASS — 33 passed, 0 failed (HOD department scoping + analytics, incl. `?month`, distinct-student coverage, 4-week windows, `reportMentors`) |
| `test:admin` | PASS — 23 passed, 0 failed (Admin college-wide mentoring dashboard; still asserts Admin weekly = 8) |
| `test:hod-admin` | PASS — 22 passed, 0 failed (Admin HOD Management) |
| `test:admin-routes` | PASS — 8 passed, 0 failed (Admin dashboard route contract vs the reported 404s) |
| `test:grammar` | PASS — all grammar engine cases passed |
| `test:grammar-safety` | PASS — 45 passed, 0 failed |
| `test:grammar-dataset` | PASS — 85 passed, 0 failed (curated exact matches, approximate threshold, ambiguous refusal, no-reliable-correction, punctuation/capitalisation, spelling/SVA/articles/prepositions, missing-verb fragment repair incl. the reported `he not coming tomorrow` → `He is not coming tomorrow.`, singular/plural subjects, existing-auxiliary and reduced-relative guards, meaning preservation, dataset integrity) |
| `test:grammar-api` | PASS — 63 passed, 0 failed (incl. the exact screenshot fragment `student not attending class regularly` and the reported `he not coming tomorrow` over the real HTTP endpoint) |
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
| `test:document-watermark` | PASS — 44 passed, 0 failed (rendered appearance + genuine background layering; scanned and full-page-background pages both behind) |
| `test:document-watermark-runtime` | PASS — 46 passed, 0 failed (real upload/preview/download/delete + pre-fix regeneration; served bytes proven behind-layered on every page) |
| `test:record-book-header` | PASS — 50 passed, 0 failed (repeating KSRCE header on **every** page: a real 7-page / 120-row record book with the header inside the reserved top band and **zero body/header overlap**, correct "Page X of Y", `K S R C E` watermark preserved, the 205×190 logo embedded per page, and all three `?mode=` document types) |
| `test:principal` | PASS — 53/53 (Principal provisioning/idempotency, forced first-login password change incl. token refresh + stale-token inertness, read-only college-wide dashboard RBAC, explicit student-PDF deny for PRINCIPAL, restart ×3 preservation; ADMIN/HOD unaffected) |
| `test:security-hardening` | PASS — 8/8 (login throttle 429 + Retry-After, reset on success, per-identity isolation; marks template dept isolation; bulk import persists student + refuses cross-dept rows; **bulk import audit trail**, no secrets in audit rows; JWT source contract; middleware wiring; port 5119) |
| `test:ai-assistant` | PASS — 47/47 EXIT 0 (Ollama-backed role-aware chat via an in-process mock Ollama — no live host needed: base URL/roles/ownership/context scoping, multi-turn history, provider-failure 500/502/503/504 handling, rate-limit 429, read-only counts unchanged; mock-server port + teardown verified clean) |
| Browser E2E (headless Chromium, sandbox) | PASS — **42/42** across sections A–J (login render/error, admin, student + RBAC, HOD class + marks + Excel template + bulk import + persistence + corrupt-file rejection, ECE cross-department isolation, faculty, Principal forced-password-change + read-only, no horizontal overflow at 1440×900 / 1024×768 / 390×844, zero page exceptions, zero unexpected console errors) |

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

### Faculty / Mentor directory search — PASS (2026-10-12)

- **Task:** add a client-side search bar to the Faculty Management / Faculty Mentors page and the
  Mentor Management section, filtering existing records by name, employee ID, email, designation and
  department, with a match count, a friendly no-results message and a clear (×) reset.
- **Where:** a Faculty record IS the mentor record in this data model, so one matcher and one
  interaction pattern cover every surface:
  - Admin → **Faculty / Mentors** (`frontend/src/pages/admin/AdminDashboard.tsx`, tab `faculty`,
    "Faculty & Mentor Master") — desktop table + mobile cards.
  - Admin → **Mentor Assignment Desk** (`AdminDashboard.tsx`, tab `assignment`) — the Admin's
    mentor-management roster.
  - HOD → **Department Faculty Mentors** (`frontend/src/pages/hod/HodDashboard.tsx`, tab `faculty`)
    — the responsive mentor card grid.
- **Shared matcher:** new `frontend/src/utils/facultySearch.ts` (`facultyMatchesQuery`).
  Case-insensitive; trims the query; blank/whitespace-only matches everything; partial substrings
  match (`vish` → `Vishnu`); every whitespace-separated token must appear somewhere in the record's
  name / employee ID / email / designation / department fields. Callers pass only the list the API
  already returned, which is role- and department-scoped.
- **UI:** reused the existing design system (`.card`, `.form-control`, the `Search` icon, navy/gold
  tokens), `flex-wrap` + `min-width` so it stays usable on desktop/tablet/mobile, `aria-label` on the
  input and an `aria-live="polite"` "Showing X of Y" count; the × clear button appears only when the
  field is non-empty. No layout redesign.
- **Bulk actions stay correct:** on the Admin Faculty / Mentors screen the filtered list drives the
  header select-all, the sticky `BulkActionBar` (`totalEligible` / `allSelected` / `Select all`) and
  both the desktop rows and mobile cards; changing the query clears the selection so a bulk delete or
  download can never act on a hidden row. The backend bulk endpoints are unchanged.
- **RBAC / department scope:** no server change. Admin searches the college-wide `/admin/faculty`
  payload; an HOD searches only the server-scoped `/hod/faculty` list, so a client-side filter can
  never surface a record the backend withheld.
- **Pagination:** none of these three screens paginates — each loads the whole eligible set in one
  request — so there is no page state to reset when the query changes; search covers the full set.
  (The Student Master directory keeps its existing server-side search + pagination and was not
  touched.)
- **Verification (actual results):**
  - Frontend `tsc && vite build` — exit 0 (1684 modules).
  - Matcher unit checks (exact / partial / email / employee ID / designation / empty / whitespace /
    multi-token / no-result) — **16/16 PASS**.
  - Live API (`POST /api/auth/login` as admin → `GET /api/admin/faculty`): **221 real records**.
    Empty and whitespace queries return every record; a partial name (case-insensitive), an email, an
    employee ID and a designation each match their owner; every result of the partial query genuinely
    contains the term in a searched field; a nonsense query returns 0; an Admin token is refused
    (**403**) by the HOD `/api/hod/faculty` endpoint. All HTTP checks PASS.
  - Running Vite dev server (3000) already serves the updated modules — `AdminDashboard.tsx`,
    `HodDashboard.tsx` and `utils/facultySearch.ts` all fetched with the placeholder, the matcher
    import, `filteredFaculty` / `filteredMentors` and both no-result strings present.
  - Regressions, isolated temp stores/ports (live 5050/3000 untouched): `test:critical` 12/12,
    `test:hod` 33/33 (includes the HOD department-scope matrix), `test:bulk-actions` 15/15,
    `test:admin` 23/23, `test:bulk-upload` 23/23.
- **Not changed:** Student Master directory, reassignment forms, Student / Faculty / Principal pages,
    routes, record ids, API endpoints, JSON/DB fields, stored data and business logic. No new
    dependency, no mock data, no commit/push.
- **Honest limitation:** the filter is client-side over the already-loaded list (there is no
  pagination control on these screens to reset), and an interactive browser click-through was not
  available in this environment; verification is the production build, the matcher unit checks, the
  live-API filter check, and the running dev server serving the updated modules.

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
15. The grammar engine is **dataset-based, not generative**. It may only apply a stored correction or a
    deterministic rule; when it cannot prove a correction it returns the original with an explicit status.
    It must never substitute a similar sentence or invent facts, and it never claims exhaustive coverage.
16. Official record values are protected by one shared guard (`protected-values.ts`) for both the local engine
    and any optional external LLM; a suggestion that drops or alters one is discarded, not shown.
17. Approximate matching requires an explicit per-entry opt-in **and** a similarity threshold; the dataset is
    grown by adding verified entries, never by generating a synthetic corpus.
18. The missing-verb repair is **sentence-anchored and list-gated**: only a curated subject at a sentence start, only a
    curated participle, and it is abandoned when any finite verb/modal follows the participle. It inserts only an
    article/auxiliary (it never rewrites the clause), so protected values cannot be dropped, and it never pluralises an
    object outside a clause it actually rebuilt.
19. The public login page is refined **in place** and kept entirely inside the scoped `.lg-*` block (plus one
    `aria-busy` attribute) so the shared `.login-*` rules (`ChangePasswordPage`) and every authenticated dashboard are
    never affected; the auth flow, request format and PWA behaviour must not change, and the campus image must be
    verified served byte-identical.
20. The grammar engine stays **deterministic and rule-gated** but is now **modular and broad**: the general
    vocabulary/spelling layer (`vocabulary/lexicon.ts`) may only *validate* words and offer a single unambiguous,
    dictionary-and-frequency-backed typo fix — it never drives grammar. The rules live in ordered reusable functions
    (`grammar.rules.ts`) and may only touch words that are in a curated set.
21. The large vocabulary is **licensed and verbatim**, never generated or inflated: `dwyl/english-words`
    `words_alpha.txt` (**The Unlicense**) for the dictionary and `hermitdave/FrequencyWords` `en_50k.txt` (**MIT**) for
    suggestion ranking, with provenance and SHA-256 in `vocabulary/data/SOURCES.md`. A list with an unclear licence
    (`first20hours/google-10000-english`) is rejected. A tiny `NON_WORD_ENTRIES` override removes specific archaic
    entries in memory so the modern spelling can be offered (the file on disk is never edited).
22. The optional local model is **OFF unless explicitly enabled** (`GRAMMAR_LOCAL_MODEL=true`) and is never required.
    Its output passes the same `sanitizeLlmOutput` + `preservesProtectedValues` guard as the external provider, and any
    failure (disabled, unreachable, timeout, HTTP error, malformed, empty, unchanged, or protected-value-dropping)
    falls back silently to the deterministic engine. The system must never pretend a model is running.
23. The engine preserves the exact public contract: the five grammar-response keys, the documented status enum and the
    existing UI/flows (`Improve Grammar`, suggestion card, `Apply Correction` / `Keep Original`), RBAC and the local JSON
    storage are unchanged. The one-time dictionary load is cached per process and off the request path (warmed at boot).
24. The login page is aligned to the reference **purely with CSS/JSX inside the `.lg-*` scope** (decision 19 extended):
    62 / 38 split, uppercase hero title + `WELCOME BACK`, feature descriptions, and clipped gold `.lg-panel-decor` arcs.
    The decorative layer is *clipped separately* rather than by putting `overflow: hidden` on the panel, so the card's
    drop shadow is never cut. No auth/PWA/storage/other-dashboard change; the campus image stays byte-identical and is
    always referenced by its app asset path, never an absolute drive path.
25. A student's certificates live in **two** existing collections (`StudentDocument` and `StudentProgress`), so any surface
    that lists or reproduces them reads **both** through one shared collector, and any de-duplication uses the **one** shared
    stored-file identity rule (`uploaded-file-key.util.ts`). The Record Book PDF uses `collectStudentDocumentArchive` in both
    renderers; a file referenced by both collections is listed and reproduced **exactly once**. A record with no file attached
    is still listed and says so plainly — it is never described as a lost file or as needing "administrator repair". The
    documents archive and its annexures are rendered together or not at all (`internal` mode is marks-only), and the record
    book never decides or changes a verification status, never re-uploads, and never modifies an original certificate file.

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
| 2026-10-15 | PASS | **BUG FIX — uploaded achievement certificates missing from the Official Record Book (PDF).** `GET /api/pdf/student/:id?mode=full\|mentor-documents` printed "0 student-uploaded document(s) on record" and appended no certificate pages. **Root cause:** the record-book collector (`collectRecordBookData`) read only `StudentDocument` — the same collection split as the My Documents bug — and on a real record every `StudentDocument` row is the auto-generated `student_details_form` (listed, never self-embedded), so the actual certificate (a `StudentProgress` row) was neither listed nor attached. The legacy jsPDF fallback had the identical defect. **Fix:** new shared collector `collectStudentDocumentArchive` (`backend/src/modules/pdf/record-book-html.data.ts`) reads **both** collections, adds `source: 'DOCUMENT' \| 'PROGRESS'`, and de-duplicates by one shared stored-file identity rule (`backend/src/utils/uploaded-file-key.util.ts`, now also used by `student-progress.controller.ts`); **both** renderers use it; a record with no file attached gets a clear "no certificate file attached" message instead of the misleading "administrator repair" wording; the annexure cover sheet names the real upload channel; `internal` mode (marks-only) no longer appends document annexures, matching the legacy renderer. No duplicate records, no re-upload, originals untouched. **Points untouched** (leaderboard identical: rank 1 / 5 pts / 1 achievement). **Verified on the real generated PDF:** `mode=full` 3 → **5 pages**, certificate listed + original `adobe.pdf` text **reproduced verbatim** on p5; `mode=mentor-documents` 2 → **4 pages**; live upload→regenerate→delete round trip **17/17** (PDF restored **byte-identical**, file removed, rows restored, points unchanged); new `test:record-book-certificates` **27/27**; `test:record-book-header` 74/74, `test:certificate-visibility` 22/22, `test:runtime` 38/38, `test:document-watermark-runtime` 46/46, `test:leaderboard` 35/35, `test:state-machine` 137/137, `test:security-hardening` 8/8; backend + frontend `tsc` clean; backend + frontend `npm run build` exit 0. Harnesses `.runtime-verify/pdf/{repro,dump,probe-live-e2e}.mjs`. Branch `temp`, uncommitted. |
| 2026-10-15 | PASS | **BUG FIX — Achievement Leaderboard "Something Went Wrong" (Rules-of-Hooks violation).** The shared `LeaderboardView` rendered the KSRCE error boundary while `/api/leaderboard` returned 200, because the perf-optimisation pass added a `useMemo` **after** the `if (error)` / `if (!data) return <LeaderboardSkeleton/>` early returns, so the hook count changed between the loading render (5 hooks) and the loaded render (6) → `Rendered more hooks than during the previous render. at LeaderboardView (…:244)`. **Fix (`frontend/src/components/leaderboard/LeaderboardView.tsx` only):** hoisted `entries` + the `derived = useMemo(…)` block above both early returns, made it null-safe (`data?.entries ?? []`, `(data?.verifiedAchievements ?? 0) > 0`, `data?.me ? … : null`), removed the duplicate, added an explanatory comment. Audited all 9 other `useMemo` sites — all already before their early returns (`HodDashboard` documents it), so no other page affected. **Verified:** pre-fix reproduced in a real browser (headless Chrome/CDP, dev 3000 → backend 5050, student `73152421125`); post-fix **8/8 PASS** (`.lb-root`, hero "Achievement Leaderboard", 157 students in scope, 0 error-boundary, 0 exceptions, 0 console errors); `test:leaderboard` 35/35; frontend `tsc --noEmit` exit 0; `vite build` exit 0. Harness `.runtime-verify/achv/verify.mjs`. Branch `temp`, uncommitted. |
| 2026-10-15 | PASS | **Login page — reference-match pass (64/36 · 420 px card · `OR` separator).** Matched the written reference spec. Reference photo `A:\movies\K.S.R.C.E. Campus at Twilight.png` verified **byte-identical** (SHA-256) to the existing `frontend/public/assets/ksrce-campus-twilight.png` (already referenced by CSS; no duplicate created). `index.css` (`.lg-*` only): `.lg-page` grid `62/38 → 64/36`; `.lg-card` `max-width` `440 → 420 px`; new `.lg-or-sep`/`.lg-or-line`/`.lg-or-text` (`OR` rule); tightened card rhythm (head 1.6→1.4, college 0.9→0.8, divider 1/0.8→0.85/0.7, form-group 1.15→1.05, pwa-row 1.15→0.9, foot 1.25/1→1.05/0.9 rem). `LoginPage.tsx`: added the `OR` separator above the conditional PWA button. Copy already matched the spec verbatim; no remember-me/forgot-password added (no real functionality). **Unchanged:** API/payload/fields/errors, `useAuth`/session/role redirects, password toggle, PWA install, campus asset, other pages; `.login-*` untouched; no dependency. **Verified on the running app** (3000 + real 5050) in headless Chrome at **1490×810**: split **64/36** (954/536), card **420×682** centred Δ0, hero left x=48, gaps 88/28/29/88 px, heading 31.2 px, lead 3 balanced lines (317/294/362), four 36×36 icons; 1440×900 → 922/518 card 420×681; 1024×768 → 655/369 card 313×695; 390/320 stacked with no horizontal overflow; campus `200` (2,580,028 B) + logo `200`; toggle / wrong-password alert / successful login / PWA all work; **0 console errors/exceptions** (only the expected 401); `tsc --noEmit` + `vite build` exit 0 (CSS 138.91 kB). **No image input in this environment → the attached screenshot could not be viewed/pixel-diffed**; matched to the spec's stated text + dimensions and validated via computed styles, element geometry and sharp pixel stats. Branch `temp`, uncommitted, no commit/push. |
| 2026-10-15 | PASS | **Login page — hero refinement (smaller headline · balanced lead · feature contrast).** Focused second pass on the left hero only; right card untouched. `index.css` (`.lg-*` only): `.lg-hero-title` desktop `clamp(1.42rem,2.3vw,1.95rem)` (33.6→31.2 px) / tablet `clamp(1.28rem,2vw,1.72rem)` (22.02→20.48 px); `.lg-hero-text` `margin-top` `clamp(1.75rem,3.4vh,2.4rem)` (gap 25→31 px) and `max-width` `min(40ch,100%)` (52→40ch) giving **three balanced lines** (317/294/362 px); `.lg-brand-body::before` scrim widened `radial-gradient(150% 125% at 0% 52%, rgba(6,27,54,.66) …)` for feature contrast. `LoginPage.tsx` untouched. **Unchanged:** login API/payload/fields/errors, `useAuth`/session/role redirects, password toggle, PWA install, campus asset, card 440×670 centred, other pages; `.login-*` untouched; no dependency; no hardcoded credentials. **Verified on the running app** (3000 + real auth 5050) in headless Chrome via CDP: 1440 headline 31.2 px/4 lines/lh 37.44, lead 3 lines @383.6, gaps 130/31/32/129 px, icons 36×36 @x46 titles @x96, card Δ≤1; 1024 headline 20.48 px, lead 3 lines @353.3, gaps 106/28/26/106, icons @x32, card Δ0; 390/320 stacked no horizontal overflow + vertical scroll (docH 944/992); campus photo + logo `200`; gold line fits 280→1440 px; toggle / wrong-password alert / successful login / PWA all work; **0 console errors/exceptions** (only the expected 401); `tsc --noEmit` + `vite build` exit 0 (CSS 138.62 kB). Screenshots can't be visually inspected here (no image input) → validated via computed styles + geometry + sharp pixel stats. Branch `temp`, uncommitted, no commit/push. |
| 2026-10-15 | PASS | **Login page — final UI polish (hero alignment · spacing · panel cleanup).** In-place refinement of the split-screen login. `LoginPage.tsx`: crest + hero copy + feature list + bottom tagline wrapped in one shared `<div className="lg-brand-inner">`; the `.lg-panel-decor` span removed. `index.css` (`.lg-*` only): new `.lg-brand-inner` (single left edge + one space-between rhythm); `.lg-brand` background-position `46% 42%` (tablet `46% 44%`, mobile `46% 56%`) chosen from a sharp pixel profile of the 1672×941 campus photo (building structure left/mid, sunset centre-right); lighter `.lg-brand-veil` (left 0.84→0.72) so the image is less darkened; heading `line-height` 1.16→1.2, heading→paragraph gap 17→25 px, paragraph→features 27→33 px, feature-row gap 15.3→17.1 px; `.lg-panel-decor` + `::before`/`::after` deleted so the panel is only the smooth deep-navy → midnight gradient. **Unchanged:** login API/payload/fields/errors, `useAuth`/session/role redirects, password toggle, PWA install, campus asset, every other page; `.login-*` (`ChangePasswordPage`) untouched; no dependency; no hardcoded credentials. **Verified on the running app** (3000 + real auth 5050) in headless Chrome via CDP: hero left edge x=46/32/18 (1440/1024/stacked); gaps 25 px / 33 px; 4 headline lines identical size+line-height, `MENTOR–MENTEE` gold + nowrap; 4 icons 36×36 same x, text column x 96/82; `.lg-panel-decor` gone; card 440×670 centred (delta ≤1 px); 62/38 at 1440 & 1024; no horizontal overflow at 1440/1024/768/390/320; short screens scroll vertically; hero-region mean R 65→71, text background luminance 38–53, sunset band ~132; toggle password→text→password; wrong → `Invalid username or password.`; correct (`Ksrce@admin` / `Ksrce@1234`) → token + app shell + sidebar; **0 console errors/exceptions** (only the expected 401); `tsc --noEmit` + `vite build` exit 0 (CSS 138.62 kB); asset `200 image/png` 2,580,028 B. Screenshots can't be visually inspected here (no image input) → validated via computed styles + sharp pixel stats. Branch `temp`, uncommitted, no commit/push. |
| 2026-10-15 | PASS | **Login page — right-panel premium navy + left-hero alignment fix.** Follow-up to the split-screen redesign, fixing (a) the faint/translucent right panel — the page gradient showed through the transparent `.lg-panel` and two oversized decorative circles/borders crowded the card — and (b) the left hero's inconsistent alignment/spacing. `frontend/src/styles/index.css` (`.lg-*` block only): `.lg-panel` now paints a full deep-navy → midnight gradient edge-to-edge (`162deg #0d2a4d → #0a2342 → #061b36 → #04101f`, radial top-right blue lift + faint bottom-left gold bloom); `.lg-panel-decor` reduced to one soft gold radial bloom + a mask-faded dot grid (oversized circles gone); `.lg-card` border `rgba(245,189,53,.42)`, radius 20 px, layered navy shadow; `.lg-hero-title-v2` four `.lg-hero-line` blocks on one left edge/line-height; `.lg-hero-accent` gold + `nowrap`; paragraph `max-width: min(52ch,100%)`; `.lg-feature-icon` 36×36 with a fixed gap; `EMPOWERING FUTURE ENGINEERS` bottom-left; `min-height: 100dvh` + safe-area padding + `overflow-x: clip`; one-column stack ≤960px. `LoginPage.tsx`: the whole `MENTOR–MENTEE` line is gold. **Unchanged:** login API/payload/fields/errors, `useAuth`/session/role redirects, password toggle, PWA install, campus asset, every other dashboard; no dependency; no hardcoded credentials. **Verified on the running app** (3000 + real auth 5050) in headless Chrome via CDP: 62/38 at 1440 & 1024; panel `rgb(6,27,54)` + gradient with navy corners (13,42,77)/(32,62,90)/(4,16,31); card 440×670 centred on the panel centre (x 946–1386, y 115–785) with white samples; `MENTOR–MENTEE` `rgb(245,189,53)`; all hero lines share one left x + line-height (38.98 px @ 33.6 px); feature icons 36×36 with a consistent text x; no horizontal overflow at 1440/1024/768/390/320; toggle password→text; wrong → `Invalid username or password.`; correct (`Ksrce@admin` / `Ksrce@1234`) → token + app shell; real API 401 / 200 (ADMIN + token); **0 console errors**; `tsc --noEmit` + `vite build` exit 0 (CSS 139.08 kB). Screenshots can't be visually inspected here (no image input) → validated via computed styles + pixel stats. Branch `temp`, uncommitted, no commit/push. |
| 2026-10-14 | PASS | **Login page — premium redesign aligned to the latest navy/gold reference.** Refined the existing premium login page in place to match the specified reference. `frontend/src/pages/auth/LoginPage.tsx`: each `FEATURE_HIGHLIGHTS` entry gained a short `description` (icon + title + description rendered per row) and the sign-in panel gained a `<span className="lg-panel-decor">`. `frontend/src/styles/index.css` (scoped `.lg-*` block only): split moved to `flex: 1 1 62%` (brand) / `38%` (panel); `.lg-hero-title` now `text-transform: uppercase` (letter-spacing + adjusted clamp/`max-width`) with the `Mentor–Mentee` span still gold; `.lg-title` (`Welcome Back`) uppercase; new `.lg-feature-text`/`.lg-feature-desc` styles + a larger `.lg-feature-icon`; new clipped `.lg-panel-decor::before/::after` gold arcs (`rgba(245,189,53,.11)`/`.07`); `.lg-card { z-index: 1 }`. Campus image kept (`/assets/ksrce-campus-login.png`, unchanged, 2 728 283 B, byte-identical to the supplied `A:\movies\eb72e87c-…png`), referenced via the app asset path. **Unchanged:** login API (`POST /api/auth/login` shape/errors), `useAuth`/session/role redirects, validation/errors, password show/hide, loading/disabled states, PWA install (`!isInstalled` + `promptInstall`, never simulated), storage, every other dashboard; `.lg-*` is the only selector family touched (`.login-*` reused by `ChangePasswordPage` untouched); no dependency; no hardcoded credentials. **Verified on the running app** (dev server 3000 + real auth 5050) in headless Chrome via CDP: brand **62 %**/panel **38 %** at 1440 & 1024; `.lg-hero-title` computed `text-transform: uppercase` (35.2/23.55/20.48 px desktop/tablet/mobile) with gold `rgb(245,189,53)` span; 4 feature rows each with icon + title + description; card border `1px rgba(245,189,53,.32)`, radius 20 px; primary navy gradient `#13315c→#071526` + gold border + arrow; campus image loaded natural **1 672 × 941** with left-panel pixels mean luminance ≈ **66–77** (building band ≈ 3.7 % near-black → clearly visible); **no horizontal overflow** at 1440/1024/390; password toggle `password→text→password`; invalid login → `Invalid username or password.`; valid login → `ksrce_token` + dashboard; **0 console errors**; `tsc && vite build` **exit 0**. Screenshots captured but **not** visually reviewed (no image input in this environment). Branch `temp`, uncommitted. |
| 2026-10-13 | PASS | **Grammar engine — missing-auxiliary repair covers `coming` (`he not coming tomorrow`).** Reported from the running Mentoring form: `he not coming tomorrow` produced `He not coming tomorrow.` (only capitalised/punctuated, auxiliary missing). **Root cause:** the repair is curated/list-gated — `fixMissingAuxiliaryVerbs` matches only a curated subject, optional `not`, a curated participle (`MISSING_AUX_GERUNDS`) and the clause tail, only at a sentence start — and `coming` was absent from `MISSING_AUX_GERUNDS`, so the clause never matched and fell through to the mechanical capitalisation + terminal-punctuation step. The rule order in `grammar.service.ts` (word corrections → `fixMissingAuxiliaryVerbs` → `PHRASE_RULES` → capitalisation/punctuation) was already correct. **Fix:** added `coming` plus a curated group of other unambiguous action participles (`going`, `talking`, `asking`, `telling`, `bringing`, `waiting`, `looking`, `watching`, `visiting`, `leaving`, `arriving`, `sending`, `eating`, `drinking`, `walking`, `sitting`, `standing`, `wearing`, `paying`; noun/adjective `-ing` words such as morning/evening/meeting/building stay excluded) in `grammar.dataset.ts`, and in `grammar.structure.ts` restricted the object-plural normalisation (`MISSING_AUX_OBJECT_PLURALS`) to a clause that continues past the bare object, so a bare `she not attending class` → `She is not attending class.` while `student not attending class regularly` → `The student is not attending classes regularly.` is preserved. **Results:** `he not coming tomorrow` → `He is not coming tomorrow.`; `student not coming tomorrow` → `The student is not coming tomorrow.`; `they not submitting assignments` → `They are not submitting assignments.`; `He is not coming tomorrow.` unchanged; reduced relatives (`Students coming late should report to the mentor.`) untouched; protected values never altered (tail copied verbatim). **Tests:** `test:grammar-dataset` **85/85** (added the reported case + siblings, singular/plural subjects, existing auxiliaries, reduced-relative/ambiguous, punctuation variants), `test:grammar-safety` **45/45**, `test:grammar-api` **63/63** (exact reported input + siblings + already-correct driven over the real `src/index.ts` as a real mentor), `test:grammar` green, backend `tsc` + frontend `vite build` exit 0. **Live:** via the frontend dev proxy (`/api/mentor/grammar-check`, the route `GrammarAssistField` calls) the running server returns the corrected output for the exact reported input. Branch `temp`, uncommitted. |
| 2026-10-13 | PASS | **Login page — premium polish pass (in place).** Refined the existing navy/gold `pages/auth/LoginPage.tsx` + its scoped `.lg-*` CSS block without rebuilding: **campus image visibility** restored by replacing the heavy veil (left `0.97`/`0.9`, vertical `0.72→0.88`) with a *localised* radial scrim behind the copy (≤`0.6`) plus lighter diagonal/vertical washes (`0.78→0.3`, `0.55→0.68`), with stronger text-shadow keeping white text readable; crop `object-position: center 42%`; **crest** badge 54→52 px, name 1.0 rem, gold sub; **typography** hero `clamp(1.65rem,2.9vw,2.45rem)`/`1.17`/`21ch`, body `rgba(233,239,247,.95)`/`1.72`; **card** padding `2.4/2.15/1.8 rem`, `max-width 440px`, radius 20 px, softer gold border + 3-layer shadow (inset highlight); **fields** `min-height 50px` with a gold `3px rgba(245,189,53,.28)` ring on a navy border (`:focus` + `:focus-visible`), label gap `.42rem`, password toggle **38×38**; **Sign In** `52px` navy gradient, brighter hover + lift, gold focus ring, explicit `disabled`/`btn-loading` (spinner re-centred, global class reused); **PWA button** kept secondary-but-accessible (softer border, ≥44 px); **decoration** grid `0.65→0.4`, arcs `0.18→0.13`/`0.1→0.07`; **responsive** compact banner (`208px`, `184px` ≤480), stacked card `max-width 460px`, **100 % full-width at ≤480**, `overflow-x: hidden` kept; `aria-busy` on submit. **Unchanged:** auth (`useAuth`, `POST /api/auth/login` shape/errors/role redirects), PWA install, show/hide password, storage, all other dashboards; no dependency, no hardcoded credentials. **Verified live:** `3000` → 200; `/assets/ksrce-campus-login.png` → 200 `image/png` **2 728 283 B** byte-identical; served CSS contains the new rules; `POST /api/auth/login` via proxy → **200 (ADMIN + token)** and wrong password → **401**; `tsc && vite build` **exit 0**. No browser tool available → visual layout validated by the scoped breakpoints + compile, not screenshots. Branch `temp`, uncommitted. |
| 2026-10-13 | PASS | **Grammar engine — missing-verb fragment repair.** Reported: `student not attending class regularly` produced only `Student not attending class regularly.` (capitalised + punctuated, still missing the article + auxiliary). **Root cause:** the deterministic pipeline had only word/phrase substitutions — no rule understood *subject + `not` + participle* (or *subject + participle*, e.g. `student facing difficulty in mathematics`), so the clause fell through to the mechanical capitalisation + terminal-punctuation step; no curated exact/approximate entry covered it. **Fix:** new `backend/src/modules/grammar/grammar.structure.ts` (`fixMissingAuxiliaryVerbs`) run from `grammar.service.ts` after word corrections and before `PHRASE_RULES`. It matches only at a sentence start (string start / after `.!?`), an optional `the`, a curated subject (`MISSING_AUX_SUBJECTS`), an optional `not`, a curated participle (`MISSING_AUX_GERUNDS` — explicit so during/morning/building/… are never mistaken for verbs) and the rest of the clause; inserts the article/auxiliary (`The student is …`, `He is …`, `They are …`), copies the remainder through byte-for-byte, and pluralises a small curated set of singular objects (`attending class → attending classes`) only inside a clause it actually rebuilt. **Safety:** any curated finite verb/modal (`FINITE_VERB_MARKERS`) after the participle means a reduced relative (`Students facing difficulty should approach the mentor.`) and the clause is left untouched; a subject already followed by an auxiliary (`student is attending …`) never matches. **Tests:** new "Missing auxiliary verb (fragment) repair" section in `dataset-grammar.test.ts` (four target patterns → `The student is not attending classes regularly.` / `He is not attending classes regularly.` / `She is not submitting assignments.` / `The student is facing difficulty in mathematics.`, plural-subject `are`, already-correct + reduced-relative guards, protected values after the participle, dataset integrity) and a full-stack case in `grammar-api.test.ts` posting the exact screenshot input to `POST /api/mentor/grammar-check`. **Verification:** `test:grammar-dataset` **73/73**, `test:grammar-safety` **45/45**, `test:grammar-api` **54/54** (real `src/index.ts` boot; exact input returns `corrected = "The student is not attending classes regularly."`, `status = RULES_APPLIED`, `hasCorrections = true`, nothing persisted until Apply Correction), `test:grammar` green; backend `tsc --noEmit` exit 0; frontend `tsc --noEmit` + `vite build` exit 0. No route/RBAC/storage/API-shape change. Branch `temp`, uncommitted. |
| 2026-10-13 | PASS | **Dataset-based grammar engine — deterministic, conservative, extensible (no external AI required).** Extracted the writing assistant's correction engine out of the inline `runRuleBasedGrammarEngine` in `modules/counselling/ai-assistant.service.ts` into a new modular package `backend/src/modules/grammar/`: `grammar.dataset.ts` (`EXACT_CORRECTIONS` curated whole sentences — only pairs with ≥ 0.5 content-token overlap flag `allowApproximate` — extensible `WORD_CORRECTIONS` misspelling/proper-noun dictionary, ordered `PHRASE_RULES` for contraction spelling / subject–verb agreement / bare infinitive / pluralisation / articles / fixed prepositions / structural errors / spacing, and thresholds `APPROX_MATCH_THRESHOLD` 0.9, `AMBIGUOUS_THRESHOLD` 0.7, `APPROX_TOPIC_FLOOR` 0.5), `grammar.normalize.ts` (matching-only `normalizeForMatching`, `tokenize`/`contentTokens`, `tokenSetSimilarity`, `levenshtein`/`similarityRatio`), `protected-values.ts` (`extractProtectedValues`/`preservesProtectedValues`/`isOfficialToken`, shared with the optional LLM path) and `grammar.service.ts` (`correctText` orchestrator). **Pipeline:** exact → similarity-gated approximate (0.9, curated opt-in, same-topic pair required) → word dictionary (official-code tokens skipped) → ordered phrase rules → safe capitalisation/terminal punctuation; if nothing reliable changes, the text is returned **verbatim**. **Status contract added** to the response: `EXACT_MATCH` / `APPROXIMATE_MATCH` / `RULES_APPLIED` / `NO_RELIABLE_CORRECTION` / `AMBIGUOUS_INPUT` / `EXTERNAL_AI`; a close-but-unsafe match returns the original with `AMBIGUOUS_INPUT` rather than a guessed rewrite, so no similar sentence is ever substituted and no fact is fabricated. Wiring: `ai-assistant.service.ts` delegates to `correctText` and re-exports the guard (public surface unchanged); `counselling.controller.ts` returns `status`; frontend `client.ts` `checkGrammar` type + `GrammarAssistField.tsx` show a status-driven message ("No reliable correction found" / "Text is ambiguous — kept exactly as you typed it") and still replace the field **only after Apply Correction**. **No** route/RBAC/storage/workflow change. **Verified (actual):** new `test:grammar-dataset` **59/59** (exact pairs, case/whitespace/punctuation tolerance, approximate threshold, ambiguous refusal, clean sentence → `NO_RELIABLE_CORRECTION`, blank input, punctuation, capitalisation, spelling/SVA/articles/prepositions, meaning preservation incl. names/register numbers/subject codes/CGPA/dates and no invented numbers, determinism, dataset integrity); `test:grammar-safety` **45/45**; `test:grammar-api` **49/49**; `test:grammar` green; backend `tsc --noEmit` exit 0; frontend `tsc --noEmit` + `vite build` exit 0. Three real issues found and fixed while verifying (approximate topic floor excluded three same-topic pairs; an integrity assertion flagged intentional proper-noun capitalisation; an all-caps test expectation). Branch `temp`, uncommitted — no commit/push. |
| 2026-10-13 | PASS | **Premium login page redesign — campus-photo hero + navy/gold sign-in card.** Rebuilt `pages/auth/LoginPage.tsx` into a full-screen 60/40 split: a campus **branding panel** (the supplied photo `A:\movies\eb72e87c-e8c7-44b1-9a40-baa0134bc3ab.png` copied verbatim to `frontend/public/assets/ksrce-campus-login.png`, 2 728 283 B / 1 672 × 941, source preserved; rendered `object-fit: cover` under a navy veil + bottom gradient so the building/entrance stay visible; dotted-grid texture; curved gold arcs; crest + college name/`Autonomous • Tiruchengode`; gold-accented `Digital Mentor–Mentee Management System`; supporting sentence; four `lucide-react` feature highlights — Mentor & Mentee Management, Academic Records & Analytics, Placement Monitoring & Achievements, Department & Institution Insights; `Empowering Future Engineers` footer) beside a **sign-in panel** with a compact white card (gold border + top accent, college logo/name/system title, `Welcome Back`, the preserved form, the retained `Download / Install KSRCE Web App` button, `Permanent Academic Records System / Secured Institutional Access • K.S.R. College of Engineering` footer). **Palette** `#061B36` / `#0A2342` / `#F5BD35`, scoped to a new `.lg-*` block in `styles/index.css` (the existing `.login-*` rules are kept untouched because `ChangePasswordPage.tsx` reuses them) with desktop/tablet(961–1180)/stacked(≤960)/mobile(≤480) rules + `prefers-reduced-motion`. **Unchanged:** form, validation, error display, show/hide password, loading, PWA install, every API/route/session/auth rule (no Remember-Me / Forgot-Password existed → none invented; no credentials hardcoded); no dashboard touched. **Verified:** asset exists & served (`HEAD /assets/ksrce-campus-login.png` → 200 image/png, 2 728 283 B; copied into `dist/`); no absolute path in code/bundle (only `/assets/ksrce-campus-login.png`, one ref); live dev server 3000 headless Chrome `--dump-dom` shows all redesign nodes; screenshots 1440×900 = 69.4% navy + 0.45% gold + 18.4% white card (panel edge `(4,22,44)`, card `(251,251,251)`, photo σ≈61), 1024×768 two-column, 390×844 stacked banner+card; real `POST /api/auth/login` 200 (ADMIN) / 401 wrong-password; frontend `tsc` + `vite build` exit 0; `test:critical` 12/12. Branch `temp`, uncommitted. |
| 2026-10-12 | PASS | **Faculty / Mentor directory search — Faculty & Mentor Master + Mentor Assignment Desk (Admin) + Department Faculty Mentors (HOD).** Client-side search bar added to all three screens, filtering the already-loaded, role-scoped list by name / employee ID / email / designation / department. Shared matcher `frontend/src/utils/facultySearch.ts` (`facultyMatchesQuery`): case-insensitive, trims, blank = all, partial substrings, AND across whitespace tokens. Reused `.card` + `.form-control` + the `Search` icon, responsive, `aria-live` "Showing X of Y", a × clear button, and "No matching faculty found" / "No matching mentors found" states. The Admin filtered list drives the header select-all, the sticky `BulkActionBar` (totalEligible / allSelected / Select all) and both table + mobile cards; changing the query clears the selection so bulk delete/download cannot touch a hidden row. HOD searches only the server-scoped `/hod/faculty` list (Admin token → 403). No route/id/endpoint/field/data/business change; no dependency; these screens have no pagination to reset (documented). **Verified:** frontend `tsc && vite build` exit 0; matcher unit 16/16; live API `/admin/faculty` returned **221** real records — empty/whitespace = all, partial name (case-insensitive), email, employee id, designation all match, every partial hit contains the term, nonsense = 0, HOD endpoint refuses Admin (403); dev server 3000 serves all updated modules; regressions `test:critical` 12/12, `test:hod` 33/33, `test:bulk-actions` 15/15, `test:admin` 23/23, `test:bulk-upload` 23/23. Uncommitted (branch `temp`). |
| 2026-10-12 | PASS | **User-facing "Counselling" → "Mentoring" — remaining labels cleared.** A previous UI update set the user-facing term to **Mentoring** but left many visible labels; the mixed case was the mentor mentee-profile view (card foot `5-Domain Mentoring Records` vs tab `6. Counselling`). Replaced every remaining user-visible mentoring-workflow occurrence with **Mentoring**: sidebar (`Counselling Records`, `5-Domain Counselling`, student `Mentoring & Counselling` → `Mentoring History`), mentor profile view (tab, `Counselling Sessions` card + aria-label, `Mentee Counselling Records & Dossier`, record `Mentoring Date`, `Edit Counselling Record`, empty state, add/edit modal title/subtitle + `Mentoring Date`/`Mentoring Category` field labels and validation), faculty dashboard (`Add/Pending/Recent Counselling`, `5-Domain Counselling`, record table, `Open Counselling Desk`, quick-add modal), `CounsellingCategorySelect`, Admin hub (`Counselling Sessions`, `Institutional 5-Domain Counselling Hub`, `Student Counselling Directory`, `Counselling Action`, `View Student Counselling`), HOD faculty detail (`Counselling History`, `Counselling records`, `Last Counselling`, `Counselling provided`), Principal KPI hint/table/note + activity/charts copy, HOD empty copy, Student `5-Domain Counselling & Mentoring History` + card + PDF copy, AI prompts and login tagline. **Kept intentionally:** the unrelated `Counselling (Govt Quota)` admission option (StudentDashboard + CompleteProfileWizard + mentor admission display), all internal identifiers (tab keys, `/counselling/*`, `counselling*` fields, `CounsellingRecord`, component/type names, comments) and backend/PDF text. Display-only — no route/id/endpoint/field/data/business change. **Verified:** frontend `tsc` + `vite build` exit 0; the compiled bundle contains **only** the two `Counselling (Govt Quota)` strings and all renamed labels; the running Vite dev server (3000) already serves the updated sidebar module. Branch `temp`, uncommitted. Headless-browser click pass not run. |
| 2026-10-12 | PASS | **Faculty Mentor Cards + click-through detail — HOD "Department Faculty Mentors".** Replaced the HOD faculty **table** with responsive **cards** (`components/faculty/FacultyMentorCard.tsx`, new) — name, employee ID, email, designation, department, cabin, contact (when present), current mentee count, coverage % and active/inactive badge, plus the existing **View Details** / **Edit** actions and the **Add Faculty** button; 3 / 2 / 1 columns (≤1180px / ≤700px) with loading, empty and error states, no hardcoded data. Card root is `role="button"` + `tabIndex=0` (Enter/Space) and inner actions `stopPropagation()` so **Edit never also opens the detail**. A card or **View Details** opens one wide `Modal` (`components/faculty/FacultyDetailView.tsx`, new) with tabs **Overview / Mentees / Counselling History / Meetings / Documents / Assignment History**, each backed by real dept-scoped records and a clear empty state; the Mentees tab can open a mentee's existing student page. **Backend:** extended the existing `getMentorDetail` (`GET /api/hod/mentor/:mentorId`, `modules/hod/hod.controller.ts`) — no new routes — with dept-scoped `assignments` (ACTIVE **and** historical `MentorAssignment` rows for that mentor, `isCurrent`/status/reason/dates), `counselling` (records authored by `mentor === mentorId`, incl. pre-reassignment history), `meetings` (that mentor's meetings) and `documents` (`StudentDocument` metadata for the current mentees; bytes via the existing authenticated view/download endpoints). Relationships keyed by stable ids, never names; current vs historical by status; reassigned students not duplicated; foreign-department mentor id → 404. New types in `api/client.ts`; scoped `faculty-*` CSS appended to `styles/index.css`. **Verified in a real headless browser** (`backend/.runtime-verify/faculty-cards-browser.mts`, scratch, real backend + built SPA via CDP) **34/34 PASS**: cards replace the table (old "Emp ID" header gone), real card facts + coverage, 3/2/1 columns, correct faculty opens, all six tabs, Mentees = current only (reassigned excluded), Counselling = this mentor's own records (incl. a pre-reassignment one) and not another's, Meetings/Documents real, Assignment History current + historical with reason, document preview GET 200, no-mentee empty state, Edit independent of card click, keyboard Enter, mentee → student page, foreign faculty excluded / foreign mentor 404, zero page JS errors. Backend `tsc --noEmit` + `npm run build` clean; frontend `tsc --noEmit` + `npm run build` clean; `test:hod` 33/33, `test:critical` 12/12, `test:bulk-actions` 15/15. Branch `temp`, uncommitted; no commit/push. |
| 2026-10-12 | PASS | **Bulk selection · bulk delete · bulk document · bulk document (ZIP) download — Student Master + Faculty / Mentors.** Added multi-row selection (header select-all = current page, per-row, live count, selected rows tinted + gold rail, sticky action bar) keyed by **record id** so it survives pagination/refresh and is cleared when the filter set or tab changes. **Backend:** `services/bulk-documents.service.ts` (jszip archive `Bulk_Documents_YYYY-MM-DD.zip` → `Students/Name_ID/`, collision-safe `safeSegment`/`safeFileName`/`uniqueName`, `manifest.csv`, bounds `BULK_DOCUMENT_LIMITS` 200 records / 250 MB / 100-char names); `modules/students/student-bulk.controller.ts` (`GET /students/selection/ids`, `POST /students/bulk-delete`, `POST /students/bulk-documents`); `modules/admin/faculty-bulk.controller.ts` (`GET /admin/faculty/selection/ids`, `POST /admin/faculty/bulk-delete`, `POST /admin/faculty/bulk-documents` → explicit "no documents available" JSON since there is no faculty document store). Routes `authorize(ADMIN, HOD)` **and** re-checked in every handler; HOD scope = own department, ADMIN unrestricted. Bulk delete validates every id, reuses the real cascade (extracted `cascadeDeleteStudent` / `cascadeDeleteFaculty`, single deletes refactored to call them) and returns per-record `{requested, deleted, failed}`. Downloads resolve the served path through the existing **watermarked-copy** policy (`resolveServedDocumentPath`) and never touch originals; zero eligible docs → HTTP 200 JSON `{hasDocuments:false, missing:[…]}` (no empty ZIP). **Latent bug fixed:** the original `deleteStudent` cascade deleted `StudentDocument` by `student`, but the model keys its owner as `studentId`, so document metadata was silently orphaned — now `{ studentId }` on both paths (files on disk still untouched, per existing policy). **Frontend:** typed `BulkDeleteOutcome`/`BulkDownloadResult` + `bulkDownloadDocuments()` in `api/client.ts`; new `hooks/useRowSelection.ts`, `components/bulk/{BulkActionBar,BulkDeleteModal,SelectionCheckbox}.tsx`; `AdminDashboard.tsx` header + per-row checkboxes on both desktop tables and both mobile card lists, bulk bar on each tab, selection cleared on filter/tab change, buttons disabled while busy, success/partial/no-docs toasts; scoped `bulk-*` CSS in `index.css` (responsive ≤640px). **Verified on the running app (live 5050):** selection ids 128 students / 1 faculty; `?search=` scoping exact; real ZIP 135 743 B `application/zip` → `Students/Vishnuvarthan P_73152421125/Student Details Form.pdf` + root `manifest.csv` (matching row); non-existent id → `hasDocuments:false`; faculty → no-documents JSON; empty ids → 400; bulk-delete with 2 non-existent ids → `deleted=0 failed=2` per-record reasons. New suite `test:bulk-actions` **15/15** (port 5099, temp store). Backend `tsc --noEmit` + `npm run build` and frontend `tsc --noEmit` + `vite build` all exit 0. Limitation: bulk UI build-verified but not yet click-verified in a headless browser (see Pending). Branch `temp`, uncommitted. |
| 2026-10-12 | FIXED | **Student record book — two headings removed from the generated PDF and their blank space reclaimed.** Removed `INSTITUTIONAL VERIFICATION & DIGITAL ENDORSEMENT` (the signature heading) and `OFFICIAL DIGITAL MENTOR–MENTEE RECORD BOOK` (the full-mode document title) from every site that emitted them **into the PDF**, not just the preview. **Sites:** `record-book-html.service.ts` — the `.sigheading` div in `signatureBlockHtml()` and the pdf-lib `drawText` in `stampPageFurniture` (y≈49 mm) for the signature heading; `docTitleFor('full')` now returns `''` and `stampPageFurniture` skips an empty title line; `pdf.service.ts` jsPDF fallback — the `INSTITUTIONAL VERIFICATION…` text + its 12 mm gap, and the full-mode `docTitle`. **`internal`/`mentor-documents` deliberately unchanged** — their own titles (`OFFICIAL INTERNAL ASSESSMENT REPORT`, `MENTORING RECORDS & DOCUMENT ARCHIVE`) still print on every page (asserted). **Blank reclamation:** added `headerBandMm(mode)`/`headerRuleMm(mode)`; `PRINT_CSS` → `printCss(topMm)` (watermark shift derived from the band so the mark stays centred); the full book's top band shrinks **35 → 31.5 mm** and divider **30.6 → 28.4 mm** so the removed title leaves no gap (titled modes keep 35/30.6); signature reserve `margin-top` **16 → 9 mm** (heading + its 12 mm margin gone) so a full final page holds more content. `StudentDocument.renderVersion` bumped to `2026-10-12-removed-headings` → stale stored Student Details Form regenerates in place. **Verified on the real HTTP path** (`GET /api/pdf/student/73152421125?mode=full|internal|mentor-documents`): neither removed heading on any page; college name/logo header (ink 12.3 mm, body from 34.9 mm on `full`), `K S R C E` watermark, `Page X of Y`, four signing captions all intact; page counts unchanged (full 2 pp, internal 1 p, mentor-documents 1 p; 120-row synthetic still 9 pp). **Matrix:** record-book-header **74/74**, runtime **38/38**, critical **12/12**, document-watermark **44/44**, document-watermark-runtime **46/46**; `tsc --noEmit` + `npm run build` exit 0. Honest limitation: the signing block stays bottom-anchored, so a sparse final page still has empty space *between* content and signatures — inherent to short data, not the removed headings. Branch `temp`, uncommitted. |
| 2026-10-11 | FIXED | **Student record book — signature block bottom-anchored; void below signatures closed.** Reproduced on the real HTTP path (admin login → `GET /api/pdf/student/73152421125?mode=full|internal|mentor-documents`, the route the download buttons call): `full` 2 pp, page 2 ended y≈593 (204 pt blank below signatures); `internal` 1 p, ended y≈394 (403 pt blank). Root cause: signatures emitted in normal flow, so on a short final page they floated up with the page's unused height below. **Fix** in `record-book-html.service.ts`: `signatureBlockHtml()` → invisible geometry-identical `.signatures.sig-reserve` placeholder (reserves height ⇒ pagination/page count unchanged, content can never reach the band), and `stampPageFurniture` draws the visible block once with pdf-lib at the bottom of the last Chrome page (heading y≈692, lines y≈757, captions y≈764–775; cols x≈34/169/304/439). After: `full` 2 pp last-page body y≈775, `internal` 1 p y≈775, `mentor-documents` 1 p y≈775, 120-row synthetic still 9 pp (signature on last). **Old-PDF vectors closed:** `pdf.controller.ts` now sends `Cache-Control: no-store`+`Pragma`/`Expires`; stale stored Student Details Form (201 893 B/200 479 B, 08–09 Oct, old layout) now self-heals — `StudentDocument.renderVersion` + `getStudentDocuments` regenerates the derived form in place when out of date (idempotent), served form now 136 463 B/137 350 B with signatures at the bottom. **Tests:** record-book-header 68/68, runtime 38/38, critical 12/12, document-watermark 44/44, document-watermark-runtime 46/46, tsc + build exit 0. Branch `temp`, uncommitted. |
| 2026-10-11 | PASS | Clean server restart — one fresh backend + one fresh frontend on localhost, no data loss. **Inspection:** read PROJECT_PROGRESS.md, both package.json files, `frontend/vite.config.ts` (port 3000, `/api`→`localhost:5050`) and env (`backend/.env` PORT=5050, `frontend/.env` VITE_API_URL=localhost:5050); listed Node processes (full command lines) + listening ports. **Found:** backend tree `powershell` 13568 → npm 29692 → cmd 28004 (`tsx watch src/index.ts`) → watcher 25280 → server **21204** on **5050**; no frontend running (3000/5173/4173 free); the `chrome-devtools-mcp` Node processes + `opencode.exe serve` are harness, not project, and were left running. **Stop:** `taskkill /PID 13568 /T /F` (descendants only) → 21204/25280/28004/29692/13568 gone; port 5050 confirmed released, no project Node process left. **Start:** backend `npm run dev` (backend/) → **PID 19744** on 5050, `/api/health` `{"status":"ok","database":"connected"}`; frontend `npm run dev` (frontend/) → **Vite v6.4.3 PID 7688** on `http://localhost:3000/` (title `KSRCE Mentoring | K.S.R. College of Engineering`). **Verify:** direct health 200; frontend 200 + correct title/entry; proxy `/api/health` 200 (only backend = 19744); `POST /api/auth/login` via proxy 200 w/ token; `GET /api/pdf/student/73152421125` & `73152421002?mode=full` via proxy **200 application/pdf %PDF- ~137/136 KB**; both logs free of startup errors. No source/`.env`/`backend/data`/uploads/`node_modules`/Git/uncommitted changes touched; no commit/push. |
| 2026-10-11 | PASS | Student record book — "content compressed at the top / big blank below the signature" fixed. **Reproduced on the real path** (login `Ksrce@admin` → `GET /api/pdf/student/73152421125?mode=full`), rendered each page to PNG and measured per-band ink + MuPDF line geometry. **Finding:** page 1 was already full (content to y≈737 pt); the problem was the **last page** — for the live short records page 2 used only ~44% of its height (sections 5–10 then a tiny signature block, heading y≈297 pt, captions y≈340–353 pt, ~440 pt blank below). **Root cause:** small/tight print type (body 9 pt/1.32; cells 8 pt @ 1.1 mm; bare signature underline) on top of a genuinely sparse final page — no `zoom`/`scale`, fixed height or print flag involved (all checked). **Fix (`backend/src/modules/pdf/record-book-html.service.ts`):** body → 10 pt/1.42; cells → 9 pt @ 1.5 mm (`th` 8.8 pt, section title 9.5 pt, `sub` 8.2 pt, table margin 3.2 mm); banner 9.5/11 pt + `break-inside:avoid`; photos frame 44 mm + 7.8 pt captions; annexure 10.5/8.3 pt; note 8.3 pt; **signature block rebuilt** with a `7.5 mm` `.sigline` + `8.3 pt` caption per column, 16 mm top margin, 10 pt heading + 12 mm gap, `break-inside:avoid`. Header band / pdf-lib per-page header+footer / `K S R C E` watermark (`translateY(-9.5mm) rotate(45deg)`, fixed z-index-0) / `thead` repetition left untouched. **Verified on real PDFs:** both live students stay **2 pages**, page 1 → ~776 pt, page 2 signature captions now at y≈582–593 pt (blank tail ~440 → ~200 pt, no third-page spill), nothing in the header band, nothing past the bottom margin, footer intact. Long synthetic 120-row book 7 → **9 pages**: column headers still repeat on all 8 subject-row pages, header in band on all 9, watermark centred on all 9, no clipping (max bottom 788 < 797 pt). Corrected the renderer's watermark-centring assertion to use the mark's own PDF geometry (the pixel-diff bbox is biased on sparse pages where opaque cells overpaint the background layer) — still fails if missing/off-centre > 20 pt. **Matrix green:** record-book-header **68/68**, runtime **38/38**, document-watermark **44/44**, document-watermark-runtime **46/46**, internal-marks **97/97**, critical **12/12**; `tsc --noEmit` + `npm run build` exit 0. Before/after PNGs + PDFs in `.runtime-verify/layout-before/`. Branch `temp`, uncommitted. |
| 2026-10-11 | PASS | Student PDF "still broken in the actual app" — stale running process root-caused & closed; verified over the real HTTP path. **Symptom:** the layout fix + all renderer-level suites were green, yet the browser still showed the old broken record book. **Root cause:** the live backend on 5050 was the `tsx watch` **child** (PID 17128, watcher 32920) whose start time (21:36:53) equalled the last-write second of `record-book-html.service.ts` — it was running a snapshot taken at that write, so the browser was hitting code that never included the final fixes (start-time/mtime race; unprovable after the fact, hence the restart). **Action:** killed 32920+17128, restarted `npm run dev` on 5050 (health 200); drove the EXACT browser call chain `POST /api/auth/login` (Ksrce@admin) → `GET /api/pdf/student/:id?mode=full` for three real students (incl. 73152421125) — every page now has the college header, `Page X of Y` and `K S R C E`, body y0 102–107 pt (below the 30.6 mm rule), nothing clipped (saved `.runtime-verify/live-app/`). **Multi-page over the same endpoint** on an isolated scratch instance (5098, temp store, live data untouched) seeded with 120 IA rows, 40 meetings, evidence photos, JPEG scans + a real 3-page PDF annexure: full = **19 pages** — all 15 Chrome pages furnished (header in band, correct footnote, watermark, 0 intruders in the header band), long IA table repeated its column headings across 5 continuation pages, no clipping, uploaded files byte-identical afterwards; watermark pixel-diff vs an un-watermarked control: document ink unchanged (ink+ ≤0.81%) = true background, slope ≈ +0.95 = `\` diagonal, centre y≈424 vs 421 pt; `internal` (8 p) and `mentor-documents` (14 p) furnished with annexure tails preserved. Matrix re-run: record-book-header **56/56**, runtime **38/38**, document-watermark **44/44**, document-watermark-runtime **46/46**, internal-marks **97/97**, critical **12/12**; `tsc --noEmit` + `npm run build` exit 0. No product code changed (verification + restart only). Limitations unchanged: verbatim annexure pages keep their own layout; opaque full-page scans hide the underlaid mark; jsPDF fallback doesn't repeat table headers on autoTable breaks. Nothing committed (branch `temp`). |
| 2026-10-11 | PASS | Student PDF — watermark, header and content overlap final pass (hardening the repeating-header fix + two real gaps closed). **Root cause:** (1) Chrome print supports neither `@page` margin boxes nor a space-reserving `position: fixed` header (measured: fixed header y≈107pt vs body y≈96pt at a 34mm margin), so the old code emitted the header once in normal flow → page 1 only, and long-table pages started body ink at the top; (2) the `.wm` layer was centred in the @page **content box** → ≈9.5mm below the physical page centre (ink bbox centre y≈451pt vs page centre 421pt); (3) long tables split with **no repeated column headers**. **Fixes (`backend/src/modules/pdf/record-book-html.service.ts`):** `@page{size:A4;margin:35mm 12mm 16mm}` reserves a top band for the pdf-lib-stamped repeating institutional header (`stampPageFurniture`: navy rule + verified `assets/ksrce-logo.png` + college name + autonomous/AICTE/Anna University line + Tiruchengode address + gold document title + divider at 30.6mm) and bottom band for the footer on every page; watermark now `transform: translateY(-9.5mm) rotate(45deg)` → centred on the physical A4 page along the required bottom-right → top-left `\` diagonal, still a `position: fixed` z-index-0 background layer under `.content`; `gridTable` + the photo montage now put section title + column headers in a real `<thead>` with `table.grid thead { display: table-header-group }` so Chrome repeats headers on every continuation page (rows keep `break-inside: avoid`). **Verified (real renders, pixel + geometry, not build-only):** `test:record-book-header` 50 → **56/56** on a 7-page/120-row record book — header inside the band + zero body/header overlap + correct footers + `K S R C E` on every page + logo per page on pages 1–7, column headers repeated on every continuation page, no body text clipped below the content box (min 5.5pt), and a pixel-diff watermark check (vs an un-watermarked control) proving the document ink is unchanged (≤0.4% edge-blend pixels ≤18/255 = true background), slope ≈ +0.95 (`\`), ink bbox centre y≈424pt vs 421pt page centre; `test:runtime` **38/38** (header on every footered page incl. the NSS-photo annexure), `test:document-watermark` **44/44**, `test:document-watermark-runtime` **46/46**, `test:internal-marks` **97/97**, `test:critical` **12/12**; backend `tsc --noEmit` + `npm run build` **exit 0**. Appended verbatim PDF annexures keep their native layout and the legacy jsPDF fallback (no browser) still doesn't repeat headers on autoTable page breaks — both pre-existing limitations documented; nothing committed (branch `temp`). |
| 2026-10-11 | PASS | Repeating KSRCE institutional header on **every page** of the student documents (record book + `internal` + `mentor-documents`). **Mechanism (measured, not assumed):** Chrome's print engine supports neither `@page` margin boxes nor a space-reserving `position: fixed` header — a probe with `@page{margin:34mm 12mm 16mm}` put the fixed header text at y≈107pt while body text started at y≈96pt (overlap), which is why the old code emitted the header once in normal flow (page 1 only). **Fix (`backend/src/modules/pdf/record-book-html.service.ts`):** reserve a real top band with `@page{size:A4;margin:35mm 12mm 16mm}`; delete the one-off in-flow `headerHtml()` (+ its `.topbar`/`.insthead`/`.collegename`/`.autoline`/`.addrline`/`.doctitle`/`.instrule` CSS); replace `stampPageFooters()` with `stampPageFurniture()` which stamps the header (navy top rule, aspect-fitted `assets/ksrce-logo.png`, centred college name + AICTE/Anna University affiliation + Tiruchengode address, gold document title, subtle divider at 30.6mm) **and** the footer onto **every** Chrome-rendered page (`basePageCount`). Appended verbatim annexure pages and the legacy jsPDF fallback are unchanged; the `K S R C E` watermark is preserved. **Verified:** new `test:record-book-header` **50/50** — a real 7-page record book (120-row table; the long table spans 6 pages) with per-page MuPDF bounding-box checks proving the header is inside the reserved band (top y=35.0pt) and **zero body/header overlap**, correct "Page X of Y", `K S R C E` watermark on every page, and the 205×190 logo image object embedded per page; `sharp` pixel inspection of pages 1/4/7 (navy bar ~10–14mm, gold title, header ink ends ~28mm, blank gap, body ink starts exactly 35mm); `test:runtime` **38/38** (image-bearing book: header on every footered page incl. the NSS photo annexure page); full backend matrix **30/30 EXIT 0**; backend `npm run build` exit 0; frontend `tsc --noEmit` exit 0 (unaffected). Honest limitation: the no-browser jsPDF fallback is unchanged, so `autoTable`-paginated pages would lack the header there. PROJECT_PROGRESS.md updated; nothing committed (branch `temp`). |
| 2026-10-11 | PASS | Full browser E2E verification (+ two confirmed UI defects fixed). **Method:** a real headless Chromium over the Chrome DevTools Protocol driven by Node 24's built-in global `WebSocket` (no new dependency), against a **disposable sandbox** — a second backend on port **5056** over a freshly re-seeded temp store (`E2E_SCRATCH=e2e-store`) and the SPA rebuilt with `VITE_API_URL=http://localhost:5056` served on 4174; the developer's live 5050/3000 servers were untouched and the sandbox source/store (gitignored) were removed afterwards. **Result: 42/42 PASS** across sections A–J — login render/error, Admin dashboard + logout, Student + RBAC (403s), HOD nav/scope/Class Management, the full HOD marks workflow (Excel template **200 xlsx**, valid workbook previews + imports one row, imported IA1 mark **persists** as 40, corrupt `.xlsx` rejected), ECE↔CSE department isolation, Faculty nav + RBAC, Principal forced first-login password change + read-only dashboard (reads 200 / writes 403), no horizontal overflow at 1440/1024/390, zero page exceptions / zero unexpected console errors. **Two confirmed defects found and fixed: (G)** failed login was silent — `AuthContext.login` toggled the global `isLoading` before its `await`, so `App`'s boot gate unmounted `LoginPage` and the 401 error never rendered (removed the global toggle; the submit button keeps its local `loading`). **(H)** any toast wiped the HOD Marks class/subject/semester selection — `useToast()` returned the non-memoized context value recreated on every render (it carried the live `toasts` array), so the `loadSubjects` effect listed `toast` in its deps and re-ran, resetting the selection (fixed at the root: `ToastContext` value memoized + actions-only; `toasts` is only read inside the provider). Full backend matrix re-run sequentially: **29/29 EXIT 0** (incl. `runtime` 38/38, `ai-assistant` 47/47, `security-hardening` 8/8); backend `npm run build` exit 0; frontend `npm run build` exit 0. PROJECT_PROGRESS.md updated; nothing committed (branch `temp` preserved). |
| 2026-10-11 | PASS | Full security audit — follow-up pass: closed the last environment blocker and the last audit gap. **(E)** `test:ai-assistant` "could not complete" root-caused: the suite ships an **in-process mock Ollama** (no live host needed) and passed all 47 checks, then **hung at teardown** because the imported backend keeps the Node event loop alive (Express listener + 1-hour reminder interval) and the suite only ever called `process.exit(1)`. Added the explicit `process.exit(0)` used by every other suite that boots `src/index.js` → **47/47 EXIT 0, port freed**; AI module untouched. **(F)** Marks **bulk import** had no audit trail (manual saves audit; the HOD bulk path wrote nothing). `executeMarksImport` now writes one `IMPORT_MARKS_BULK` row per run (outcome summary + ≤50 register numbers + ≤20 subject codes, no secrets; fully-refused imports audited too) via the failure-tolerant `logAudit()`; new check 3b raised `test:security-hardening` to **8/8**. Full 28-suite matrix re-run sequentially: **28/28 EXIT 0** (incl. `test:runtime` 38/38, `test:faculty-dept-reassign` 18/18, `test:ai-assistant` 47/47). Static scans: no hardcoded secrets outside test fixtures; `JWT_SECRET` env-driven + prod fail-closed; upload path resolver rejects traversal; marks bulk-upload security path re-traced end to end. Backend `tsc --noEmit` + `npm run build` PASS; frontend `tsc --noEmit` + `vite build` PASS. PROJECT_PROGRESS.md updated; nothing committed (branch `temp` preserved). |
| 2026-10-10 | PASS | Principal role end-to-end — read-only college-wide dashboard + forced first-login password change. **Provisioning (bootstrap 5b):** one `PRINCIPAL` account created only if none exists (default username `Principal`, email `Principal@ksrce.ac.in`, password = shipped bootstrap default, all env-overridable via `PRINCIPAL_USERNAME` / `PRINCIPAL_EMAIL` / `PRINCIPAL_PASSWORD`); bcrypt-hashed only, never logged; later boots never duplicate / re-hash / re-arm (restart ×3 → one account, byte-identical hash; idempotent). **Forced change:** signed JWT `mustChangePassword` claim + global `/api` middleware allow-listing `/health`, `/auth/login`, `/auth/me`, `/auth/change-password`; every protected route (dashboard, admin/HOD, settings, exports) 403 until a new password is set; `changePassword` validates current+new+confirmation (400 mismatch/short/same/wrong-current), persists fresh hash, returns fresh unflagged `{token, user}`; old flagged token inert; only the new password logs in (old fails). Frontend `ChangePasswordPage` enforces the identical flow right after login. **Read-only portal:** `/principal/*` → `PrincipalDashboard` reusing `AdminMentoringDashboard` over GET-only `/api/admin/overview/*` widened to `authorize(ADMIN, PRINCIPAL)`; sidebar PRINCIPAL nav; no write/manage/approve/settings/download surface. **Real gap closed:** `downloadStudentPdf` lacked an explicit PRINCIPAL rule and silently allowed — explicit PRINCIPAL deny added; suite asserts 403 by register number and by id. New `test:principal` **53/53**; regressions `test:admin` 23/23, `test:admin-routes` 8/8, `test:admin-auth` 13/13, `test:hod-admin` 22/22; backend `npm run build` PASS; frontend `tsc --noEmit` + `vite build` PASS. PROJECT_PROGRESS.md updated; no commit/push made. |
| 2026-10-09 | PASS | Sidebar independent scrolling + truly-fixed header — whole-page-scroll root cause fixed. **Symptom:** scrolling the sidebar nav moved the whole page (header + sidebar + content) instead of only the nav list. **Root cause (two defects, both confirmed by live `getBoundingClientRect()` probes on a rebuilt bundle):** (1) the global mobile safeguard `html, body { overflow-x: hidden }` in `index.css` turned `html`/`body` into a scroll container and silently disabled `position: sticky` on `.ksrce-header` and the sidebar — they computed `sticky` but the header's `top` was **-600** after `scrollTo(0,600)`, and injecting `overflow-x: visible`/`clip` restored `0` while re-injecting `hidden` broke it again; (2) the sidebar was never height-constrained — `.app-container` is `min-height:100vh` and the rail sits in a flex row that grows with content, so `.sidebar-nav`'s existing `overflow-y:auto` never got a bounded height and never scrolled internally (wheel bubbled to the page); a third related defect: nav rows are column-flex children and were compressed in the collapsed rail instead of overflowing. **Fix (smallest safe CSS/layout change, no new dependency, no new scroll container):** `overflow-x: hidden` → `overflow-x: clip`; appended scoped block in `index.css` — `.sidebar-nav { min-height:0; overflow-x:hidden }`, `.sidebar-nav > .nav-item, .nav-section-label { flex-shrink:0 }`, and `@media (min-width:961px){ .sidebar { position:sticky; top:var(--header-hpx); height/max-height:calc(100vh - var(--header-hpx)); overflow:hidden; align-self:flex-start } }`; **also fixed** `Modal.tsx` + `MentorAiBotModal.tsx` which hardcoded `document.body.style.overflow='auto'` on close (leaving a stale inline overflow on `<body>` after any modal) — now restore the captured previous value. No overflow added around `.main-content`/`.page-body`, so the non-portaled fixed modal overlay is never clipped. **Verified (sandboxed backend + rebuilt SPA, headless Chromium):** 53/53 checks, 0 page/console errors — desktop 1440×900 Admin: rail sticky at y=66, height 834, nav overflows 1211/700 and scrolls (`scrollTop 0→400`) while `scrollY` stays, page at 600 stays 600 when wheeled over nav, wheel over main scrolls 600→900, header `top:0` + rail `top:66` while scrolled, last item not clipped, collapse 76px rail still overflows 1044/717 and scrolls, expand 264px; modal overlay still spans 0,0,1440,900; tablet 900×700 + mobile 390×844 drawers fixed below header, nav scrolls independently, Escape/X/backdrop close, no horizontal overflow; before/after probes reproduce the bug and confirm shipped `overflow-x: clip`; `tsc --noEmit` exit 0; `vite build` PASS (1659 modules, `index-JcWmmNV8.css`); canonical dist rebuilt with all new selectors; no sandbox ports left listening; no commit/push. |
| 2026-10-09 | PASS | Student Dashboard Overview UI + Profile Completion card "always Incomplete" bug fixed. **Root cause (confirmed by live API evidence + browser):** `StudentDashboard.tsx` read `profile?.profileCompleted`, but `GET /api/students/:id` returns only `profile_completed: 0|1` (+ `profile_completed_at`) — no camelCase key — so the card rendered "Incomplete" even after the student completed and saved their profile (`/auth/me` + the login JWT do carry `profileCompleted`, which is why the wizard gate was fine). **Fix:** new `backend/src/utils/profile-completion.util.ts` — `calculateProfileCompletion(student)` is the single source of truth for the exact four buckets the directory always used (identity / contact / family / school, each 25; `profileCompleted` authoritative → 100) and returns `{percentage, missing[]}`; `getStudents` now calls it (same output, inline copy removed) and `getStudentById` additionally returns `profile_completion_percentage` + `profile_completion_missing` (additive only — keys, statuses, RBAC untouched). `StudentDashboard.tsx` reads `profile_completed === 1` (with a tolerant `profileCompleted` fallback) and shows a real progress bar + "Missing: …" on Incomplete — no invented percentages. **Same-pass UI overhaul** (scoped `sd-` CSS in `index.css`, navy/gold tokens): banner identity block + balanced action column (prominent-but-balanced Download Record Book PDF, aligned Internal Assessment / Mentor Documents), uniform `sd-stat` cards that wrap without overflow, two-column Meeting Schedule / Assigned Faculty Mentor grid that truly collapses ≤900px (was stuck `1fr 1fr`), mentor name/designation/cabin/phone/email shown only when present, readable empty states, compact Saturday Mentoring Log empty state, ≤640px banner stacking. **Verified on the real pipeline** (fresh-store sandbox backend on :5095 seeded via the real API + headless Chromium on rebuilt bundles): before-fix bundle "PROFILE COMPLETION Incomplete" vs after-fix "Complete" at 1440/900/390 with no horizontal overflow; **8/8 cases** — incomplete payload → Incomplete + 25% bar + missing labels; filled+saved (optionals empty) → Complete (`profile_completed=1`, 100%, `missing=[]`); refresh keeps Complete; sign-out/in keeps Complete (fresh token `profileCompleted=true`); save failure (invalid mobile → 400) never flips to Complete; optional empties don't block; response format + directory/detail agreement (100 == 100); 0 console errors. Frontend & backend `tsc --noEmit` exit 0; `vite build` PASS; canonical `frontend/dist` rebuilt with production `VITE_API_URL=localhost:5050`. Suites re-run green — `test:directory` 16/16, `test:critical` 12/12, `test:runtime` 38/38. No commit/push made. |
| 2026-10-09 | PASS | Admin Mentoring Dashboard — "College Mentoring Split" + "Weekly Progress" **focused refinement** (presentation only, second pass over exactly these two cards). **Split (`CoveragePie`):** refined circular coverage ring with a clear centered % + `COVERAGE` label, track + gold fill from the server's de-duplicated `pie`; two restrained stat rows (green Mentored, red/amber Pending) each showing server count + % in one consistent format; subtle footer `Reporting month: 2026-10 · 1 students, each counted once`; no malformed characters. **Weekly (`WeeklyProgressList`):** consistent `DATE RANGE | BAR | COUNT` rows — compact one-line ranges (`Aug 17 – Aug 23` via `formatWeekRange`, fixed date-label width), low-attention flexible bars on a subtle track with theme fill scaled to the busiest week (gold `is-busiest`), clean zero-session dashed stubs, subtle separators + hover, counts straight from the API. **Layout:** shared `.mentoring-split-wide` grid, equal-height cards, single column ≤1024px; scoped CSS block in `index.css`. **No API/route/RBAC/calculation/data-fetch/unrelated card changed.** Verified on the real pipeline with an isolated backend (:5090, seeded `verify-data2`: pie 1/0/1 = 100%, weekly `[2,3,0,5,1,0,4,6]`, 2 zero weeks) + rebuilt SPA across desktop 1440 / tablet 1024 / mobile 390: equal card heights (394.72/394.72), ring %/arc match API, stat rows match, 8 rows, one-line API-derived date labels, stubs/bar-widths/busiest match, hover feedback, no horizontal overflow on any viewport, no mojibake (overview + Comparison + 30-Day tabs, bundle `·` scan), 0 page/console errors; dept drill-down re-verifies the same components (ring 100%, 8 rows, counts match dept API); empty dept shows the intended EmptyState. **Found (pre-existing, NOT fixed — out of scope):** the 30-Day Report tab never loads data — `loadReport` tests `currentTab === 'reports'` while the parent supplies `mentoring-reports`, so the tab always shows "Report unavailable"; the API itself returns 200 with a full payload. `tsc --noEmit` + `npm run build` PASS. `git add -A` only; no commit/push. |
| 2026-10-09 | PASS | Admin Mentoring Dashboard — "College Mentoring Split" + "Weekly Progress" polish (presentation only). **Split:** `CoveragePie` in `frontend/src/pages/admin/AdminMentoringDashboard.tsx` no longer draws a two-slice pie — it renders a 108px coverage **ring** (inline SVG, `stroke-dasharray`/`stroke-dashoffset` on a track + fill, `role="img"` with an aria-label carrying coverage %, mentored and pending) and two stat rows (Mentored / Pending) whose counts and percentages come straight from the server payload (`pie.mentored`, `pie.pending`; the server de-duplicates, so they always sum to the total), with a `Reporting month: … · N students, each counted once` foot. **Weekly progress:** new `WeeklyProgressList` renders a token-styled list — relative bars scaled to the busiest week (gold `is-busiest` highlight), dashed placeholder for zero-session weeks, and compact `Aug 17 – Aug 23` date labels from `weekStart`/`weekEnd` with the API's `weekLabel` as fallback. **Layout:** the two inline `gridTemplateColumns: 'minmax(280px, 1fr) 2fr'` split blocks (dept drill-down + college overview) now use one `.mentoring-split-wide` class; the dept panel's `.card`s stretch to equal height. **CSS:** new scoped block in `frontend/src/styles/index.css` (`.mentoring-split-wide`, `.mentoring-panel`, `.ring-*`, `.split-*`, `.weekly-*`) with responsive rules at ≤1024px (single column) and ≤480px. **Encoding:** replaced the last mojibake (`â€"`, `Â·`) in this file's comments/labels with the real `—` / `·`. No API, data, route, RBAC, calculation or workflow change; no dependency added. **Verified:** `npx tsc --noEmit` PASS; `npx vite build` PASS (1659 modules, CSS 89.20 kB); all new selectors confirmed present in the emitted CSS bundle. No commit/push. |
| 2026-10-09 | PASS | Login page — premium UI polish (presentation only). **Typography:** college name (`.login-crest-name`) and hero heading (`.login-hero-title`, `clamp(1.55rem,2.6vw,2.25rem)`, `text-wrap: balance`) stay in the already-loaded Cinzel serif with the gold `Mentor–Mentee` span highlighted; every form label, input, button, description and helper uses Inter (`--font-sans`), consistent weights/sizes/leading/spacing. **Card:** gold 3px top accent, `--radius-2xl` (24px), deeper `0 20px 50px -12px` shadow, `2.5rem 2.25rem` padding, `font-family` pinned to sans. **Fields:** login-scoped `.login-card .form-control` = 46px min-height, slate-300 border, slate-400 placeholder, `:hover` slate-400 border, `:focus` navy-700 border + 3px gold `rgba(197,155,39,.18)` ring (120ms transitions); labels stay 0.8rem/600/clear; password toggle, `autocomplete="username"` / `"current-password"` and required attributes untouched. **Buttons:** Sign In keeps its classes but its inline style moved to `.login-card .btn-primary` (46px, weight 700, navy-800 bg, hover navy-700 + lift -1px + shadow; `btn-loading` spinner + `disabled` duplicate-submission guard unchanged); the PWA button was de-inlined into `.login-pwa-btn` — gold-500 outline secondary (white bg, navy text, gold icon), hover gold-50 with lift. **Other:** `.login-legal`/`.login-foot` contrast raised, restrained gold glows (`login-page::before` top-right + faint bottom-right navy depth over the existing radial), tablet `961–1180px` padding/type reduction, `≤640px` card/panel/logo/button polish, and a scoped `prefers-reduced-motion` block disabling the hover/press transforms (the global reduce rule already collapses animations to 0.01ms). **Banner:** the "Institutional Portal Access • Role-Based Authentication" `.alert.alert-info` banner remains fully removed (0 nodes, 0 text in bundle) and no new banner was added. No auth/API/routes/validation/PWA logic changed; no dependencies added. **Verified:** `tsc --noEmit` PASS; `vite build` PASS (1659 modules). Headless-Chromium on the built dist at 1440×900, 1024×768 and 390×844: 0 banner nodes/text, all content present, brand panel flex ≥961px / none on mobile, card fits with no horizontal overflow (`scrollWidth == innerWidth`), Cinzel computed on hero+crest and Inter on card/labels/inputs, inputs 46px with navy+gold `:focus` ring (and no ring on blur), Sign In navy 46px, PWA button gold-outline navy-text, gold `:focus-visible` outlines on Sign In + PWA (blue on the toggle, matching the app-wide focus style), hover = navy-700/gold-50 + lift, reduced-motion context = card animation 1e-05s and hover transforms none, autocomplete/toggle/required all intact, **0 page errors and 0 console errors** on every viewport. No commit/push. |
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
| 2026-10-09 | PASS | KSRCE document watermarking + evidence GPS/timestamps + reverse geocoding. **Watermark (backend):** new `services/document-watermark.service.ts` (`WATERMARK_TEXT = 'K S R C E'`, centred, −45°, 0.17 opacity, never throws) overlays **every page** of an existing PDF with `pdf-lib` and composites JPEG/PNG with `sharp`; the original is never modified. `document.controller.ts` writes a **separate** `<stem>-watermarked<ext>` copy on upload and records it on `StudentDocument.watermarkedFileUrl` / `watermarkStatus` / `watermarkText` / `watermarkAppliedAt` (`fileUrl` always stays the untouched original); preview (`/file`) and download serve the watermarked copy; delete removes **both**; `student-details-pdf.service.ts` watermarks the generated Student Details Form too. Unsupported/other formats are reported `unsupported` and the original is kept — never corrupted, flattened, cropped or resized. **Evidence GPS (backend):** `MentoringEvidence` gained optional location/capture/upload metadata; `evidence.service.ts` adds `parseEvidenceLocation` (rejects present-but-invalid coords with 400 `INVALID_LOCATION`/`INVALID_LATITUDE`/`INVALID_LONGITUDE`/`INVALID_LOCATION_ACCURACY`; lat −90..90, long −180..180) and `parseEvidenceCaptureTimes`; a denied/unavailable/timed-out/missing fix is stored honestly and **never blocks the upload**; coordinates are treated as device-reported, not verified proof. `uploadedAt` is the server-authoritative time (UTC; displayed local) and the uploader comes from the auth context. **Reverse geocoding:** new `services/geocoding.service.ts` (public OSM Nominatim default, **no key**) with configurable `GEOCODING_DISABLED` / `GEOCODING_BASE_URL` / `GEOCODING_USER_AGENT` / `GEOCODING_TIMEOUT_MS`; statuses RESOLVED / NOT_FOUND / RATE_LIMITED (429) / ERROR / UNAVAILABLE / DISABLED; a 429 or provider failure never blocks upload and coords are kept even with no place name; no exact-address claim. **Frontend:** `utils/evidence.ts` reads EXIF capture time from the original `File` **before** canvas compression (which strips metadata), captures geolocation once on user-initiated attach (no auto re-prompt after DENIED), and exposes honest statuses; `EvidenceUploader.tsx` shows a GPS panel + per-photo capture time; `EvidenceGallery.tsx` shows upload time/uploader, capture time, location with coords + accuracy, place name and location-captured time; `api/client.ts` appends aligned `evidenceCaptureTimes`; `MentorStudentProfileView.tsx` and `SaturdayEvidenceModal.tsx` thread one `evidenceLocation` per submission, reset at every open/edit/close point, and send it only when photos are attached. Location is collected **only** on user-initiated evidence upload; role/ownership auth, audit and existing records are unchanged. **Verified:** backend `tsc --noEmit` clean; frontend `tsc --noEmit` + `vite build` clean (1659 modules); `npx tsx src/tests/document-watermark.test.ts` 22/22, `evidence-location.test.ts` 33/33 (incl. geocode success/no-match/429/error/disabled, invalid-coord rejection, EXIF normalisation), `document-watermark-runtime.test.ts` **29/29** (real server over HTTP: single/multi-page PDF + PNG watermark, original byte-identical on disk, `/file` + `/download` serve the watermarked copy, unrelated mentor 403 / anonymous 401, delete removes both), existing `test:mentoring-evidence` **100/100** re-run green. New npm scripts `test:document-watermark`, `test:document-watermark-runtime`, `test:evidence-location`. No dependency added (`pdf-lib`/`sharp` already present); no DB change; no commit/push. |
| 2026-10-09 | PASS | BUG FIX — K S R C E watermark not visible in downloaded/previewed documents. **Root causes (both fixed):** (1) the watermark was painted but far too faint — measured by rendering the real service output with MuPDF at 2x: the old 0.17 opacity over a 0.45 grey composited to ~luminance 231 on white (contrast ~1.10:1), effectively invisible on screen; (2) documents uploaded before the feature (and any record whose copy was lost) had no `watermarkedFileUrl`, so preview/download silently fell back to the untouched original. **Fix (smallest targeted):** `services/document-watermark.service.ts` — opacity 0.17 → **0.32**, colour 0.35 → **0.35 graphite** (both PDF and the `sharp`/SVG image path share the same constants, derived from `WATERMARK_COLOR`); still centred, −45°, original untouched, images not resized. `document.controller.ts` — new `watermarkedFileNameFor()` (one source of truth for `<stem>-watermarked<ext>`), new `ensureWatermarkedCopy()` that lazily derives the copy from the ORIGINAL on first access and persists `watermarkedFileUrl`/`watermarkStatus`/`watermarkText`/`watermarkAppliedAt` (never overwrites the original), `resolveServedDocumentPath()` is now async and prefers it, and both `/file` and legacy `/uploads/*` responses now send `Cache-Control: no-store` so a stale pre-watermark copy can never be reused. Evidence photos, GPS/place-name/timestamps, auth/ownership, unsupported-format handling and delete-both-copies are unchanged. **Verification:** rendered-pixel evidence via `mupdf` (temp sandbox, not committed): new stroke luminance **202** (contrast 1.24:1) on every page, bbox centre ≈ page centre, diagonal ≈45°; image path luminance 201. New regression checks derive the renderer's composited stroke from the PDF's own ExtGState `ca` + fill colour and fail the old 0.17 setting. `test:document-watermark` **33/33** (+11 rendered-appearance checks), `test:document-watermark-runtime` **43/43** (new section H proves a simulated pre-fix record is regenerated on access and served watermarked, original byte-identical; preview/download `no-store`), `test:evidence-location` 33/33, `test:evidence-location-runtime` 74/74, `test:mentoring-evidence` 100/100, `test:runtime` 38/38; backend `tsc` clean. **Honest limitation:** this agent cannot view images, so "visual inspection" was done as objective rendered-pixel/geometry analysis and before/after PNG renders were written for human review (temp path, not committed); no claim of human visual review is made. No secrets/.env/artifacts committed; no commit/push made. |
| 2026-10-09 | PASS | BUG FIX — K S R C E watermark too prominent, wrong direction on image documents, and overlaying text/tables/signatures. **Root causes (both confirmed by rendering the real service output with MuPDF at 2x, not assumed):** (1) *prominence/overlap* — the 0.32-opacity graphite watermark was painted ON TOP of the page (its `pdf-lib` content stream was appended last), so the diagonal crossed body text, multi-column tables and signature lines (rendered stroke mean luminance ~203, contrast ~1.24:1). (2) *direction* — the `sharp`/SVG **image** path used `rotate(-45)` in SVG's y-DOWN space, which renders the OPPOSITE `/` diagonal (measured principal-axis slope −1.01); the **PDF** path (y-UP) was already the required `\` (bottom-right → top-left). **Fix (only `services/document-watermark.service.ts`):** opacity 0.32 → **0.12**, colour 0.35 → **0.40 light neutral grey**, watermark size 0.14 → **0.10** of the shorter page side (image font 0.12 → 0.10); new `placeWatermarkBehindContent()` moves the just-appended watermark stream to the FRONT of each page's `/Contents` array so every original operator (text, tables, images) paints on top — true background layering; new `WATERMARK_IMAGE_ROTATION_DEGREES = 45` so the SVG image path renders the SAME bottom-right → top-left `\` diagonal as the PDF. Controller/routes/model unchanged; separate watermarked copy, original-untouched guarantee, unsupported-format handling, evidence-photo exclusion and preview/download are all unchanged. **Verification (temp MuPDF sandbox, not committed):** representative 3-page PDF (headings, paragraphs, 4/5-column tables, 7pt text, signature lines, whitespace) — BEFORE mean stroke luminance ~203.4–204.3 / contrast ~1.24 / watermark stream LAST; AFTER mean stroke luminance ~237.9 / contrast ~1.07 / watermark stream index **0** (behind); diagonal measured `\` (slope ≈ +1.0) on every page, bbox centre ≈ page centre, original buffer byte-for-byte identical, every page watermarked. Image path: was `/` (slope −1.01, luminance 206.7) now `\` (slope +0.99, luminance 238.4). **Tests:** `test:document-watermark` **37/37** (new "painted BEHIND the content" assertion, subtle-but-present 0.08–0.15 alpha / 230–245 luminance bounds, new image backslash-direction pixel test); `test:document-watermark-runtime` **43/43**; regressions `test:critical` 12/12, `test:evidence-location` 33/33, `test:evidence-location-runtime` 74/74, `test:mentoring-evidence` 100/100, `test:runtime` 38/38; backend `tsc` + build clean; frontend `tsc` + `vite build` clean. **Honest limitation:** the model cannot visually view images, so direction/legibility were confirmed programmatically (PCA principal-axis + luminance/contrast), and before/after PNGs were produced for human review. Opacity is intentionally inside the requested 0.08–0.12 band (`WATERMARK_OPACITY`, one constant to tune). Committed + pushed to `temp`. |
| 2026-10-09 | PASS | FOLLOW-UP to the K S R C E watermark fix — background-layering edge case. Rendering a PDF whose page is a single opaque full-page scan proved that a behind-layered watermark is **completely hidden** (0 changed pixels), which would violate "watermark every page, remain visible". Added a targeted hybrid in `services/document-watermark.service.ts`: `hasOpaqueFullPageBackground()` scans each page's existing content for a near-full-page `cm` transform (image/form XObject) or a near-full-page filled `re` rectangle; those scan pages keep the **subtle top overlay**, while normal vector pages still get the watermark **behind** the content (first in `/Contents` via `placeWatermarkBehindContent()`). Re-verified with MuPDF: the scan page now shows the watermark (16,309 changed pixels, max darkening 17) while every vector page remains behind (watermark stream index 0, `\` diagonal, mean luminance 237.9). New test section F asserts the scan page is watermarked, ON TOP and still subtle — `test:document-watermark` **42/42**; `test:document-watermark-runtime` **43/43**; backend `tsc` + build clean. Committed + pushed to `temp`. |
| 2026-10-10 | PASS | BUG FIX — K S R C E watermark must be a true BACKGROUND layer on every page (was overlaying tables/headings/signatures). **Root cause (confirmed by rendering the real service output, not assumed):** the previous fix `8baa758` added `hasOpaqueFullPageBackground()` to keep the watermark visible on genuine scans, but it false-positived on ordinary vector pages — any near-full-page filled `re` rectangle (background fill / shaded panel / container rect) or full-page `cm` image transform matched — so those pages *skipped* `placeWatermarkBehindContent()` and the watermark stayed **on top**, darkening content. **Fix (`backend/src/services/document-watermark.service.ts` only):** removed the heuristic entirely (`hasOpaqueFullPageBackground`, helper `drawnContentText`, unused `pdf-lib` content-stream imports) and now **always** call `placeWatermarkBehindContent(page)` — the watermark stream is moved to index `0` of each page's `/Contents`, so all original operators paint over it; no top-overlay path remains for PDFs. Image (JPEG/PNG) path unchanged. **Accepted, documented tradeoff:** on a page that is one opaque full-page scan/fill the underlaid watermark is hidden behind that paint (present but not prominent) rather than covering content; the hard requirement is that it never sits in front of content. **Verification (programmatic MuPDF render + sharp pixel diff; model cannot view images):** form pages `contentChanged=0`, `contentMaxDiff=0.0` (original ink byte-identical; watermark only in white space); `styled` full-page-background page 0 content pixels darkened (was 30); `scantext` 0 text pixels darkened (was 281); direction `\` bottom-right → top-left PASS 5/5. Suites: `test:document-watermark` **44/44** (section F now asserts the scan page is behind; new section G asserts a full-page-background + dense-text page stays behind), `test:document-watermark-runtime` **46/46** (new `watermarkStreamIndex()` assertions on the served bytes for single-page, multi-page and regenerated pre-fix docs), regressions `test:runtime` 38/38 and `test:evidence-location-runtime` 74/74. Backend `tsc --noEmit` clean; `npm run build` exit 0. Exactly 3 files changed (1 service + 2 tests); original uploads never modified; PROJECT_PROGRESS.md updated. No commit/push made. |
### ACHIEVEMENT LEADERBOARD AND APPLICATION-WIDE PERFORMANCE OPTIMISATION (2026-10-15)

This pass audited the entire application (React + TypeScript + Vite frontend; Node + Express + TypeScript backend; local JSON storage), identified root causes, and implemented targeted, verifiably correct fixes. All existing uncommitted changes were preserved. No commit or push was made automatically. No MongoDB/external infra was introduced.

**Key changes:**
- **Backend (storage)**: added `LocalCollection.snapshot()` (no per-query deep clones) and restructured `LocalQuery.materialise()` to clone results before populate; updated `matchingRecords`, `loadPopulateData`, `countDocuments`, `exists`, `checkUnique`, `syncIndexes` to use snapshots.
- **Backend (N+1)**: `admin.controller.getFacultyList` — single `MentorAssignment.find({mentor:{$in:ids}, status:'ACTIVE'})` pass; `getDepartments` and `getBatches` — single-pass tallies over students/faculty. `getAdminDashboardStats` — parallelised 12 independent reads with `Promise.all`.
- **Backend (reports/export)**: `reports.controller.exportStudentsCsv` — bulk preload of assignments, academic records and completed meetings via `$in` maps (replaces per-student queries).
- **Frontend (bundling)**: `App.tsx` uses `React.lazy()` + `Suspense` to split role dashboards and heavy views into separate chunks; shared `DashboardSkeleton` fallback.
- **Frontend (rendering)**: `LeaderboardView` memoises derived presentation with `useMemo`.

**Measured improvements (controlled):**
- `/api/reports/export/csv`: **92.5 ms → 15.7 ms** (5.9× faster; 40-iter HTTP medians).
- `getFacultyList` N+1: **123.2 ms → 0.072 ms** (~1700×).
- Per-collection reads: **0.56–3.50 ms → 0.008–0.062 ms** (**42–121×**) using snapshot vs `all()` deep-clone.
- Initial frontend JS: **1116.3 KB → 342.9 KB** (↓ **~66%**); dashboards/routes code-split.

**Verification:** Full build passes (root `tsc` + backend + frontend). All major backend suites green (leaderboard 35/35, placement 48/48, internal-marks 97/97, security-hardening 8/8, critical-reassignment 12/12, student-directory-pagination 16/16, admin-dashboard-routes 8/8, admin-overview 23/23, principal-role 53/53, hod-scope 33/33, record-permission-state 137/137, faculty-notifications 21/21, admin-hod-management 22/22, overall-mentee-export 100%, runtime-verification 38/38, bulk-upload 23/23, bulk-actions 15/15, bulk-assignment 29/29, ai-assistant pass, document-watermark 44/44; total 513+ checks). One PDF "Discussion With" test (pre-existing, identical with baseline) failed — unrelated to these changes.

**Notes:** Leaderboard points/ranking, tie-breakers, verification rules, role scopes and permissions unchanged. No new infrastructure, no cross-user cache. Uncommitted work preserved.

### Kavitha Chatbot — `POST /api/api/ai/chat` 404 + Login "Page Not Found" — Fixed (2026-10-15)

**Verified root cause (single defect, two symptoms).** `frontend/src/api/client.ts` builds every request as `fetch(API_BASE + endpoint)`. The project convention is:

- `API_BASE = VITE_API_URL_origin + '/api'` (base supplies `/api` **once**), and
- every endpoint path **omits** `/api` (e.g. `request('/auth/login')`, `request('/auth/me')`).

63 of 67 `request(...)` calls followed this. The **4 AI endpoints were the sole exception**, hard-coding the `/api` prefix (`request('/api/ai/chat')`). With `VITE_API_URL=http://localhost:5050` this produced `http://localhost:5050/api` + `/api/ai/chat` = `http://localhost:5050/api/api/ai/chat` → the backend's catch-all returned `API endpoint 'POST /api/api/ai/chat' not found.`

A prior attempted fix wrongly changed `API_BASE` itself to *strip* `/api` (origin only). That made the AI endpoints work but broke **all 63 other endpoints** — notably `/auth/login` and `/auth/me`, which then hit `http://localhost:5050/auth/...` and returned 404. A 404 on the login request is mapped by `formatApiError` to the "Page Not Found" copy (`"The page you're looking for doesn't exist or may have been moved."`) — exactly the red alert seen on the login page.

**Correct fix (matches existing convention; no duplicate routes; no auth changes):**
- Restored `API_BASE = (normalizedApiUrl || '') + '/api'` (origin + `/api`, as committed).
- Removed the erroneous `/api` prefix from the 6 AI requests so they align with every other endpoint: `/ai/status`, `/ai/conversations` (GET/POST), `/ai/conversations/:id` (GET/DELETE), `/ai/chat`.

Nothing else changed: backend routes were already correct (`app.use('/api/ai', aiAssistantRoutes)`; router defines `/status`, `/chat`, `/conversations`).

**Files changed:** `frontend/src/api/client.ts` only (1 `API_BASE` line + 6 AI endpoint paths).

**Verification against the RUNNING app (backend :5050, frontend :3000), authenticated as the seeded ADMIN (credentials read from `backend/.env`, never printed):**
- `POST /api/auth/login` → `success:true` (login no longer 404s).
- `GET /api/ai/status` → **200**, `{ available:false, model:"qwen3:8b", provider:"ollama", configured:true }` (route reached; provider chosen from env).
- `POST /api/api/ai/chat` → **404** `API endpoint 'POST /api/api/ai/chat' not found.` (proves the old doubled path).
- `POST /api/ai/chat` → routed to the handler; returned **503** `"Ollama server is unreachable."` (no fabricated answer). Correct URL is now `POST http://localhost:5050/api/ai/chat`.
- Typechecks: frontend `tsc --noEmit` exit 0; backend `tsc --noEmit` exit 0. Production build: `npm run build` exit 0.
- Tests unchanged and green: `ai-assistant` 47/47, `gemini-integration` 38/38.

**Gemini status:** `GEMINI_API_KEY` in `backend/.env` is **empty**, so server-side provider selection falls back to Ollama (by design) and `status.provider = "ollama"`. A **live Gemini response could not be produced without a real key**; the key is read only server-side and never sent to the browser. With a key set, the provider becomes `gemini` and the same `/api/ai/chat` route is used. No mock/fake success is ever returned.

**Notes:** Preserved authentication, role authorization, error handling, and all unrelated uncommitted work. No commit/push.

### Kavitha Chatbot � "AI service unreachable" Root Cause Resolved with Real Gemini AI Integration (2026-10-15)

**1. Verified Root Cause:**
- ackend/.env had an empty GEMINI_API_KEY=, while a key had been placed in ackend/.env.example.
- Because GEMINI_API_KEY was missing from ackend/.env, isGeminiConfigured() returned alse.
- Without an explicit provider configuration, the system defaulted to ollama at http://127.0.0.1:11434.
- Because Ollama was not installed or running locally, upstream chat requests failed with ECONNREFUSED.
- i-provider.service.ts mapped the connection failure to AiProviderError('ollama', 'UNAVAILABLE') returning HTTP 503 "The AI service is currently unreachable. Please try again shortly.".
- Furthermore, missing configuration was misattributed as service unreachability rather than a configuration error.

**2. Files Changed:**
- ackend/.env: Configured GEMINI_API_KEY securely in local environment; verified never committed or leaked to logs/frontend.
- ackend/.env.example: Sanitized back to template placeholder (your_gemini_or_ai_api_key_here) to prevent secret leakage in git.
- ackend/src/services/ai-provider.service.ts:
  - Honest provider detection: When GEMINI_API_KEY is not configured and OLLAMA_BASE_URL is not set, ctiveAiProvider() reports configured: false with a clear message: "The AI assistant is not configured on the server. Please configure GEMINI_API_KEY in the backend environment.".
  - Improved error messages for INVALID_KEY, NOT_CONFIGURED, QUOTA, and TIMEOUT so failures are never misleadingly masked as transport/server downtime.
- PROJECT_PROGRESS.md: Documented diagnosis, code changes, and live E2E browser verification.

**3. Verification & Live AI Responses:**
- **Live Gemini Provider Check:** GET /api/ai/status returns **HTTP 200**, { available: true, model: "gemini-2.5-flash", provider: "gemini", configured: true }.
- **Live Message Verification (Backend & E2E Browser Subagent against http://localhost:3000):**
  1. Summarize the college mentoring dashboard: Returned real grounded AI response summarizing 15 departments, 221 faculty, 157 students, active mentors, and departmental breakdown.
  2. Explain monthly mentoring coverage: Returned real AI response explaining monthly coverage formula and October 2026 metrics.
  3. Compare department mentoring statistics: Returned comparative department mentoring statistics and student distribution.
- **Retry Mechanism:** Successfully verified interactive Retry button and error handling in browser.
- **Automated Test Suites:**
  - 
pm run test:gemini: **38/38 PASS**.
  - 
pm run test:ai-assistant: **47/47 PASS**.
  - Backend typecheck (	sc --noEmit): **Exit 0**.
  - Frontend typecheck (	sc --noEmit): **Exit 0**.
  - Frontend production build (
pm run build): **Exit 0** (15.42s).
  - Backend production build (
pm run build): **Exit 0**.
- **Role-Based Authorization & Security:** All routes protected by JWT auth (uthenticate middleware); role-specific context preserved; API keys kept strictly server-side.

### Admin Dashboard — Statistic-Card Drill-Downs and the "About Us" Search Result (2026-10-16)

**Goal.** Make the seven Admin overview statistics cards interactive (clicking one shows the real records behind the number, without changing any statistic or record) and let the Mentor-Assignment search surface an "About Us" result that opens an About Us page (none existed, so one was created).

**Backend.**
- New ADMIN-only endpoints in `backend/src/modules/admin/admin-dashboard-details.controller.ts`, mounted in `admin.routes.ts` under `authorize(ROLES.ADMIN)`:
  - `GET /api/admin/dashboard-details/active-arrears` — students carrying ≥1 active arrear, with per-subject `semester / subject_code / subject_name`; `totalActiveArrears` is the unfiltered sum (== the "Active Arrears" card).
  - `GET /api/admin/dashboard-details/mentoring-sessions` — college-wide `CounsellingRecord` list with student + mentor names; `total` == the "Mentoring Sessions" card.
  - `GET /api/admin/dashboard-details/documents` — college-wide `StudentDocument` list with student name, title, category, upload date and verification status; `total` == the "Uploaded Documents" card.
  - All three support `search`, `page`, `limit` (≤100); documents also `verificationStatus`; each returns `total`, `pages`, `hasMore`.
  - Rationale: the other four aggregates already have paginated list endpoints (`/api/students`, `/api/admin/faculty`); the three above had **no** college-wide list (mentoring records and documents were reachable only per student), so a detail view would otherwise have to fetch every student (N+1).
- **Bug fixed while reusing `/api/students`:** the `assignmentStatus` query param was destructured but **never applied**, so `?assignmentStatus=assigned|unassigned` silently returned everyone. It is now resolved at the QUERY level (pre-fetch the ACTIVE-assignment student ids, then `$in`/`$nin`) so `total`, `pages` and the pager are correct. Backwards-compatible, and assigned + unassigned is now an exact partition of the active students.
- Aggregate rules are unchanged and shared with the cards: `calculateArrearStatistics(records, clearedSubjects, arrearHistory).activeArrearsCount` (same `AcademicRecord` field selection as `getAdminDashboardStats`), `CounsellingRecord.countDocuments()`, `StudentDocument.countDocuments()`.

**Frontend.**
- `frontend/src/components/admin/StatDetailsModal.tsx` — one modal for all seven cards: navy/gold styling, correct title + official card value in the header, debounced search, pagination, skeleton loading, honest empty state, error state with Retry, Escape/backdrop close, scroll lock. `Total Faculty` is filtered to active + searched client-side and paged locally (that endpoint returns the whole roster and does not paginate); the rest are server-paginated.
- `frontend/src/pages/admin/AdminDashboard.tsx` — the seven `<div className="stat-card">` blocks became a single data-driven map of focusable `role="button"` cards (`tabIndex=0`, Enter/Space handled, `aria-label`, chevron); `statCard` state + `statCardValue` derivation added; the modal is rendered once at the shell level.
- `frontend/src/styles/index.css` — `.stat-card--clickable` (pointer, hover lift/glow, `:focus-visible` ring), `.stat-card-chevron`, reduced-motion guard.
- `frontend/src/api/client.ts` — `api.admin.getActiveArrearsDetails / getMentoringSessionsDetails / getUploadedDocumentsDetails` + response types.
- **About Us:** new standalone route `/about` (`frontend/src/pages/common/AboutUsPage.tsx`, lazy-loaded in `App.tsx`, mirroring `/students/:id`) built only from verified strings in `backend/src/modules/pdf/institutional-header.ts` (college name, AICTE/AU affiliation, address, website) and from real app capabilities — no invented institutional facts. The Mentor Assignment search (`mentorSearch`) shows an `About Us — View Page` result **only** for the exact trimmed phrase (case-insensitive); clicking it or pressing Enter navigates to `/about`. Ordinary mentor search is untouched.

**Verification (all run, results as observed).**
- `test:admin-stat-details` (new, real HTTP against `src/index.ts` + temp store) — **9/9 PASS**: each detail total reconciles with `/api/admin/dashboard-stats`; arrear rows carry `semester + code + name`; search → 1 / nonsense → 0; `limit=1` → `pages=2, hasMore=true`; assigned 2 + unassigned 2 == 4 active students; every detail endpoint returns HOD 403 and anonymous 401; `client.ts` ships the three routes.
- `.runtime-verify/admin-stats/verify.mjs` (headless Chrome via CDP; scratch backend seeded from a **copy** of `backend/data`, vite dev frontend) — **10/10 PASS**: 7 focusable pointer cards; each opens the correctly-titled dialog with real rows (Total Students 25, Total Faculty 25, Assigned 25, Unassigned 25, Mentoring Sessions 8, Documents 6, Active Arrears empty-state as that dev store has none) and Escape closes it; Total Students card 157 == dialog 157; Assigned 103 + Unassigned 54 == Total 157; Enter opens a card; exact `About Us` shows the result and navigates to `/about` (affiliation text present) while `Abou` does not; Enter on the exact query navigates; a normal mentor name search still returns roster rows with no About Us result; 390px mobile opens a fits-the-screen dialog; 0 console errors, 0 exceptions.
- Regressions: `test:admin-routes` 8/8, `test:directory` 16/16, `test:admin` (overview) 23/23.
- Typechecks/builds: backend `tsc --noEmit` exit 0; frontend `tsc --noEmit` exit 0; frontend `npm run build` exit 0 (emits `dist/assets/AboutUsPage-*.js`).

**Notes.** No statistic value, role permission, business rule or unrelated dashboard changed; real records are never modified by a modal (read-only). Preserved local JSON storage and all prior uncommitted work. No commit/push.
