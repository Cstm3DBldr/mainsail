<!--
    A starter panel. Copy this directory, rename it, and edit.

    Everything here is deliberate — each block shows one thing a real panel
    needs, with a note on why it is done this way. Delete what you do not use.
-->
<template>
    <!--
        No <panel> wrapper.

        Mainsail's CustomPanel host already draws the card, its title bar, the
        icon and the collapse control, using the values from your registration.
        Start at the content. If you wrap this in your own panel you get two
        nested cards.
    -->
    <v-card-text class="pa-0">
        <div class="px-4 py-3">
            <!--
                $t works because the plugin shares Mainsail's Vue, and the
                strings come from the bundle merged in created() below.
            -->
            <div class="text-overline mb-2">
                {{ $t('Panels.ExamplePanelPlugin.Readings') }}
            </div>

            <v-simple-table dense>
                <tbody>
                    <tr v-for="row in readings" :key="row.label">
                        <td class="grey--text">{{ row.label }}</td>
                        <td class="text-right font-weight-medium">{{ row.value }}</td>
                    </tr>
                </tbody>
            </v-simple-table>
        </div>

        <v-divider />

        <div class="px-4 py-3">
            <div class="text-overline mb-2">
                {{ $t('Panels.ExamplePanelPlugin.Actions') }}
            </div>

            <div class="d-flex" style="gap: 8px">
                <!--
                    :loading is bound to THIS action, not to a global flag.
                    See runAction() for why that matters.
                -->
                <v-btn
                    small
                    outlined
                    class="flex-grow-1"
                    :loading="busyAction === 'status'"
                    :disabled="!printerReady"
                    @click="runAction('status', 'STATUS')">
                    {{ $t('Panels.ExamplePanelPlugin.QueryStatus') }}
                </v-btn>
                <v-btn
                    small
                    outlined
                    color="warning"
                    class="flex-grow-1"
                    :loading="busyAction === 'home'"
                    :disabled="!printerReady || printerIsPrinting"
                    @click="runAction('home', 'G28')">
                    {{ $t('Panels.ExamplePanelPlugin.HomeAll') }}
                </v-btn>
            </div>

            <!--
                Say WHY a control is disabled. A greyed-out button with no
                explanation reads as a bug.
            -->
            <div v-if="!printerReady" class="caption grey--text mt-2">
                {{ $t('Panels.ExamplePanelPlugin.PrinterNotReady') }}
            </div>
            <div v-else-if="printerIsPrinting" class="caption grey--text mt-2">
                {{ $t('Panels.ExamplePanelPlugin.BusyPrinting') }}
            </div>

            <v-alert v-if="lastCommand" dense text type="info" class="mt-3 mb-0">
                <span class="caption">
                    {{ $t('Panels.ExamplePanelPlugin.LastSent') }}
                    <code>{{ lastCommand }}</code>
                </span>
            </v-alert>
        </div>
    </v-card-text>
</template>

<script lang="ts">
/*
 * These imports look ordinary but do not bundle anything. vite.config.ts
 * aliases them to shims/ that read Mainsail's own copies back off
 * window.__mainsail_plugin_runtime__ at load time. That is what lets a plugin
 * use decorators and share the host's reactivity instead of shipping a second
 * Vue that would not talk to the first.
 */
import { Component, Prop, Vue } from 'vue-property-decorator'
import localeMessages from './locales/index.json'

interface Reading {
    label: string
    value: string
}

@Component({ name: 'ExamplePanelPlugin' })
export default class ExamplePanelPlugin extends Vue {
    /*
     * The three props the host passes in. panelStore is Mainsail's Vuex store
     * and panelSocket its Moonraker websocket.
     *
     * $store and $socket also resolve, because this component renders inside
     * Mainsail's tree — but the props are the contract. Prefer them.
     */
    @Prop({ type: Object, required: true }) declare readonly panelConfig: Record<string, unknown>
    @Prop({ type: Object, required: true }) declare readonly panelStore: any
    @Prop({ type: Object, required: true }) declare readonly panelSocket: any

    /** Which action is running, or null. Never a shared/global flag — see runAction. */
    busyAction: string | null = null
    lastCommand = ''

    created(): void {
        /*
         * Merge this plugin's strings into Mainsail's i18n before first
         * render. Mainsail ships no strings for a panel it does not know
         * about, and a missing key renders as the key itself.
         */
        const messages = localeMessages as Record<string, Record<string, unknown>>
        Object.keys(messages).forEach((locale) => {
            this.$i18n.mergeLocaleMessage(locale, messages[locale])
        })
    }

    /*
     * Read printer state through getters, not by copying it into local data.
     * The store is reactive and shared, so a getter re-evaluates on its own;
     * a copy taken in created() goes stale immediately.
     */
    get printer(): any {
        return this.panelStore.state.printer ?? {}
    }

    get printerReady(): boolean {
        return this.panelStore.state.server?.klippy_state === 'ready'
    }

    get printerIsPrinting(): boolean {
        return ['printing', 'paused'].includes(this.printer.print_stats?.state ?? '')
    }

    get readings(): Reading[] {
        const toolhead = this.printer.toolhead ?? {}
        const extruder = this.printer.extruder ?? {}
        const temp = typeof extruder.temperature === 'number' ? `${extruder.temperature.toFixed(1)} °C` : '—'

        return [
            { label: this.$t('Panels.ExamplePanelPlugin.KlipperState') as string, value: this.panelStore.state.server?.klippy_state || '—' },
            { label: this.$t('Panels.ExamplePanelPlugin.HomedAxes') as string, value: toolhead.homed_axes || 'none' },
            { label: this.$t('Panels.ExamplePanelPlugin.Extruder') as string, value: temp },
        ]
    }

    /**
     * Run one g-code action, tracking progress for that action alone.
     *
     * Two things worth copying:
     *
     * Do NOT bind :loading to `socket.loadings.includes('sendGcode')`. That
     * flag is global — it is set while ANY g-code is in flight anywhere in
     * Mainsail — so every button on your panel spins whenever an unrelated
     * macro runs from the console, and users read that as the panel
     * misbehaving.
     *
     * The busyAction guard also drops a second press while one is running.
     * These commands move a real machine; an impatient double-click should
     * not send the command twice.
     */
    async runAction(name: string, gcode: string): Promise<void> {
        if (this.busyAction !== null) return

        this.busyAction = name
        this.lastCommand = gcode

        try {
            // Show it in Mainsail's console the way its own controls do, then
            // send it. dispatch returns a promise, so progress is real rather
            // than a fixed delay.
            this.panelStore.dispatch('server/addEvent', { message: gcode, type: 'command' })
            await this.panelStore.dispatch('printer/sendGcode', gcode)
        } finally {
            this.busyAction = null
        }
    }
}
</script>

<style scoped>
/*
 * Scoped styles are safest: an unscoped rule here applies to the whole of
 * Mainsail, since the plugin renders inside its DOM.
 *
 * Prefer Vuetify's utility classes and theme colours over hard-coded values,
 * so the panel follows the user's light/dark theme instead of fighting it.
 */
</style>
