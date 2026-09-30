# Project Fix Log

> **SINGLE SOURCE OF TRUTH for debugging history.**
> Read this file FIRST at the start of every debugging, fixing, or deployment task.
> Update it IMMEDIATELY at the end of every fix, investigation, test, or deployment check.
> **Never delete previous entries** — append and update while preserving complete history.
> No secrets, passwords, API keys, JWT secrets, or MongoDB credentials in this file.

Status legend: `PASS` | `PARTIAL` | `FAIL` | `PENDING` | `PRE-EXISTING`

Related: `PROJECT_PROGRESS.md` (overall project status / deployment state).

---

## 1. Confirmed Facts

### Environment
- Project root: `A:\mini projects\New folder`
- Stack: Express + TypeScript backend (`backend/`), React + Vite frontend (`frontend/`), MongoDB (Mongoose).
- Monorepo uses npm workspaces (`backend`, `frontend`) with **divergent Express declarations**:
  root `express ^5.2.1`, backend `express ^4.21.2`.
- `render.yaml` builds the backend with `rootDir: backend`, `buildCommand: npm install && npm run build`.
- Render runtime project directory is **read-only**; only `/tmp` accepts writes.
- The local filesystem is **ephemeral** on Render — local-disk uploads do not survive a redeploy.

### Deployment hosts
- Live backend: `https://digital-mentor-mentee.onrender.com`
- `render.yaml` declares different service names: `digital-mentor-mentee-backend`, `digital-mentor-mentee-frontend`.
  These do **not** match the live host. Left unchanged pending owner confirmation (see §5).

### Security-relevant invariants (do not regress)
- No mock data as a workaround.
- No disabling of auth / CORS / rate limits as a workaround.
- No secrets in logs, notepads, or committed files.
- Do not regress the working Vercel deployment.

---

## 2. Fixed Issues

### ENTRY-001 — Render HTTP 500: backend process crashed during boot
- **Date/time:** 2026-09-30 (investigation started); fix committed `2026-09-30`.
- **Severity:** Critical — total API outage on Render.
- **Symptom:** Student dashboard returned HTTP 500 on Render only. Vercel and local were unaffected.
- **Root cause:**
  - `backend/uploads` is **untracked in git**, so a fresh Render container does not contain it.
  - Three **unguarded import-time `mkdirSync`** calls attempted to create it during `require()` —
    i.e. before `startServer()` ran and **outside its `try/catch`**:
    - `backend/src/modules/documents/document.controller.ts` → `uploads/documents`
    - `backend/src/modules/student-progress/student-progress.controller.ts` → `uploads/progress`
    - `backend/src/modules/documents/student-details-pdf.service.ts` → `uploads/documents` (request-time, surfaced as a 500)
  - Render's project directory is read-only, so `mkdirSync` threw `EPERM`.
  - The process exited **before binding the port**, so `/api/health` and every other route were
    unavailable. The browser reports this as HTTP 500 — there was no single failing request endpoint.
- **Reproduction (pre-fix):** real `tsc` build + read-only ACL on cwd →
  ```
  Error: EPERM: operation not permitted, mkdir '<cwd>\uploads\documents'
      at Object.<anonymous> (dist/modules/documents/document.controller.js:28:18)
      at Object.<anonymous> (dist/index.js:14:34)
  ```
  Exit code 1, no port bound, no request logged.
- **Fix (commit `5888d25`):**
  - Added `backend/src/config/storage.ts`:
    - `UPLOADS_BASE` — resolves once to a **verified-writable** directory: the historical
      `cwd/uploads`, else a fallback under the OS temp dir. **Never throws.**
    - `resolveWritableUploadsDir(subdir)` — creates a per-feature subdirectory.
    - `resolveStoredUploadPath(fileUrl)` — maps stored `/uploads/...` URLs back to real files with
      path-traversal containment.
    - Optional `UPLOADS_DIR` env var overrides the base directory.
  - All three writers now use `resolveWritableUploadsDir`.
  - **Also removed three ad-hoc `path.resolve(process.cwd(), fileUrl)` resolutions** in
    `document.controller.ts` (`resolveStoredPath`) and `student-progress.controller.ts`
    (2 sites, old-file delete on update and on delete). These validated containment against
    `UPLOADS_DIR` but resolved against `process.cwd()`. Had the temp fallback triggered, they would
    have **silently broken every stored file** (path-traversal check would reject all reads). Writer
    and reader are now anchored to the same constant.
  - `backend/src/index.ts` — startup log now reports the real resolved directory
    (`UPLOADS_DIR`); removed the now-unused `path` import.
  - Deleted temporary diagnostic script `backend/src/tests/diagnose-student-role.ts`.
