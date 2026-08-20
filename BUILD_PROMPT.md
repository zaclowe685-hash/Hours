# Build prompt: MILK RUN

> **Read this first — four things changed, on Zac's instruction, before the
> build started. The app that exists is HOURS, not MILK RUN.**
>
> | Spec says | Built as | Why |
> |---|---|---|
> | App called **MILK RUN**, folder `~/milk-run`, repo `Milk-Run` | **HOURS**, folder `~/hours`, repo `Hours` | Zac: "make it something about driving, because it actually is an app about driving" |
> | Categories **MILK RUN** / **JOYRIDE** | **SENT** / **CHOSE** | Zac picked these when the app name changed. Coral/teal split is unchanged; the internal values are `'sent'` and `'chose'` |
> | Empty map centres on Sydney | Asks for a location fix and centres on him (Sydney only as a last resort) | Zac's choice |
> | Odometer label `MINUTES OF YOUR LIFE SPENT ON OTHER PEOPLE'S ERRANDS` | Same number, quieter label: `minutes spent on other people's errands` | Zac: "same idea, but just a bit less, you know, relaxed" |
>
> The seeded Gym routine, the localStorage key (`hours.v1`), and everything
> else follow this spec as written.

> Paste target: a **fresh Claude Code session** with zero context. Everything you
> need is in this file. The project folder is `~/milk-run` and it is already
> created and `git init`-ed. Build into it.

---

## 0. Your role & how to work — read this first

You are writing the FIRST full version of this app. A review pass (`/code-review`,
or a stronger model) happens AFTER you deliver, so do not try to do its job.

- **Do:** build every feature in this spec correctly, keep the code readable ES
  modules, and pin every number to the exact values written here.
- **Test ONCE, at the end.** Do not stop after every milestone. Build the whole
  spec, then actually serve it and work through the section 12 smoke check for
  real. Fix what those checks surface.
- **Do NOT gold-plate.** No try/catch around every line, no speculative guards,
  no performance micro-tuning. Build the edge cases WRITTEN in this spec and
  stop; do not invent extra ones.
- **When unsure whether something is a real problem, flag it, don't harden it.**
  Leave a `// REVIEW: <what you're unsure about>` comment at that line and gather
  them all into a `## Known risks for review` list at the end of your final reply.
- **Stop when the spec is built and runs.** Don't keep polishing.

### Who this is for
Zac — Year 11, Sydney, just got his P plates. Mac (Apple Silicon), zsh. Not a
professional dev: explain things in plain English in your final handover, short
and clear. **He does the testing, not you.** Never claim something is "verified
working" from a screenshot. Hand it over with the link and say it's ready for him
to test. One console-error check at the end is enough (that IS the section 12
smoke check).

### The house rules you must follow (from his global CLAUDE.md)
1. The folder is `~/milk-run`, already git-init'ed. **Commit at milestones.**
2. Static, no build step → served with the shared no-cache server:
   `python3 ~/scripts/serve-nocache.py ~/milk-run 5490`
3. **Port 5490** — confirmed free.
4. You MUST add an entry to the GLOBAL `~/.claude/launch.json` (the preview tool
   only reads the global file). Copy the shape of an existing static entry.
5. You MUST add a row to the project registry table in `~/.claude/CLAUDE.md`.
   Suggested row:
   `| "Milk Run" / "the drive tracker" / "my drives" | ~/milk-run | python3 ~/scripts/serve-nocache.py ~/milk-run 5490 | localhost:5490 — solo drive log: tap GO, stopwatch runs with the phone locked, road route + km reconstructed from start/end GPS pins; MILK RUN (asked of you) vs JOYRIDE (yours) + free tags; TickTick-style recurring drives (gym auto-logs Wed+Fri, 7 min each way); deployed to GitHub Pages for the iPhone home-screen Shortcut |`
6. Add `milk-run` to the `PROJECTS=()` array in `~/scripts/backup-all.sh`.
   **This repo must be PUBLIC** — it is a live GitHub Pages site. There are
   currently three deliberately-public repos; this is the fourth. Note that in
   your handover so it never gets flipped private by mistake.
7. Write a short `README.md` in the folder.

---

## 1. What you are building

**MILK RUN** — a single-person web app that logs every drive Zac takes and splits
his driving life into two halves: **MILK RUNs** (drives he was *asked* to do —
"go get milk", "go to Officeworks and buy pens", "pick your brother up") and
**JOYRIDEs** (drives he chose — gym, mates, the beach).

The core interaction is one tap. He taps **GO** as he gets in the car, locks the
phone, drives, gets back, and taps **HOME**. The app captures duration, a start
pin and an end pin, reconstructs the real road route between them, names the
destination, and files the drive.

It must feel like a beautiful physical object — a warm, filmic, mechanical
dashboard instrument, not a form. The visuals are as important as the data.

