Add this to your mainsail config to enable the plugin
```json
{
  ...
  "customPanels": [
    {
      "id": "example-panel-plugin",
      "title": "Example panel plugin",
      "icon": "",
      "entryUrl": "http://localhost:8080/plugins/example-panel-plugin.js",
      "collapsible": true
    }
  ],
  ...
}
```

For plugin to be usable **entryUrl** should be either hosted on the same server OR it 
should come from server with CORS configuration that allows connection coming from 
mainsail server domain

Icons can be supplied using svg for example heres a bootstrap icon, you might need to add some style tags tough
```json
{
    ...
    "icon": "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='currentColor' class='bi bi-heart' viewBox='0 0 16 16'><path d='m8 2.748-.717-.737C5.6.281 2.514.878 1.4 3.053c-.523 1.023-.641 2.5.314 4.385.92 1.815 2.834 3.989 6.286 6.357 3.452-2.368 5.365-4.542 6.286-6.357.955-1.886.838-3.362.314-4.385C13.486.878 10.4.28 8.717 2.01zM8 15C-7.333 4.868 3.279-3.04 7.824 1.143q.09.083.176.171a3 3 0 0 1 .176-.17C12.72-3.042 23.333 4.867 8 15'/></svg>",
    ...
}     
```

## Serve the bundle as `.js`, not `.mjs`

Plugins are fetched with a dynamic `import()`, and browsers refuse to execute
a module served with a non-JavaScript MIME type. nginx as shipped on a
standard Klipper host has no mapping for `.mjs` and serves it as
`application/octet-stream`, so an `.mjs` plugin fails to load — with nothing
in the console but a generic *"Failed to fetch dynamically imported module"*,
which looks like a missing file rather than a MIME problem.

`.js` is mapped correctly everywhere, so the build emits that. If you host a
plugin yourself, check the response really is `application/javascript`:

```bash
curl -sI https://your-host/plugins/your-plugin.js | grep -i content-type
```
