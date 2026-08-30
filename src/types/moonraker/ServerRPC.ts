/**
 * Server Administration RPC Interface
 *
 * These endpoints provide access to server status, data tracking, and administrative requests.
 *
 * @see https://moonraker.readthedocs.io/en/latest/external_api/server/
 */
export interface ServerRPC {
    /**
     * Query Moonraker server information.
     * Returns details about the server state, loaded components, and version info.
     */
    'server.info': () => Promise<{
        /** Reports if the Klippy unix domain socket is connected */
        klippy_connected: boolean
        /** Reports the current state of Klippy */
        klippy_state: 'ready' | 'startup' | 'shutdown' | 'error' | 'disconnected'
        /** A list of components that are currently loaded in Moonraker */
        components: string[]
        /** A list of components that failed to load in Moonraker */
        failed_components: string[]
        /** A list of directories that Moonraker has registered */
        registered_directories: string[]
        /** A list of warnings that Moonraker has generated */
        warnings: string[]
        /** The number of websocket connections that Moonraker is currently serving */
        websocket_count: number
        /** The full version of Moonraker that is currently running */
        moonraker_version: string
        /** The version of the Moonraker API in tuple format */
        api_version: [number, number, number]
        /** The version of the Moonraker API as string */
        api_version_string: string
    }>

    /**
     * Get the current Moonraker configuration.
     * Returns the full configuration including all components.
     */
    'server.config': () => Promise<{
        /** An object containing the full Moonraker configuration */
        config: Record<string, Record<string, unknown>>
        /** An object containing the original configuration as read from config files */
        orig: Record<string, Record<string, string>>
        /** An array of file objects describing the config files parsed */
        files: Array<{
            /** The name of the configuration file (relative path) */
            filename: string
            /** The config sections parsed from this file */
            sections: string[]
        }>
    }>

    /**
     * Request cached temperature data.
     * Returns temperature history for all sensors.
     */
    'server.temperature_store': (params?: {
        /** When true, include temperature monitors (sensors that may have null values) */
        include_monitors?: boolean
    }) => Promise<
        Record<
            string,
            {
                /** History of temperature measurements (null values possible for monitors) */
                temperatures: (number | null)[]
                /** History of temperature targets for heaters */
                targets?: number[]
                /** History of power values for heaters (0-1 PWM duty cycle) */
                powers?: number[]
                /** History of speed values for fans (0-1 PWM duty cycle) */
                speeds?: number[]
            }
        >
    >

    /**
     * Request cached GCode responses.
     * Returns a FIFO queue of gcode messages with the oldest item at index 0.
     */
    'server.gcode_store': (params?: {
        /** Number of cached responses to return (default: all) */
        count?: number
    }) => Promise<{
        /** Array of cached gcode messages (FIFO, oldest first) */
        gcode_store: Array<{
            /** The GCode message */
            message: string
            /** Unix timestamp when message was received */
            time: number
            /** Message type: command (via API) or response (from Klippy) */
            type: 'command' | 'response'
        }>
    }>

    /**
     * Requests a manual rollover for log files registered with Moonraker's log management facility.
     * Currently limited to moonraker.log and klippy.log.
     */
    'server.logs.rollover': (params?: {
        /** The application for which the log should be rolled over. When omitted, all logs are rolled over. */
        application?: 'moonraker' | 'klipper'
    }) => Promise<{
        /** A list of application names successfully rolled over */
        rolled_over: string[]
        /** An object where fields are application names that failed, values are error messages */
        failed: Record<string, string>
    }>

    /**
     * Restart the Moonraker server.
     */
    'server.restart': () => Promise<'ok'>

    /**
     * Identify the client connection to Moonraker.
     * This should be called immediately after the websocket connection is established.
     */
    'server.connection.identify': (params: {
        /** The name of your client (e.g., 'Mainsail', 'Fluidd', 'KlipperScreen') */
        client_name: string
        /** The current version of the connected client */
        version: string
        /** Application type */
        type: 'web' | 'mobile' | 'desktop' | 'display' | 'bot' | 'agent' | 'other'
        /** The URL for your client's homepage */
        url: string
        /** Optional JWT for user authentication */
        access_token?: string
        /** Optional system API key for clients without user authentication */
        api_key?: string
    }) => Promise<{
        /** The connection's unique identifier */
        connection_id: number
    }>

    /**
     * Get the unique identifier for this websocket connection.
     * @deprecated Use server.connection.identify instead to retrieve the connection ID.
     */
    'server.websocket.id': () => Promise<{
        /** A unique identifier for this connection */
        websocket_id: number
    }>

    /**
     * Get a list of all configured sensors, keyed by sensor id.
     */
    'server.sensors.list': () => Promise<{
        /** Configured sensors, keyed by sensor id */
        sensors: Record<string, Sensor>
    }>

    /**
     * Get a list of current announcements and the feeds they came from.
     */
    'server.announcements.list': (params?: {
        /** When true, include announcements the user has already dismissed */
        include_dismissed?: boolean
    }) => Promise<{
        /** Current announcements, newest first */
        entries: AnnouncementEntry[]
        /** Names of the subscribed feeds */
        feeds: string[]
    }>