**The feeling to nail:** tapping GO should feel like turning a key.

---

## 2. The hard constraint you must design around (read carefully)

Zac is a P-plater: **he cannot touch or connect the phone while driving**, and he
wants the phone screen OFF during the drive. This kills the obvious approach.

**A web page cannot record GPS in the background on iOS.** The moment Safari is
backgrounded or the phone is locked, JS is suspended and `watchPosition` stops
firing. There is no workaround for a web app. Do not attempt a background
breadcrumb trace, do not use a wake-lock hack to keep the screen on, and do not
pretend it works.

**Therefore the design is:**

| Needs to work with the phone locked | How |
|---|---|
| The stopwatch | **Store `startedAt` as a timestamp in localStorage.** Never rely on a running `setInterval` to accumulate time. Elapsed is always computed as `Date.now() - startedAt` when the page becomes visible again. This is 100% accurate whether the phone was locked for 7 minutes or 3 hours, and survives the tab being killed entirely. |
| The route line + distance | **Two GPS fixes only** — one on GO, one on HOME. Then ask a free routing server for the driving route between them, which returns a real road polyline and real road distance in km. Draw that. |

Label the route honestly in the UI as the **likely road route**, not a recorded
trace. Add a small `~` before reconstructed distances.

**Routing service (no API key, no billing):**
`https://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson`
Read `routes[0].distance` (metres) and `routes[0].geometry` (a GeoJSON
LineString) from the response.
- If it fails, times out (5 s), or there is no network: fall back to
  **haversine straight-line distance × 1.25** and draw a simple curved line
  between the two pins. Mark the drive `routeSource: 'estimate'` and show a tiny
  dotted line instead of a solid one.
- Do the routing lazily — the drive saves instantly, and the route resolves in
  the background and updates the record when it lands. **Never block the UI on a
  network call.**
- If it was offline at the time, retry unresolved routes next time the app opens
  with a connection.

**Do NOT use the Google Maps API** — it needs a key and a billing account. Use
Leaflet + free tiles (section 7).

---

## 3. Tech stack & file layout

Static site. **No build step, no bundler, no framework, no server code.** Opens
straight from the no-cache server and from GitHub Pages.

- Vanilla ES modules with `<script type="module">`.
- **Leaflet 1.9.4** from CDN for maps:
  `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js` + matching CSS.
- Everything else hand-written. No React, no Vite, no npm install, no chart
  library — draw the charts yourself with SVG or Canvas (section 8).
- Fonts: use `@import` from Google Fonts — **Bebas Neue** (headings/odometer),
  **DM Mono** (numbers, timers, dockets), **Inter** (body). If offline, the
  fallbacks must still look deliberate: `Impact/sans-serif`, `ui-monospace`,
  `system-ui`.

### Exact files to produce

```
~/milk-run/
  index.html
  manifest.webmanifest
  sw.js                      # service worker — offline shell + install
  README.md
  BUILD_PROMPT.md            # already here, leave it
  css/
    reset.css
    theme.css                # palette + type scale as CSS custom properties
    app.css                  # layout + components
  js/
    main.js                  # boot, routing between screens, visibility handling
    store.js                 # localStorage schema, CRUD, migrations, export/import
    drive.js                 # the live-drive state machine (GO / DRIVING / HOME)
    geo.js                   # geolocation, OSRM routing, haversine, place naming
    places.js                # saved places: match, name, rename, visit counts
    routines.js              # recurring drives engine + catch-up on open
    stats.js                 # all derived numbers, pure functions, no DOM
    ui/
      screens.js             # screen mount/unmount
      home.js                # the GO button + odometer + week ribbon
      driving.js             # full-bleed live timer + scrolling road
      finish.js              # the post-drive card: category, tags, place name
      log.js                 # the docket list + filters
      map.js                 # Leaflet map of every route + place pins
      insights.js            # the stats screen (dial, split bar, records)
      routinesUI.js          # routine editor
      settings.js            # export/import, phone setup guide, danger zone
      widgets.js             # shared: rolling odometer digits, toggle, sheet, toast
  assets/
    icon-192.png             # app icons — generate these, see section 7.7
    icon-512.png
    icon-maskable-512.png
```

**No downloaded models, textures, audio or imagery.** Everything visual is CSS,
SVG, or Canvas drawn in code. The only external requests at runtime are the font
CSS, the Leaflet library, map tiles, OSRM, and Nominatim.

---

## 4. Data model

All in `localStorage` under a single key `milkrun.v1`, written through `store.js`.
Debounce writes to 250 ms except the live-drive record, which writes immediately.

```js
{
  schemaVersion: 1,
  drives: [Drive],
  places: [Place],
  routines: [Routine],
  liveDrive: LiveDrive | null,
  settings: { homeCoords: {lat, lon} | null, firstRun: bool, lastOpened: ts }
}
```

