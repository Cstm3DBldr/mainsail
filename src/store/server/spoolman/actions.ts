import Vue from 'vue'
import { ActionTree } from 'vuex'
import { RootState } from '@/store/types'
import { ServerSpoolmanState } from '@/store/server/spoolman/types'
import { SpoolmanProxyResponse } from '@/types/moonraker/ServerRPC'

const LOG_PREFIX = '[Server][Spoolman]'
const logDebug = (...args: unknown[]) => window.console.debug(LOG_PREFIX, ...args)
const logError = (...args: unknown[]) => window.console.error(LOG_PREFIX, ...args)

/*
 * Unwrap a proxied Spoolman reply.
 *
 * With use_v2_response the payload is nested under `response` and a failure
 * is reported in `error` rather than rejecting, so it has to be checked here.
 * Returns null when Spoolman reported an error, having shown it to the user.
 */
function convertV2response(payload: SpoolmanProxyResponse): unknown {
    if ((payload.error?.message ?? null) !== null) {
        Vue.$toast.error(payload.error?.message ?? 'unknown spoolman error')
        return null
    }

    // if the response is v2, we need to get the response into the payload
    if ('response' in payload) return payload.response

    return payload
}

/* Fetch a path from Spoolman and unwrap the reply. */
async function proxyGet(path: string, useV2 = true): Promise<unknown> {
    const payload = await Vue.$socket.emitAndWait('server.spoolman.proxy', {
        request_method: 'GET',
        path,
        use_v2_response: useV2,
    })

    return convertV2response(payload)
}

export const actions: ActionTree<ServerSpoolmanState, RootState> = {
    reset({ commit }): void {
        commit('reset')
    },

    async init({ dispatch }): Promise<void> {
        logDebug('init')

        // Independent requests, so they are issued together and reported
        // separately rather than one failure hiding the others.
        const results = await Promise.allSettled([
            dispatch('loadActiveSpoolId'),
            dispatch('loadInfo'),
            dispatch('loadHealth'),
            dispatch('loadVendors'),
        ])

        results.forEach((result) => {
            if (result.status === 'rejected') logError('Init request failed:', result.reason)
        })

        // Load the spools without waiting. Happy Hare and AFC need this data
        // to show spool details, but the list can be large and startup should
        // not block on it.
        dispatch('refreshSpools')
    },

    async loadActiveSpoolId({ dispatch }): Promise<void> {
        const { spool_id } = await Vue.$socket.emitAndWait('server.spoolman.get_spool_id')

        await dispatch('applyActiveSpoolId', spool_id)
    },

    /*
     * Store the active spool id and pull its details.
     *
     * Separate from loadActiveSpoolId because Moonraker also announces a
     * change unprompted through notify_active_spool_set, which carries the
     * new id and so does not need to be queried again.
     */
    async applyActiveSpoolId({ commit, dispatch }, spool_id: number | null): Promise<void> {
        commit('setActiveSpoolId', spool_id)

        // also set active spool to null, if spool_id is 0 or null
        if (spool_id === null || spool_id === 0) {
            commit('setActiveSpool', null)
            return
        }

        await dispatch('refreshActiveSpool')
    },

    async notifyActiveSpoolChanged({ dispatch }, payload: { spool_id: number | null }): Promise<void> {
        await dispatch('applyActiveSpoolId', payload.spool_id)
    },

    async loadInfo({ commit }): Promise<void> {
        const info = await proxyGet('/v1/info')
        if (info === null) return

        commit('setInfo', info)
    },

    async loadHealth({ commit }): Promise<void> {
        const health = await proxyGet('/v1/health')
        if (health === null) return

        commit('setHealth', (health as { status: string }).status)
    },

    async loadVendors({ commit }): Promise<void> {
        const vendors = await proxyGet('/v1/vendor')
        if (vendors === null) return

        commit(
            'setVendors',
            Object.entries(vendors as Record<string, unknown>).map((value) => value)
        )
    },

    async refreshSpools({ commit, dispatch }): Promise<void> {
        dispatch('socket/addLoading', 'refreshSpools', { root: true })

        try {
            const spools = await proxyGet('/v1/spool', false)
            if (spools === null) return

            commit('setSpools', Object.entries(spools as Record<string, unknown>).map(([, spool]) => spool))
        } catch (error) {
            logError('Failed to load spools:', error)
        } finally {
            dispatch('socket/removeLoading', 'refreshSpools', { root: true })
        }
    },

    async setActiveSpool({ dispatch }, id: number | null): Promise<void> {
        const params: { spool_id?: number } = {}
        if (id !== null) params['spool_id'] = id

        try {
            await Vue.$socket.emitAndWait('server.spoolman.post_spool_id', params)
        } catch (error) {
            logError('Failed to set the active spool:', error)
            return
        }

        await dispatch('loadActiveSpoolId')
    },

    async refreshActiveSpool({ commit, state }): Promise<void> {
        if (state.active_spool_id === null) return

        try {
            const spool = await proxyGet(`/v1/spool/${state.active_spool_id}`)
            if (spool === null) return

            commit('setActiveSpool', spool)
        } catch (error) {
            logError('Failed to load the active spool:', error)
        }
    },
}