- **Files changed:** `backend/src/config/storage.ts` (new), `backend/src/index.ts`,
  `backend/src/modules/documents/document.controller.ts`,
  `backend/src/modules/documents/student-details-pdf.service.ts`,
  `backend/src/modules/student-progress/student-progress.controller.ts`.
- **Post-fix behaviour:** under an identical read-only cwd the process now starts, logs
  `[storage] ... is not writable ... using <temp> instead`, and only fails later on the Mongo
  connection — behaving like any unhealthy service instead of dying at import.

### ENTRY-002 — Admin-only global "Delete All Documents"
- **Date/time:** 2026-09-30.
- **Severity:** Feature request (destructive admin capability was missing entirely).
- **Symptom:** an Admin could bulk-delete one student's documents, but there was no way to clear the
  whole `StudentDocument` repository. Only `DELETE /api/documents/student/:studentId/all` existed, and
  that per-student path deliberately **retains** the system-generated primary
  `student_details_form`, so it can never purge everything.
- **Fix:**
  - `backend/src/modules/admin/admin.controller.ts` — new `deleteAllDocuments` handler:
    - Snapshots `_id/fileName/fileUrl` **before** deleting, so on-disk cleanup still knows the targets.
    - Deletes records with a **single atomic `StudentDocument.deleteMany({})`** — records are never
      left half-removed.
    - Removes each stored file through the **existing** `resolveStoredUploadPath` helper
      (`backend/src/config/storage.ts`). No second storage system and no re-derived uploads root, so
      the read-only/`/tmp` fallback from ENTRY-001 stays consistent. Its path-traversal containment
      also applies to the purge.
    - Partial failures are **collected, never swallowed**: a failed `unlink` is recorded and reported
      instead of aborting the request, and reported counts never overstate what was removed.
    - Returns `documentsDeleted`, `filesDeleted`, `filesNotDeleted` (+ capped `filesNotDeletedNames`,
      `filesAlreadyAbsent`) and appends a manual-cleanup warning to the message when files remain.
    - Zero documents -> HTTP 200 `"No documents found."`
    - `logAudit` action `DELETE_ALL_DOCUMENTS` records counts and **file names only — never file
      contents or buffers**. The no-op zero-document case is deliberately not audit-logged so the trail
      only records real destructive actions.
    - Defence in depth: the handler re-checks `req.user.role !== ROLES.ADMIN` and returns 403 even if
    it were ever re-mounted elsewhere. Authorisation is never a frontend concern.
  - `backend/src/modules/admin/admin.routes.ts` — `router.delete('/documents/all', authorize(ROLES.ADMIN), deleteAllDocuments)`
    (`authenticate` is already applied router-wide).
  - `frontend/src/api/client.ts` — `api.admin.deleteAllDocuments()`.
  - `frontend/src/pages/admin/AdminDashboard.tsx` — "Delete All Documents" button in the Documents tab
    header, gated on `isAdmin`; confirmation modal titled **"Delete ALL Documents?"** carrying the
    explicit **"This action cannot be undone."** warning; `deletingAllDocs` disabled state plus a
    `useRef` in-flight latch (`disabled` alone cannot stop two clicks landing before React re-renders);
    UI state updates and `loadData()` refresh only **after** the backend reports success.
- **Scope guarantee:** only `StudentDocument` records and their own files are touched. Students,
  Users, Faculty, academics, counselling, meetings and every other collection are untouched.
- **Files changed:** `backend/src/modules/admin/admin.controller.ts`,
  `backend/src/modules/admin/admin.routes.ts`, `frontend/src/api/client.ts`,
  `frontend/src/pages/admin/AdminDashboard.tsx`.
- **Unrelated paths left alone:** `document.controller.ts` and `document.routes.ts` are **unmodified**,
  so normal single-document deletion and the per-student bulk delete behave exactly as before.

