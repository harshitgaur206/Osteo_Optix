# Osteo-Optix (SIH 26004) — Changes in this package

## ⚠️ One step required before you run this

The compiled app that ships in `PROTOTYPE/index.html` + `PROTOTYPE/assets/`
was **stale** — it predated the Leaflet NER district map being added to the
source, which is the reason the map wasn't showing. All the fixes below are
in the *source* (`frontend/src/...`), and this sandbox could not recompile
them (see "Why the zip still has an old build" at the bottom).

**Run this once before using the app:**

```bash
cd PROTOTYPE/frontend
npm install
npm run build
```

`npm run build` runs `vite build` and then a script that copies
`frontend/dist/index.html` straight over `PROTOTYPE/index.html` — the exact
file the FastAPI backend serves at `/` and `/app`. After this one command,
the map, the dashboard fix, and the exercise pictograms will all be live.

Then run the app as before:
```bash
cd PROTOTYPE/backend
python -m app.seed_data      # re-seeds health workers only, DB is fresh
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
or just double-click `run_app.bat` on Windows.

---

## What was actually broken, and what was changed

### 1. NER district map not showing
**Root cause:** not a bug in the map code itself — the shipped, prebuilt
`PROTOTYPE/assets/*.js` simply didn't contain the Leaflet/GeoJSON map
feature at all (confirmed: the string `"leaflet"` doesn't appear anywhere in
the built JS). The source file was edited after the last production build,
and the build was never re-run and re-copied.
**Fix:** no code change needed here — rebuilding (see above) ships the map
that already exists in `frontend/src/components/DoctorDashboard.jsx`.

### 2. Doctor's Portal: cards say "4", table says "0 records"
**Root cause:** the two numbers came from two different data sources.
The summary cards called `/api/dashboard/statistics` (a server-side
aggregate). The records table below only ever read `getLocalScreeningHistory()`
— data cached in *this browser's* `localStorage`, which starts empty on a
new session/device even when the server already has real records.
**Fix:**
- Added `GET /api/screenings` to the backend (`backend/app/main.py`) —
  returns every real screening on file.
- Rewrote `DoctorDashboard.jsx` to fetch that list, merge it with any
  not-yet-synced local records, and compute the KPI cards, the map's
  district colors, and the records table **all from that one combined
  array**. They can no longer disagree.

### 3. Hardcoded data removed (workers data kept, as requested)
`backend/app/seed_data.py` used to insert 4 fake patients (Biren Das,
Monorama Gogoi, Tenzing Lepcha, Lalthlamuani Sailo) and 6 fake screenings
on every fresh boot — this is exactly what was causing the "4" in the
cards. Removed entirely. The only thing still seeded is the 3 demo
**Health Worker** logins (`HW_NER_01/02/03`), which you asked to keep.
The stale `ner_oa_screening.db` (which still had the old fake rows baked
in) was deleted so the app starts from a genuinely empty, real state.

### 4. A second map bug this uncovered: district data never actually reached the map
While fixing #2, two more things came to light that would have kept the
map from ever plotting *real* patient data correctly, even after a rebuild:
- `ScreeningResponse` (the API's screening object) never included the
  patient's district at all — added `district` to
  `backend/app/schemas.py` and populated it in `main.py` from the
  patient's own record.
- The patient registration form's District field was **free text**
  (`UserProfile.jsx`), while the map only understands the 10 exact
  district names baked into its GeoJSON — any typo or district outside
  that list would silently never appear on the map. Changed it to a
  dropdown built from the map's own GeoJSON file, so a selected district
  is guaranteed to match a map polygon, and picking it now auto-fills the
  correct state.

### 5. Awareness Library exercise cards were text-only
Added a small inline SVG stick-figure pictogram above each of the 3
exercise cards (Quadriceps Isometric Setting, Straight Leg Raises, Seated
Knee Extensions), showing the position and movement direction. Pure
inline SVG — no image files, no network fetch, works fully offline.
Nutrition/Joint-care cards were left as-is (they're conceptual guidance,
not a physical movement to demonstrate).

---

## Why the zip still ships an old build
This sandbox's `node_modules` only contains a **Windows** native binding
for the build tool (`@rolldown/binding-win32-x64-msvc`) — it was installed
on a Windows machine before zipping. This environment is Linux, has no
network access, and so cannot download the matching Linux binding to run
`npm run build` itself. All source fixes are in place and reviewed line by
line; running the one `npm install && npm run build` command on your own
machine (any OS) will compile them in.

`node_modules/` and Python `__pycache__/` are excluded from this zip to
keep it a reasonable size — `npm install` and normal Python execution will
regenerate both.

---

## Round 2 changes (this package)

This zip was rebuilt in an environment with npm access, so — unlike the
note above — **`PROTOTYPE/index.html` is a fresh, real build of everything
below.** You can run it as-is; `npm install && npm run build` is only
needed again if you make further source changes. The old orphaned
`PROTOTYPE/assets/` folder (stale JS chunks from a pre-singlefile-plugin
build, no longer referenced by anything) was also removed.

1. **NER district choropleth map no longer loads OpenStreetMap tiles.**
   Every piece of information it shows (district shapes, colors,
   click-to-filter, tooltips) already came from the bundled
   `ner-districts.json` GeoJSON, not the tile layer — so the tile layer was
   dropped and the map now renders on a plain background. Works fully
   offline; no dependency on a third-party tile server's availability or
   policy. (`DoctorDashboard.jsx`)

2. **"Unmapped/Other" bucket instead of defaulting to Kamrup Metropolitan.**
   Any screening/user record with no district on file used to be silently
   folded into "Kamrup Metropolitan" everywhere district stats are
   computed — inflating that one district's numbers with data that was
   never actually observed there. Now bucketed separately as
   "Unmapped/Other" in `DoctorDashboard.jsx` (frontend) and in
   `/api/dashboard/statistics` / `/api/dashboard/trends` (`main.py`,
   backend).

3. **Triage guidance is now persisted, not recomputed from partial data.**
   `triage_guidance` used to be computed once at screening creation (from
   the full survey + vision + sensor feature set) but never saved — so
   every later read (`GET /api/screenings/{id}`, the list endpoint, and a
   duplicate-POST path) recomputed it using *only* demographic fields
   (age/sex/occupational load/terrain/previous injury), silently
   discarding the actual survey/vision/sensor evidence the stored
   `risk_probability`/`risk_category` were based on. This could show
   triage text inconsistent with the risk score next to it. Fixed by
   adding a `triage_guidance` column to the `Screening` model
   (`models.py`), saving it at creation, and reusing the stored value on
   every read (`main.py`). Legacy rows saved before this change still fall
   back to the old demographics-only recompute.

4. **Real encryption at rest for local patient data.** `offlineStorage.js`'s
   "encryption" was an XOR cipher with a single static key
   (`OSTEO_OPTIX_FIELD_SECRET_KEY_NER_2026`) baked into the client bundle —
   obfuscation, not encryption; identical and recoverable for every install.
   Replaced with real AES-256-GCM via the Web Crypto API: the key is
   derived (PBKDF2) from the logged-in worker's session JWT once available,
   or from a randomly-generated per-device secret before login (unique per
   install, not a shared hardcoded string), with a fresh random IV on every
   write. The existing synchronous `get*`/`save*` API used throughout the
   app is unchanged — it's backed by an in-memory cache hydrated
   asynchronously from the encrypted store (`waitForStorageReady()` is
   exported for the one place that reads on initial mount, wired into
   `App.jsx`; `rehydrateOfflineStorageForSession()` re-keys the cache right
   after login, wired into `HealthWorkerPinModal.jsx`).

5. **CORS locked down.** `allow_origins=["*"]` with `allow_credentials=True`
   is both unsafe (any site can call authenticated endpoints from a
   victim's browser) and technically invalid per the CORS spec (browsers
   reject a wildcard origin combined with credentials). Now configurable
   via an `ALLOWED_ORIGINS` env var (comma-separated); credentials are only
   allowed once real origins are configured, and a warning is logged when
   falling back to the wildcard demo default. (`main.py`)

6. **Health worker PIN login is now rate-limited.** A 4-digit PIN is only
   10,000 combinations with no throttling, i.e. brute-forceable in minutes.
   Added an in-memory limiter on `/api/auth/worker-login` — 5 failed
   attempts (tracked per worker ID *and* per client IP) locks that key out
   for 15 minutes, returning HTTP 429. Good enough for a single-process
   deployment; back it with Redis (or similar shared store) if you run
   multiple backend processes. (`main.py`)

7. **JWT signing key no longer hardcoded.** `auth.py` shipped a fixed
   secret string in source (and therefore in every client checkout / git
   history). It now reads `JWT_SECRET_KEY` from the environment, falling
   back to a randomly generated per-process key with a logged warning if
   unset (existing tokens simply stop validating on restart in that case —
   safe default, loud signal that it isn't configured for production).

8. **Icon pictograms extended to Nutrition and Joint Care tabs, and to the
   triage box.** The Awareness Library's exercise cards already had inline
   stick-figure SVGs; Nutrition/Joint Care cards were text-only. Since
   those aren't body movements, they now get a single clear symbolic icon
   instead (leaf/droplets/sun for nutrition, mountain/footprints/scale for
   joint care) via lucide-react — same "quick, language-independent visual
   anchor" idea, without forcing a pose diagram onto "drink more water".
   (`AwarenessLibrary.jsx`)

9. **Voice/TTS wired into the Awareness Library and the triage box.**
   `audioService.js`'s `speakQuestionText()` (Bhashini-cached vernacular
   audio, falling back to browser speech synthesis) was already used
   elsewhere in the app but not here. Every Awareness Library card and the
   Clinical Triage Recommendation box in `ScreeningResult.jsx` now has a
   "Listen" button that reads its guidance aloud in the current language.

10. **Simulated/estimated data now flagged in the UI, not just comments.**
    - `WearableSimulator.jsx`: a persistent banner ("Simulated sensor data:
      no physical wearable/IMU hardware is connected...") shows whenever
      running in simulated mode, and the per-IMU status boxes now say
      "Simulated" instead of always claiming "Connected".
    - `GaitVision.jsx`: added a note that its ROM/symmetry/trunk-lean
      figures are a real MediaPipe pose-tracking estimate from this
      device's own camera, not a validated clinical measurement device —
      so results shouldn't be read as clinical-grade on their own. Also
      found and removed two hardcoded placeholder numbers (`cadence:
      94.0`, `step_duration: 0.62`) that were being reported as if measured
      from the clip when nothing in the code actually derives them from
      the video; both now come through as `null` (frontend `GaitVision.jsx`
      and backend `schemas.py` default) rather than fabricated values. They
      weren't feeding into the risk model itself, but they were being
      logged into the `training_data` table as if real, which would have
      quietly degraded any future model retrained on that table.

### Known gap not fixed (needs real data, not just code)
**GeoJSON district coverage is still a placeholder.** `ner-districts.json`
has 10 districts across 7 states; the real North Eastern Region has
roughly 100, and Arunachal Pradesh has none at all in the current file. Any
patient outside these 10 districts has nowhere to render on the choropleth
map (they still count correctly in the "Unmapped/Other" bucket everywhere
else). This needs a real NER district boundary GeoJSON/shapefile sourced
from an authoritative source (e.g. Survey of India / state government GIS
portals, or a maintained open dataset) — it can't be fabricated here.

