"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  // Window control APIs
  windowMinimize: () => {
    electron.ipcRenderer.send("window-minimize");
  },
  windowMaximize: () => {
    electron.ipcRenderer.send("window-maximize");
  },
  windowClose: () => {
    electron.ipcRenderer.send("window-close");
  },
  hudOverlayHide: () => {
    electron.ipcRenderer.send("hud-overlay-hide");
  },
  hudOverlayClose: () => {
    electron.ipcRenderer.send("hud-overlay-close");
  },
  setIgnoreMouseEvents: (ignore, options) => {
    electron.ipcRenderer.send("set-ignore-mouse-events", ignore, options);
  },
  getAssetBasePath: async () => {
    return await electron.ipcRenderer.invoke("get-asset-base-path");
  },
  getSources: async (opts) => {
    return await electron.ipcRenderer.invoke("get-sources", opts);
  },
  switchToEditor: () => {
    return electron.ipcRenderer.invoke("switch-to-editor");
  },
  openSourceSelector: (mode) => {
    return electron.ipcRenderer.invoke("open-source-selector", mode);
  },
  selectSource: (source) => {
    return electron.ipcRenderer.invoke("select-source", source);
  },
  getSelectedSource: () => {
    return electron.ipcRenderer.invoke("get-selected-source");
  },
  storeRecordedVideo: (videoData, fileName) => {
    return electron.ipcRenderer.invoke("store-recorded-video", videoData, fileName);
  },
  getRecordedVideoPath: () => {
    return electron.ipcRenderer.invoke("get-recorded-video-path");
  },
  setRecordingState: (recording) => {
    return electron.ipcRenderer.invoke("set-recording-state", recording);
  },
  onStopRecordingFromTray: (callback) => {
    const listener = () => callback();
    electron.ipcRenderer.on("stop-recording-from-tray", listener);
    return () => electron.ipcRenderer.removeListener("stop-recording-from-tray", listener);
  },
  openExternalUrl: (url) => {
    return electron.ipcRenderer.invoke("open-external-url", url);
  },
  openScreenRecordingSettings: () => {
    return electron.ipcRenderer.invoke("open-screen-recording-settings");
  },
  saveExportedVideo: (videoData, fileName) => {
    return electron.ipcRenderer.invoke("save-exported-video", videoData, fileName);
  },
  openVideoFilePicker: () => {
    return electron.ipcRenderer.invoke("open-video-file-picker");
  },
  setCurrentVideoPath: (path) => {
    return electron.ipcRenderer.invoke("set-current-video-path", path);
  },
  getCurrentVideoPath: () => {
    return electron.ipcRenderer.invoke("get-current-video-path");
  },
  clearCurrentVideoPath: () => {
    return electron.ipcRenderer.invoke("clear-current-video-path");
  },
  getPlatform: () => {
    return electron.ipcRenderer.invoke("get-platform");
  },
  // Camera Preview Window APIs
  showCameraPreview: (options) => {
    return electron.ipcRenderer.invoke("show-camera-preview", options);
  },
  hideCameraPreview: () => {
    return electron.ipcRenderer.invoke("hide-camera-preview");
  },
  closeCameraPreview: () => {
    return electron.ipcRenderer.invoke("close-camera-preview");
  },
  updateCameraPreview: (options) => {
    return electron.ipcRenderer.invoke("update-camera-preview", options);
  },
  resizeCameraPreview: (newSize) => {
    return electron.ipcRenderer.invoke("resize-camera-preview", newSize);
  },
  resizeCameraPreviewRect: (newWidth, newHeight) => {
    return electron.ipcRenderer.invoke("resize-camera-preview-rect", newWidth, newHeight);
  },
  positionCameraPreviewInArea: (options) => {
    return electron.ipcRenderer.invoke("position-camera-preview-in-area", options);
  },
  getSourceBounds: (sourceId, sourceName, videoDimensions) => {
    return electron.ipcRenderer.invoke("get-source-bounds", sourceId, sourceName, videoDimensions);
  },
  getScreenForWindow: (windowName) => {
    return electron.ipcRenderer.invoke("get-screen-for-window", windowName);
  },
  onCameraPreviewInit: (callback) => {
    const listener = (_, options) => callback(options);
    electron.ipcRenderer.on("camera-preview-init", listener);
    return () => electron.ipcRenderer.removeListener("camera-preview-init", listener);
  },
  onCameraPreviewUpdate: (callback) => {
    const listener = (_, options) => callback(options);
    electron.ipcRenderer.on("camera-preview-update", listener);
    return () => electron.ipcRenderer.removeListener("camera-preview-update", listener);
  },
  // Mouse tracking APIs
  startMouseTracking: (bounds) => {
    return electron.ipcRenderer.invoke("start-mouse-tracking", bounds);
  },
  checkAccessibilityPermission: () => {
    return electron.ipcRenderer.invoke("check-accessibility-permission");
  },
  requestAccessibilityPermission: () => {
    return electron.ipcRenderer.invoke("request-accessibility-permission");
  },
  stopMouseTracking: () => {
    return electron.ipcRenderer.invoke("stop-mouse-tracking");
  },
  isMouseTracking: () => {
    return electron.ipcRenderer.invoke("is-mouse-tracking");
  },
  recordMouseClick: (button = "left") => {
    return electron.ipcRenderer.invoke("record-mouse-click", button);
  },
  saveMouseEvents: (mouseData, fileName) => {
    return electron.ipcRenderer.invoke("save-mouse-events", mouseData, fileName);
  },
  loadMouseEvents: (videoPath) => {
    return electron.ipcRenderer.invoke("load-mouse-events", videoPath);
  },
  checkFileExists: (filePath) => {
    return electron.ipcRenderer.invoke("check-file-exists", filePath);
  },
  // Region Selection APIs
  openRegionSelector: () => {
    return electron.ipcRenderer.invoke("open-region-selector");
  },
  confirmRegionSelection: (region) => {
    return electron.ipcRenderer.invoke("confirm-region-selection", region);
  },
  cancelRegionSelection: () => {
    return electron.ipcRenderer.invoke("cancel-region-selection");
  },
  getWindowBounds: () => {
    return electron.ipcRenderer.invoke("get-window-bounds");
  },
  saveRegionInfo: (regionInfo, fileName) => {
    return electron.ipcRenderer.invoke("save-region-info", regionInfo, fileName);
  },
  loadRegionInfo: (videoPath) => {
    return electron.ipcRenderer.invoke("load-region-info", videoPath);
  },
  getScreenForRegion: (region) => {
    return electron.ipcRenderer.invoke("get-screen-for-region", region);
  },
  // Window Picker APIs (窗口选择器)
  openWindowPicker: () => {
    return electron.ipcRenderer.invoke("open-window-picker");
  },
  confirmWindowPicker: (windowInfo) => {
    return electron.ipcRenderer.invoke("confirm-window-picker", windowInfo);
  },
  cancelWindowPicker: () => {
    return electron.ipcRenderer.invoke("cancel-window-picker");
  },
  hideWindowPicker: () => {
    return electron.ipcRenderer.invoke("hide-window-picker");
  },
  showWindowPicker: () => {
    return electron.ipcRenderer.invoke("show-window-picker");
  },
  setWindowPickerIgnoreMouse: (ignore) => {
    return electron.ipcRenderer.invoke("set-window-picker-ignore-mouse", ignore);
  },
  getActiveWindowSource: () => {
    return electron.ipcRenderer.invoke("get-active-window-source");
  },
  // 原生窗口检测 API
  isWindowDetectionAvailable: () => {
    return electron.ipcRenderer.invoke("is-window-detection-available");
  },
  getWindowUnderCursor: () => {
    return electron.ipcRenderer.invoke("get-window-under-cursor");
  },
  findWindowSource: (title) => {
    return electron.ipcRenderer.invoke("find-window-source", title);
  },
  // Region Indicator APIs (for showing recording area overlay)
  showRegionIndicator: (region) => {
    return electron.ipcRenderer.invoke("show-region-indicator", region);
  },
  hideRegionIndicator: () => {
    return electron.ipcRenderer.invoke("hide-region-indicator");
  },
  closeRegionIndicator: () => {
    return electron.ipcRenderer.invoke("close-region-indicator");
  },
  updateRegionIndicator: (data) => {
    return electron.ipcRenderer.invoke("update-region-indicator", data);
  },
  onRegionIndicatorUpdate: (callback) => {
    electron.ipcRenderer.on("region-indicator-update", callback);
  },
  removeRegionIndicatorListener: () => {
    electron.ipcRenderer.removeAllListeners("region-indicator-update");
  },
  // Teleprompter Window APIs
  showTeleprompter: () => {
    return electron.ipcRenderer.invoke("show-teleprompter");
  },
  hideTeleprompter: () => {
    return electron.ipcRenderer.invoke("hide-teleprompter");
  },
  closeTeleprompter: () => {
    return electron.ipcRenderer.invoke("close-teleprompter");
  },
  isTeleprompterVisible: () => {
    return electron.ipcRenderer.invoke("is-teleprompter-visible");
  },
  updateTeleprompterContent: (content) => {
    return electron.ipcRenderer.invoke("update-teleprompter-content", content);
  },
  onTeleprompterContentUpdate: (callback) => {
    const listener = (_, content) => callback(content);
    electron.ipcRenderer.on("teleprompter-content-update", listener);
    return () => electron.ipcRenderer.removeListener("teleprompter-content-update", listener);
  },
  teleprompterResizeStart: () => {
    return electron.ipcRenderer.invoke("teleprompter-resize-start");
  },
  teleprompterResizeMove: (data) => {
    return electron.ipcRenderer.invoke("teleprompter-resize-move", data);
  },
  teleprompterResizeEnd: () => {
    return electron.ipcRenderer.invoke("teleprompter-resize-end");
  },
  // Pro Feature APIs - Keyframes and Flow Graph
  saveKeyframeImage: (imageData, fileName) => {
    return electron.ipcRenderer.invoke("save-keyframe-image", imageData, fileName);
  },
  saveFlowGraph: (flowGraphJson, fileName) => {
    return electron.ipcRenderer.invoke("save-flow-graph", flowGraphJson, fileName);
  },
  loadFlowGraph: (filePath) => {
    return electron.ipcRenderer.invoke("load-flow-graph", filePath);
  },
  listFlowGraphs: () => {
    return electron.ipcRenderer.invoke("list-flow-graphs");
  },
  exportFlowGraphZip: (zipData, fileName) => {
    return electron.ipcRenderer.invoke("export-flow-graph-zip", zipData, fileName);
  },
  deleteFlowGraph: (filePath) => {
    return electron.ipcRenderer.invoke("delete-flow-graph", filePath);
  }
});
