# Project Progress

> SINGLE SOURCE OF TRUTH for all development progress, fixes, pending issues,
> decisions, and verification results.
> Read this file FIRST at the start of every task. Update it at the END of every task.
> No secrets, passwords, API keys, JWT secrets, or MongoDB credentials in this file.

Status legend: `PASS` | `PARTIAL` | `FAIL` | `PENDING`

---

## Current Status

- **Overall project status:** PASS — Builds clean (frontend + backend). Full 6-state permission machine implemented and enforced server-side. Grammar & Spelling Assistant (advisory, non-destructive) implemented and runtime-verified.
- **Current deployment status:** PARTIAL — Vercel = PASS. Render = fix implemented and verified locally; awaiting redeploy to confirm on the live host.
- **Blocking issue:** Resolved in code. Root cause identified as an import-time filesystem crash specific to Render's read-only runtime. Not yet confirmed on the live Render host.

---

## Completed

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

**FIXED in code, pending redeploy verification — Render boot crash.**

- **Where it occurs:** The process dies at boot, before `app.listen()`. There is no single failing
  request endpoint; every route is unavailable, which surfaces as HTTP 500.
- **Exact error (reproduced locally under a read-only working directory):**
  ```
  Error: EPERM: operation not permitted, mkdir '<cwd>\uploads\documents'
      at Object.<anonymous> (dist/modules/documents/document.controller.js:28:18)
      at Object.<anonymous> (dist/index.js:14:34)
  ```
  Exit code 1, no port bound, no request logged.
- **Post-fix behaviour under the same read-only directory:** the process starts, logs
  `[storage] ... is not writable ... using <temp> instead`, and only fails later on the Mongo
  connection — i.e. it now behaves like any other unhealthy service instead of dying at import.

**Honest limitation:** the live host `digital-mentor-mentee.onrender.com` currently returns HTTP 200
on every read path probed, so this crash is **not active on that instance right now**. Render runtime
logs were not accessible, so the causal link to the historical 500 is strongly supported but not
proven. The fix removes a confirmed, reproducible, Render-only boot failure either way.

---

## Last Change

- **Most recent change:** Grammar & Spelling Assistant — advisory, non-destructive text improvement.
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

- PENDING — Redeploy to Render and confirm `/api/health` and the student dashboard return 200
  on a cold container.
- PENDING — Obtain Render runtime logs to confirm or refute the causal link for the historical 500.
- PENDING — Decide on durable upload storage. Local-disk uploads do **not** survive a Render redeploy
  (the filesystem is ephemeral). The temp-dir fallback keeps the API alive but is also ephemeral.
  If uploaded certificates must persist, they need object storage; this is a design decision, not a bug fix.
- PENDING — `render.yaml` service names (`digital-mentor-mentee-backend` / `-frontend`) do not match
  the live host (`digital-mentor-mentee`). Confirm whether the blueprint is meant to replace the
  existing manually-created service before changing names.
- PRE-EXISTING FAIL (unrelated to this change, re-confirmed) — `npm run test:export` fails on an Excel
  column-order assertion: column 6 is `EMAIL` where the test expects `CLASS & SECTION`.
  Re-verified by stashing all permission-machine work and re-running on pristine `HEAD`:
  `AssertionError: Column 6 header must be "CLASS & SECTION", got "EMAIL"`. Not a regression; the
  export column order was already wrong before this work.
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

---

## Deployment

- **Local:** PASS — frontend and backend both build and run.
- **Vercel:** PASS — unaffected; no frontend or Vercel-facing change was made.
- **Render:** PENDING — fix implemented and locally verified; needs a redeploy to confirm on the host.

---

## Latest Investigation

- **Exact error:** import-time `EPERM ... mkdir '<cwd>\uploads\documents'`, exit code 1, before `app.listen()`.
- **Root cause:** untracked `uploads` directory + unguarded import-time `mkdirSync`, against Render's
  read-only project filesystem.
- **What was tried:** full clean-install simulation of Render's build (`cd backend && npm install`),
  a real `tsc` build, and a read-only-ACL execution of `dist/index.js` before and after the fix.
- **Environment note:** the development machine's C: drive reached 0 bytes free mid-investigation
  (an `npm install` died with `ENOSPC`). The npm download cache was purged to recover ~6.3 GB.

---

## Log

| Date | Status | Summary |
|------|--------|---------|
| — | PASS | UTF-8 mojibake / CSV charset fixes; both builds green. |
| — | FAIL | Render student dashboard HTTP 500 — root cause open. |
| — | PASS | Root cause found: import-time `mkdirSync` crash on Render's read-only FS. Express 5 and Sapling ruled out with evidence. Fix implemented; backend/frontend builds and 3 test suites green. Awaiting redeploy verification. |