```js
Drive = {
  id: 'd_' + crypto.randomUUID(),
  category: 'milkrun' | 'joyride',
  tags: ['gym', 'woolies'],            // lowercase, no #, deduped
  startedAt: 1755690000000,            // epoch ms
  endedAt: 1755690420000,
  durationMs: 420000,                  // endedAt - startedAt, stored explicitly
  from: { lat, lon } | null,
  to:   { lat, lon } | null,
  placeId: 'p_...' | null,             // resolved destination
  placeLabel: 'Woolworths Mona Vale',  // denormalised for fast rendering
  distanceKm: 4.8 | null,
  routeGeometry: [[lat,lon], ...] | null,   // decoded, ready for Leaflet
  routeSource: 'osrm' | 'estimate' | 'pending' | 'none',
  origin: 'manual' | 'routine' | 'quicklog',
  routineId: 'r_...' | null,
  note: null,                          // reserved, no UI in v1
  createdAt, updatedAt
}

Place = {
  id: 'p_...',
  label: 'Woolworths Mona Vale',
  lat, lon,
  visits: 12,
  totalMs: 5040000,
  isHome: false,
  createdAt
}

Routine = {
  id: 'r_...',
  name: 'Gym',
  enabled: true,
  days: [3, 5],                  // 0=Sun .. 6=Sat
  timeOfDay: '06:30',            // 24h local
  legMinutes: 7,
  returnTrip: true,              // generates an outbound AND a return leg
  returnOffsetMinutes: 75,       // how long after arrival the return leg starts
  category: 'joyride',
  tags: ['gym'],
  placeLabel: 'The gym',
  placeId: null,                 // optional, links to a saved Place for the map
  lastGeneratedFor: '2026-08-19' // YYYY-MM-DD, prevents double-generation
}

LiveDrive = { startedAt, from: {lat,lon}|null, geoStatus: 'ok'|'denied'|'pending'|'unavailable' }
```

**Migrations:** `store.js` reads `schemaVersion`; if it is missing or lower,
run the migration chain and bump it. Ship v1 with an empty chain but the
mechanism in place — Zac will ask for changes later and his data must survive.

---

## 5. The live-drive state machine (`drive.js`)

Three states: `IDLE` → `DRIVING` → `IDLE`, plus the `FINISHING` sheet.

**Starting a drive (`start()`):**
1. Write `liveDrive = { startedAt: Date.now(), from: null, geoStatus: 'pending' }`
   to localStorage **immediately, before anything else.** The stopwatch must be
   safe even if the page dies one frame later.
2. Switch to the DRIVING screen instantly. Do not wait for GPS.
3. Fire `navigator.geolocation.getCurrentPosition` with
   `{ enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }`. When it
   lands, patch `liveDrive.from` and set `geoStatus: 'ok'`. On error set
   `'denied'` or `'unavailable'` and carry on — **a drive without GPS is still a
   valid drive**, it just has no route and no distance.

**While DRIVING:** the only thing running is a 1 Hz `requestAnimationFrame`-throttled
render of `Date.now() - startedAt`. On `visibilitychange` → visible, and on
`pageshow`, recompute from `startedAt` immediately (do not "catch up" a counter).

**Ending a drive (`finish()`):**
1. Capture `endedAt = Date.now()`.
2. Request the end GPS fix (same options). Show the FINISH sheet immediately with
   a "finding you…" shimmer in the place field; don't block on it.
3. Build the Drive record, clear `liveDrive`, save.
4. Resolve the destination (section 6) and kick off routing (section 2) in the
   background, patching the record as each lands.

**Edge cases (build exactly these, invent no others):**
- **App reopened mid-drive:** if `liveDrive` exists on boot, go straight to the
  DRIVING screen with the correct elapsed time. This is the normal path, not an
  error.
- **Stale drive:** if `liveDrive` exists and `Date.now() - startedAt > 6 hours`,
  do NOT auto-log it. Show a recovery card on Home: *"You started a drive at
  4:12pm on Tuesday and never finished it."* with three buttons —
  **[Finish it now]** (uses now as the end time), **[Set the time myself]**
  (opens a duration picker), **[Bin it]**.
- **Zero/negative duration:** if `endedAt - startedAt < 20000` (20 s), don't
  silently save. Ask: *"That was 8 seconds. Bin it, or log it anyway?"*
- **Location permission denied:** never nag again in that session. Show a single
  small line on the finish sheet: *"No location — tap to name the place
  yourself."* Everything else works.
- **GPS drift:** if `from` and `to` are within 120 m of each other, do not draw a
  route or a distance. Label it "round trip / stayed local" and set
  `distanceKm: null`, `routeSource: 'none'`.

---

