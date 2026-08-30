import Vue from 'vue'
import { ActionTree } from 'vuex'
import { ServerTimelapseState } from '@/store/server/timelapse/types'
import { RootState } from '@/store/types'

const LOG_PREFIX = '[Server][Timelapse]'
const logDebug = (...args: unknown[]) => window.console.debug(LOG_PREFIX, ...args)
const logError = (...args: unknown[]) => window.console.error(LOG_PREFIX, ...args)

export const actions: ActionTree<ServerTimelapseState, RootState> = {
    reset({ commit }): void {
        commit('reset')
    },

    async init({ commit, dispatch }): Promise<void> {
        logDebug('init')

        // Both requests are independent, so they are issued together rather
        // than one after the other.
        const [settings, lastFrame] = await Promise.allSettled([
            Vue.$socket.emitAndWait('machine.timelapse.get_settings'),
            Vue.$socket.emitAndWait('machine.timelapse.lastframeinfo'),
        ])

        if (settings.status === 'fulfilled') dispatch('initSettings', settings.value)
        else logError('Failed to load timelapse settings:', settings.reason)

        if (lastFrame.status === 'fulfilled') {
            commit('setLastFrame', {
                count: lastFrame.value.framecount,
                file: lastFrame.value.lastframefile,
            })
        } else {
            logError('Failed to load last frame info:', lastFrame.reason)
        }
    },

    /*
     * Apply a settings payload to the store.
     *
     * Kept separate from init() because post_settings answers with the same
     * shape, so saving a setting reuses this to pick up whatever the server
     * actually stored.
     */
    initSettings({ commit }, payload): void {
        if ('requestParams' in payload) delete payload.requestParams

        commit('setSettings', payload)
    },

    getEvent({ commit }, payload): void {
        switch (payload.action) {
            case 'newframe':
                commit('setLastFrame', {
                    count: parseInt(payload.frame),
                    file: payload.framefile,
                })
                break

            case 'render':
                if (payload.status === 'error') {
                    Vue.$toast.error(payload.msg)
                    commit('resetSnackbar')
                } else commit('setRenderStatus', payload)
                break

            default:
                logDebug('unknown timelapse event', payload)
        }
    },

    async saveSetting({ dispatch }, payload): Promise<void> {
        try {
            const response = await Vue.$socket.emitAndWait('machine.timelapse.post_settings', payload)
            dispatch('initSettings', response)
        } catch (error) {
            logError('Failed to save timelapse setting:', error)
        }
    },

    updateCamSettings({ dispatch, state }, payload): void {
        // check if the changed webcam is the timelapse webcam, if not stop here
        if (state.settings.camera !== payload.oldName) return

        // send the new webcam name; if it is the same name, it will only update the settings
        dispatch('saveSetting', { camera: payload.newName })
    },

    resetSnackbar({ commit }): void {
        commit('resetSnackbar')
    },
}
