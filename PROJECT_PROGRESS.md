# Project Progress

> SINGLE SOURCE OF TRUTH for all development progress, fixes, pending issues,
> decisions, and verification results.
> Read this file FIRST at the start of every task. Update it at the END of every task.
> No secrets, passwords, API keys, JWT secrets, or MongoDB credentials in this file.

Status legend: `PASS` | `PARTIAL` | `FAIL` | `PENDING`

---

## Current Status

- **Overall project status:** PASS — Builds clean (frontend + backend). Encoding defects resolved project-wide.
- **Current deployment status:** PARTIAL — Vercel = PASS. Render = fix implemented and verified locally; awaiting redeploy to confirm on the live host.
- **Blocking issue:** Resolved in code. Root cause identified as an import-time filesystem crash specific to Render's read-only runtime. Not yet confirmed on the live Render host.

---

## Completed

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

- **Most recent change:** Render read-only filesystem boot-crash fix.
- **Files affected:**
  - `backend/src/config/storage.ts` — **new**; writable uploads resolution + safe stored-path mapping.
  - `backend/src/modules/documents/document.controller.ts` — import-time `mkdirSync` replaced.
  - `backend/src/modules/student-progress/student-progress.controller.ts` — import-time `mkdirSync`
    and two `process.cwd()` path resolutions replaced.
  - `backend/src/modules/documents/student-details-pdf.service.ts` — request-time `mkdirSync` replaced.
  - `backend/src/index.ts` — startup log reports the real resolved directory; unused `path` import removed.
  - `backend/src/tests/diagnose-student-role.ts` — temporary diagnostic script, deleted.
- **Verification result:** backend build PASS; frontend build PASS; read-only boot test PASS;
  dashboard repro 5/5 PASS; `test:critical` PASS; `test:directory` 16/16 PASS.

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
- PRE-EXISTING FAIL (unrelated to this change) — `npm run test:export` fails on an Excel column-order
  assertion: column 6 is `EMAIL` where the test expects `CLASS & SECTION`.
  Reproduced on pristine `HEAD` with changes stashed, so it is not a regression.

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
