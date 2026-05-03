import Vue from 'vue'
import Component from 'vue-class-component'
import { SAStatus } from '@/types/sa'

const DEFAULT_SA: SAStatus = {
    num_paths: 0,
    current_path: -1,
    servo_engaged: false,
    path_states: [],
    encoder_dist: [],
    entry_filament: [],
    toolhead_filament: [],
    extruder_filament: [],
    filament_loaded: [],
    selector_position: 0,
    path_materials: [],
    path_brands: [],
    path_product_lines: [],
    path_color_names: [],
    path_color_hexes: [],
    path_load_temps: [],
    path_unload_temps: [],
    feed_speed: 0,
    purge_length: 0,
    nozzle_distance: 0,
    bowden_lengths: [],
    selector_positions: [],
    encoder_mpp: [],
    drive_rotation_distance: 0,
    cal_state: '',
    cal_path: -1,
    cal_prompt: '',
}

@Component
export default class SaMixin extends Vue {
    get saExists(): boolean {
        return 'autoloader' in this.$store.state.printer
    }

    get saStatus(): SAStatus {
        return (this.$store.state.printer.autoloader as SAStatus) ?? DEFAULT_SA
    }

    get saPathIndices(): number[] {
        return Array.from({ length: this.saStatus.num_paths }, (_, i) => i)
    }

    get saIsCalibrating(): boolean {
        return this.saStatus.cal_state !== ''
    }

    saStateColor(state: string): string {
        switch (state) {
            case 'loaded':
                return 'success'
            case 'partial':
                return 'warning'
            case 'unknown':
                return 'amber'
            default:
                return 'grey'
        }
    }

    /**
     * Mirror of KlipperScreen _effective_state() — derive path state from
     * sensors when available. The raw path_states from Klipper can read
     * 'unknown' before a load cycle completes even when sensors clearly
     * indicate filament presence.
     */
    saEffectiveState(idx: number): string {
        const sa = this.saStatus
        const entry = sa.entry_filament?.[idx]
        const toolhead = sa.toolhead_filament?.[idx]
        const extruder = sa.extruder_filament?.[idx]
        const reported = sa.path_states?.[idx] ?? 'unknown'

        if (entry === undefined || entry === null) return reported
        if (!entry && !toolhead && !extruder) return 'empty'
        if (entry && toolhead && extruder) return 'loaded'
        if (entry || toolhead || extruder) return 'partial'
        return reported
    }

    saColorHex(idx: number): string {
        const stored = (this.saStatus.path_color_hexes?.[idx] ?? '').trim()
        if (!stored) return ''
        // Multi-color hex is encoded slash-separated, e.g. "#FF0000/#00FF00".
        // For single-value consumers, return the first color.
        const first = stored.split('/')[0].trim().replace(/^#/, '')
        return first ? `#${first}` : ''
    }

    /**
     * CSS `background` value for a path's color swatch. Mirrors the KlipperScreen
     * sa_color_swatch rendering:
     *   - single hex     → solid flat color
     *   - 2 hexes, gradient name → horizontal linear-gradient (smooth blend)
     *   - 2 hexes, dual name     → vertical split (left = hex[0], right = hex[1])
     *   - 3+ hexes               → conic-gradient 120° sectors starting at 12 o'clock
     */
    saColorBackground(idx: number): string {
        const stored = (this.saStatus.path_color_hexes?.[idx] ?? '').trim()
        if (!stored) return ''
        const parts = stored
            .split('/')
            .map((p) => p.trim().replace(/^#/, ''))
            .filter((p) => p)
        if (parts.length === 0) return ''
        if (parts.length === 1) return `#${parts[0]}`

        if (parts.length === 2) {
            const name = (this.saStatus.path_color_names?.[idx] ?? '').toLowerCase()
            const isGradient = /gradient|rainbow|ocean|sunset|forest|galaxy|fade|shift/i.test(
                name
            )
            if (isGradient) {
                return `linear-gradient(to right, #${parts[0]}, #${parts[1]})`
            }
            // Dual → sharp vertical left/right split
            return `linear-gradient(to right, #${parts[0]} 0 50%, #${parts[1]} 50% 100%)`
        }
        // 3+ colors → conic pie, equal sectors, starting from top (12 o'clock)
        const step = 100 / parts.length
        const stops = parts.map((hex, i) => {
            const start = (i * step).toFixed(2)
            const end = ((i + 1) * step).toFixed(2)
            return `#${hex} ${start}% ${end}%`
        })
        return `conic-gradient(from -90deg, ${stops.join(', ')})`
    }

    saGcode(script: string): void {
        this.$store.dispatch('printer/sendGcode', script)
    }
}
