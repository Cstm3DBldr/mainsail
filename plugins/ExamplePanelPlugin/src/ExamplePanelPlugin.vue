<template>
    <!--
        No <panel> wrapper: the host draws the card, title, icon and collapse
        control from the registration. Start at the content.
    -->
    <v-card-text class="pa-0">
        <div class="px-4 py-3">
            <v-simple-table dense>
                <tbody>
                    <tr>
                        <td class="grey--text">{{ $t('Panels.ExamplePanelPlugin.Extruder') }}</td>
                        <td class="text-right font-weight-medium">{{ extruderTemp }}</td>
                    </tr>
                </tbody>
            </v-simple-table>

            <v-btn
                small
                outlined
                class="mt-3"
                :loading="busy"
                :disabled="!printerReady"
                @click="sendStatus">
                {{ $t('Panels.ExamplePanelPlugin.QueryStatus') }}
            </v-btn>
        </div>
    </v-card-text>
</template>

<script lang="ts">
// These resolve to Mainsail's own copies via the aliases in vite.config.ts —
// nothing is bundled. See README.
import { Component, Prop, Vue } from 'vue-property-decorator'
import localeMessages from './locales/index.json'

@Component({ name: 'ExamplePanelPlugin' })
export default class ExamplePanelPlugin extends Vue {
    @Prop({ type: Object, required: true }) declare readonly panelConfig: Record<string, unknown>
    @Prop({ type: Object, required: true }) declare readonly panelStore: any
    @Prop({ type: Object, required: true }) declare readonly panelSocket: any

    busy = false

    created(): void {
        // Mainsail ships no strings for a panel it does not know about, so
        // merge our own before first render or $t renders the raw key.
        const messages = localeMessages as Record<string, Record<string, unknown>>
        Object.keys(messages).forEach((locale) => {
            this.$i18n.mergeLocaleMessage(locale, messages[locale])
        })
    }

    get printerReady(): boolean {
        return this.panelStore.state.server?.klippy_state === 'ready'
    }

    get extruderTemp(): string {
        const t = this.panelStore.state.printer?.extruder?.temperature

        return typeof t === 'number' ? `${t.toFixed(1)} °C` : '—'
    }

    async sendStatus(): Promise<void> {
        // Track progress for this action, not socket.loadings — that flag is
        // global and set while any g-code runs anywhere in Mainsail.
        if (this.busy) return

        this.busy = true
        try {
            this.panelStore.dispatch('server/addEvent', { message: 'STATUS', type: 'command' })
            await this.panelStore.dispatch('printer/sendGcode', 'STATUS')
        } finally {
            this.busy = false
        }
    }
}
</script>
