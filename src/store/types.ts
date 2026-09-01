import { SocketState } from '@/store/socket/types'
import { ServerState } from '@/store/server/types'
import { PrinterState } from '@/store/printer/types'
import { GuiState } from '@/store/gui/types'
import { EditorState } from '@/store/editor/types'

export interface RootState {
    packageVersion: string
    debugMode: boolean
    naviDrawer: boolean | null
    instancesDB: 'moonraker' | 'browser' | 'json'
    configInstances: ConfigJsonInstance[]
    configCustomPanels: ConfigJsonCustomPanel[]

    socket?: SocketState
    gui?: GuiState
    printer?: PrinterState
    server?: ServerState
    editor?: EditorState
}

export interface RootStateDependency {
    serviceName: string
    installedVersion: string
    neededVersion: string
}

export interface ConfigJson {
    defaultTheme?: 'dark' | 'light'
    hostname?: string | null
    port?: string | number | null
    path?: string | null
    instancesDB?: 'moonraker' | 'browser' | 'json'
    instances?: ConfigJsonInstance[]
    customPanels?: ConfigJsonCustomPanel[]
}

export interface ConfigJsonInstance {
    hostname: string
    port?: number
    path?: string
}

export interface ConfigJsonCustomPanel {
    id: string;
    title: string;
    icon: string;
    entryUrl: string;
    collapsible: boolean;
    /*
     * Optional name of a Klipper object this panel needs, e.g. 'autoloader'.
     * When set, the panel is hidden on a printer that does not report that
     * object, the same way the spoolman and mmu panels hide themselves.
     * Without it a hardware-specific plugin still renders its frame on every
     * printer, leaving an empty card the user cannot remove.
     */
    requiresPrinterObject?: string;
}

export interface Theme {
    name: string
    displayName: string
    colorLogo: string
    colorPrimary?: string
    logo?: {
        show: boolean
        light: boolean
    }
    sidebarBackground?: {
        show: boolean
        light: boolean
    }
    mainBackground?: {
        show: boolean
        light: boolean
    }
    css?: boolean
}

export interface KlipperRepos {
    [name: string]: {
        url: string
        docsLanguages?: string[]
    }
}
