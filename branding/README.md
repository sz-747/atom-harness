# Atom startup identity

## Launch

Run `atom.cmd` from a terminal or use the native PowerShell launcher `atom.ps1`.

Direct PowerShell alternative:

```powershell
& .\atom.ps1
```

The launcher's working directory is **the folder you launched from**, not this repository. It passes the absolute Atom startup extension path to Pi, so the dragon appears in any project without installing a competing global extension. Pi's own project trust checks and tools remain unchanged. The repository must stay at this path unless you update the user-local shim.

From File Explorer, a console is opened for the PowerShell process. From an existing terminal, Atom runs in that terminal, like `pi`. No execution-policy settings or PATH entries were changed.

## Build and preview (React + Ink / TypeScript)

The renderer uses **React 19 and Ink 7**, with TSX components in `ink-banner.tsx`. Dependencies are installed locally and locked in `../package-lock.json`.

From the repository root (Node 22+):

```powershell
npm ci
npm run build
npm run preview -- 120 48
```

`npm run build` first runs `npm run sample`, which reads `../atom-face.png` and writes `generated/face-data.ts`, then `scripts/build.mjs` bundles everything, React, Ink and Yoga included, into the single file `generated/header.mjs` (about 1.8 MB). Build once after replacing the reference or editing TSX, then restart `atom` or use `/reload`. The generated native-ESM header lets Ink/Yoga initialize normally without being transpiled through Pi's extension loader, and bundling Ink in matters for startup: resolving its dependency tree from `node_modules` costs Node hundreds of file opens (about two seconds on Windows), while the one file imports in a quarter of a second. Ink's optional `react-devtools-core` import is aliased to `stubs/react-devtools-core.mjs`, and a `createRequire` banner serves Ink's CommonJS dependencies. Reloads use the build timestamp to avoid stale module caching. Nothing is installed, sampled or compiled during normal startup.

Ink renders synchronously into **private in-memory streams**. Its React `Box`/`Text` tree lays out the artwork, then one cached frame is returned through Pi's existing header API. Ink never owns real stdin/stdout, patches the console, or starts a competing terminal UI. Every off-screen render unmounts and cleans up its Ink instance. Non-TUI modes do not load Ink.

## Exact artwork

The banner **is the reference image**, not a drawing of it:

1. `scripts/sample-face.mjs` (build time) crops `atom-face.png` to its artwork, box-filters it in linear light onto a 2:1 grid (785×304), quantizes the result to 256 colors with median cut, and stores the deflated palette indices in `generated/face-data.ts` (about 100 KB).
2. `face.ts` (runtime) area-averages that grid onto the terminal's own cell grid, so proportions hold for any terminal size and cell aspect. Each cell is split into a mosaic of sub-cells and becomes the block glyph plus pair of foreground/background colors that best reproduce its samples. The reference is bright ink on near-black, so every sample also keeps its **ink color** (its pixels weighted by brightness) next to the plain average: a thin whisker or cloud stroke is drawn in its own green instead of that green diluted with the black around it, and the lettering keeps the reference's lime-to-dark gradient. A sub-cell lights up once the ink covers at least 15% of it, and a cell's darker half only gets a background color where it is itself at least half ink (letter bodies, dense scales). Everything else stays transparent, so no fill is ever painted around a stroke or across the surrounding terminal.

Three mosaics exist, from finest to coarsest:

| `ATOM_BLOCKS` | Sub-cells | Glyphs | Default for |
|---|---|---|---|
| `octants` | 2×4 | Unicode 16 `BLOCK OCTANT-*` (U+1CD00–U+1CDE5) plus the older quarter, half and quadrant blocks | Windows Terminal (`WT_SESSION`), kitty, Ghostty, foot: they draw these glyphs themselves, whatever the font |
| `sextants` | 2×3 | Unicode 13 `BLOCK SEXTANT-*` (U+1FB00–U+1FB3B) | WezTerm |
| `quadrants` | 2×2 | `▘▝▀▖▌▞▛▗▚▐▜▄▙▟█` | everything else, since every block-capable font has them |

Set `ATOM_BLOCKS=octants|sextants|quadrants` to override the detection, for example when a terminal shows missing-glyph boxes (drop to `sextants` or `quadrants`) or is known to draw octants (raise it). Octants double the vertical detail of quadrants; at 200 columns the dragon's scales, whiskers and cloud strokes become individual marks instead of smears. Only Windows Terminal 1.24 with its built-in glyphs has been checked here; the other defaults follow those terminals' release notes and are not verified.

