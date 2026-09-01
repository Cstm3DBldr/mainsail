<template>
    <v-card-text class="pa-0">
        <!--
            Each section below proves one part of the plugin contract on its
            own, so a failure points at the specific thing that broke rather
            than just "the panel did not work".
        -->

        <!-- 1. Runtime handshake: did the host share its Vue with us? -->
        <div class="px-4 py-3">
            <div class="text-overline mb-2">Runtime</div>
            <div class="d-flex flex-wrap" style="gap: 6px">
                <v-chip small :color="runtimeOk ? 'success' : 'error'" text-color="white">
                    <v-icon left small>{{ runtimeOk ? mdiCheckCircle : mdiAlertCircle }}</v-icon>
                    runtime {{ runtimeVersion }}
                </v-chip>
                <v-chip small outlined>Vue {{ vueVersion }}</v-chip>
                <v-chip small outlined>{{ sharedModules.length }} shared modules</v-chip>
                <v-chip small color="success" text-color="white">
                    <v-icon left small>{{ mdiCheckCircle }}</v-icon>
                    decorators
                </v-chip>
                <v-chip small color="success" text-color="white">
                    <v-icon left small>{{ mdiCheckCircle }}</v-icon>
                    vuetify
                </v-chip>
                <v-chip small :color="i18nOk ? 'success' : 'warning'" text-color="white">
                    <v-icon left small>{{ i18nOk ? mdiCheckCircle : mdiAlertCircle }}</v-icon>
                    i18n
                </v-chip>
            </div>
            <div class="caption grey--text mt-2">
                {{ $t('Panels.PluginSmokeTestPanel.LocaleProof') }}
            </div>
        </div>

        <v-divider />

        <!--
            2. Reactivity: these come from the host store and must tick on
            their own. A static value here would mean the plugin got a
            snapshot instead of sharing the host's reactivity.
        -->
        <div class="px-4 py-3">
            <div class="text-overline mb-2">
                Live printer state
                <span class="caption grey--text text-none">— {{ updateCount }} store updates since load</span>
            </div>
            <v-simple-table dense>
                <tbody>
                    <tr v-for="row in stateRows" :key="row.label">
                        <td class="grey--text" style="width: 45%">{{ row.label }}</td>
                        <td class="text-right font-weight-medium">{{ row.value }}</td>
                    </tr>
                </tbody>
            </v-simple-table>
        </div>

        <v-divider />

        <!-- 3. Dispatch: can the plugin actually drive the printer? -->
        <div class="px-4 py-3">
            <div class="text-overline mb-2">Send G-code</div>

            <div class="caption grey--text mb-1">Safe — queries only, nothing moves</div>
            <div class="d-flex flex-wrap mb-3" style="gap: 8px">
                <v-btn v-for="cmd in safeCommands" :key="cmd" small outlined @click="send(cmd)">
                    {{ cmd }}
                </v-btn>
            </div>

            <div class="caption warning--text mb-1">
                <v-icon x-small color="warning">{{ mdiAlertCircle }}</v-icon>
                Moves the machine
            </div>
            <div class="d-flex flex-wrap" style="gap: 8px">
                <v-btn
                    v-for="cmd in motionCommands"
                    :key="cmd"
                    small
                    outlined
                    color="warning"
                    :disabled="printerIsBusy"
                    @click="send(cmd)">
                    {{ cmd }}
                </v-btn>
            </div>
            <div v-if="printerIsBusy" class="caption grey--text mt-2">
                Motion buttons are disabled while the printer is {{ printerState }}.
            </div>

            <v-alert v-if="lastCommand" dense text class="mt-3 mb-0" type="info">
                <span class="caption">Last sent: <code>{{ lastCommand }}</code></span>
            </v-alert>
        </div>
    </v-card-text>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'
import { mdiCheckCircle, mdiAlertCircleOutline } from '@mdi/js'
import localeMessages from './locales/index.json'

interface StateRow {
    label: string
    value: string
}

