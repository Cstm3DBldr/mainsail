import Vue from 'vue'
import { getDefaultState } from './index'
import { MutationTree } from 'vuex'
import { GuiState, GuiStateDashboard, GuiStateDashboardLayoutKey, GuiStateLayoutoption } from '@/store/gui/types'
import { setDataDeep } from '@/plugins/helpers'

export const mutations: MutationTree<GuiState> = {
    reset(state) {
        Object.assign(state, getDefaultState())
    },

    setData(state, payload) {
        setDataDeep(state, payload)
    },

    saveSetting(state, payload: { name: string; value: unknown }) {
        const nested = payload.name.split('.').reduceRight<unknown>((value, key) => ({ [key]: value }), payload.value)
        setDataDeep(state, nested)
    },

    setHeaterChartVisibility(state, payload) {
        const index = state.view.tempchart.hiddenDataset.indexOf(payload.name.toUpperCase())

        if (payload.hidden && index === -1) state.view.tempchart.hiddenDataset.push(payload.name.toUpperCase())
        else if (payload.hidden !== true && index > -1) state.view.tempchart.hiddenDataset.splice(index, 1)
    },

    setGcodefilesMetadata(state, data) {
        const array = [...state.view.gcodefiles.hideMetadataColumns]
        const index = array.findIndex((value: string) => value === data.name)

        if (data.value && index !== -1) array.splice(index, 1)
        else if (!data.value && index === -1) array.push(data.name)

        Vue.set(state.view.gcodefiles, 'hideMetadataColumns', array)
    },

    setGcodefilesShowHiddenFiles(state, value) {
        Vue.set(state.view.gcodefiles, 'showHiddenFiles', value)
    },

    setCurrentWebcam(state, payload) {
        Vue.set(state.view.webcam.currentCam, payload.page, payload.value)
    },

    setHistoryColumns(state, data) {
        if (data.value && state.view.history.hideColums.includes(data.name)) {
            state.view.history.hideColums.splice(state.view.history.hideColums.indexOf(data.name), 1)
        } else if (!data.value && !state.view.history.hideColums.includes(data.name)) {
            state.view.history.hideColums.push(data.name)
        }
    },

    setHistoryHidePrintStatus(state, payload) {
        Vue.set(state.view.history, 'hidePrintStatus', payload)
    },

    addClosePanel(state, payload) {
        const nonExpandPanels = [...state.dashboard.nonExpandPanels[payload.viewport]]

        if (!nonExpandPanels.includes(payload.name)) {
            nonExpandPanels.push(payload.name)

            Vue.set(state.dashboard.nonExpandPanels, payload.viewport, nonExpandPanels)
        }
    },

    removeClosePanel(state, payload) {
        const nonExpandPanels = [...state.dashboard.nonExpandPanels[payload.viewport]]
        const index = nonExpandPanels.indexOf(payload.name)
        if (index > -1) {
            nonExpandPanels.splice(index, 1)

            Vue.set(state.dashboard.nonExpandPanels, payload.viewport, nonExpandPanels)
        }
    },

    deleteFromDashboardLayout(state, payload) {
        const layoutArray = [
            ...(state.dashboard[payload.layoutname as keyof GuiStateDashboard] as GuiStateLayoutoption[]),
        ]
        layoutArray.splice(payload.index, 1)
        Vue.set(state.dashboard, payload.layoutname, layoutArray)
    },

    setChartDatasetStatus(state, payload: { objectName: string; dataset: string; value: boolean }) {
        // set new value if object doesn't exist in view.tempchart.datasetSettings
        if (!(payload.objectName in state.view.tempchart.datasetSettings)) {
            const newVal: Record<string, boolean> = {}
            newVal[payload.dataset] = payload.value

            Vue.set(state.view.tempchart.datasetSettings, payload.objectName, newVal)
            return
        }

        Vue.set(state.view.tempchart.datasetSettings[payload.objectName], payload.dataset, payload.value)
    },

    setDatasetAdditionalSensorStatus(state, payload: { objectName: string; dataset: string; value: boolean }) {
        // set new value if object doesn't exist in view.tempchart.datasetSettings
        if (!(payload.objectName in state.view.tempchart.datasetSettings)) {
            const newVal: { additionalSensors: Record<string, boolean> } = { additionalSensors: {} }
            newVal.additionalSensors[payload.dataset] = payload.value

            Vue.set(state.view.tempchart.datasetSettings, payload.objectName, newVal)
            return
        }

        // set new value if additionalSensor object doesn't exist in view.tempchart.datasetSettings
        if (!('additionalSensors' in state.view.tempchart.datasetSettings[payload.objectName])) {
            const newVal: Record<string, boolean> = {}
            newVal[payload.dataset] = payload.value

            Vue.set(state.view.tempchart.datasetSettings[payload.objectName], 'additionalSensors', newVal)
            return
        }

        Vue.set(
            state.view.tempchart.datasetSettings[payload.objectName].additionalSensors as Record<string, boolean>,
            payload.dataset,
            payload.value
        )
    },

    addPanel(state, payload) {
        const layoutKey = payload.viewport as GuiStateDashboardLayoutKey
        const panels = [...(state.dashboard[layoutKey] as GuiStateLayoutoption[])]
        panels.push(payload.panel)

        Vue.set(state.dashboard, layoutKey, panels)
    },

    /*
     * Drop custom panel entries whose plugin is no longer configured.
     * Sweeps every layout belonging to the viewport (e.g. desktopLayout1,
     * desktopLayout2, ...) because the user may have moved the panel
     * away from the layout it was originally added to.
     */
    removeStaleCustomPanels(state, payload: { viewport: string; configuredIds: string[] }) {
        const layoutKeys = (Object.keys(state.dashboard) as GuiStateDashboardLayoutKey[]).filter((key) =>
            key.startsWith(payload.viewport)
        )

        for (const layoutKey of layoutKeys) {
            const panels = state.dashboard[layoutKey] as GuiStateLayoutoption[]
            const kept = panels.filter(
                (panel) => panel.name !== 'custom' || payload.configuredIds.includes(panel.config?.id ?? '')
            )

            if (kept.length !== panels.length) Vue.set(state.dashboard, layoutKey, kept)
        }
    },

    setCustomPanels(state, payload) {
        if (payload.customPanels) {
            Vue.set(state.view, 'customPanels', payload.customPanels)
        }
    },
}
