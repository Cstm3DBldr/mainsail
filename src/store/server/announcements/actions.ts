import Vue from 'vue'
import { ActionTree } from 'vuex'
import { RootState } from '@/store/types'
import { ServerAnnouncementsState } from './types'
import { AnnouncementEntry } from '@/types/moonraker/ServerRPC'

const LOG_PREFIX = '[Server][Announcements]'
const logDebug = (...args: unknown[]) => window.console.debug(LOG_PREFIX, ...args)
const logError = (...args: unknown[]) => window.console.error(LOG_PREFIX, ...args)

export const actions: ActionTree<ServerAnnouncementsState, RootState> = {
    reset({ commit }): void {
        commit('reset')
    },

    async init({ dispatch }): Promise<void> {
        logDebug('init')

        try {
            const response = await Vue.$socket.emitAndWait('server.announcements.list')
            dispatch('getList', response)

            logDebug(`Loaded ${response.entries?.length ?? 0} announcement(s)`)
        } catch (error) {
            logError('Failed to load announcements:', error)
        }
    },

    /*
     * Apply an announcement list payload to the store.
     *
     * Separate from init() because Moonraker also pushes this shape
     * unprompted via the notify_announcement_update notification.
     */
    getList({ commit }, payload: { entries?: AnnouncementEntry[]; feeds?: string[] }): void {
        if ('entries' in payload) {
            const entries = (payload.entries ?? []).map((entry) => ({
                ...entry,
                date: new Date(entry.date * 1000),
                date_dismissed: entry.date_dismissed ? new Date(entry.date_dismissed * 1000) : null,
                dismiss_wake: entry.dismiss_wake ? new Date(entry.dismiss_wake * 1000) : null,
            }))

            commit('setEntries', entries)
        }

        if ('feeds' in payload) commit('setFeeds', payload.feeds)
    },

    getDismissed({ commit }, payload): void {
        commit('setDismissed', { entry_id: payload.entry_id, status: true })
    },

    getWaked({ commit }, payload): void {
        commit('setDismissed', { entry_id: payload.entry_id, status: false })
    },

    async close(_, payload: { entry_id: string }): Promise<void> {
        await Vue.$socket.emitAndWait('server.announcements.dismiss', { entry_id: payload.entry_id })
    },

    async dismiss(_, payload: { entry_id: string; time: number }): Promise<void> {
        await Vue.$socket.emitAndWait('server.announcements.dismiss', {
            entry_id: payload.entry_id,
            wake_time: payload.time,
        })
    },
}
