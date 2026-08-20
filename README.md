# HOURS

Every drive you take, logged in one tap.

Tap **GO** as you get in the car. Lock the phone and drive. Tap **HOME** when
you're back. HOURS works out how long you were gone, where you went, and how far
you drove — then files it as **SENT** (someone asked you to go) or **CHOSE**
(your own drive).

Built for a P-plater who can't touch the phone while driving.

---

## Run it

```bash
python3 ~/scripts/serve-nocache.py ~/hours 5490
```

Then open **http://localhost:5490**.

Live on your phone: **https://zaclowe685-hash.github.io/Hours/**

## How the stopwatch survives a locked phone

A web page can't record GPS in the background on iOS — the moment Safari is
backgrounded, JavaScript stops. So HOURS doesn't try.

Instead it writes **one timestamp** when you tap GO. Elapsed time is always
`now − that timestamp`, worked out fresh every time the page wakes up. Lock the
phone for three hours, kill the tab, restart it — the clock is still exactly
right, because nothing was ever counting.

The route works the same way: **two GPS fixes**, one at each end, and the road
route between them is looked up afterwards from OSRM. That's why distances show
a `~` and the app calls it the *likely road route* — it's a reconstruction, not
a recorded trace.

## The two widgets (this is the point)

In the Shortcuts app, make two shortcuts using **Open URL**:

| Shortcut | URL |
|---|---|
| **GO** | `https://zaclowe685-hash.github.io/Hours/?go=1` |
| **HOME** | `https://zaclowe685-hash.github.io/Hours/?end=1` |

Add both to the home screen (or a Shortcuts widget, the Lock Screen, or Back
Tap). Tapping GO starts a drive with no further taps. Tapping it twice does
nothing bad.

## Routines

Drives you always take log themselves. One ships with the app: **Gym, Wednesday
and Friday, 6:30am, 7 minutes each way, back 75 minutes later.** Edit it in
Setup → Routines. Auto-logged drives carry an `AUTO` stamp and a **Didn't go**
button for a day, which wipes both legs.

## What's in here

```
index.html            the shell
css/theme.css         the palette — every colour in the app is defined here
js/store.js           localStorage schema, CRUD, migrations, export/import
js/drive.js           the GO / DRIVING / HOME state machine
js/geo.js             GPS, OSRM routing, haversine, reverse geocoding
js/places.js          saved places, destination naming
js/routines.js        recurring drives + catch-up
js/stats.js           every derived number, pure functions
js/ui/                one file per screen, plus shared widgets
tools/check.mjs       imports, service-worker cache list, palette check
tools/make-icons.py   draws the app icons (no image files were downloaded)
```

Checks:

```bash
node tools/check.mjs
```

## Your data

Everything lives in `localStorage` on the device, under one key (`hours.v1`).
Nothing is uploaded anywhere. **Setup → Export** writes a JSON backup; Import
takes it back, merging or replacing.

The only things that leave the device are two GPS pins per drive, sent to
[OSRM](https://project-osrm.org/) for the route and to
[Nominatim](https://nominatim.openstreetmap.org/) to name the destination. Map
tiles come from CARTO. No API keys, no accounts, no billing.

## Notes

- Deployed on **GitHub Pages** from a **public** repo — that's required for
  Pages, and it must stay public or the phone version goes dead.
- Map data © OpenStreetMap contributors, tiles © CARTO.
