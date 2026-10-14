# 5 in 1 Solitaire — web app

A from-scratch web recreation of the PSP Minis game **5 in 1 Solitaire** (`NPUZ00086`):
**Klondike, Spider, FreeCell, Golf and Gaps**, rendered up to **4K (3840×2160)** and as fast as your display
allows (**60 / 120 / 144 Hz…**). No dependencies, no build step.

## Run

```bash
npm start            # http://localhost:8080  (or open index.html with any static server)
npm test             # headless Chromium: rules, random playouts, real mouse drag & drop, screenshots
```

Controls: drag cards · double-click / right-click = auto-move · click stock to draw · `U` undo · `H` hint ·
`P`/`Esc` pause · `R` reshuffle (Gaps) · `F` performance overlay. Menus work with mouse, touch or arrow keys + Enter.
Installable as an offline PWA.

## Two versions

| | Page | What it is |
| --- | --- | --- |
| Remake | `index.html` | Re-implementation with generated graphics/audio, 4K rendering and up to 120 fps |
| **Original** | `psp.html` | The **real game** running in a PSP emulator (PPSSPP compiled to WebAssembly) in the browser — 1:1, not a remake |

### Running the original (`psp.html`)

**Do not double-click `psp.html`** — browsers block the emulator on `file://`. Start the bundled server first:
`sh start.sh` (Linux / Steam Deck), `start.bat` (Windows) or `python3 serve.py`, then open the `psp.html` address it prints (normally <http://localhost:8080/psp.html>; if port 8080 is busy it picks the next free one).

```bash
npm run setup:psp    # downloads PPSSPP-wasm + EmulatorJS from npm into psp/emulatorjs/ (not committed; GPL)
npm start            # serves with the COOP/COEP headers the multi-threaded emulator needs
# open http://localhost:8080/psp.html and choose your own .iso/.cso (read locally, never uploaded)
```

* Works with the USA (`NPUZ00086`) and Europe (`NPEZ00384`) dumps; the game's assets are identical, only the encrypted `EBOOT.BIN` differs.
* The game itself is not included in this repo; you supply your own copy.
* Static hosting (e.g. GitHub Pages) works too: `coi-sw.js` adds the required headers via a service worker.
* The original renders at the PSP's native 60 fps. The resolution selector (native … 4K) sets PPSSPP's internal render resolution. A real GPU is needed for the higher settings.
* Default keys: arrows = D-pad, X = ✕, Z = ○, S = □, A = △, Enter = Start, V = Select.
* Verified headless (software GL): the emulator identifies the game, boots it and accepts keyboard input through the save-data prompt to the profile screen. Not verified: real-GPU speed at 4K, audio by ear, a full game session.

## What was recreated from the game (remake)

The `.cso` was decompressed and its file tree inspected. `EBOOT.BIN` is encrypted (`~PSP`), so the code could
not be read; the structure was rebuilt from the asset inventory plus standard rules:

| From the disc | In this app |
| --- | --- |
| `CARD_KLONDIKE/SPIDER/FREECELL/GOLF/GAPS/OPTIONS`, `GAME_MENU_*` | Main menu with the five games + Options |
| `GAME_SELECT_NEWGAME/TUTORIAL` | Game-select screen: New Game / Tutorial |
| `KLONDIKE_OPTIONS_DRAWCARDS/TIMEDGAME/AUTOPLAY` | Draw 1/3, timed game, autoplay |
| `SPIDER_OPTIONS_SUITS` | 1 / 2 / 4 suits |
| `GOLF_OPTIONS_LOOPSTACKS` | Loop stacks (K↔A) |
| `GAPS_OPTIONS_RANDOMSHUFFLE`, `RESHUFFLE` | Reshuffle button (2 per game), random-shuffle option |
| `BACKGROUND_*` (7), `CARDBACK1-7` | 7 backgrounds, 7 card decks |
| `AUDIO_OPTIONS_*`, `PROFILE_OPTIONS_*`, `STATS_SCREEN` | Music/SFX sliders, erase profile/stats, statistics |
| `PAUSE`, `GAME_UNDO_O`, `GAMEOVER_QUIT`, `FIREFLY.VAG` | Pause menu, undo, game-over dialog, firefly particles |
| `PIC1.PNG` look (blue gradient + black flourish with suit glyphs) | Menu/table backdrop |

**No copyrighted assets are included.** Every card, background, icon, sound effect and the music are generated in code
(Canvas2D vectors and Web Audio synthesis).

## Rules implemented

* **Klondike** – draw 1 or 3, unlimited recycles, Windows-style scoring, optional timed scoring (−2 / 10 s, time bonus), autoplay when solved.
* **Spider** – 1/2/4 suits, 5 stock deals (blocked while a column is empty), same-suit run moves, completed K→A runs removed (+100, −1 per move).
* **FreeCell** – 4 cells, move-limit `(cells+1)·2^emptyColumns`, optional safe auto-move to foundations.
* **Golf** – 7×5 columns, ±1 rank onto the waste, optional K↔A looping, score = cards left.
* **Gaps** – aces removed, 4 gaps, next-rank-same-suit rule, 2 reshuffles that keep sorted runs.

## Performance design (4K @ up to 120 fps)

* `requestAnimationFrame` loop → follows the display's refresh rate; optional limiter (30/60/120) and an overlay (`F`) with FPS, frame time, render cost, canvas size and detected Hz.
* Render resolution option: Native, 1080p, 1440p or **4K** (the 16:9 table is rendered at that height and scaled to the window).
* Card faces/backs/slots are rendered **once** into cached sprites at the exact output resolution; a frame is just a few dozen `drawImage` calls. Stacks only draw their top cards; the background is a cached bitmap; menus are GPU-composited DOM.
* Frame-rate independent animation (exponential smoothing), nothing allocated per frame, and the loop skips drawing when nothing is animating (fireflies off).

Measured in this repo's CI sandbox with **software rendering only (no GPU)**: render cost ≈ 0.2 ms/frame at 1080p and ≈ 8 ms/frame at 3840×2160, so a real GPU has a lot of headroom for 120 fps at 4K. Actual refresh rate is determined by your monitor and browser.