### ENTRY-000 (earlier session) — UTF-8 mojibake / encoding remediation
- Removed corrupted characters from `MentorStudentProfileView.tsx` (`â€¢`, `â€”`, `â†’`, etc.).
- Fixed duplicate `"+ +"` button text; corrected CSV `Content-Type` charset.
- Project-wide mojibake scan: 0 remaining. Frontend + backend builds green.

---

## 3. Verification Results

Verification for **ENTRY-002** (recorded 2026-09-30):

| Check | Result |
|---|---|
| Root build (`npm run build`: backend `tsc` + frontend `tsc` + `vite build`) | **PASS** — 1643 modules, no type errors |
| Endpoint rejects missing token | **PASS** — 401 "Authentication token missing or invalid." |
| Endpoint rejects malformed token | **PASS** — 401 |
| Endpoint rejects STUDENT / FACULTY / MENTOR / HOD | **PASS 4/4** — 403 "You are not authorized to perform this operation." |
| Route resolves to the real handler (not a 404 fallback) | **PASS** — the 403s above prove the route matched |
| No read path exposed for the purge URL | **PASS** — `GET` returns 404 |
| Normal single-document + per-student bulk delete unchanged | **PASS** — `document.controller.ts` / `document.routes.ts` not in the diff |
| `btn-danger` / `Modal` / `useAuth` contracts match usage | **PASS** — verified against source |

How the auth/role checks were run: the real `admin.routes.js` module was mounted in a throwaway
in-process Express app and probed with a **test-only** `JWT_SECRET`; the script lived outside the
repo (`%TEMP%`) and was deleted afterwards. **No `ADMIN` token was ever sent**, and
`authenticate`/`authorize` both reject before the handler body, so the run performed **zero database
writes and zero file deletions**. The destructive path itself was therefore not executed against real
data.

Verification for **ENTRY-001** (recorded 2026-09-30):

| Check | Result |
|---|---|
| Backend build (`npm run build` in `backend/`) | **PASS** |
| Frontend build (`npm run build` in `frontend/`) | **PASS** — 1643 modules, no frontend change made |
| Read-only boot test (`dist/index.js` under read-only ACL) | **PASS** — no import-time crash |
| Dashboard reproduction (`student-dashboard-500.repro.ts`) | **PASS 5/5** — all scenarios RENDERS |
| `npm run test:critical` | **PASS** — 12/12 steps, zero data loss |
| `npm run test:directory` | **PASS 16/16** |
| `npm run test:export` | **FAIL — pre-existing**, see §4 |

Earlier live-service probes (before the fix, for diagnosis):
- `https://digital-mentor-mentee.onrender.com/api/health` → 200 `{"status":"ok","database":"connected"}`.
- Admin login, `/api/auth/me`, student list, first student detail, schedule → 200.
- Sequential sweep of all 182 `GET /api/students/:id` → **all 200**.
- Local backend against production MongoDB, 60 sampled students × 2 dashboard routes
  (`GET /api/students/:id`, `GET /api/meetings/schedule/current`) → **120/120 200**.
- Live deployment confirmed current via CSV `Content-Type: text/csv; charset=utf-8`, zero mojibake.

---

## 4. Known / Pre-Existing Issues

### PRE-001 — `test:export` fails on Excel column-order assertion
- **Classification:** **PRE-EXISTING — NOT caused by any current change.**
- **Failure:** `AssertionError: Column 6 header must be "CLASS & SECTION", got "EMAIL"`
  at `backend/src/tests/overall-mentee-export.test.ts:330`.
- **Proof:** re-ran with all `backend/src` changes **stashed** on pristine `HEAD` — identical failure.
- **Status:** unfixed, out of scope for ENTRY-001.

### ENV-001 — Development machine C: drive reached 0 bytes free (resolved)
- An `npm install` died with `ENOSPC` (`tar TAR_ENTRY_ERROR ENOSPC: no space left on device`).
- Recovered ~6.3 GB by purging the npm download cache (regenerable). Free space afterwards: ~5.88 GB.
- `%TEMP%` (~13.7 GB) was deliberately **left untouched** as it may contain user files.
- **Lesson:** check free disk before large clean-install simulations; `git archive` + `tar -xf`
  (writing the tar to a file first) is required — piping `git archive` into `tar` in PowerShell
  corrupts the stream (`tar.exe: Damaged tar archive (bad header checksum)`).

---

## 5. Pending Issues & Decisions

