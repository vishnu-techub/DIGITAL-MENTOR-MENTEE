# DEBUG_NOTES.md

> Persistent investigation / fix log for the KSRCE Digital Mentor-Mentee system.
> **This file is the source of truth. Read it BEFORE every investigation or change.**
> Update it IMMEDIATELY after every investigation, fix, or test.
> Never delete previous entries — append. Historical entries may be marked OUTDATED.
> No secrets, passwords, API keys, JWT secrets, or MongoDB credentials in this file.

Related: `PROJECT_PROGRESS.md`, `PROJECT_FIX_LOG.md`.

---

## ENTRY D-001 — Student Dashboard "Something Went Wrong" (HTTP 500) — frontend TDZ ReferenceError

- **Timestamp:** 2026-09-30
- **Status:** ROOT CAUSE IDENTIFIED — fix applied and locally verified
- **Severity:** Critical — the student dashboard is unusable in production.

### Reported symptom
Frontend shell renders (Header, Sidebar, Student identity, Navigation all load), then the
page switches to the generic "500 Something Went Wrong" screen as soon as the dashboard
data is requested.

### Root cause (FINAL)
A **temporal dead zone (TDZ) ReferenceError** in the frontend — **not** a backend/API failure.

`frontend/src/pages/student/StudentDashboard.tsx`:

| Line | Declaration |
|---|---|
| 156 | `const loadData = async () => { ... }` — **calls `loadMyAcademicRequests()` at line 198** |
| 208-210 | `useEffect(() => { loadData(); }, [user]);` — invokes `loadData` on mount |
| 395 | `const loadMyAcademicRequests = async () => { ... }` — declared **~240 lines AFTER** its call site |

`loadData` (line 156) referenced `loadMyAcademicRequests` (line 395) which was still in its
temporal dead zone, so the call threw:

```
ReferenceError: Cannot access 'loadMyAcademicRequests' before initialization
    at StudentDashboard.tsx (~line 198, inside loadData)
    caught at StudentDashboard.tsx:201  console.error('Failed to load student data:', err)
```

That `ReferenceError` was caught by the `catch` at line 200, which converts **any** non-`ApiError`
into a synthetic HTTP 500:

```tsx
// StudentDashboard.tsx:200-202
} catch (err: any) {
  console.error('Failed to load student data:', err);
  setLoadError(err instanceof ApiError ? err : new ApiError(500, err?.message));   // <-- fabricates a 500
}
```

`formatApiError(500)` then classifies it as `SERVER_ERROR`, and the guard at line 299-307
renders `<ServerErrorState />` = the generic "Something Went Wrong" page.

**This is why the backend looked healthy while the dashboard showed a 500: the two dashboard
API requests actually succeeded (HTTP 200), and the 500 was fabricated client-side afterwards.**

The deployed bundle reports the same class of failure in minified form —
`Cannot access 'kt' before initialization` — which is the mangled name of the same binding.

### Exact change made
Single file: `frontend/src/pages/student/StudentDashboard.tsx`

Converted `loadMyAcademicRequests` from a `const` arrow function into a **hoisted
`async function` declaration**. Function declarations are fully hoisted and initialised
before any statement in the enclosing scope runs, so `loadData` can no longer hit the TDZ,
regardless of call ordering. Behaviour is unchanged.

Before (line 395):
```tsx
const loadMyAcademicRequests = async () => {
  try {
    const res = await api.academicRequests.getMine();
    if (res.success && Array.isArray(res.data)) setMyAcademicRequests(res.data);
  } catch {
    /* non-blocking: the request history is supplementary information */
  }
};
```

After (line 395):
```tsx
async function loadMyAcademicRequests() {
  try {
    const res = await api.academicRequests.getMine();
    if (res.success && Array.isArray(res.data)) setMyAcademicRequests(res.data);
  } catch {
    /* non-blocking: the request history is supplementary information */
  }
}
```

No other file was modified. No backend code, MongoDB data, Render config, or Vercel config
was touched.

### Backend investigation result (this entry, for the record)
Before the frontend cause was found, the backend was ruled out with live evidence:

- Live backend `https://digital-mentor-mentee.onrender.com` → `/api/health` = 200 `database: connected`.
- Production MongoDB read-only audit: **182** `STUDENT` users ↔ **182** `Student` documents, 1:1.
  Zero orphan users, zero dangling user refs, zero wrong-role refs, zero inactive students.
- Live sweep, **all 182 students × 6 dashboard endpoints = 1092 requests, all HTTP 200**:
  `auth/me`, `students/:id`, `meetings/schedule/current`, `notifications`,
  `documents/student/:id`, `student/progress`, `students/academic-edit-request/my`.
- Extra live sweep, **all 182 students**: `auth/me` and `students/{registerNumber}` → all 200,
  zero case mismatches between `username` and `registerNumber`.
- Cold-start probe after a 17-minute idle window → all 200.
- Live instance code fingerprinted as identical to `HEAD` (login type-confusion, schools regex
  injection, schools `findById` cast — all reproduced the exact HEAD behaviour).