The composition, palette, dragon, clouds and gradient lettering therefore match the PNG at whatever resolution the terminal offers. The one deliberate departure is the eye, painted into the grid when it is loaded, in source pixels and supersampled so it scales with the rest of the dragon: `EYE` is a piercing white eyeball with a dark slit pupil over the reference's small yellow-green highlight; because the slit is only six source pixels wide, the sub-cell under the eye's center is pinned to the terminal background after resampling whenever the eye is at least two sub-cells wide, so the pupil survives narrow windows instead of being outvoted by the white around it. The banner fits **both** live terminal dimensions. Pi anchors a frame taller than the terminal to its bottom, which would push the top of the dragon into scrollback in any window that is not maximized, so the header measures Pi's own component tree (startup notes, warnings, editor, footer) and takes only the rows left free. It refits on every render until the first prompt starts the conversation, then only when the terminal is resized, so a growing conversation scrolls it away like any other output instead of shrinking it. Without a tree to measure it reserves eight rows. Below 64 columns the block lettering is unreadable, so its region is masked and the spaced caption (`B A S I L I X`) is centered where the lettering sits; extremely small windows fall back to the name alone.

### Wordmark

The lettering reads **BASILIX** by default. The PNG's blocks spell ATOM, so any other name is drawn by `face.ts` when the grid is loaded: the lettering box is cleared to the background and the name is set in a built-in block font (square-capped strokes, A–Z and space) in the reference's own gradient, read row by row off the ATOM blocks first, so the shading is the PNG's exact lime-to-dark. Letters fill the box's height; a long name is condensed to 85% of its natural width before it is made shorter instead. Set `ATOM_WORDMARK` to try another name (`ATOM_WORDMARK=ATOM` shows the reference's own lettering untouched); the default lives in `DEFAULT_WORDMARK` in `face.ts`. The caption under 64 columns follows the same name.

Full-color, 256-color (nearest cube/gray index), standard green, and `NO_COLOR` modes are supported. Without color, two-tone cells become `░▒▓` shading and edge glyphs keep their shape. Every painted run ends with a full SGR reset.

## Files and editing

- `../atom.ps1`: native PowerShell launcher; preserves working directory, arguments, exit status.
- `../atom.cmd`: compatibility entrypoint to PowerShell.
- `../.pi/extensions/atom-startup.ts`: one Pi header component, only in TUI mode; hands it Pi's TUI (live terminal size and component tree) and settles it at the first prompt.
- `../scripts/sample-face.mjs`: build step; crop, grid scale, palette size and the wordmark box (source pixels) live at the top. `../scripts/png.mjs` is its dependency-free PNG reader.
- `../scripts/build.mjs`: the esbuild bundling step (single-file output, devtools stub alias, require banner). `stubs/react-devtools-core.mjs` is the stub it aliases in.
- `generated/face-data.ts`: generated grid, palette and wordmark box. Never edit; rebuild instead.
- `face.ts`: grid decoding, area resampling with ink colors, the octant/sextant/quadrant glyph tables, terminal detection and `ATOM_BLOCKS`, two-color cell selection, the eye overlay (`EYE`) and pupil pin, the block font and wordmark painter (`DEFAULT_WORDMARK`, `ATOM_WORDMARK`), caption overlay. The tunables live at the top: the transparent threshold (anything darker, near-black in the reference, is left to the terminal's own background), the flat threshold, `GAIN` (ink keeps its full color from 1/GAIN coverage up; sparser strokes dim in proportion), the minimum coverage that lights a sub-cell, and the coverage a cell's darker half needs before it is painted as a background.
- `ink-banner.tsx`: React `AtomBanner` / `ArtworkRow` components and isolated Ink frame capture.
- `atom-wordmark.ts`: layout, size selection, caption threshold, fitting around the rows Pi's other components occupy, cached rendering. Cache includes height, width, reserved rows, color mode and glyph set.
- `theme/forest.ts`: color-mode detection and exact-color painting for each terminal tier.
- `../atom-face.png`: the visual reference; read only by the build step.

No Pi core changes, image protocols, full-terminal background fills, animations, or runtime network calls. React and Ink are the runtime dependencies for this renderer.

## Verification

```powershell
npm test
npm run preview -- 80 32
npm run preview -- 120 48
atom --offline --no-session
```

Tests use Node 24+, installed Pi, and the local TypeScript compiler. Nothing is downloaded during tests. They cover strict TS/TSX typing, that the generated grid matches the PNG's linear-light block means and brackets the lettering, that the pupil shows through at 100 and 120 columns, that the wordmark name is normalized and drawn in the reference's gradient, the three glyph tables against Unicode's code point order, terminal detection and the `ATOM_BLOCKS` override, that each mode only emits its own glyphs, actual extension loading, one header, non-TUI guards, widths 0–200, height-only resizing, narrow caption rendering, centering, bounds, the lettering box being drawn, the banner fitting around Pi's own rows and settling at the first prompt, color tiers/resets, two-tone cell density and color range, transparent negative space, off-screen stream isolation, listener cleanup, and cache invalidation.

## Architecture reference

Studied Hermes' `ui-tui/src/banner.ts`, `components/branding.tsx`, `theme.ts`, `entry.tsx`, and `components/appLayout.tsx`. Adapted the artwork/palette/component separation, transparent spaces, and edge margins to Pi's native component API. No Hermes artwork, branding, or theme implementation was copied.
