# Project Progress

> SINGLE SOURCE OF TRUTH for all development progress, fixes, pending issues,
> decisions, and verification results.
> Read this file FIRST at the start of every task. Update it at the END of every task.
> No secrets, passwords, API keys, JWT secrets, or MongoDB credentials in this file.

Status legend: `PASS` | `PARTIAL` | `FAIL` | `PENDING`

---

## Current Status

- **Overall project status:** PASS — Builds clean (frontend + backend). Encoding defects resolved project-wide.
- **Current deployment status:** PARTIAL — Vercel = PASS (student dashboard working). Render = FAIL (HTTP 500 on student dashboard despite service being LIVE).
- **Blocking issue:** Render-only HTTP 500. Root cause still unidentified.

---

## Completed

### UTF-8 mojibake / encoding remediation — PASS
- Removed corrupted characters from `MentorStudentProfileView.tsx` (`â€¢`, `â€”`, `â†’`, and similar).
- Fixed duplicate `"+ +"` button text.
- Fixed CSV `Content-Type` charset.
- Project-wide mojibake scan: **0 remaining**.
- Frontend build: **PASS**
- Backend build: **PASS**

---

## Current Issue

**FAIL — HTTP 500 occurs on Render deployment only.**

- **Where it occurs:** Student dashboard, on the Render deployment.
- **What is confirmed:**
  - Vercel deployment works correctly (same code path succeeds).
  - Render deployment builds successfully and the service reports **LIVE**.
  - `SAPLING_API_KEY` was added to Render using the Sapling Private API Key.
  - The 500 persisted **after** adding that key.
- **Therefore:** Do **NOT** assume `SAPLING_API_KEY` is the root cause.
- **What has already been checked:** Vercel (works), Render build (passes), Render service health (LIVE), Sapling key presence on Render (present but no effect).

---

## Last Change

- **Most recent change:** UTF-8 mojibake / encoding fix pass across the project.
- **Files affected:**
  - `MentorStudentProfileView.tsx` — corrupted characters removed, `"+ +"` button text corrected.
  - CSV export response — `Content-Type` charset corrected.
- **Verification result:** Frontend build PASS, backend build PASS, mojibake scan 0 remaining.

---

## Pending

- PENDING — Identify the exact Render API endpoint returning HTTP 500.
- PENDING — Capture the exact backend exception / stack trace from Render runtime logs.
- PENDING — Diff Render environment/config against the working Vercel environment.
- PENDING — Fix the Render-specific root cause.
- Known bugs: none other than the Render 500 currently tracked here.

---

## Important Decisions

1. Fix the actual Render-specific root cause — do **not** paper over it.
2. Do **not** modify or regress working Vercel functionality.
3. Do **not** use mock data as a workaround.
4. Do **not** disable security (auth / CORS / rate limits) as a workaround.
5. This notepad is committed with the project and must be updated after every task;
   historical entries must never be deleted — mark them outdated instead.

---

## Deployment

- **Local:** PASS — frontend and backend both build and run.
- **Vercel:** PASS — student dashboard functional.
- **Render:** FAIL — service LIVE, student dashboard returns HTTP 500.

---

## Latest Investigation

- **Exact error:** HTTP 500 on student dashboard (Render only). Stack trace not yet captured.
- **Root cause:** UNKNOWN. `SAPLING_API_KEY` ruled out as sole cause (key present, error unchanged).
- **What was tried:** Added `SAPLING_API_KEY` to Render env vars with the Sapling Private API Key → no change.
- **Next debugging step:**
  1. Identify the exact Render API endpoint returning 500.
  2. Reproduce while watching Render runtime logs.
  3. Extract the backend exception / stack trace.
  4. Compare Render environment and configuration with the working Vercel environment.
  5. Apply the Render-specific fix without touching Vercel behavior.

---

## Log

| Date | Status | Summary |
|------|--------|---------|
| — | PASS | UTF-8 mojibake / CSV charset fixes; both builds green. |
| — | FAIL | Render student dashboard HTTP 500 — root cause open. |