- Production Vercel bundle (`digital-mentor-mentee-frontend.vercel.app`) endpoint set matches
  `frontend/src/api/client.ts` exactly — no endpoint drift. Its `VITE_API_URL` correctly
  resolves to `https://digital-mentor-mentee.onrender.com`.
- Service worker (`frontend/public/sw.js`) only handles same-origin GETs and explicitly
  returns early for `/api/`; the API is cross-origin, so the SW never intercepts it.

**Conclusion: every dashboard API is healthy. The backend was never the cause.**
This also supersedes the "no single failing endpoint" framing in `PROJECT_FIX_LOG.md` ENTRY-001
for the *current* production deployment.

### Tests / commands run
| Command | Result |
|---|---|
| `npm --prefix frontend run build` | see Verification below |
| `npx tsc --noEmit -p frontend` (typecheck) | see Verification below |

### Verification

| Check | Command | Result |
|---|---|---|
| Frontend typecheck | `npx tsc --noEmit -p tsconfig.json` (in `frontend/`) | **PASS** — exit 0 |
| Frontend build | `npm --prefix frontend run build` | **PASS** — 1643 modules, `dist/assets/index-DUSwJokv.js` |
| **Root build (backend + frontend)** | `npm run build` | **PASS** — exit 0 |
| Backend health (local) | `GET http://localhost:5050/api/health` | **PASS** — `200 {"status":"ok","database":"connected"}` |
| Compiled output — declaration form | inspected `dist/assets/index-DUSwJokv.js` | **PASS** — emits `async function kt(){...}` (hoisted), no TDZ-bound `const kt` |
| Compiled output — call site | inspected `dist/assets/index-DUSwJokv.js` | **PASS** — `kt()` invoked inside `Oe` (`loadData`), whose `catch` does `new tl(500,...)` (`new ApiError(500,...)`) — the exact chain that fabricated the 500 |
| Minified-name correlation | compared bundle to deployed error | **CONFIRMED** — deployed error `Cannot access 'kt' before initialization` refers to this same mangled binding |
| TDZ semantics before/after | isolated Node reproduction of the exact declaration order | **PASS** — before: `ReferenceError: Cannot access 'loadMyAcademicRequests' before initialization`; after: resolves cleanly |

Key compiled-output evidence (`dist/assets/index-DUSwJokv.js`):
```js
async function kt(){try{const N=await J.academicRequests.getMine();
  N.success&&Array.isArray(N.data)&&Me(N.data)}catch{}}
```
```js
...Xe.success&&E(Xe.data),kt()}}catch(ul){console.error("Failed to load student data:",ul),
_(ul instanceof tl?ul:new tl(500,ul==null?void 0:ul.message))}finally{z(!1)}};
g.useEffect(()=>{Oe()},[c]);
```

### Files changed
| File | Change |
|---|---|
| `frontend/src/pages/student/StudentDashboard.tsx` | `const loadMyAcademicRequests = async () => {...}` → hoisted `async function loadMyAcademicRequests() {...}` (+ explanatory comment) |
| `DEBUG_NOTES.md` | this note (new) |

No backend source, test file, MongoDB data, Render config, or Vercel config was modified.

### Build verification (root)
- Command: `npm run build` (root) → `npm --prefix backend run build && npm --prefix frontend run build`
- Result: **PASS**, exit code 0. Backend `tsc` clean, frontend `tsc` clean, Vite build succeeded
  (1643 modules, `dist/assets/index-DUSwJokv.js`, 737.90 kB / 175.95 kB gzip).
- No build errors of any kind: no frontend TS error, no backend TS error, no
  configuration/dependency error. No build-blocking fix was required.

### Remaining issues
1. **PENDING — Vercel/Render deployment verification.** The fix is local only until it is
   committed, pushed, and redeployed. Production is NOT yet confirmed fixed.
2. **Low-risk latent TDZ pattern still present** (not triggered today, deliberately NOT changed
   to keep this fix minimal):
   - `loadIdentityRequestOptions` is declared at line 346 but referenced by
     `openIdentityEditModal` at line 341 (only reachable from a click handler, so it is already
     initialised by then).
   - `loadData` itself is a `const` arrow function referenced only from the effect at line 208
     and from event handlers, so it is safe.
   These are safe under current React semantics but would break if an effect ever moved above
   its declaration. Worth converting to `function` declarations as a follow-up cleanup.
3. **Diagnosability observation (NOT changed, intentionally):** `StudentDashboard.tsx:202`
   converts *any* unexpected client-side exception into `new ApiError(500, …)`, which is what
   masked a `ReferenceError` as a server-side HTTP 500 for this long. Changing it would risk
   hiding genuine server errors, so it is left alone — but this line is the reason the failure
   was misattributed to the backend. Recommend a follow-up that distinguishes
   `SERVER_ERROR` (real HTTP 500) from `CLIENT_ERROR` (unexpected JS exception).

### Next action
Commit and push the `StudentDashboard.tsx` fix, then redeploy the frontend and confirm on
Vercel that the student dashboard renders without a `ReferenceError`.

---
