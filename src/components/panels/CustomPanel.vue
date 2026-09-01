<template>
    <panel
        v-if="klipperReadyForGui && config"
        :icon="config.icon"
        :title="config.title"
        :collapsible="config.collapsible"
        :loading="!loadedComponent && !error"
        :card-class="'custom_' + panelId + '_panel'">
        <v-card-text v-if="error" class="error--text">
            {{ error }}
        </v-card-text>
        <component
            :is="loadedComponent"
            v-else-if="loadedComponent"
            :panel-config="config"
            :panel-store="$store"
            :panel-socket="$socket" />
    </panel>
</template>

<script lang="ts">
import { Component, Mixins, Prop } from 'vue-property-decorator'
import Panel from '@/components/ui/Panel.vue'
import BaseMixin from '@/components/mixins/base'
import { ConfigJsonCustomPanel } from '@/store/types'

@Component({
    components: { Panel },
})
export default class CustomPanel extends Mixins(BaseMixin) {
    @Prop({ required: true }) declare readonly panelId: string

    loadedComponent: object | null = null
    error: string | null = null

    // Resolved from the registration rather than stored in the layout, so an
    // edited title, icon or entryUrl takes effect.
    get config(): ConfigJsonCustomPanel | undefined {
        const panels = this.$store.getters['gui/getCustomPanels'] as ConfigJsonCustomPanel[]

        return panels.find((panel) => panel.id === this.panelId)
    }

    async created() {
        const entryUrl = this.config?.entryUrl
        if (!entryUrl) {
            this.error = this.$t('Panels.CustomPanel.NoEntryUrl') as string

            return
        }

        try {
            // Loaded at runtime: the plugin is built separately from Mainsail,
            // so the host bundle stays untouched.
            const module = await import(/* @vite-ignore */ entryUrl)

            // Frozen so Vue's observer does not deep-walk a plugin's options
            // object trying to make a component definition reactive.
            this.loadedComponent = module.default ? Object.freeze(module.default) : null

            if (!this.loadedComponent) {
                this.error = this.$t('Panels.CustomPanel.NoDefaultExport') as string
            }
        } catch (error) {
            window.console.error(`Failed to load custom panel "${this.config?.title}"`, error)
            this.error = this.$t('Panels.CustomPanel.LoadFailed') as string
        }
    }
}
</script>
