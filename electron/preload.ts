import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
    hudOverlayHide: () => {
      ipcRenderer.send('hud-overlay-hide');
    },
    hudOverlayClose: () => {
      ipcRenderer.send('hud-overlay-close');
    },
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options)
  },
  getAssetBasePath: async () => {
    // ask main process for the correct base path (production vs dev)
    return await ipcRenderer.invoke('get-asset-base-path')
  },
  getSources: async (opts: Electron.SourcesOptions) => {
    return await ipcRenderer.invoke('get-sources', opts)
  },
  switchToEditor: () => {
    return ipcRenderer.invoke('switch-to-editor')
  },
  openSourceSelector: (mode?: 'window' | 'region' | 'all') => {
    return ipcRenderer.invoke('open-source-selector', mode)
  },
  selectSource: (source: any) => {
    return ipcRenderer.invoke('select-source', source)
  },
  getSelectedSource: () => {
    return ipcRenderer.invoke('get-selected-source')
  },

  storeRecordedVideo: (videoData: ArrayBuffer, fileName: string) => {
    return ipcRenderer.invoke('store-recorded-video', videoData, fileName)
  },

  getRecordedVideoPath: () => {
    return ipcRenderer.invoke('get-recorded-video-path')
  },
  setRecordingState: (recording: boolean) => {
    return ipcRenderer.invoke('set-recording-state', recording)
  },
  onStopRecordingFromTray: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('stop-recording-from-tray', listener)
    return () => ipcRenderer.removeListener('stop-recording-from-tray', listener)
  },
  openExternalUrl: (url: string) => {
    return ipcRenderer.invoke('open-external-url', url)
  },
  saveExportedVideo: (videoData: ArrayBuffer, fileName: string) => {
    return ipcRenderer.invoke('save-exported-video', videoData, fileName)
  },
  openVideoFilePicker: () => {
    return ipcRenderer.invoke('open-video-file-picker')
  },
  setCurrentVideoPath: (path: string) => {
    return ipcRenderer.invoke('set-current-video-path', path)
  },
  getCurrentVideoPath: () => {
    return ipcRenderer.invoke('get-current-video-path')
  },
  clearCurrentVideoPath: () => {
    return ipcRenderer.invoke('clear-current-video-path')
  },
  getPlatform: () => {
    return ipcRenderer.invoke('get-platform')
  },
  
  // Camera Preview Window APIs
  showCameraPreview: (options: { size: number; shape: 'circle' | 'rectangle'; position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) => {
    return ipcRenderer.invoke('show-camera-preview', options)
  },
  hideCameraPreview: () => {
    return ipcRenderer.invoke('hide-camera-preview')
  },
  closeCameraPreview: () => {
    return ipcRenderer.invoke('close-camera-preview')
  },
  updateCameraPreview: (options: { size?: number; shape?: 'circle' | 'rectangle'; position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'; recording?: boolean }) => {
    return ipcRenderer.invoke('update-camera-preview', options)
  },
  resizeCameraPreview: (newSize: number) => {
    return ipcRenderer.invoke('resize-camera-preview', newSize)
  },
  resizeCameraPreviewRect: (newWidth: number, newHeight: number) => {
    return ipcRenderer.invoke('resize-camera-preview-rect', newWidth, newHeight)
  },
  positionCameraPreviewInArea: (options: { 
    area: { x: number; y: number; width: number; height: number }; 
    size: number; 
    shape: 'circle' | 'rectangle'; 
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' 
  }) => {
    return ipcRenderer.invoke('position-camera-preview-in-area', options)
  },
  getSourceBounds: (sourceId: string, sourceName?: string, videoDimensions?: { width: number; height: number }) => {
    return ipcRenderer.invoke('get-source-bounds', sourceId, sourceName, videoDimensions)
  },
  getScreenForWindow: (windowName: string) => {
    return ipcRenderer.invoke('get-screen-for-window', windowName)
  },
  onCameraPreviewInit: (callback: (options: any) => void) => {
    const listener = (_: any, options: any) => callback(options)
    ipcRenderer.on('camera-preview-init', listener)
    return () => ipcRenderer.removeListener('camera-preview-init', listener)
  },
  onCameraPreviewUpdate: (callback: (options: any) => void) => {
    const listener = (_: any, options: any) => callback(options)
    ipcRenderer.on('camera-preview-update', listener)
    return () => ipcRenderer.removeListener('camera-preview-update', listener)
  },

  // Mouse tracking APIs
  startMouseTracking: (bounds: { x: number; y: number; width: number; height: number }) => {
    return ipcRenderer.invoke('start-mouse-tracking', bounds)
  },
  checkAccessibilityPermission: () => {
    return ipcRenderer.invoke('check-accessibility-permission')
  },
  requestAccessibilityPermission: () => {
    return ipcRenderer.invoke('request-accessibility-permission')
  },
  stopMouseTracking: () => {
    return ipcRenderer.invoke('stop-mouse-tracking')
  },
  isMouseTracking: () => {
    return ipcRenderer.invoke('is-mouse-tracking')
  },
  recordMouseClick: (button: 'left' | 'right' | 'middle' = 'left') => {
    return ipcRenderer.invoke('record-mouse-click', button)
  },
  saveMouseEvents: (mouseData: any, fileName: string) => {
    return ipcRenderer.invoke('save-mouse-events', mouseData, fileName)
  },
  loadMouseEvents: (videoPath: string) => {
    return ipcRenderer.invoke('load-mouse-events', videoPath)
  },
  checkFileExists: (filePath: string) => {
    return ipcRenderer.invoke('check-file-exists', filePath)
  },

  // Region Selection APIs
  openRegionSelector: () => {
    return ipcRenderer.invoke('open-region-selector')
  },
  confirmRegionSelection: (region: { x: number; y: number; width: number; height: number }) => {
    return ipcRenderer.invoke('confirm-region-selection', region)
  },
  cancelRegionSelection: () => {
    return ipcRenderer.invoke('cancel-region-selection')
  },
  saveRegionInfo: (regionInfo: { x: number; y: number; width: number; height: number }, fileName: string) => {
    return ipcRenderer.invoke('save-region-info', regionInfo, fileName)
  },
  loadRegionInfo: (videoPath: string) => {
    return ipcRenderer.invoke('load-region-info', videoPath)
  },
  getScreenForRegion: (region: { x: number; y: number; width: number; height: number }) => {
    return ipcRenderer.invoke('get-screen-for-region', region)
  },

  // Window Picker APIs (窗口选择器)
  openWindowPicker: () => {
    return ipcRenderer.invoke('open-window-picker')
  },
  confirmWindowPicker: (windowInfo: { id: string; name: string }) => {
    return ipcRenderer.invoke('confirm-window-picker', windowInfo)
  },
  cancelWindowPicker: () => {
    return ipcRenderer.invoke('cancel-window-picker')
  },
  hideWindowPicker: () => {
    return ipcRenderer.invoke('hide-window-picker')
  },
  showWindowPicker: () => {
    return ipcRenderer.invoke('show-window-picker')
  },
  setWindowPickerIgnoreMouse: (ignore: boolean) => {
    return ipcRenderer.invoke('set-window-picker-ignore-mouse', ignore)
  },
  getActiveWindowSource: () => {
    return ipcRenderer.invoke('get-active-window-source')
  },
  // 原生窗口检测 API
  isWindowDetectionAvailable: () => {
    return ipcRenderer.invoke('is-window-detection-available')
  },
  getWindowUnderCursor: () => {
    return ipcRenderer.invoke('get-window-under-cursor')
  },
  findWindowSource: (title: string) => {
    return ipcRenderer.invoke('find-window-source', title)
  },

  // Region Indicator APIs (for showing recording area overlay)
  showRegionIndicator: (region: { x: number; y: number; width: number; height: number }) => {
    return ipcRenderer.invoke('show-region-indicator', region)
  },
  hideRegionIndicator: () => {
    return ipcRenderer.invoke('hide-region-indicator')
  },
  closeRegionIndicator: () => {
    return ipcRenderer.invoke('close-region-indicator')
  },
  updateRegionIndicator: (data: { 
    region?: { x: number; y: number; width: number; height: number };
    isRecording?: boolean;
    isPaused?: boolean;
  }) => {
    return ipcRenderer.invoke('update-region-indicator', data)
  },
  onRegionIndicatorUpdate: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('region-indicator-update', callback)
  },
  removeRegionIndicatorListener: () => {
    ipcRenderer.removeAllListeners('region-indicator-update')
  },

  // Pro Feature APIs - Keyframes and Flow Graph
  saveKeyframeImage: (imageData: string, fileName: string) => {
    return ipcRenderer.invoke('save-keyframe-image', imageData, fileName)
  },
  saveFlowGraph: (flowGraphJson: string, fileName: string) => {
    return ipcRenderer.invoke('save-flow-graph', flowGraphJson, fileName)
  },
  loadFlowGraph: (filePath: string) => {
    return ipcRenderer.invoke('load-flow-graph', filePath)
  },
  listFlowGraphs: () => {
    return ipcRenderer.invoke('list-flow-graphs')
  },
  exportFlowGraphZip: (zipData: ArrayBuffer, fileName: string) => {
    return ipcRenderer.invoke('export-flow-graph-zip', zipData, fileName)
  },
  deleteFlowGraph: (filePath: string) => {
    return ipcRenderer.invoke('delete-flow-graph', filePath)
  },
})