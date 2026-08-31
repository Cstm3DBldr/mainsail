<template>
    <div>
        <p class="mb-2">Extruder temperature: {{ extruderTemperature }}</p>
        <v-btn small color="primary" @click="sendStatus">Klipper status</v-btn>
    </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'

@Component({ name: 'ExamplePanelPlugin' })
export default class ExamplePanelPlugin extends Vue {
    @Prop({ type: Object, required: true }) readonly panelConfig!: Record<string, unknown>
    @Prop({ type: Object, required: true }) readonly panelStore!: any
    @Prop({ type: Object, required: true }) readonly panelSocket!: any

    get extruderTemperature(): string {
        const t = this.panelStore.state.printer?.extruder?.temperature ?? 0
        return `${Number(t).toFixed(1)} °C`
    }

    sendStatus(): void {
        const gcode = 'STATUS'
        this.panelStore.dispatch('server/addEvent', { message: gcode, type: 'command' })
        this.panelSocket.emit('printer.gcode.script', { script: gcode }, { loading: `macro_${gcode}` })
    }
}
</script>
