# Mainsail panel plugin — starter

A working panel you can copy to build your own. It reads live printer state,
sends g-code, ships its own translations, and builds to a single file that
Mainsail loads at runtime.

Requires a Mainsail with custom-panel support. On a stock release the
registration means nothing and no panel appears.

## Quick start

```bash
cp -r plugins/ExamplePanelPlugin plugins/MyPanel
cd plugins/MyPanel && npm install && npm run build
```

Then rename things in three places — `name`/`main` in `package.json`,
`lib.name`/`fileName` in `vite.config.ts`, and the class name plus the
`Panels.<name>` prefix on the translation keys. Serve `dist/my-panel.js`
somewhere the browser can reach and register it (below).

## Every file, and what it is for

| File | What it does |
|---|---|
| `src/MyPanel.vue` | The panel. Start here. |
| `src/main.ts` | Entry point. Must `export default` the component — the host reads `module.default` and shows an error if it is missing. |
| `src/locales/index.json` | Your translations, merged into Mainsail's i18n in `created()`. |
| `vite.config.ts` | Build config. The aliases and the CSS inlining both matter — see below. |
| `tsconfig.json` | Needs `experimentalDecorators: true`. Without it decorators are emitted untranspiled and the browser cannot parse the bundle. |
| `shims/host-runtime.js` | Reads Mainsail's shared runtime off `window`. |
| `shims/vue.js`, `shims/vue-class-component.js`, `shims/vue-property-decorator.js` | Re-export the host's copies so your `import` statements resolve without bundling a second Vue. |
| `package.json` | Deps are `devDependencies` — none of them are bundled. |

### `src/MyPanel.vue`

Write it exactly like a component inside Mainsail: class syntax, `@Component`,
`@Prop`. That works because of the shims, and it is what Mainsail's own
`AGENTS.md` asks contributors to use.

The host passes three props:

| Prop | What it is |
|---|---|
| `panelConfig` | Your registration entry, so a panel can be configured per instance. |
| `panelStore` | Mainsail's Vuex store — printer state, and `dispatch` for actions. |
| `panelSocket` | The Moonraker websocket, for calls with no store action. |

`$store`, `$socket`, `$i18n` and `$vuetify` also resolve, because the plugin
renders inside Mainsail's component tree. The props are the contract though —
prefer them.

Do **not** wrap your content in `<panel>`. The host already draws the card,
title, icon and collapse control from your registration; wrapping gives you
two nested cards. Start at `<v-card-text>`.

Every `v-*` component is available with no import or registration, because
Mainsail installs the full Vuetify build and you share its Vue.

### `vite.config.ts`

Three things in here are load-bearing:

**The aliases** map `vue`, `vue-class-component` and `vue-property-decorator`
onto `shims/`. Without them you either bundle a second Vue — which does not
share reactivity with the host, so nothing updates — or the bundle keeps bare
specifiers a browser cannot resolve in a dynamic import.

**`experimentalDecorators` in `esbuild.tsconfigRaw`** must be set even though
`tsconfig.json` also sets it. esbuild does not read your tsconfig for
per-file transforms.

**`inlineCss()`** folds the stylesheet into the JS. Nothing on the host side
reads a plugin's asset manifest, so a sibling `.css` is never requested and
the panel renders unstyled. Keep this if your panel has any styles.

**Build as `.js`, not `.mjs`.** nginx as shipped on a Klipper host has no
mapping for `.mjs` and serves it as `application/octet-stream`; browsers
refuse to execute a module with a non-JavaScript MIME type. The only symptom
is `Failed to fetch dynamically imported module`, which reads as a missing
file even though the request returns 200.

### `src/locales/index.json`

Mainsail carries no strings for a panel it does not know about, so ship your
own and merge them in `created()`, before first render. A missing key renders
as the key itself — `Panels.MyPanel.Title` on screen — which is the usual sign
the merge did not run or a prefix does not match.

Namespace under `Panels.<YourPanel>` so you cannot collide with Mainsail's
keys or another plugin's.

## Registering the panel

```json
{
    "id": "my-panel",
    "title": "My Panel",
    "icon": "<24x24 svg path string>",
    "entryUrl": "/plugins/my-panel.js",
    "collapsible": true,
    "requiresPrinterObject": "my_klipper_object"
}
```

`icon` is a bare path string, the same format Vuetify's `v-icon` takes,
rendered as `fill: currentColor`. It cannot carry its own colour, and it wants
to survive 18 px — keep strokes above about two units of the 24-unit grid.

`requiresPrinterObject` is optional. Set it and the panel is hidden on a
printer that does not report that Klipper object, the way the Spoolman panel
hides itself without the Moonraker component. Without it, a panel for hardware
this printer does not have still draws an empty card. Its dashboard position
is remembered either way.

Register in **Moonraker's database**, not `config.json`:

```bash
curl -X POST 'http://PRINTER:7125/server/database/item' \
    -H 'Content-Type: application/json' \
    -d '{"namespace":"mainsail","key":"view.customPanels","value":[ ... ]}'
```

`config.json` lives in Mainsail's web root, which the update manager wipes on
a Mainsail update, and it is a cacheable static file — a browser holding an
old copy shows neither the panel nor any setting to enable one, with nothing
to say why. The database has neither problem. Both are read, and `config.json`
wins on an id collision, so an administrator can still pin an entry.

Note the database entry surviving an update does **not** extend to your bundle.
If it lives in `~/mainsail/plugins/` the same update deletes it, leaving a
registration pointing at a missing file. Serve it from outside the web root,
or add it to Moonraker's `persistent_files`.

## When it does not work

| Symptom | Cause |
|---|---|
| No panel, and no setting to enable one | The browser is running a cached Mainsail without custom-panel support. Try a private window. |
| `Failed to fetch dynamically imported module` | Usually the MIME type — check `curl -sI` shows `application/javascript`. Also check the file is actually there: nginx serves `index.html` with a 200 for missing paths, so a plugin that never landed looks present. |
| Panel loads but is unstyled | `inlineCss()` missing from the build. |
| Raw `Panels.X.Y` keys on screen | Locale bundle not merged, or the prefix does not match. |
| Nothing updates when the printer changes | A bundled second Vue instead of the shims. |
| Edited title/icon/entryUrl has no effect | A Mainsail without the fix that reads these from the registration rather than the copy stored in the saved layout. |
| Every button spins when unrelated g-code runs | `:loading` bound to `socket.loadings`, which is global. Track your own busy state — `runAction()` shows the pattern. |