## 6. Destination naming (`places.js` + `geo.js`)

Priority order — this is important, it makes the app feel smart with almost no
network use:

1. **Saved place match.** If the end fix is within **150 m** of a saved `Place`,
   use it. Increment `visits` and add to `totalMs`. No network call at all.
2. **Home match.** If within 150 m of `settings.homeCoords`, this was a round
   trip returning home; look at whether any *other* place was passed — there
   isn't one, so label it by the drive's tags if present, otherwise
   `"Round trip"`.
3. **Reverse geocode**, once, via Nominatim (free, no key):
   `https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}&zoom=18&addressdetails=1`
   Prefer, in order: `name` → `address.shop` → `address.amenity` →
   `address.road` + `address.suburb`. Cap at 40 chars.
   Rate-limit yourself to **1 request per second**, and cache every result by
   rounded coords (4 dp) so the same spot is never looked up twice.
   On any failure fall back to `"Unnamed stop"` — never show raw coordinates to
   the user.
4. **Zac can always rename it**, on the finish sheet or later from the log. When
   he renames a stop, **create or update the saved Place**, so from then on
   that spot is recognised instantly by rule 1. Tell him that in a one-time tip:
   *"Named it? I'll recognise it next time."*

**Home coords** are set on first run: a card on Home says *"Tap here while you're
at home so I can tell when you've got back."* One tap stores the fix.

---

## 7. Visual style — this is half the job

Zac explicitly asked for something genuinely beautiful and a palette he hasn't
used. Purple and blue are banned. The look is **Highway Sunset**: warm, filmic,
1970s road-trip, mechanical instrument panel. Think a dashboard at golden hour.

### 7.1 Palette (put these in `theme.css` as custom properties, use nothing else)

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#1C1512` | page background, deep warm charcoal |
| `--ink-2` | `#261C18` | raised surfaces, cards |
| `--ink-3` | `#33261F` | borders, grooves, inset wells |
| `--coral` | `#FF8A5B` | primary accent — MILK RUN category, the GO button |
| `--rust` | `#E5533D` | pressure/urgency, the STOP state, negative deltas |
| `--peach` | `#FFD9A0` | headline text, odometer digits, warm highlights |
| `--teal` | `#2FB6A8` | the single cool note — JOYRIDE category, positive deltas |
| `--bone` | `#F4EDE4` | body text |
| `--dust` | `#8C7A6B` | secondary text, labels, axis lines |

Derived: `--coral-glow: rgba(255,138,91,.28)`, `--teal-glow: rgba(47,182,168,.28)`.
**Category colour is a hard rule everywhere in the app:** MILK RUN = coral,
JOYRIDE = teal. Never swap them, never introduce a third accent.

### 7.2 The atmosphere layer (do this early, it carries everything)
- A fixed, full-viewport **warm vignette**: a radial gradient from transparent to
  `rgba(0,0,0,.55)` at the edges, `pointer-events:none`, `z-index:9999`.
- A **film grain** overlay above it: a 128×128 canvas filled once with random
  monochrome noise, tiled as a repeating background at `opacity:.05`,
  `mix-blend-mode:overlay`. Static, not animated — animated grain looks cheap
  and eats battery.
- A slow **sunset wash** behind the content: a large soft radial gradient of
  `--rust` → transparent anchored low-left, and one of `--coral` → transparent
  high-right, both at ~12% opacity, drifting over ~40 s with a CSS transform
  animation. Respect `prefers-reduced-motion` and freeze it if set.

### 7.3 The GO button (the hero interaction)
A large circular button, 200 px, centred on Home. It must feel physical:
- A `--ink-2` disc sunk into an inset well (inner shadow, top-lit), ringed by a
  1 px `--ink-3` groove.
- The word **GO** in Bebas Neue, 64 px, `--peach`, letter-spaced.
- A concentric ring of `--coral` at 40% opacity that **breathes** — scale
  1 → 1.06 over 3.2 s, `ease-in-out`, infinite alternate.
- On `:active`: the disc translates down 3 px, the inner shadow deepens, the ring
  snaps to 100% opacity and floods `--coral-glow` outward once.
- On release it commits: a single expanding coral ring flies out past the edge of
  the screen over 500 ms while the screen transitions.
- While a drive is running, Home is not shown — but if he navigates back to it,
  the button becomes a **rust-coloured STOP** with the live timer inside it.

### 7.4 The odometer (the signature component, `ui/widgets.js`)
A mechanical rolling-digit counter, used for every big number in the app.
- Each digit is a vertical strip of 0–9 inside a `overflow:hidden` window, moved
  with `transform: translateY(-N * 1em)`.
- Digits roll with `cubic-bezier(.2,.9,.25,1)` over 700 ms, each digit **staggered
  40 ms after the one to its right**, so the number cascades like a real odometer.
