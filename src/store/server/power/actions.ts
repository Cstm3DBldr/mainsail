import Vue from 'vue'
import { ActionTree } from 'vuex'
import { ServerPowerState } from '@/store/server/power/types'
import { RootState } from '@/store/types'

const LOG_PREFIX = '[Server][Power]'
const logDebug = (...args: unknown[]) => window.console.debug(LOG_PREFIX, ...args)
const logError = (...args: unknown[]) => window.console.error(LOG_PREFIX, ...args)

export const actions: ActionTree<ServerPowerState, RootState> = {
    reset({ commit }): void {
        commit('reset')
    },

    async init({ commit }): Promise<void> {
        logDebug('init')

        try {
            const { devices } = await Vue.$socket.emitAndWait('machine.device_power.devices')
            commit('setDevices', devices)

            logDebug(`Loaded ${devices.length} power device(s)`)
        } catch (error) {
            logError('Failed to load power devices:', error)
        }
    },

    getStatus({ commit }, payload): void {
        if (!payload.error) commit('setStatus', payload)
    },

    responseToggle({ commit }, payload): void {
        if ('requestParams' in payload) delete payload.requestParams

        for (const [key, value] of Object.entries(payload)) {
            commit('setStatus', { device: key, status: value })
        }
    },
}
