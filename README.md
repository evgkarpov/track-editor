# GNSS Track Editor

A local browser-based editor for building reusable motorsport track definitions from GNSS data.

The editor combines a GNSS-derived reference path with a satellite basemap and manual track metadata. It can define:

- the final Start/Finish line;
- any number of timing sectors;
- arbitrary corner IDs such as `T3A` / `T3B`;
- corner Start / Apex / End stations;
- generated entry and exit gates;
- generated corner analysis polygons;
- the GNSS median reference path itself.

The app runs as static HTML/CSS/JavaScript. GNSS CSV processing happens in the browser.

## Languages

The UI supports:

- English — default;
- Russian.

Use the **Language** selector in the top-right corner. The selected language is stored in browser `localStorage` and restored on the next launch.

Project files and exported `TrackDefinition` data are language-independent. Source documentation is maintained in English.

## Quick start with the included PIR sample

1. Extract the ZIP.
2. Open `index.html` in Chrome, Edge, or Safari.
3. Portland International Raceway is already loaded.
4. The reference path is a median GNSS trajectory built from selected fast laps in `trk0008.csv`.
5. Set or adjust the final Start/Finish line.
6. Choose the number of sectors and place the sector split lines.
7. Mark each corner with Start → Apex → End.
8. Export the completed `TrackDefinition`.

The editor automatically stores the current PIR markup in browser `localStorage`.

## Workflow for a new track

### 1. Load a GNSS CSV

The CSV must contain:

- `lat`
- `lon`

Recommended columns:

- `millis`
- `speed_kmh`
- `fix`

### 2. Set the temporary detection Start/Finish line

Click **Set detection S/F**, then click a clean point on the real GNSS trajectory near the start/finish straight.

This line is used only to split the raw session into laps.

### 3. Detect laps

Click **Detect laps**. Review the detected lap list and keep the clean laps selected.

### 4. Build the GNSS reference

Click **Build median reference**.

The editor resamples the selected laps, builds a median trajectory, smooths it, and stores distance along the reference path as `s`.

### 5. Define final timing

The final timing definition is independent from the temporary detection line.

Set:

- the final Start/Finish station;
- the number of sectors, from 1 to 20;
- the required split lines.

For `N` sectors, the editor needs `N - 1` internal split lines:

- 1 sector: S/F → S/F;
- 2 sectors: S1 end, then S2 ends at S/F;
- 3 sectors: S1 end + S2 end, then S3 ends at S/F;
- 4 sectors: S1 end + S2 end + S3 end, then S4 ends at S/F.

Timing lines snap to the reference path and are generated perpendicular to the local path tangent.

The export includes:

- `timing.startFinish`
- `timing.sectorCount`
- `timing.sectorSplits`
- derived `timing.sectors`
- sector lengths
- expected crossing heading for each timing line

### 6. Define corners

For each corner, place:

- **Start** — beginning of the corner analysis zone;
- **Apex** — manual reference apex station;
- **End** — end of the corner analysis zone.

Start is intentionally not the braking point. Braking point, actual apex, trail braking, yaw behavior, and similar lap-specific values should be derived later from GNSS + IMU telemetry.

The editor generates:

- `entryGate`
- `exitGate`
- `analysisPolygon`

from the manual Start / Apex / End definition.

## Corner naming

Corner IDs are not restricted to integer turn numbers.

Built-in presets:

- **PIR**: `T1` … `T12`
- **Pacific Raceways**: `T1`, `T2`, `T3A`, `T3B`, `T4`, `T5A`, `T5B`, `T6`, `T7`, `T8`, `T9`, `T10`

You can also add, rename, or delete arbitrary corner IDs. Export preserves explicit `cornerOrder`.

## Satellite basemap

The background uses Esri World Imagery.

Features:

- satellite layer on/off;
- adjustable imagery opacity;
- GNSS, timing lines, gates, and zones rendered in geographic alignment with the basemap;
- optional ArcGIS access token;
- public imagery fallback when no token is configured.

Satellite imagery requires an internet connection. GNSS editing continues to work if imagery is unavailable.

The optional ArcGIS token is stored only in browser `localStorage`.

### Camera-lock behavior

The satellite layer and GNSS overlay use the same camera transform.

Loaded tiles are repositioned on every render, including during zoom-level transitions. Older imagery may temporarily appear at lower resolution while replacement tiles load, but it remains geographically locked to the GNSS geometry.

## Controls

- mouse wheel — zoom;
- drag empty map area — pan;
- drag timing marker — move timing station along the reference path;
- drag corner marker — move Start / Apex / End along the reference path;
- `1` — Set Start mode;
- `2` — Set Apex mode;
- `3` — Set End mode;
- `Esc` — cancel the current placement mode.

## Project persistence

**Save project** exports an editor project that can be imported later.

The project stores:

- reference path;
- selected/raw lap display data;
- timing markup;
- corner order and corner markup;
- gate / analysis settings.

For the included PIR sample, markup is also automatically persisted in `localStorage`.

## TrackDefinition export

`Export TrackDefinition` produces a JSON track definition containing:

- track metadata;
- GNSS median reference path;
- final Start/Finish line;
- sector split lines;
- derived sector definitions and lengths;
- ordered corner definitions;
- Start / reference apex / End station values;
- geographic timing and corner gates;
- analysis polygons.

The editor validates incomplete timing and corner markup before export, while still allowing an explicit partial export when required.

## Files

- `index.html` — application shell and static UI;
- `styles.css` — application styles;
- `i18n.js` — English and Russian UI translations;
- `app.js` — editor logic;
- `sample_data.js` — preprocessed PIR sample reference data;
- `assets/trk0008.csv` — source PIR GNSS session;
- `assets/portland_turn_guide.jpg` — visual turn-numbering guide only; it is not used for georeferencing.

## Privacy and data handling

GNSS CSV parsing and track editing happen in the browser.

The editor does not upload GNSS session data to an application backend. Satellite tiles are requested from the configured Esri imagery service when the satellite layer is enabled.