- Digit windows: `--ink` background, `--peach` DM Mono digits, a 1 px `--ink-3`
  divider between each, and a subtle horizontal gradient overlay
  (dark → transparent → dark) so the drums look cylindrical.
- On Home the odometer shows **lifetime minutes driven for other people**, with
  the label `MINUTES OF YOUR LIFE SPENT ON OTHER PEOPLE'S ERRANDS`. It counts up
  from 0 on every app open — that one animation is the app's handshake.

### 7.5 The scrolling road (the DRIVING screen)
Full-bleed canvas behind the live timer.
- A dark road surface in `--ink`, with a subtle noise texture.
- **Centre-line dashes** in `--peach` scrolling from top to bottom, in a slight
  perspective (dashes get shorter and narrower toward the top of the screen so it
  reads as a road receding to a horizon).
- Scroll speed is tied to elapsed time in a deliberately unrealistic, satisfying
  way: `speed = 120 + min(elapsedMinutes, 40) * 9` px/s. Long drives visibly rip.
- A warm horizon glow at the top: a `--rust` → transparent gradient band, as if
  driving into the sunset.
- Two soft `--coral` light streaks down the left and right edges (headlight
  spill), pulsing very slowly.
- **Cap the canvas at 30 fps** and stop the loop entirely on
  `visibilitychange → hidden`. This screen is on while he's driving; do not cook
  the battery.
- If `prefers-reduced-motion`, render the road static with no scroll.

### 7.6 Other visual components
- **Dockets (drive cards in the log).** Styled as supermarket receipts: `--bone`
  paper at 4% opacity over `--ink-2`, DM Mono, a **perforated top and bottom edge**
  (a repeating-radial-gradient notch pattern), the place name in caps, duration
  and km right-aligned like line items, and a coral or teal 3 px left spine for
  the category. Tags print as `#gym` in `--dust`.
- **The week ribbon (Home).** A horizontal strip of the last 7 days. Each day is a
  vertical stack of segments, one per drive, height proportional to duration,
  coloured by category. Empty days show a thin `--ink-3` baseline. Today's column
  is outlined in `--peach`. It should read instantly as "how much of my week was
  other people's errands".
- **The 24-hour dial (Insights).** A polar SVG chart: 24 spokes from a centre
  point, each spoke's length = total minutes driven in that hour of the day
  across all history, coloured by the dominant category. Hour labels at 12/3/6/9.
  It shows him at a glance that he's the family's 5pm delivery service.
- **The split bar.** One horizontal bar, coral vs teal, showing MILK RUN vs
  JOYRIDE minutes. Animated width on mount. The bigger number is labelled inside
  the bar; the smaller sits outside it.
- **Transitions.** Screens cross-fade over 220 ms with a 12 px upward slide. The
  finish sheet rises from the bottom with a slight overshoot
  (`cubic-bezier(.34,1.4,.64,1)`).

### 7.7 App icons
Generate `assets/icon-192.png`, `icon-512.png` and `icon-maskable-512.png`
yourself — write a tiny Node or Python script that draws them (or build them as
SVG and rasterise). Design: an `--ink` rounded square, a single `--coral` road
curving from bottom-left to top-right, a `--peach` sun disc at the top. Maskable
version keeps everything inside the safe 80% circle. Don't download an icon.

---

## 8. Screens & features

Five main screens reachable from a **bottom tab bar** (thumb-reachable, this is a
phone app first): **Home · Log · Map · Insights · Settings**. The tab bar hides
entirely on the DRIVING screen.

### 8.1 Home
- The odometer (7.4) with its label.
- The GO button (7.3). If a drive is live, this screen is skipped on boot.
- The week ribbon (7.6).
- Three small stat chips under the ribbon: **this week's minutes**, **drives this
  week**, **km this week**, each with a delta vs last week in `--teal` (down is
  good for milk runs, so: fewer milk-run minutes = teal, more = rust; be explicit
  about which direction is "good" per stat).
- The recovery card for a stale drive, when relevant (section 5).
- The home-coords setup card, on first run only.
- A **[+ Log a past drive]** text button (section 8.6).

### 8.2 The DRIVING screen
Full-bleed, no chrome. The scrolling road (7.5) behind:
- The elapsed timer, DM Mono, `clamp(72px, 22vw, 140px)`, `--peach`, centred,
  format `M:SS` under an hour and `H:MM:SS` over.
- Under it, small `--dust` caps: the start time, and the GPS status
  (`LOCATION LOCKED` / `NO LOCATION` / `FINDING YOU…`).
- At the bottom, a wide **HOME** button in `--rust`. **It requires a
  press-and-hold of 600 ms** with a filling ring — a single accidental tap in a
  pocket must not end the drive. Say so in tiny text: `HOLD TO END`.
