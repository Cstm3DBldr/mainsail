<template>
    <panel
        v-if="klipperReadyForGui"
        :icon="config.icon"
        :title="config.title"
        :collapsible="config.collapsible"
        :loading="loading"
        card-class="custom-panel">
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
    @Prop({ required: true, type: Object }) declare readonly config: ConfigJsonCustomPanel

    loadedComponent: object | null = null
    loading = true
    error: string | null = null

    async created() {
        await this.resolvePlugin()
    }

    private async resolvePlugin() {
        if (!this.config.entryUrl) {
            this.loading = false
            this.error = this.$t('Panels.CustomPanel.NoEntryUrl') as string

            return
        }

        try {
            // Load the plugin bundle at runtime. It is an ES module built
            // separately from Mainsail, so the host bundle stays untouched.
            const module = await import(/* @vite-ignore */ this.config.entryUrl)
            this.loadedComponent = module.default ?? null

            if (!this.loadedComponent) {
                this.error = this.$t('Panels.CustomPanel.NoDefaultExport') as string
            }
        } catch (error) {
            window.console.error(`Failed to load custom panel "${this.config.title}"`, error)
            this.error = this.$t('Panels.CustomPanel.LoadFailed') as string
        } finally {
            this.loading = false
        }
    }
}
</script>
