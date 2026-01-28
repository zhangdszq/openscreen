"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  hudOverlayHide: () => {
    electron.ipcRenderer.send("hud-overlay-hide");
  },
  hudOverlayClose: () => {
    electron.ipcRenderer.send("hud-overlay-close");
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
  openSourceSelector: () => {
    return electron.ipcRenderer.invoke("open-source-selector");
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
  }
});