/*
 * A panel whose only job is to prove that a Mainsail host can load and run a
 * plugin correctly. It deliberately depends on nothing but stock Klipper
 * objects, so it can be pointed at any printer -- including one with none of
 * the hardware the real autoloader panel expects.
 *
 * Written with decorators and class syntax on purpose: if this renders at
 * all, the decorator transpile and the shared-Vue handshake both worked.
 */
@Component({ name: 'PluginSmokeTest' })
export default class PluginSmokeTest extends Vue {
    // Declared, not @Prop: the host passes these in, and declaring them as
    // props would make Vue warn on a host that does not.
    declare panelConfig: Record<string, unknown>
    declare panelStore: any
    declare panelSocket: any

    mdiCheckCircle = mdiCheckCircle
    mdiAlertCircle = mdiAlertCircleOutline

    lastCommand = ''
    updateCount = 0

    readonly safeCommands = ['M115', 'STATUS', 'GET_POSITION']
    readonly motionCommands = ['G28', 'G28 Z', 'M84']

    created(): void {
        const messages = localeMessages as Record<string, Record<string, unknown>>
        Object.keys(messages).forEach((locale) => {
            this.$i18n.mergeLocaleMessage(locale, messages[locale])
        })
    }

    mounted(): void {
        // Counting store mutations is the cheapest honest proof of shared
        // reactivity: a plugin holding its own copy of the state would sit
        // at zero here while the numbers above went stale.
        this.$store.subscribe(() => {
            this.updateCount++
        })
    }

    get runtime(): any {
        return (window as any).__mainsail_plugin_runtime__ ?? null
    }

    get runtimeOk(): boolean {
        return this.runtime !== null
    }

    get runtimeVersion(): string {
        return this.runtime?.version ?? 'missing'
    }

    get vueVersion(): string {
        return this.runtime?.Vue?.version ?? 'unknown'
    }

    get sharedModules(): string[] {
        return Object.keys(this.runtime?.modules ?? {})
    }

    get i18nOk(): boolean {
        // A missing key renders as the key itself, so this is a real check.
        const key = 'Panels.PluginSmokeTestPanel.Headline'

        return this.$t(key) !== key
    }

    get printer(): any {
        return this.$store.state.printer ?? {}
    }

    get printerState(): string {
        return this.printer.print_stats?.state ?? 'unknown'
    }

    get printerIsBusy(): boolean {
        return ['printing', 'paused'].includes(this.printerState)
    }

    get stateRows(): StateRow[] {
        const toolhead = this.printer.toolhead ?? {}
        const position: number[] = toolhead.position ?? []
        const fmt = (value: unknown, suffix = ''): string =>
            typeof value === 'number' ? `${value.toFixed(1)}${suffix}` : '—'

        const rows: StateRow[] = [
            { label: 'Klipper state', value: this.$store.state.server?.klippy_state ?? '—' },
            { label: 'Print state', value: this.printerState },
            { label: 'Homed axes', value: toolhead.homed_axes || 'none' },
            {
                label: 'Position X / Y / Z',
                value:
                    position.length >= 3
                        ? position
                              .slice(0, 3)
                              .map((n) => n.toFixed(1))
                              .join(' / ')
                        : '—',
            },
        ]

        // Only shown when the printer actually has them, so the panel stays
        // honest on a machine without a bed heater or an extruder.
        if (this.printer.extruder) {
            rows.push({
                label: 'Extruder',
                value: `${fmt(this.printer.extruder.temperature, '°C')} / ${fmt(this.printer.extruder.target, '°C')}`,
            })
        }
        if (this.printer.heater_bed) {
            rows.push({
                label: 'Bed',
                value: `${fmt(this.printer.heater_bed.temperature, '°C')} / ${fmt(this.printer.heater_bed.target, '°C')}`,
            })
        }

        return rows
    }

    send(gcode: string): void {
        this.lastCommand = gcode

        // panelStore/panelSocket are the props the host passes in; falling
        // back to $store/$socket keeps the panel usable if a host wires the
        // component up without them.
        const store = this.panelStore ?? this.$store
        const socket = this.panelSocket ?? (this as any).$socket

        store.dispatch('server/addEvent', { message: gcode, type: 'command' })
        socket.emit('printer.gcode.script', { script: gcode }, { loading: `macro_${gcode}` })
    }
}
</script>
