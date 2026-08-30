import Vue from 'vue'
import { ActionTree } from 'vuex'
import { RootState } from '@/store/types'
import { ServerJobQueueState, ServerJobQueueStateJob } from '@/store/server/jobQueue/types'

const LOG_PREFIX = '[Server][JobQueue]'
const logDebug = (...args: unknown[]) => window.console.debug(LOG_PREFIX, ...args)
const logError = (...args: unknown[]) => window.console.error(LOG_PREFIX, ...args)

export const actions: ActionTree<ServerJobQueueState, RootState> = {
    reset({ commit }): void {
        commit('reset')
    },

    async init({ dispatch }): Promise<void> {
        logDebug('init')

        try {
            const status = await Vue.$socket.emitAndWait('server.job_queue.status')
            dispatch('getStatus', status)

            logDebug(`Loaded ${status.queued_jobs?.length ?? 0} queued job(s)`)
        } catch (error) {
            logError('Failed to load job queue:', error)
        }
    },

    getEvent({ commit }, payload): void {
        if ('updated_queue' in payload && payload.updated_queue !== null) commit('setQueuedJobs', payload.updated_queue)
        if ('queue_state' in payload) commit('setQueueState', payload.queue_state)
    },

    /*
     * Apply a queue status payload to the store.
     *
     * Every server.job_queue method answers with this shape, so the actions
     * below reuse it instead of waiting for the change notification.
     */
    getStatus({ commit }, payload): void {
        if ('queued_jobs' in payload) commit('setQueuedJobs', payload.queued_jobs)
        if ('queue_state' in payload) commit('setQueueState', payload.queue_state)
    },

    async addToQueue({ dispatch }, filenames: string[]): Promise<void> {
        try {
            const status = await Vue.$socket.emitAndWait('server.job_queue.post_job', { filenames })
            dispatch('getStatus', status)
        } catch (error) {
            logError('Failed to add jobs to the queue:', error)
        }
    },

    changeCount({ dispatch, getters }, payload: { job_id: string; count: number }): void {
        const jobs: ServerJobQueueStateJob[] = getters['getJobs']

        const index = jobs.findIndex((job) => job.job_id === payload.job_id)
        if (index === -1) return

        jobs[index].combinedIds = Array(payload.count - 1).fill(payload.job_id)

        dispatch('sendNewQueueList', { jobs })
    },

    changePosition({ dispatch, getters }, payload: { oldIndex: number; newIndex: number }): void {
        const jobs: ServerJobQueueStateJob[] = getters['getJobs']

        const job = jobs.splice(payload.oldIndex, 1)[0]
        jobs.splice(payload.newIndex, 0, job)

        dispatch('sendNewQueueList', { jobs })
    },

    startByJobId({ dispatch, getters }, job_id: string): void {
        const jobs: ServerJobQueueStateJob[] = getters['getJobs']

        const index = jobs.findIndex((job) => job.job_id === job_id)
        if (index === -1) return

        const job = jobs.splice(index, 1)[0]
        jobs.splice(0, 0, job)

        dispatch('sendNewQueueList', { jobs, printStart: true })
    },

    /*
     * Replace the queue with the given job list.
     *
     * The queue is a flat list of filenames, so a job the user asked to run
     * several times is expanded back out to one entry per run.
     */
    async sendNewQueueList(
        { dispatch },
        payload: { jobs: ServerJobQueueStateJob[]; printStart?: boolean }
    ): Promise<void> {
        const filenames = payload.jobs
            .map((job) => {
                const numJobs = (job.combinedIds?.length ?? 0) + 1
                // return job.filename if the job will be only printed one time
                if (numJobs === 1) return job.filename

                // return an array of job.filename if the job will be printed multiple times
                return Array(numJobs).fill(job.filename)
            })
            .flat()

        try {
            const status = await Vue.$socket.emitAndWait('server.job_queue.post_job', { filenames, reset: true })
            dispatch('getStatus', status)

            // Only start once the reordered queue is in place, so the job the
            // user picked is the one that runs.
            if (payload.printStart) await dispatch('start')
        } catch (error) {
            logError('Failed to update the job queue:', error)
        }
    },

    async deleteFromQueue({ dispatch }, job_ids: string[]): Promise<void> {
        try {
            const status = await Vue.$socket.emitAndWait('server.job_queue.delete_job', { job_ids })
            dispatch('getStatus', status)
        } catch (error) {
            logError('Failed to remove jobs from the queue:', error)
        }
    },

    async clearQueue({ dispatch }): Promise<void> {
        try {
            const status = await Vue.$socket.emitAndWait('server.job_queue.delete_job', { all: true })
            dispatch('getStatus', status)
        } catch (error) {
            logError('Failed to clear the job queue:', error)
        }
    },

    async start({ dispatch }): Promise<void> {
        try {
            const status = await Vue.$socket.emitAndWait('server.job_queue.start', undefined, {
                loading: 'startJobqueue',
            })
            dispatch('getStatus', status)
        } catch (error) {
            logError('Failed to start the job queue:', error)
        }
    },

    async pause({ dispatch }): Promise<void> {
        try {
            const status = await Vue.$socket.emitAndWait('server.job_queue.pause', undefined, {
                loading: 'pauseJobqueue',
            })
            dispatch('getStatus', status)
        } catch (error) {
            logError('Failed to pause the job queue:', error)
        }
    },
}
