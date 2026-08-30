import { defineConfig } from 'vite'
import vue from '@pedrolamas/plugin-vue2'
import { resolve } from 'path'

// Build config for a Mainsail panel plugin.
//
// The output is a single ES module. Vue and the decorator helpers are marked
// external so they are NOT bundled — Mainsail already has them loaded, and
// bundling a second copy of Vue would both bloat the file and break
// reactivity across the host/plugin boundary.
//
// Uses @pedrolamas/plugin-vue2 (the maintained fork) rather than the
// deprecated @vitejs/plugin-vue2, which does not support Vite 6+. This
// matches what Mainsail itself builds with.
export default defineConfig({
    plugins: [vue()],
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
    },
    build: {
        // Emitting into Mainsail's public/plugins makes the bundle available
        // at <hostname>/plugins/<file>.mjs during local development.
        outDir: resolve(import.meta.dirname, '../../public/plugins'),
        emptyOutDir: false,
        lib: {
            entry: 'src/main.ts',
            name: 'ExamplePanelPlugin',
            formats: ['es'],
            fileName: () => 'example-panel-plugin.mjs',
        },
        rollupOptions: {
            external: ['vue', 'vue-property-decorator', 'vue-class-component'],
        },
    },
    preview: {
        port: 8081,
        cors: { origin: 'http://localhost:8080' },
    },
})
