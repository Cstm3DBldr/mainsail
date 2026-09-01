/**
 * Runtime shared with custom panel plugins.
 *
 * A plugin is built separately from Mainsail and loaded as an ES module at
 * runtime, so it cannot `import 'vue'` — a bare specifier has nothing to
 * resolve against in the browser, and bundling a second copy of Vue would
 * both bloat the plugin and break reactivity across the boundary.
 *
 * Exposing the host's own Vue and the two decorator packages lets a plugin
 * be written the same way every component in this repo is written, with
 * `@Component` and `@Prop`, rather than being forced into the options API
 * purely by how it happens to be loaded.
 *
 * Plugins reach these by aliasing the module names to a shim at build time,
 * so their source keeps the ordinary import statements. See the example
 * plugin's vite.config.ts.
 */
import Vue from 'vue'
import * as vueClassComponent from 'vue-class-component'
import * as vuePropertyDecorator from 'vue-property-decorator'

export interface MainsailPluginRuntime {
    /** Version of this contract, so a plugin can check what it is talking to. */
    version: string
    /** The host's Vue constructor — the same one that instantiates the plugin. */
    Vue: typeof Vue
    /** Package re-exports, keyed by the module name a plugin would import. */
    modules: Record<string, unknown>
}

export const PLUGIN_RUNTIME_VERSION = '1.0.0'

export const installPluginRuntime = (): void => {
    const runtime: MainsailPluginRuntime = {
        version: PLUGIN_RUNTIME_VERSION,
        Vue,
        modules: {
            vue: Vue,
            'vue-class-component': vueClassComponent,
            'vue-property-decorator': vuePropertyDecorator,
        },
    }

    // Deliberately a global rather than an import map: import maps must be
    // declared before any module loads, which would mean generating one into
    // index.html at build time for a set of plugins not known until runtime.
    ;(window as unknown as Record<string, unknown>).__mainsail_plugin_runtime__ = runtime
}
