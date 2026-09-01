import { defineConfig } from 'vite'
import vue from '@pedrolamas/plugin-vue2'
import { resolve } from 'path'

// Build config for a Mainsail panel plugin.
//
// The output is a single ES module loaded at runtime, so it cannot resolve
// bare specifiers the way a bundled app can. Rather than shipping its own
// copy of Vue — which would bloat the plugin and break reactivity across the
// host boundary — 'vue' and the two decorator packages are aliased to shims
// that read them back out of the runtime Mainsail publishes on window.
//
// The practical effect is that plugin source is written exactly like any
// component in Mainsail itself, with @Component and @Prop, instead of being
// pushed into the options API by how it happens to be loaded.
const shim = (name: string) => resolve(import.meta.dirname, 'shims', name)

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            vue: shim('vue.js'),
            'vue-class-component': shim('vue-class-component.js'),
            'vue-property-decorator': shim('vue-property-decorator.js'),
        },
    },
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
    },
    esbuild: {
        // Class components need legacy decorators; without this they are
        // emitted untranspiled and the browser cannot parse the module.
        tsconfigRaw: {
            compilerOptions: {
                experimentalDecorators: true,
                target: 'es2020',
                useDefineForClassFields: false,
            },
        },
    },
    build: {
        outDir: resolve(import.meta.dirname, 'dist'),
        emptyOutDir: true,
        lib: {
            entry: 'src/main.ts',
            name: 'PluginSmokeTest',
            formats: ['es'],
            fileName: () => 'plugin-smoke-test.mjs',
        },
    },
})
