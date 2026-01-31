/// <reference types="vite/client" />
/// <reference types="../electron/electron-env" />

interface ProcessedDesktopSource {
  id: string;
  name: string;
  display_id: string;
  thumbnail: string | null;
  appIcon: string | null;
}

interface Window {
  electronAPI: {
    getSources: (opts: Electron.SourcesOptions) => Promise<ProcessedDesktopSource[]>
    switchToEditor: () => Promise<void>
    openSourceSelector: () => Promise<void>
    selectSource: (source: any) => Promise<any>
    getSelectedSource: () => Promise<any>
    storeRecordedVideo: (videoData: ArrayBuffer, fileName: string) => Promise<{
      success: boolean
      path?: string
      message: string
      error?: string
    }>
    getRecordedVideoPath: () => Promise<{
      success: boolean
      path?: string
      message?: string
      error?: string
    }>
    getAssetBasePath: () => Promise<string | null>
    setRecordingState: (recording: boolean) => Promise<void>
    onStopRecordingFromTray: (callback: () => void) => () => void
    openExternalUrl: (url: string) => Promise<{ success: boolean; error?: string }>
    saveExportedVideo: (videoData: ArrayBuffer, fileName: string) => Promise<{
      success: boolean
      path?: string
      message?: string
      cancelled?: boolean
    }>
    openVideoFilePicker: () => Promise<{ success: boolean; path?: string; cancelled?: boolean }>
    setCurrentVideoPath: (path: string) => Promise<{ success: boolean }>
    getCurrentVideoPath: () => Promise<{ success: boolean; path?: string }>
    clearCurrentVideoPath: () => Promise<{ success: boolean }>
    getPlatform: () => Promise<string>
    
    // HUD Overlay
    hudOverlayHide: () => void
    hudOverlayClose: () => void
    
    // Camera Preview Window APIs
    showCameraPreview: (options: { size: number; shape: 'circle' | 'rectangle'; position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'; borderStyle?: string; shadowIntensity?: number }) => Promise<void>
    hideCameraPreview: () => Promise<void>
    closeCameraPreview: () => Promise<void>
    updateCameraPreview: (options: { size?: number; shape?: 'circle' | 'rectangle'; position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'; recording?: boolean; borderStyle?: string; shadowIntensity?: number }) => Promise<void>
    resizeCameraPreview: (newSize: number) => Promise<void>
    resizeCameraPreviewRect: (newWidth: number, newHeight: number) => Promise<void>
    positionCameraPreviewInArea: (options: { 
      area: { x: number; y: number; width: number; height: number }; 
      size: number; 
      shape: 'circle' | 'rectangle'; 
      position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' 
    }) => Promise<void>
    getSourceBounds: (sourceId: string, sourceName?: string, videoDimensions?: { width: number; height: number }) => Promise<any>
    getScreenForWindow: (windowName: string) => Promise<any>
    onCameraPreviewInit: (callback: (options: any) => void) => () => void
    onCameraPreviewUpdate: (callback: (options: any) => void) => () => void
    
    // Mouse tracking APIs
    startMouseTracking: (bounds: { x: number; y: number; width: number; height: number }) => Promise<void>
    checkAccessibilityPermission: () => Promise<boolean>
    requestAccessibilityPermission: () => Promise<void>
    stopMouseTracking: () => Promise<any>
    isMouseTracking: () => Promise<boolean>
    recordMouseClick: (button?: 'left' | 'right' | 'middle') => Promise<void>
    saveMouseEvents: (mouseData: any, fileName: string) => Promise<any>
    loadMouseEvents: (videoPath: string) => Promise<any>
    checkFileExists: (filePath: string) => Promise<boolean>
    
    // Region Selection APIs
    openRegionSelector: () => Promise<{ x: number; y: number; width: number; height: number } | null>
    confirmRegionSelection: (region: { x: number; y: number; width: number; height: number }) => Promise<void>
    cancelRegionSelection: () => Promise<void>
    saveRegionInfo: (regionInfo: { x: number; y: number; width: number; height: number }, fileName: string) => Promise<any>
    loadRegionInfo: (videoPath: string) => Promise<any>
    getScreenForRegion: (region: { x: number; y: number; width: number; height: number }) => Promise<any>
    
    // Pro Feature APIs - Keyframes and Flow Graph
    saveKeyframeImage: (imageData: string, fileName: string) => Promise<any>
    saveFlowGraph: (flowGraphJson: string, fileName: string) => Promise<any>
    loadFlowGraph: (filePath: string) => Promise<any>
    listFlowGraphs: () => Promise<any>
    exportFlowGraphZip: (zipData: ArrayBuffer, fileName: string) => Promise<any>
    deleteFlowGraph: (filePath: string) => Promise<any>
    
    // Native Video Export APIs
    checkNativeExporter: () => Promise<boolean>
    getNativeEncoders: () => Promise<string[]>
    getNativeGpuInfo: () => Promise<{ supported: boolean; name?: string; backend?: string; memoryMb?: number }>
    nativeExport: (config: any, onProgress?: (progress: any) => void) => Promise<any>
    cancelNativeExport: () => Promise<boolean>
  }
}
