# HOURS

Every run you do for the family, timed in one tap.

Tap **GO** as you walk out the door. Lock the phone and drive. Tap **I'M BACK**
when you walk back in, then tap what it was (Allambie shops, Woolies, KFC…).
HOURS adds it to one big number — time spent helping the family — and the
**Proof** tab turns that into something you can hand across the table.

Built for a P-plater who can't touch the phone while driving.

**HOURS 2 (2026-09-24)** — rebuilt after an argument about who drives more.
It now tracks *only* time helping the family: personal drives (CHOSE), the gym
routine and routines in general are gone. Everything else was redesigned.

---

## Run it

```bash
python3 ~/scripts/serve-nocache.py ~/hours 5490
```

Then open **http://localhost:5490**.

Live on your phone: **https://zaclowe685-hash.github.io/Hours/**

## How a run is timed

A run is **door to door**: from GO (leaving home) to I'M BACK (walking in).
Shopping, queueing and waiting in the car park all count — that's the time
you gave up.

The stopwatch is **one stored timestamp**, never a running counter. Elapsed is
always `now − that timestamp`, worked out fresh every time the page wakes up,
so locking the phone or killing the tab can't lose a second.

Forgot to tap GO? Every errand is a **one-tap button** on Home that knows its
usual length — tap it, tap Log. If you always change the length, the button
learns the new one. Forgot I'M BACK? After 6 hours Home asks how long you were
out.

## The two home-screen buttons

In the Shortcuts app, make two shortcuts using **Open URLs** (the links are
also in Settings with Copy buttons):

| Shortcut | URL |
|---|---|
| **GO** | `https://zaclowe685-hash.github.io/Hours/?go=1` |
| **BACK** | `https://zaclowe685-hash.github.io/Hours/?end=1` |

Add both to the home screen. Both are safe to double-tap.

## Errands, km and the map

Errands (`state.errands`) are the one-tap buttons. Each has a usual length,
an icon, an optional `group: 'takeaway'` (lives under **Get takeaway**), and
an optional location.

GO and I'M BACK are both tapped at home, so GPS alone never sees *where* a run
went. Instead each **pinned** errand gets one OSRM road route home → there,
cached on the errand (`routeKm`, `routeGeom`, `routeFor` = the home it was
routed from). A run's km = `2 × routeKm`. The map draws those routes.

Home sets itself from the first GPS fix on GO (only if not set). Settings can
reset it. Poppa Flock isn't in OpenStreetMap, so it has no pin until Zac taps
it in Settings → **I'm here now** while he's there.

Map tiles are **Esri's World Dark Gray Canvas** (free, no key). CARTO's dark
tiles started stamping "API KEY REQUIRED" in 2026 — don't switch back.

## The backfill

`js/errands.js` → `BACKFILL` adds the 10 runs from 10–23 Sept 2026 that were
never logged (4 Allambie shops, 1 Woolies Frenches Forest, 3 KFC, 1 Poppa Flock,
1 Domino's Mona Vale), spread out by Claude on sensible days, once, with fixed
ids (`d_bf_01…10`) and the `settings.backfilled` flag. They show an ADDED tag,
like any run logged after the fact.

## What's in here

```
index.html            the shell
css/theme.css         the palette — every colour in the app is defined here
css/app.css           every screen's layout and motion
js/store.js           localStorage schema (v2), migrations, CRUD, export/import
js/errands.js         the one-tap buttons, defaults, the backfill, home→errand routes
js/drive.js           GO / out on a run / I'M BACK
js/geo.js             GPS, OSRM routing, haversine
js/stats.js           every derived number, pure functions
js/ui/home.js         the big number, GO, errand tiles, recent runs
js/ui/driving.js      the stopwatch dial and I'M BACK
js/ui/sheets.js       every bottom sheet: what was it / quick log / edit run / edit button
js/ui/proof.js        the screen to show the family
js/ui/runs.js         every run, by day
js/ui/map.js          home, pins, routes
js/ui/settings.js     name, home, buttons, iPhone links, backup
js/ui/widgets.js      DOM helpers, icons, big number, sheets, toasts, stepper
tools/check.mjs       imports, service-worker cache list, palette check
tools/make-icons.py   draws the app icons (no image files were downloaded)
```

Checks:

```bash
node tools/check.mjs
```

## Your data

Everything lives in `localStorage` on the phone, under `hours.v1` (the key
name stayed the same so the data carried over; the schema inside is v2).

The v1 → v2 migration keeps only drives marked SENT and drops routines. Before
it runs, the whole v1 state is copied to `hours.backup.pre-v2` — Settings →
**Download the old data** saves it as a file.

The only things that leave the phone: one GPS pin on GO, and home + errand
pins sent to [OSRM](https://project-osrm.org/) for routes. Map tiles come from
Esri. No API keys, no accounts, no billing.

## Notes

- Deployed on **GitHub Pages** from a **public** repo — required for Pages;
  it must stay public or the phone version goes dead.
- The service worker is **network-first** for the app's own files (3 s
  timeout, then cache), so a push shows up on the next open. Bump
  `CACHE_VERSION` in `sw.js` when the file list changes.

## Notes for Claude sessions

Zac calls this "HOURS", "the drive tracker", "my drives" or "the driving app".

- Start: `python3 ~/scripts/serve-nocache.py ~/hours 5490` → localhost:5490. LIVE: zaclowe685-hash.github.io/Hours (GitHub Pages, repo `Hours`, must stay **PUBLIC**).
- Checks: `node tools/check.mjs`. `python3 tools/make-icons.py` redraws the icons.
- **Purpose:** proof, for family arguments, of how much time Zac spends helping. He does NOT want his brother (or anyone else) tracked, and no "who asked" field — he dropped that on purpose.
- Look: "Last Light" — pure black, untinted greys, ONE accent: the sunset ramp (gold → orange → red → pink), used only for time helped and things you can tap. Inter Tight + Instrument Serif italic.
- `?go=1` and `?end=1` are the home-screen buttons. No CarPlay/Bluetooth automation: he's on P plates.
- Console handle: `window.HOURS = { store, drive, errands, screens }`.