- A `Screen can go off — the clock keeps running` line in `--dust`, so he trusts
  it. This is important; without it he'll leave the screen on and burn battery.

### 8.3 The FINISH sheet
Rises after the hold completes. Everything here is optional — a **[Save]** button
is always active, and the drive is *already saved* before the sheet appears.
- Big duration at the top, and the distance once routing lands (shimmer until then).
- **The category toggle** — the most important control. Two big halves of a
  segmented control: **MILK RUN** (coral, subtitle "someone asked") and
  **JOYRIDE** (teal, subtitle "yours"). Nothing is preselected on the first ever
  drive; after that, **default to whichever he picked last**, because errands
  come in runs.
- **Place field** — prefilled from section 6, tappable to rename.
- **Tags** — a text input that turns space/enter into chips, plus a row of his 6
  most-used tags as one-tap chips. New tags are remembered.
- **[Save]** closes the sheet and returns Home with a toast: *"Logged. 24 min."*
  and the odometer visibly rolling up if it was a milk run.

### 8.4 Log
Reverse-chronological dockets (7.6), grouped under sticky date headers
(`TODAY`, `YESTERDAY`, then `WED 19 AUG`).
- A filter row at the top: **All / Milk runs / Joyrides**, plus a tag filter chip
  row.
- Each docket header row shows the day's totals.
- Tap a docket → expands in place to show a mini map of that route, the exact
  times, and **[Edit]** / **[Delete]**. Edit opens the same finish sheet
  populated, including a duration stepper so he can correct a misfire.
- Delete asks once, and offers **[Undo]** in the toast for 6 s.

### 8.5 Map
A Leaflet map filling the screen.
- Tiles: **CARTO Dark Matter** —
  `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
  with the required attribution `© OpenStreetMap contributors © CARTO`.
  Then apply a CSS filter to the tile pane to warm it into the palette:
  `filter: sepia(.35) saturate(1.15) hue-rotate(-12deg) brightness(.85)`.
- **Every route ever driven** drawn as a polyline: milk runs in `--coral`,
  joyrides in `--teal`, both at 30% opacity and 3 px, so frequently-driven roads
  build up into a bright, glowing web of where he actually goes. This is the
  single best-looking screen in the app — make sure it earns that.
- **Place pins** as filled circles, radius `6 + min(visits, 20) * 0.8` px, in
  `--peach` with a `--coral` halo. Tap → a warm popup with the place name, visit
  count and total time.
- A **[Fit everything]** button, and a filter for All / Milk runs / Joyrides.
- When a drive finishes, if he opens the map, that route **draws itself** over
  1.2 s using `stroke-dasharray` animation. That's the reward moment.
- Empty state: the map still renders, centred on Sydney, with a line of text over
  it — *"No drives yet. Your city is blank."*

### 8.6 Quick-add (a past drive)
Three taps, no GPS. A sheet with: the category toggle, a duration stepper
(preset chips **5 / 10 / 15 / 20 / 30 / 45 / 60 min** plus ±5), a place field
(autocompleting from saved places), tags, and a date/time picker defaulting to
"an hour ago". `origin: 'quicklog'`. This is what saves him when he forgets — make
it fast and prominent, not buried.

### 8.7 Insights
- The split bar (7.6) — the headline.
- **A big honest number:** total hours ever spent on milk runs, phrased as
  *"You have spent 14 h 20 m of your life being sent to the shops."*
- The 24-hour dial (7.6).
- Records list, as dockets: longest drive · shortest · most-visited place ·
  busiest day of the week · biggest single day · furthest drive.
- **This week vs last week**, per category.
- **Top tags**, as a horizontal bar list.
- A **weekly wrap card** — a deliberately screenshot-shaped panel (9:16-ish) with
  the week's numbers, the ribbon, and the app name, plus a **[Save image]**
  button that renders it to a canvas and downloads a PNG. He'll put it in the
  family group chat, which is the best possible reminder mechanism.

### 8.8 Settings
- **Set / reset home location.**
- **Routines** → the routine editor (section 9).
- **Export data** (downloads `milk-run-backup-YYYY-MM-DD.json`) and **Import**
  (file picker, validates `schemaVersion`, asks *"Replace everything or merge?"*).
- **Put it on your phone** — the setup guide (section 10). Give this its own
  prominent card, not a footnote.
- Danger zone: **Delete all data**, typed confirmation.
- Version + a link to the README.

---

## 9. Routines — the TickTick-style recurring drives (`routines.js`)

This is the feature Zac asked for by name. Treat it like a real task app.

### 9.1 The engine
A routine generates Drive records automatically. Run `catchUp()` **on every app
open** and once a minute while open:

```
for each enabled routine:
  for each date D from (lastGeneratedFor + 1 day) to today, capped at 14 days back:
    if D's weekday is in routine.days:
      if now >= D at routine.timeOfDay:
        generate the outbound leg:
          startedAt = D at timeOfDay
          durationMs = legMinutes * 60000
        if routine.returnTrip:
          generate the return leg:
            startedAt = outbound.endedAt + returnOffsetMinutes * 60000
            durationMs = legMinutes * 60000
          (only if that start time is also <= now)
        mark both origin:'routine', routineId, and copy category/tags/placeLabel
  set lastGeneratedFor = today
