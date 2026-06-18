# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

This is a static PWA — no build step or package manager. Open `index.html` directly in a browser, or serve it with any static file server:

```sh
python3 -m http.server 8080
# or
npx serve .
```

The Service Worker (`sw.js`) requires HTTPS or localhost. On plain `file://`, offline caching won't work but the app still runs.

## Architecture

**Tech stack:** Vanilla JS (ES Modules), IndexedDB via Dexie.js, no framework, no bundler.

**Entry point:** `index.html` → `js/app.js` (ES module). `app.js` initializes the DB and owns a hash-based router (`#home`, `#team`, `#gameSetup`, `#game`, `#history`). The `navigate(route, params)` function is also exposed as `window.__navigate` for views that need to trigger navigation imperatively.

**Layers:**
- `js/db.js` — all IndexedDB access via Dexie. `initDB()` must be called once before any DB operation. DB name: `BaseballScorebook`, currently at schema version 2.
- `js/models/state.js` — pure event-sourced state engine. `computeGameState(events, game, members, opponentScores, upToOrder?)` replays the full event log to produce the current game state (outs, runners, score, batter index, etc.). This is the most critical file to understand when touching game logic.
- `js/views/*.js` — one file per screen. Each exports a `render*()` function that receives `(container, navigate, params)` and writes directly to `container.innerHTML`.
- `js/utils/constants.js` — canonical enums for at-bat results (`AT_BAT_RESULTS`), play actions (`PLAY_ACTIONS`), bases, positions, and helper predicates (`isHitResult`, `isOutResult`, `isOnBaseResult`).
- `js/utils/helpers.js` — DOM utilities, toast notifications, and formatting helpers.

## Data Model

All game events are append-only, stored as two separate Dexie tables sorted by `order`:

- **`atBats`** — one row per plate appearance: `gameId`, `inning`, `side`, `order`, `batterId`, `result`, `rbiProduced`, `fieldDirection`, `specialFlags`, `note`.
- **`plays`** — one row per baserunning/pitching event: `gameId`, `inning`, `side`, `order`, `relatedAtBatId`, `action`, `runner`, `runnerId`, `resultStatus`, `note`.

`getAllEvents(gameId)` in `db.js` merges and sorts both tables by `order`. State is never stored — it is always recomputed from scratch via `computeGameState()`.

`side` values are `'top'` / `'bottom'`. `isHome` on the game record controls which side is the team's attacking half.

## Key Behaviors to Know

- **Detailed mode only:** `atBat.mode` can be `'simple'` or `'detail'`, but the UI currently always records in detail mode. Simple mode auto-advances runners; detail mode defers runner movement to explicit `play` events.
- **3-out handling:** After the third out, `pitcherStats` are recorded, followed by a system `play(action: "pitcherStats")` and an inning-change marker play. `state.halfInningEnded` signals this boundary.
- **Dropped third strike:** Detected via `specialFlags.droppedThirdStrikeSuccess === true` or the legacy `[DROPPED_THIRD_STRIKE_SUCCESS]` substring in `note`.
- **Wild pitch / passed ball / balk advancing two bases:** Encoded as `[ADVANCE_TWO]` substring in the play's `note` field.
- **Schema migration:** DB is at version 2. `pitcherStats` gained `inning`/`side` indexes in v2. Legacy records without these fields are handled with null-coalescing in `getPitcherStats()`.
