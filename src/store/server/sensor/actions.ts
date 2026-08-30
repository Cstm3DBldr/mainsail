import Vue from 'vue'
import { ActionTree } from 'vuex'
import { ServerSensorState } from '@/store/server/sensor/types'
import { RootState } from '@/store/types'

const LOG_PREFIX = '[Server][Sensor]'
const logDebug = (...args: unknown[]) => window.console.debug(LOG_PREFIX, ...args)
const logError = (...args: unknown[]) => window.console.error(LOG_PREFIX, ...args)

export const actions: ActionTree<ServerSensorState, RootState> = {
    reset({ commit }): void {
        commit('reset')
    },

    async init({ commit }): Promise<void> {
        logDebug('init')

        try {
            const { sensors } = await Vue.$socket.emitAndWait('server.sensors.list')
            commit('setSensors', sensors)

            logDebug(`Loaded ${Object.keys(sensors).length} sensor(s)`)
        } catch (error) {
            logError('Failed to load sensors:', error)
        }
    },

    updateSensors({ commit }, payload): void {
        Object.keys(payload).forEach((key) => {
            commit('updateSensor', { key, value: payload[key] })
        })
    },
}
