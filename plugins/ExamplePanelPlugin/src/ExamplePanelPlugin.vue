<!--
    Example Mainsail panel plugin.

    A plugin is a normal Vue 2 SFC, built separately from Mainsail into a
    single ES module and loaded at runtime. Mainsail never has to be rebuilt
    to add one.

    Mainsail passes three props into every plugin panel:

      panelConfig  this plugin's own entry from the Mainsail config
      panelStore   the Vuex store, for reading printer state
      panelSocket  the Moonraker websocket client, for sending commands

    Use those props rather than reaching for $parent or a global — they are
    the supported surface and the only thing guaranteed to keep working.

    Note the plain options object below, rather than a class with decorators.
    That is deliberate and matters:

      * No import of `vue` or `vue-property-decorator`. Those are bare module
        specifiers, which a browser cannot resolve when it loads this bundle
        with a dynamic import, and bundling a second copy of Vue would break
        reactivity across the host/plugin boundary.
      * No decorators to transpile, so the emitted module is plain ES that
        every supported browser can parse.

    The component is instantiated by Mainsail's own Vue, so Vuetify
    components (v-btn here) and the active theme are available for free.
-->
<template>
    <div>
        <p class="mb-2">Extruder temperature: {{ extruderTemperature }}</p>
        <v-btn small color="primary" @click="sendStatus">Klipper status</v-btn>
    </div>
</template>

<script lang="ts">
export default {
    name: 'ExamplePanelPlugin',
    props: {
        panelConfig: { type: Object, required: true },
        panelStore: { type: Object, required: true },
        panelSocket: { type: Object, required: true },
    },
    computed: {
        // Reading through panelStore keeps this reactive, so it updates as
        // the printer reports new temperatures. Any Klipper object exposed
        // in printer state is reachable the same way.
        extruderTemperature(): string {
            const temp = this.panelStore.state.printer?.extruder?.temperature ?? 0

            return `${Number(temp).toFixed(1)} °C`
        },
    },
    methods: {
        sendStatus(): void {
            const gcode = 'STATUS'

            // Echo into Mainsail's console so the command appears alongside
            // anything the user typed by hand.
            this.panelStore.dispatch('server/addEvent', { message: gcode, type: 'command' })
            this.panelSocket.emit('printer.gcode.script', { script: gcode }, { loading: `macro_${gcode}` })
        },
    },
}
</script>