    /**
     * Dismiss an announcement, optionally only for a set time.
     */
    'server.announcements.dismiss': (params: {
        /** The announcement to dismiss */
        entry_id: string
        /** Seconds until the announcement reappears. Omit to dismiss permanently. */
        wake_time?: number
    }) => Promise<{
        /** The dismissed announcement's id */
        entry_id: string
    }>

    /**
     * Get the current job queue and its state.
     */
    'server.job_queue.status': () => Promise<JobQueueStatus>

    /**
     * Add one or more files to the job queue.
     *
     * A filename may be repeated to queue the same file several times.
     */
    'server.job_queue.post_job': (params: {
        /** Files to enqueue, relative to the gcodes root */
        filenames: string[]
        /** Replace the existing queue rather than appending to it */
        reset?: boolean
    }) => Promise<JobQueueStatus>

    /**
     * Remove jobs from the queue, either by id or all at once.
     */
    'server.job_queue.delete_job': (params: {
        /** Ids of the jobs to remove. Ignored when `all` is set. */
        job_ids?: string[]
        /** Clear the whole queue */
        all?: boolean
    }) => Promise<JobQueueStatus>

    /**
     * Start processing the job queue.
     */
    'server.job_queue.start': () => Promise<JobQueueStatus>

    /**
     * Pause the job queue, leaving any running print alone.
     */
    'server.job_queue.pause': () => Promise<JobQueueStatus>

    /**
     * Get the spool id Moonraker is currently tracking filament usage against.
     */
    'server.spoolman.get_spool_id': () => Promise<{
        /** The active spool's id, or null when none is set */
        spool_id: number | null
    }>

    /**
     * Set the spool to track filament usage against.
     */
    'server.spoolman.post_spool_id': (params: {
        /** The spool to make active. Omit to clear the active spool. */
        spool_id?: number
    }) => Promise<{
        /** The active spool's id, or null when cleared */
        spool_id: number | null
    }>

    /**
     * Forward a request to the Spoolman server.
     *
     * Moonraker proxies rather than models the Spoolman API, so the response
     * is whatever Spoolman returned and is narrowed by the caller.
     *
     * @see https://moonraker.readthedocs.io/en/latest/external_api/spoolman/
     */
    'server.spoolman.proxy': (params: {
        /** HTTP method to use against the Spoolman server */
        request_method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
        /** Path on the Spoolman server, e.g. `/v1/spool` */
        path: string
        /** Request body, for methods that take one */
        body?: unknown
        /**
         * Wrap the reply so a Spoolman error is reported in the result rather
         * than rejecting the RPC call. Without it a failing request is
         * indistinguishable from an empty one.
         */
        use_v2_response?: boolean
    }) => Promise<SpoolmanProxyResponse>
}

/**
 * Sensor reported by Moonraker's [sensor] component.
 */
export interface Sensor {
    /** Display name configured for the sensor */
    friendly_name: string
    /** Sensor id, matching its key in the sensors object */
    id: string
    /** The configured sensor type, e.g. `mqtt` */
    type: string
    /** Most recent measurement per field */
    values: Record<string, number>
}

/**
 * Announcement reported by Moonraker's [announcements] component.
 *
 * Dates are unix timestamps in seconds; the store converts them to Date
 * objects when applying the payload.
 */
export interface AnnouncementEntry {
    /** Unique id of the announcement */
    entry_id: string
    /** Link to the full announcement */
    url: string
    /** Short headline */
    title: string
    /** Body text */
    description: string
    /** Announcement importance */
    priority: 'normal' | 'high'
    /** When the announcement was published */
    date: number
    /** Whether the user has dismissed it */
    dismissed: boolean
    /** When it was dismissed, if it was */
    date_dismissed?: number | null
    /** When a temporary dismissal expires */
    dismiss_wake?: number | null
    /** Where the announcement originated, e.g. `moonraker` */
    source: string
    /** The feed it was published in */
    feed: string
}

/**
 * Job queue state, returned by every server.job_queue method.
 */
export interface JobQueueStatus {
    /** Jobs waiting in the queue, in order */
    queued_jobs: QueuedJob[]
    /** Whether the queue is processing, paused, or idle */
    queue_state: 'ready' | 'loading' | 'starting' | 'paused'
}

/**
 * One entry of the job queue.
 */
export interface QueuedJob {
    /** Path of the file, relative to the gcodes root */
    filename: string
    /** Unique id of this queue entry */
    job_id: string
    /** Unix timestamp when the job was queued */
    time_added: number
    /** Seconds the job has been waiting */
    time_in_queue: number
}

/**
 * Reply to a server.spoolman.proxy request.
 *
 * With `use_v2_response` the payload is nested under `response` and any
 * failure is reported in `error`. Without it, the reply is the proxied
 * payload itself.
 */
export type SpoolmanProxyResponse = {
    /** The proxied payload, present when use_v2_response was requested */
    response?: unknown
    /** Set when Spoolman reported a failure */
    error?: { message: string } | null
} & Record<string, unknown>