### PENDING-001 — Confirm the fix on the live Render host
- Redeploy to Render and confirm `/api/health` and the student dashboard return 200 on a **cold container**.
- Obtain Render runtime logs to confirm or refute the causal link for the historical 500.
- **Honest limitation:** the live host currently returns 200 on every read path probed, so the crash
  was **not active on that instance at the time of investigation**. The causal link is strongly
  supported (reproduced deterministically, and it is uniquely Render-compatible) but **not proven**.
  Do not report this as fully confirmed until a redeploy verifies it.

### PENDING-002 — Durable upload storage (design decision, not a bug)
- Local-disk uploads do **not** survive a Render redeploy. The new temp-dir fallback keeps the API
  alive but is equally ephemeral.
- If uploaded certificates must persist, object storage is required. **Requires owner decision.**

### PENDING-003 — `render.yaml` service name mismatch
- Declared `digital-mentor-mentee-backend` / `-frontend` vs live `digital-mentor-mentee`.
- Probe results: `digital-mentor-mentee-backend.onrender.com` timed out (HTTP 000 after 90s);
  `digital-mentor-mentee-frontend.onrender.com` returned 404.
- **Not changed** — renaming could disrupt an existing manually-created service.
  **Requires owner confirmation** on whether the blueprint should replace it.

### RULED-OUT-001 — Express 5 is NOT the cause
- Ran Render's exact `cd backend && npm install` against a clean `git archive` of `HEAD`:
  resolves **express 4.22.3** in `backend/node_modules`; root `express@5.2.1` is never installed.
- The `'/api/*'` and `'/uploads/*'` wildcard incompatibility **is** a real latent risk
  (Express 5 throws `Missing parameter name at index 10`; `*splat` and `{*splat}` work on both
  4.22.3 and 5.2.1) but is **dormant**. Left unchanged — no evidence to act on.

### RULED-OUT-002 — Sapling / external AI is NOT involved
- **No** `SAPLING_API_KEY` reference exists anywhere in `backend/src`.
- `backend/src/modules/counselling/sapling.service.ts` was deleted in commit `68e668e`.
- Current AI integration uses `AI_API_KEY` / `AI_MODEL` and already has a local fallback.
- `backend/dist/modules/counselling/sapling.service.js` is stale, gitignored local build output;
  a fresh Render deploy will not contain it.
- **Supersedes** the earlier note that a `SAPLING_API_KEY` was present on Render: the key is simply
  never read by the code.
- `render.yaml` and local `backend/.env` define no `SAPLING_API_KEY`, `GEMINI_API_KEY`, or `AI_API_KEY`.

### RULED-OUT-003 — CORS / JWT / MongoDB are NOT involved
- Health reports `database: connected`; CORS is hardcoded `origin: '*'` with no env coupling.
- `frontend/src/api/client.ts` normalizes a missing protocol and maps status `0` to `NETWORK_ERROR`,
  so a dead host surfaces as a network error, not an HTTP 500.

---

## 6. Deployment-Specific Issues

| Host | Status | Notes |
|---|---|---|
| Local | **PASS** | Frontend + backend build and run. |
| Vercel | **PASS** | Unaffected — no frontend or Vercel-facing change was made. |
| Render | **PENDING** | Fix implemented and locally verified; needs a redeploy to confirm. |

Render-specific environmental constraints to keep in mind:
- Project directory is **read-only**; only `/tmp` is writable → any disk write must be guarded or
  redirected. This is the class of bug behind ENTRY-001.
- Filesystem is **ephemeral** across redeploys → see PENDING-002.
- Free plan spins down when idle; cold starts can surface as 5xx at the edge, unrelated to app code.

---

## 7. Entry History

| # | Date | Status | Summary |
|---|------|--------|---------|
| 000 | — | PASS | UTF-8 mojibake / CSV charset fixes; both builds green. |
| 001 | 2026-09-30 | PASS | Render boot crash on read-only FS — root cause found, fixed (`5888d25`), verified locally. Express 5 and Sapling ruled out with evidence. Awaiting redeploy confirmation. |
| 002 | 2026-09-30 | PASS | Admin-only global "Delete All Documents" — atomic record purge + stored-file removal via the existing storage helper, partial failures reported, audit-logged, admin-gated UI. Build green; 401/403 verified. |
