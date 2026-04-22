# Stealth Autoloader — Mainsail Integration

## Project Goal
Add a Stealth Autoloader panel to Mainsail (https://github.com/mainsail-crew/mainsail).
This panel shows live filament path status, per-path material/color, sensor states,
and provides one-click load/unload triggers — all from the Mainsail web UI.

This is a custom Vue 3 panel added to a fork of Mainsail. It must fit Mainsail's
existing architecture: Vuex store, Moonraker websocket subscription, and the
existing component/panel conventions.

---

## Reference Links — Read These First

| Resource | URL |
|---|---|
| Mainsail source (this repo) | https://github.com/Cstm3DBldr/mainsail |
| Mainsail upstream | https://github.com/mainsail-crew/mainsail |
| Mainsail dev docs | https://docs.mainsail.xyz/development/introduction |
| Moonraker API reference | https://moonraker.readthedocs.io/en/latest/web_api/ |
| Moonraker objects/subscribe | https://moonraker.readthedocs.io/en/latest/printer_objects/ |
| Vue 3 composition API | https://vuejs.org/guide/introduction.html |
| Vuex 4 | https://vuex.vuejs.org/ |

---

## Printer & API Access

- **Printer IP:** 192.168.1.214
- **Moonraker base URL:** `http://192.168.1.214`
- **Klipper object query:** `GET /printer/objects/query?stealth_autoloader`
- **Klipper object subscribe:** Moonraker websocket `printer.objects.subscribe`
  with `{"stealth_autoloader": null}`
- **Execute gcode:** `POST /printer/gcode/script` body: `{"script": "SA_LOAD TOOL=0"}`
- **Moonraker websocket:** `ws://192.168.1.214/websocket`

---

## stealth_autoloader Object — Full Status Shape

This is the exact JSON returned by `/printer/objects/query?stealth_autoloader`:

```json
{
  "stealth_autoloader": {
    "num_paths": 6,
    "current_path": 0,
    "servo_engaged": false,
    "path_states": ["loaded","empty","empty","empty","empty","empty"],
    "encoder_dist": [823.4, -1.0, -1.0, -1.0, -1.0, -1.0],
    "entry_filament": [true, false, false, false, false, false],
    "toolhead_filament": [true, false, false, false, false, false],
    "extruder_filament": [true, false, false, false, false, false],
    "filament_loaded": [true, false, false, false, false, false],
    "selector_position": 0.0,
    "path_materials": ["PLA","","","","",""],
    "path_brands": ["Bambu","","","","",""],
    "path_product_lines": ["Basic","","","","",""],
    "path_color_names": ["Bambu White","","","","",""],
    "path_color_hexes": ["FFFFFF","","","","",""],
    "path_load_temps": [200, 200, 200, 200, 200, 200],
    "path_unload_temps": [185, 185, 185, 185, 185, 185],
    "feed_speed": 50.0,
    "purge_length": 30.0,
    "nozzle_distance": 50.0,
    "bowden_lengths": [823.0, 800.0, 800.0, 800.0, 800.0, 800.0],
    "selector_positions": [0.0, 21.0, 42.0, 63.0, 84.0, 105.0],
    "encoder_mpp": [1.4823, 1.4823, 1.4823, 1.4823, 1.4823, 1.4823],
    "drive_rotation_distance": 5.7486,
    "cal_state": "",
    "cal_path": -1,
    "cal_prompt": ""
  }
}
```

### Field Notes
- `path_states` values: `"loaded"` | `"empty"` | `"partial"` | `"unknown"`
- `num_paths` is dynamic (1–32). All per-path arrays have exactly `num_paths` elements.
- **Never hardcode 6 paths.** Always use `num_paths` to slice arrays.
- `entry_filament[n]` — filament present at the roll-feed entry of path N (autoloader end)
- `extruder_filament[n]` — filament at toolhead entry, before extruder gears
- `toolhead_filament[n]` — filament past extruder gears, entering hotend
- `path_color_hexes[n]` — hex string without `#`, e.g. `"1A2B3C"`. Empty string = no profile.
- `cal_state` non-empty means calibration is in progress; `cal_prompt` has the current prompt text.

---

## GCode Commands (sent via `POST /printer/gcode/script`)

| Command | Effect |
|---|---|
| `SA_HOME` | Home selector to physical endstop |
| `SA_SELECT TOOL=N` | Move selector to path N |
| `SA_LOAD TOOL=N` | Full load sequence for path N |
| `SA_UNLOAD TOOL=N` | Full unload sequence for path N |
| `SA_STATUS` | Print all path states to console |
| `SA_RESPOND VALUE=x` | Respond to active calibration prompt |

---

## What to Build

### Phase 1 — Status Panel (read-only)
A collapsible Mainsail panel card (`SAStatusPanel.vue`) showing:
- A row per path (T0–TN): color swatch, material name + brand, state badge, 3 sensor dots
- Active path highlight (`current_path`)
- State badge colors: `loaded`=green, `partial`=orange, `empty`=grey, `unknown`=amber
- Sensor dots (entry / extruder / toolhead): filled when active, hollow when not
- Responsive — wraps gracefully at narrow widths
- Color swatch uses `path_color_hexes[n]` with `#` prefix; grey placeholder when empty

### Phase 2 — Action Buttons
Below or alongside the status rows:
- Path selector: clicking a path row selects it (highlighted border)
- LOAD / UNLOAD buttons with correct disabled logic:
  - LOAD disabled when: `path_states[n] === 'loaded'` OR `path_color_hexes[n] === ''`
  - UNLOAD disabled when: `path_states[n] === 'empty'`

### Phase 3 — Calibration Banner
When `cal_state` is non-empty: show a dismissible banner at top of panel with:
- `cal_prompt` text displayed prominently
- Text input + RESPOND button — sends `SA_RESPOND VALUE=<input>` via gcode API

---

## Mainsail Architecture — Strict Rules

1. **Read before writing.** Before creating any file, read these in the repo:
   - `src/store/index.ts` — module registration
   - `src/store/modules/printer/` — entire directory (websocket subscription pattern)
   - One existing panel component from `src/components/panels/`
   - `src/plugins/moonraker/` or wherever the websocket/HTTP client lives

2. **Store module:** Create `src/store/modules/sa/` following the exact same
   structure as `src/store/modules/printer/`. Subscribe to `stealth_autoloader`
   via the existing Moonraker socket infrastructure — do NOT open a second socket.

3. **Component:** `src/components/panels/SAStatusPanel.vue`
   Register it wherever other panels are registered for the dashboard.

4. **TypeScript required.** All new files `.ts` or `.vue` with `<script lang="ts">`.
   Define `interface SAStatus` in `src/types/sa.ts` matching the JSON shape above exactly.

5. **Vuetify only.** Use `v-card`, `v-chip`, `v-btn`, `v-row`, `v-col` etc.
   No external CSS libraries. Match the existing Mainsail dark theme colors.

6. **Partial update merging.** Moonraker sends partial diffs on `notify_status_update`.
   Merge into existing state — do NOT replace the whole object.
   Example: if only `path_states` changes, keep all other fields intact.

7. **Panel opt-in.** Panel must appear in Mainsail's dashboard layout picker so users
   can add/remove/reposition it. Follow the exact registration method other panels use.

8. **GCode helper.** Add a Vuex action `saGcode(script: string)` that uses the
   existing Moonraker HTTP client in Mainsail. No raw fetch/axios calls from components.

9. **No hardcoded path count.** Use `v-for="i in saStatus.num_paths"` everywhere.

10. **Never modify** `src/store/modules/printer/` existing mutations or actions.
    Only add a new parallel `sa` module.

---

## Dev Setup

```bash
# From your cloned fork root
npm install

# Point dev server at the printer
echo "VITE_APP_MOONRAKER_URL=http://192.168.1.214" > .env.development.local

# Hot-reload dev server
npm run dev
# Browser: http://localhost:4173 (proxied to printer)

# Production build
npm run build
# Output: dist/

# Deploy to printer
scp -r dist/* pi@192.168.1.214:~/mainsail/
```

---

## Iteration Rules

- **After every change:** run `npx tsc --noEmit` — zero TypeScript errors before committing.
- **After store changes:** verify existing Mainsail panels (temperatures, print status) still work.
- **Never modify** existing Mainsail source files unless adding a single registration entry.
- **Commit convention:** `feat(sa): ...` / `fix(sa): ...` / `refactor(sa): ...`
- **One logical change per commit.**
- **If an upstream interface changed:** check `git log upstream/develop -- <file>` before adapting.
- **Panel must survive** being removed from the dashboard without errors or console warnings.

---

## Hardware Context

- **Printer:** Voron StealthChanger with 6 independent toolheads (T0–T5)
- **Tool changes** (swapping active head) are handled by the toolchanger — NOT this system
- **This system** only loads/unloads filament: when a roll runs out, or for manual color swap
- **ONE shared drive motor** and ONE selector motor serve all paths
- **Each toolhead** has its own extruder motor and hotend (BTT EBB36 CAN board per toolhead)
- **Bowden tube** runs from the central drive gear to each toolhead (~800mm per path)
- The autoloader is entirely self-contained and does not interfere with active printing

---

## First Task for Claude Code

1. Read this entire CLAUDE.md
2. Read all files listed under "Mainsail Architecture — Strict Rules" step 1
3. Report: what is the exact pattern Mainsail uses to subscribe to Moonraker printer
   objects and deliver live updates to Vue components? Show the key files and lines.
4. **Do not write any new code until step 3 is approved.**