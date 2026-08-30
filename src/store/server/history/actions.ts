import Vue from 'vue'
import { ActionTree } from 'vuex'
import { ServerHistoryState, ServerHistoryStateJob } from '@/store/server/history/types'
import { RootState } from '@/store/types'

const LOG_PREFIX = '[Server][History]'
const logDebug = (...args: unknown[]) => window.console.debug(LOG_PREFIX, ...args)
const logError = (...args: unknown[]) => window.console.error(LOG_PREFIX, ...args)

const DEFAULT_PAGE_SIZE = 50
const INIT_JOB_LIMIT = 100

export const actions: ActionTree<ServerHistoryState, RootState> = {
    reset({ commit }): void {
        commit('reset')
    },

    async init({ dispatch }): Promise<void> {
        logDebug('init')

        // Independent requests, so they are issued together and reported
        // separately rather than one failure hiding the other.
        const [jobs, totals] = await Promise.allSettled([
            dispatch('loadHistory', { max: INIT_JOB_LIMIT }),
            dispatch('loadTotals'),
        ])

        if (jobs.status === 'rejected') logError('Failed to load history:', jobs.reason)
        if (totals.status === 'rejected') logError('Failed to load totals:', totals.reason)
    },

    async loadTotals({ commit }): Promise<void> {
        const { job_totals, auxiliary_totals } = await Vue.$socket.emitAndWait('server.history.totals')

        commit('setTotals', job_totals)
        if (auxiliary_totals?.length) commit('setAuxiliaryTotals', auxiliary_totals)
    },

    /*
     * Load print history, paging until the server runs out of jobs or `max`
     * is reached.
     *
     * Moonraker caps how many jobs it returns per request, so a full history
     * needs several. This used to re-emit itself from its own response
     * handler; paging in a loop keeps the termination conditions in one
     * place and lets the caller await the whole run.
     *
     * `max` bounds the total pulled — startup only wants a recent slice,
     * while the UI's refresh button asks for everything.
     */
    async loadHistory({ commit, dispatch }, payload: { limit?: number; max?: number | null } = {}): Promise<void> {
        const limit = payload.limit ?? DEFAULT_PAGE_SIZE
        const max = payload.max ?? null

        if (limit <= 0) return

        dispatch('socket/addLoading', { name: 'historyLoadAll' }, { root: true })

        try {
            let start = 0
            commit('resetJobs')

            for (;;) {
                // `max` is a client side cap, not a request parameter — Moonraker
                // accepts only start/limit/before/since/order and silently ignores
                // anything else.
                const { jobs } = await Vue.$socket.emitAndWait('server.history.list', { start, limit })
                const page = jobs ?? []

                page.forEach((job) => commit('addJob', job))

                // A short page means the server has nothing left to give.
                if (page.length < limit) {
                    commit('setAllLoaded')
                    break
                }

                start += limit

                // Stop once another full page would exceed the requested max.
                if (max !== null && max <= start) break
            }

            logDebug(`Loaded ${start} job(s)`)
        } finally {
            dispatch('socket/removeLoading', { name: 'historyLoadAll' }, { root: true })
        }

        await dispatch('loadHistoryNotes')
    },

    async loadHistoryNotes({ commit, rootState }): Promise<void> {
        if (!rootState.server?.dbNamespaces.includes('history_notes')) return

        try {
            const { value } = await Vue.$socket.emitAndWait('server.database.get_item', {
                namespace: 'history_notes',
            })

            for (const [job_id, note] of Object.entries(value ?? {})) {
                commit('setHistoryNotes', { job_id, text: (note as { text: string }).text })
            }
        } catch (error) {
            logError('Failed to load history notes:', error)
        }
    },

    async getChanged({ commit, dispatch }, payload): Promise<void> {
        if (payload.action === 'added') commit('addJob', payload.job)
        else if (payload.action === 'finished') commit('updateJob', payload.job)

        try {
            await dispatch('loadTotals')
        } catch (error) {
            logError('Failed to refresh totals:', error)
        }
    },

    getDeletedJobs({ commit }, payload): void {
        if ('deleted_jobs' in payload && Array.isArray(payload.deleted_jobs)) {
            payload.deleted_jobs.forEach((jobId: ServerHistoryStateJob) => {
                commit('destroyJob', jobId)
            })
        }
    },

    async saveHistoryNote({ commit }, payload: { job_id: string; note: string }): Promise<void> {
        commit('setHistoryNotes', { job_id: payload.job_id, text: payload.note })

        try {
            await Vue.$socket.emitAndWait('server.database.post_item', {
                namespace: 'history_notes',
                key: payload.job_id,
                value: { text: payload.note },
            })
        } catch (error) {
            logError('Failed to save history note:', error)
        }
    },
}