```

**Edge cases (build exactly these):**
- **Never generate a leg in the future.** If it's Wednesday 6:00am and the gym
  routine fires at 6:30, generate nothing yet.
- **Never double-generate.** `lastGeneratedFor` plus an explicit check for an
  existing drive with the same `routineId` and the same calendar date guards this.
- **Cap the catch-up at 14 days.** If he doesn't open the app for two months, do
  not invent 40 gym drives. Generate the last 14 days and show a note: *"Only
  filled in the last two weeks."*
- If a routine's day/time is edited, **do not retroactively rewrite** drives
  already generated.
- Deleting a routine asks: *"Also delete the 23 drives it created?"* — default No.

### 9.2 Auto-logged drives in the UI
They enter the stats immediately (Zac chose auto-log, not confirm), but they must
be visibly distinguishable and one tap from being wrong-proofed:
- The docket shows a small **`AUTO`** stamp in `--dust` in the corner, angled 8°
  like a rubber stamp.
- Any auto drive from **today or yesterday** shows a **[Didn't go]** button right
  on the docket. Tapping it deletes **both legs** of that day's routine and shows
  *"Wiped. Both legs."* with an Undo.
- Home shows a dismissible line the first time a routine fires each day:
  *"Logged your gym run — 7 min each way. [Didn't go]"*

### 9.3 The routine editor (`ui/routinesUI.js`)
A proper editor, TickTick-grade:
- List of routines as cards: name, a **day-of-week pill row** with the active days
  filled in the category colour, the time, the leg length, and an enable/disable
  switch.
- **[+ New routine]** → a form: name · days (7 tappable pills) · time (native
  `<input type="time">`) · minutes per leg (stepper) · **return trip** toggle ·
  return offset (minutes, only shown if return trip is on) · category toggle ·
  tags · place name.
- A live preview line under the form, updating as he types:
  *"Every Wed & Fri at 6:30am — two 7-minute legs, 1h15 apart. 14 min a week."*
- Edit and delete on each card.

### 9.4 Seed data — ship with this routine already created
On first run, create exactly one routine:

| Field | Value |
|---|---|
| `name` | `Gym` |
| `enabled` | `true` |
| `days` | `[3, 5]` (Wednesday, Friday) |
| `timeOfDay` | `06:30` |
| `legMinutes` | `7` |
| `returnTrip` | `true` |
| `returnOffsetMinutes` | `75` |
| `category` | `joyride` |
| `tags` | `['gym']` |
| `placeLabel` | `The gym` |

Do **not** backfill history on first run — `lastGeneratedFor` starts as today, so
it begins from the day he installs it.

---

## 10. Getting it onto his phone (you must do this, it's not optional)

The whole app is pointless if it only runs on localhost. Two parts:

### 10.1 PWA
- `manifest.webmanifest`: `name: "Milk Run"`, `short_name: "Milk Run"`,
  `display: "standalone"`, `background_color: "#1C1512"`,
  `theme_color: "#1C1512"`, `orientation: "portrait"`, the three icons,
  and `start_url: "./?src=pwa"`.
- Also set `<meta name="apple-mobile-web-app-capable" content="yes">` and
  `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`.
- **Respect the iPhone notch and home indicator** — use `viewport-fit=cover` plus
  `env(safe-area-inset-*)` padding on the header and the tab bar. Zac has been
  bitten by this before; get it right.
- `sw.js`: cache the app shell (HTML/CSS/JS/icons/fonts) with a
  **cache-first, network-revalidate** strategy. Bump a `CACHE_VERSION` constant
  and delete old caches on `activate`. Never cache map tiles, OSRM or Nominatim
  responses. The app must fully open and log a drive with no network.

### 10.2 Deploy to GitHub Pages
Static, free, and doesn't touch his Netlify credits (he's had a blowout before).
- Create a **public** GitHub repo `Milk-Run`, push, and enable Pages on `main`.
  Use the `gh` CLI. This must be public for Pages to serve it.
- Verify the live URL loads before handing over.
- Add the live URL to the README and to the registry row.

### 10.3 The in-app "Put it on your phone" guide (Settings)
Write this out properly as real, followable steps, because this is what makes him
actually use it:
1. Open the live URL in **Safari** on the iPhone → Share → **Add to Home Screen**.
2. **Make the one-tap shortcut:** Shortcuts app → **+** → Add Action → **Open
   URL** → paste `<live-url>/?go=1` → name it **GO** → pick a coral icon →
   **Add to Home Screen**.
3. **Put it where his thumb already is:** long-press the home screen → **+** →
   **Shortcuts** widget → pick the GO shortcut. Now it's one tap from the home
   screen. Mention it can also go on the **Lock Screen** (iOS Lock Screen
   widgets) and be bound to **Back Tap** (Settings → Accessibility → Touch →
   Back Tap → Double Tap → Shortcuts → GO).
4. Show the URL with a **[Copy]** button right there in the app so he doesn't
   have to type it.

**Implement `?go=1`:** on boot, if the URL has `?go=1` and there is no live
drive, **start a drive immediately** and land on the DRIVING screen — no taps, no
confirmation. If a drive IS already live, just show the DRIVING screen (so a
double-tap of the widget is harmless, never a double-start). Then `history
.replaceState` the query string away so a refresh doesn't restart it.

Also implement **`?end=1`** the same way — ends the live drive and opens the
finish sheet — so he can make a second **HOME** widget. Two widgets side by side,
GO and HOME, is the fastest possible version of this app.

---

## 11. Making him not forget (build these, they're features not afterthoughts)

Zac's real risk is abandoning the app in a week. Everything below exists to stop
that; none of it is a notification, because a web app can't reliably send those
on iOS.

1. **The widget pair (10.3)** — one tap, no app opening, no thinking. This is the
   single biggest one.
2. **Quick-add in three taps (8.6)** — forgetting once must not mean a broken
   record. Make it prominent on Home.
3. **The stale-drive catcher (section 5)** — he'll tap GO and forget to tap HOME.
   The recovery card must be friendly and one tap to fix, never a scary error.
4. **A gap nudge on Home:** if the last drive was more than 4 days ago and there
   are at least 3 drives in history, show a soft `--dust` line: *"Nothing logged
   since Saturday. Missed a few? [Add them]"* → opens quick-add. Dismissible, and
   never shown twice in the same day.
5. **The growing number.** The odometer counting up on every open is a hook. It
   should feel like a meter running on the family's tab.
6. **The weekly wrap image (8.7)** — screenshot-to-group-chat is a social loop
   that makes logging worth it.
7. **Routines (section 9)** — the drives he takes every week log themselves, so
   the app is never empty even in a lazy week.
8. **A first-run tour**: three short cards on first open — *"Tap GO when you get
   in"*, *"Lock your phone, the clock keeps running"*, *"Tap HOME when you're
   back"*. Skippable, shown once.

---

## 12. Smoke check — run ONCE at the end, then hand over

Serve it (`python3 ~/scripts/serve-nocache.py ~/milk-run 5490`), open it, and
actually perform these. Fix what they surface. **Do not expand this into a
20-item self-audit** — the deep bug pass is the review model's job.

- [ ] Loads at localhost:5490 with **zero red console errors**.
- [ ] Tap GO → the DRIVING screen appears instantly, the timer counts.
- [ ] **Kill the tab entirely mid-drive, reopen** → it returns to the DRIVING
      screen with the correct elapsed time. (This is the load-bearing behaviour
      of the whole app — verify it properly.)
- [ ] Hold HOME → the finish sheet appears → save → the drive shows in the Log
      with a duration.
- [ ] `?go=1` starts a drive with no interaction; `?end=1` ends it.
- [ ] The Map screen renders tiles and draws at least one route or pin, and the
      empty state doesn't crash on a fresh profile.
- [ ] Insights renders with 0 drives, with 1 drive, and with several — no `NaN`,
      no `Infinity`, no divide-by-zero in any stat.
- [ ] A routine generates both legs on a matching day and does not double-generate
      when you reload the page five times.
- [ ] Export produces a valid JSON file and importing it back restores the same
      state.
- [ ] The live GitHub Pages URL loads on the public internet.

Then finish with your `## Known risks for review` list.

---

## 13. Handover to Zac (how to end your final message)

Keep it short and plain-English. Include:
- The local link **and** the exact command to start it later:
  `python3 ~/scripts/serve-nocache.py ~/milk-run 5490`
- The **live URL** for his phone.
- The three steps to add the GO widget (10.3), spelled out.
- Confirmation you added the `~/.claude/launch.json` entry, the
  `~/.claude/CLAUDE.md` registry row, and `milk-run` to `~/scripts/backup-all.sh`
  (**flagged PUBLIC**).
- **Do not commit at handover unless he asks** — commit at build milestones as you
  go, but the final "is it good?" commit is his call.
- Say it's **ready for him to test**, not that it's verified working.
- Your `## Known risks for review` list.
- One line: run `/code-review` next, or hand it to Opus Max / Fable High.
