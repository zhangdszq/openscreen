/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  electronAPI: {
    getSources: (opts: Electron.SourcesOptions) => Promise<ProcessedDesktopSource[]>
    switchToEditor: () => Promise<void>
    openSourceSelector: () => Promise<void>
    selectSource: (source: any) => Promise<any>
    getSelectedSource: () => Promise<any>
    storeRecordedVideo: (videoData: ArrayBuffer, fileName: string) => Promise<{ success: boolean; path?: string; message?: string }>
    getRecordedVideoPath: () => Promise<{ success: boolean; path?: string; message?: string }>
    setRecordingState: (recording: boolean) => Promise<void>
    onStopRecordingFromTray: (callback: () => void) => () => void
    openExternalUrl: (url: string) => Promise<{ success: boolean; error?: string }>
    saveExportedVideo: (videoData: ArrayBuffer, fileName: string) => Promise<{ success: boolean; path?: string; message?: string; cancelled?: boolean }>
    openVideoFilePicker: () => Promise<{ success: boolean; path?: string; cancelled?: boolean }>
    setCurrentVideoPath: (path: string) => Promise<{ success: boolean }>
    getCurrentVideoPath: () => Promise<{ success: boolean; path?: string }>
    clearCurrentVideoPath: () => Promise<{ success: boolean }>
    getPlatform: () => Promise<string>
    hudOverlayHide: () => void;
    hudOverlayClose: () => void;
    // Camera Preview APIs
    showCameraPreview?: (options: { size: number; shape: 'circle' | 'rectangle'; position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) => Promise<{ success: boolean }>
    hideCameraPreview?: () => Promise<{ success: boolean }>
    closeCameraPreview?: () => Promise<{ success: boolean }>
    updateCameraPreview?: (options: { size?: number; shape?: 'circle' | 'rectangle'; position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'; recording?: boolean }) => Promise<{ success: boolean }>
    resizeCameraPreview?: (newSize: number) => Promise<{ success: boolean }>
    positionCameraPreviewInArea?: (options: { area: { x: number; y: number; width: number; height: number }; size: number; shape: 'circle' | 'rectangle'; position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) => Promise<{ success: boolean }>
    getSourceBounds?: (sourceId: string, sourceName?: string, videoDimensions?: { width: number; height: number }) => Promise<{ success: boolean; bounds?: { x: number; y: number; width: number; height: number }; isScreen?: boolean }>
    getScreenForWindow?: (windowName: string) => Promise<{ success: boolean; screenId?: string; displayBounds?: { x: number; y: number; width: number; height: number } }>
    onCameraPreviewInit?: (callback: (options: any) => void) => () => void
    onCameraPreviewUpdate?: (callback: (options: any) => void) => () => void
  }
}

interface ProcessedDesktopSource {
  id: string
  name: string
  display_id: string
  thumbnail: string | null
  appIcon: string | null
}
