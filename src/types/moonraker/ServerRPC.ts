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
