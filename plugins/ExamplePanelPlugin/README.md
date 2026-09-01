# Example panel plugin

A minimal panel. Copy this directory, rename it, and edit.

```bash
npm install && npm run build
```

Produces one self-contained `dist/example-panel-plugin.js`. Serve it anywhere
the browser can reach, then register it.

## Registering

```json
{
    "id": "example",
    "title": "Example",
    "icon": "<24x24 svg path string>",
    "entryUrl": "/plugins/example-panel-plugin.js",
    "collapsible": true,
    "requiresPrinterObject": "some_klipper_object"
}
```

Register in Moonraker's database (`namespace: mainsail`, key
`view.customPanels`) or in `config.json`. Prefer the database: `config.json`
lives in Mainsail's web root, which the update manager wipes, and it is a
cacheable static file. Both are read; `config.json` wins on an id collision.

`requiresPrinterObject` is optional — set it and the panel hides on a printer
that does not report that Klipper object, rather than showing an empty card.

## What the host gives you

Three props: `panelConfig` (your registration entry), `panelStore` (Mainsail's
Vuex store) and `panelSocket` (the Moonraker websocket). `$store`, `$socket`,
`$i18n` and `$vuetify` also resolve, and every `v-*` component is available
without importing anything, because the plugin shares Mainsail's Vue.

## Four things that will bite you

**Build as `.js`, not `.mjs`.** nginx on a Klipper host has no mapping for
`.mjs` and serves it as `application/octet-stream`; browsers refuse to execute
a module with a non-JavaScript MIME type. The only symptom is
`Failed to fetch dynamically imported module`.

**Keep the aliases in `vite.config.ts`.** They point `vue` and the decorator
packages at `shims/`, which read Mainsail's copies off `window`. Bundle your
own Vue instead and it will not share reactivity with the host, so nothing
updates.

**`experimentalDecorators` is needed in both `tsconfig.json` and
`esbuild.tsconfigRaw`** — esbuild does not read your tsconfig for per-file
transforms. Without it decorators are emitted untranspiled and the browser
cannot parse the bundle.

**Keep `inlineCss()` in the build** if your panel has styles. Nothing reads a
plugin's asset manifest, so a sibling `.css` is never requested.
