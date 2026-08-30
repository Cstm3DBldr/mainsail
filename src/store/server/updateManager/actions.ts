import Vue from 'vue'
import { ActionTree } from 'vuex'
import { ServerUpdateManagerState } from '@/store/server/updateManager/types'
import { RootState } from '@/store/types'
import { UpdateStatusEntry } from '@/types/moonraker/MachineRPC'

const LOG_PREFIX = '[Server][UpdateManager]'
const logDebug = (...args: unknown[]) => window.console.debug(LOG_PREFIX, ...args)
const logError = (...args: unknown[]) => window.console.error(LOG_PREFIX, ...args)

export const actions: ActionTree<ServerUpdateManagerState, RootState> = {
    reset({ commit }): void {
        commit('reset')
    },

    async init({ dispatch }): Promise<void> {
        logDebug('init')

        try {
            await dispatch('refresh')
        } catch (error) {
            logError('Failed to load update status:', error)
        }
    },

    /*
     * Fetch the update status and rebuild the repo lists from it.
     *
     * Rejects on failure so a caller triggering this from the UI can react,
     * while init() logs and carries on rather than blocking startup.
     *
     * `refresh` asks Moonraker to re-query the remotes instead of answering
     * from its cache, which is slow and rate limited by GitHub, so it is
     * only used when the user explicitly asks for it.
     */
    async refresh({ dispatch }, payload: { refresh?: boolean; loading?: string } = {}): Promise<void> {
        const response = await Vue.$socket.emitAndWait(
            'machine.update.status',
            { refresh: payload.refresh ?? false },
            { loading: payload.loading ?? null }
        )

        dispatch('onUpdateStatus', response)
    },

    /*
     * Apply an update status payload to the store.
     *
     * Separate from refresh() because Moonraker also pushes this shape
     * unprompted via the notify_update_refreshed notification.
     */
    onUpdateStatus({ commit }, payload: { version_info?: Record<string, UpdateStatusEntry> }): void {
        const version_info = payload.version_info ?? {}

        commit('resetRepos')

        for (const name of Object.keys(version_info)) {
            const module = version_info[name] ?? {}
            const configured_type = module.configured_type ?? ''

            if (['git_repo', 'zip'].includes(configured_type)) {
                commit('storeGitRepo', { ...module, name })
                continue
            }

            if (['web', 'web_beta', 'python'].includes(configured_type)) {
                commit('storeWebRepo', { ...module, name })
                continue
            }

            if (name === 'system') {
                commit('updateSystem', { ...module })
            }
        }

        logDebug(`Loaded ${Object.keys(version_info).length} update entries`)
    },
}
