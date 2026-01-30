import { ipcMain, screen, BrowserWindow, systemPreferences, dialog, desktopCapturer, shell, app, nativeImage, Tray, Menu } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL$1 = process.env["VITE_DEV_SERVER_URL"];
const RENDERER_DIST$1 = path.join(APP_ROOT, "dist");
let hudOverlayWindow = null;
let cameraPreviewWindow = null;
ipcMain.on("hud-overlay-hide", () => {
  if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
    hudOverlayWindow.minimize();
  }
});
ipcMain.handle("show-camera-preview", (_, options) => {
  if (!cameraPreviewWindow || cameraPreviewWindow.isDestroyed()) {
    cameraPreviewWindow = createCameraPreviewWindow(options);
  } else {
    updateCameraPreviewWindow(options);
  }
  cameraPreviewWindow.show();
  return { success: true };
});
ipcMain.handle("hide-camera-preview", () => {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    cameraPreviewWindow.hide();
  }
  return { success: true };
});
ipcMain.handle("close-camera-preview", () => {
  closeCameraPreviewWindow();
  return { success: true };
});
function closeCameraPreviewWindow() {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    cameraPreviewWindow.close();
    cameraPreviewWindow = null;
  }
}
ipcMain.handle("update-camera-preview", (_, options) => {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    updateCameraPreviewWindow(options);
  }
  return { success: true };
});
ipcMain.handle("resize-camera-preview", (_, newSize) => {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    const pixelSize = Math.round(newSize);
    const bounds = cameraPreviewWindow.getBounds();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const newX = Math.round(centerX - pixelSize / 2);
    const newY = Math.round(centerY - pixelSize / 2);
    cameraPreviewWindow.setBounds({
      x: newX,
      y: newY,
      width: pixelSize,
      height: pixelSize
    });
  }
  return { success: true };
});
ipcMain.handle("resize-camera-preview-rect", (_, newWidth, newHeight) => {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    const width = Math.round(newWidth);
    const height = Math.round(newHeight);
    const bounds = cameraPreviewWindow.getBounds();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const newX = Math.round(centerX - width / 2);
    const newY = Math.round(centerY - height / 2);
    cameraPreviewWindow.setBounds({
      x: newX,
      y: newY,
      width,
      height
    });
  }
  return { success: true };
});
ipcMain.handle("position-camera-preview-in-area", (_, options) => {
  if (!cameraPreviewWindow || cameraPreviewWindow.isDestroyed()) {
    return { success: false };
  }
  positionCameraInArea(options);
  return { success: true };
});
ipcMain.handle("get-source-bounds", async (_, sourceId, _sourceName, _videoDimensions) => {
  if (sourceId.startsWith("screen:")) {
    const displayId = sourceId.replace("screen:", "").split(":")[0];
    const displays = screen.getAllDisplays();
    const display = displays.find((d) => String(d.id) === displayId);
    if (display) {
      return {
        success: true,
        bounds: display.bounds,
        isScreen: true
      };
    }
  }
  const primaryDisplay = screen.getPrimaryDisplay();
  return {
    success: true,
    bounds: primaryDisplay.bounds,
    isScreen: false
  };
});
ipcMain.handle("get-screen-for-window", async (_) => {
  try {
    const { desktopCapturer: desktopCapturer2 } = await import("electron");
    const sources = await desktopCapturer2.getSources({ types: ["screen"] });
    if (sources.length > 0) {
      const primaryScreen = sources[0];
      const primaryDisplay = screen.getPrimaryDisplay();
      return {
        success: true,
        screenId: primaryScreen.id,
        displayBounds: primaryDisplay.bounds
      };
    }
    return {
      success: false,
      screenId: null,
      displayBounds: null
    };
  } catch (error) {
    console.error("Failed to get screen for window:", error);
    return {
      success: false,
      screenId: null,
      displayBounds: null
    };
  }
});
function updateCameraPreviewWindow(options) {
  if (!cameraPreviewWindow || cameraPreviewWindow.isDestroyed()) return;
  if (options.size !== void 0 || options.shape !== void 0 || options.position !== void 0) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { workArea } = primaryDisplay;
    const pixelSize = options.size ? Math.max(80, Math.min(200, Math.round(options.size / 100 * workArea.width))) : 150;
    const height = options.shape === "rectangle" ? Math.round(pixelSize * 0.75) : pixelSize;
    const padding = 20;
    let x, y;
    switch (options.position) {
      case "top-left":
        x = workArea.x + padding;
        y = workArea.y + padding;
        break;
      case "top-right":
        x = workArea.x + workArea.width - pixelSize - padding;
        y = workArea.y + padding;
        break;
      case "bottom-left":
        x = workArea.x + padding;
        y = workArea.y + workArea.height - height - padding - 60;
        break;
      case "bottom-right":
      default:
        x = workArea.x + workArea.width - pixelSize - padding;
        y = workArea.y + workArea.height - height - padding - 60;
        break;
    }
    cameraPreviewWindow.setBounds({ x, y, width: pixelSize, height });
  }
  cameraPreviewWindow.webContents.send("camera-preview-update", options);
}
function positionCameraInArea(options) {
  if (!cameraPreviewWindow || cameraPreviewWindow.isDestroyed()) return;
  const { area, size, shape, position } = options;
  const pixelSize = Math.max(80, Math.min(200, Math.round(size / 100 * area.width)));
  const height = shape === "rectangle" ? Math.round(pixelSize * 0.75) : pixelSize;
  const padding = 20;
  let x, y;
  switch (position) {
    case "top-left":
      x = area.x + padding;
      y = area.y + padding;
      break;
    case "top-right":
      x = area.x + area.width - pixelSize - padding;
      y = area.y + padding;
      break;
    case "bottom-left":
      x = area.x + padding;
      y = area.y + area.height - height - padding - 60;
      break;
    case "bottom-right":
    default:
      x = area.x + area.width - pixelSize - padding;
      y = area.y + area.height - height - padding - 60;
      break;
  }
  console.log("Setting camera preview bounds:", { x, y, width: pixelSize, height, shape });
  cameraPreviewWindow.setBounds({ x, y, width: pixelSize, height });
  cameraPreviewWindow.webContents.send("camera-preview-update", { size, shape, position });
}
function createHudOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;
  const windowWidth = 500;
  const windowHeight = 400;
  const x = Math.floor(workArea.x + (workArea.width - windowWidth) / 2);
  const y = Math.floor(workArea.y + workArea.height - windowHeight - 5);
  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 500,
    maxWidth: 500,
    minHeight: 400,
    maxHeight: 400,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  hudOverlayWindow = win;
  win.on("closed", () => {
    if (hudOverlayWindow === win) {
      hudOverlayWindow = null;
    }
  });
  if (VITE_DEV_SERVER_URL$1) {
    win.loadURL(VITE_DEV_SERVER_URL$1 + "?windowType=hud-overlay");
  } else {
    win.loadFile(path.join(RENDERER_DIST$1, "index.html"), {
      query: { windowType: "hud-overlay" }
    });
  }
  return win;
}
function createEditorWindow() {
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    ...isMac && {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 12, y: 12 }
    },
    transparent: false,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    title: "OpenScreen",
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false
    }
  });
  win.maximize();
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL$1) {
    win.loadURL(VITE_DEV_SERVER_URL$1 + "?windowType=editor");
  } else {
    win.loadFile(path.join(RENDERER_DIST$1, "index.html"), {
      query: { windowType: "editor" }
    });
  }
  return win;
}
function createSourceSelectorWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: 620,
    height: 420,
    minHeight: 350,
    maxHeight: 500,
    x: Math.round((width - 620) / 2),
    y: Math.round((height - 420) / 2),
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  if (VITE_DEV_SERVER_URL$1) {
    win.loadURL(VITE_DEV_SERVER_URL$1 + "?windowType=source-selector");
  } else {
    win.loadFile(path.join(RENDERER_DIST$1, "index.html"), {
      query: { windowType: "source-selector" }
    });
  }
  return win;
}
function createCameraPreviewWindow(options) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;
  const pixelSize = Math.max(80, Math.min(200, Math.round(options.size / 100 * workArea.width)));
  const height = options.shape === "rectangle" ? Math.round(pixelSize * 0.75) : pixelSize;
  const padding = 20;
  let x, y;
  switch (options.position) {
    case "top-left":
      x = workArea.x + padding;
      y = workArea.y + padding;
      break;
    case "top-right":
      x = workArea.x + workArea.width - pixelSize - padding;
      y = workArea.y + padding;
      break;
    case "bottom-left":
      x = workArea.x + padding;
      y = workArea.y + workArea.height - height - padding - 60;
      break;
    case "bottom-right":
    default:
      x = workArea.x + workArea.width - pixelSize - padding;
      y = workArea.y + workArea.height - height - padding - 60;
      break;
  }
  const win = new BrowserWindow({
    width: pixelSize,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setIgnoreMouseEvents(false);
  win.webContents.on("did-finish-load", () => {
    win.webContents.send("camera-preview-init", options);
  });
  if (VITE_DEV_SERVER_URL$1) {
    win.loadURL(VITE_DEV_SERVER_URL$1 + `?windowType=camera-preview&shape=${options.shape}&size=${options.size}&position=${options.position}`);
  } else {
    win.loadFile(path.join(RENDERER_DIST$1, "index.html"), {
      query: {
        windowType: "camera-preview",
        shape: options.shape,
        size: String(options.size),
        position: options.position
      }
    });
  }
  cameraPreviewWindow = win;
  win.on("closed", () => {
    if (cameraPreviewWindow === win) {
      cameraPreviewWindow = null;
    }
  });
  return win;
}
const require2 = createRequire(import.meta.url);
const { uIOhook } = require2("uiohook-napi");
let isTracking = false;
let events = [];
let startTime = 0;
let recordingBounds = null;
let eventCounter = 0;
let hookStarted = false;
function generateEventId() {
  return `mouse-${Date.now()}-${eventCounter++}`;
}
function normalizeCoordinates(screenX, screenY) {
  if (!recordingBounds) return null;
  const x = (screenX - recordingBounds.x) / recordingBounds.width;
  const y = (screenY - recordingBounds.y) / recordingBounds.height;
  if (x < -0.1 || x > 1.1 || y < -0.1 || y > 1.1) {
    return null;
  }
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y))
  };
}
function getButtonName(button) {
  switch (button) {
    case 1:
      return "left";
    case 2:
      return "right";
    case 3:
      return "middle";
    default:
      return "left";
  }
}
function handleMouseClick(event) {
  if (!isTracking || !recordingBounds) return;
  const normalized = normalizeCoordinates(event.x, event.y);
  if (!normalized) return;
  const timestampMs = Date.now() - startTime;
  events.push({
    id: generateEventId(),
    timestampMs,
    x: normalized.x,
    y: normalized.y,
    type: "click",
    button: getButtonName(event.button)
  });
  console.log(`Mouse tracker: ${getButtonName(event.button)} click at (${normalized.x.toFixed(3)}, ${normalized.y.toFixed(3)}) at ${timestampMs}ms`);
}
async function checkAccessibilityPermission() {
  if (process.platform !== "darwin") {
    return true;
  }
  const isTrusted = systemPreferences.isTrustedAccessibilityClient(false);
  return isTrusted;
}
async function requestAccessibilityPermission() {
  if (process.platform !== "darwin") {
    return true;
  }
  if (systemPreferences.isTrustedAccessibilityClient(false)) {
    return true;
  }
  const result = await dialog.showMessageBox({
    type: "info",
    title: "需要辅助功能权限",
    message: "为了追踪鼠标点击，需要授予辅助功能权限",
    detail: '点击"打开设置"后，请在「隐私与安全性 → 辅助功能」中勾选此应用。',
    buttons: ["打开设置", "取消"],
    defaultId: 0
  });
  if (result.response === 0) {
    systemPreferences.isTrustedAccessibilityClient(true);
  }
  return systemPreferences.isTrustedAccessibilityClient(false);
}
function setupHook() {
  if (hookStarted) return;
  uIOhook.on("mousedown", handleMouseClick);
  try {
    uIOhook.start();
    hookStarted = true;
    console.log("Mouse tracker: Global hook started successfully");
  } catch (error) {
    console.error("Mouse tracker: Failed to start global hook:", error);
    throw error;
  }
}
function stopHook() {
  if (!hookStarted) return;
  try {
    uIOhook.stop();
    hookStarted = false;
    console.log("Mouse tracker: Global hook stopped");
  } catch (error) {
    console.warn("Mouse tracker: Error stopping hook:", error);
  }
}
async function startTracking(bounds) {
  if (isTracking) {
    console.warn("Mouse tracker: Already tracking, stopping previous session");
    stopTracking();
  }
  if (process.platform === "darwin") {
    const hasPermission = await checkAccessibilityPermission();
    if (!hasPermission) {
      const granted = await requestAccessibilityPermission();
      if (!granted) {
        return {
          success: false,
          error: "需要辅助功能权限才能追踪鼠标点击。请在系统设置中授权。"
        };
      }
    }
  }
  console.log("Mouse tracker: Starting tracking with bounds:", bounds);
  try {
    setupHook();
  } catch (error) {
    return {
      success: false,
      error: `无法启动鼠标监听: ${error}`
    };
  }
  isTracking = true;
  recordingBounds = bounds;
  startTime = Date.now();
  events = [];
  eventCounter = 0;
  return { success: true };
}
function stopTracking() {
  console.log("Mouse tracker: Stopping tracking");
  isTracking = false;
  const result = {
    events: [...events],
    screenBounds: recordingBounds ? { width: recordingBounds.width, height: recordingBounds.height } : { width: 0, height: 0 }
  };
  console.log(`Mouse tracker: Captured ${result.events.length} click events`);
  events = [];
  recordingBounds = null;
  return result;
}
function isCurrentlyTracking() {
  return isTracking;
}
function cleanup() {
  stopHook();
}
function recordClick(button = "left") {
  if (!isTracking || !recordingBounds) return;
  const point = screen.getCursorScreenPoint();
  const normalized = normalizeCoordinates(point.x, point.y);
  if (!normalized) return;
  const timestampMs = Date.now() - startTime;
  events.push({
    id: generateEventId(),
    timestampMs,
    x: normalized.x,
    y: normalized.y,
    type: "click",
    button
  });
  console.log(`Mouse tracker: Manual ${button} click recorded at (${normalized.x.toFixed(3)}, ${normalized.y.toFixed(3)}) at ${timestampMs}ms`);
}
let selectedSource = null;
function registerIpcHandlers(createEditorWindow2, createSourceSelectorWindow2, getMainWindow, getSourceSelectorWindow, onRecordingStateChange) {
  ipcMain.handle("get-sources", async (_, opts) => {
    const sources = await desktopCapturer.getSources(opts);
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      display_id: source.display_id,
      thumbnail: source.thumbnail ? source.thumbnail.toDataURL() : null,
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null
    }));
  });
  ipcMain.handle("select-source", (_, source) => {
    selectedSource = source;
    const sourceSelectorWin = getSourceSelectorWindow();
    if (sourceSelectorWin) {
      sourceSelectorWin.close();
    }
    return selectedSource;
  });
  ipcMain.handle("get-selected-source", () => {
    return selectedSource;
  });
  ipcMain.handle("open-source-selector", () => {
    const sourceSelectorWin = getSourceSelectorWindow();
    if (sourceSelectorWin) {
      sourceSelectorWin.focus();
      return;
    }
    createSourceSelectorWindow2();
  });
  ipcMain.handle("switch-to-editor", () => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.close();
    }
    createEditorWindow2();
  });
  ipcMain.handle("store-recorded-video", async (_, videoData, fileName) => {
    try {
      const videoPath = path.join(RECORDINGS_DIR, fileName);
      await fs.writeFile(videoPath, Buffer.from(videoData));
      currentVideoPath = videoPath;
      return {
        success: true,
        path: videoPath,
        message: "Video stored successfully"
      };
    } catch (error) {
      console.error("Failed to store video:", error);
      return {
        success: false,
        message: "Failed to store video",
        error: String(error)
      };
    }
  });
  ipcMain.handle("get-recorded-video-path", async () => {
    try {
      const files = await fs.readdir(RECORDINGS_DIR);
      const videoFiles = files.filter((file) => file.endsWith(".webm"));
      if (videoFiles.length === 0) {
        return { success: false, message: "No recorded video found" };
      }
      const latestVideo = videoFiles.sort().reverse()[0];
      const videoPath = path.join(RECORDINGS_DIR, latestVideo);
      return { success: true, path: videoPath };
    } catch (error) {
      console.error("Failed to get video path:", error);
      return { success: false, message: "Failed to get video path", error: String(error) };
    }
  });
  ipcMain.handle("set-recording-state", (_, recording) => {
    const source = selectedSource || { name: "Screen" };
    if (onRecordingStateChange) {
      onRecordingStateChange(recording, source.name);
    }
  });
  ipcMain.handle("open-external-url", async (_, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error("Failed to open URL:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("get-asset-base-path", () => {
    try {
      if (app.isPackaged) {
        return path.join(process.resourcesPath, "assets");
      }
      return path.join(app.getAppPath(), "public", "assets");
    } catch (err) {
      console.error("Failed to resolve asset base path:", err);
      return null;
    }
  });
  ipcMain.handle("save-exported-video", async (_, videoData, fileName) => {
    try {
      const isGif = fileName.toLowerCase().endsWith(".gif");
      const filters = isGif ? [{ name: "GIF Image", extensions: ["gif"] }] : [{ name: "MP4 Video", extensions: ["mp4"] }];
      const result = await dialog.showSaveDialog({
        title: isGif ? "Save Exported GIF" : "Save Exported Video",
        defaultPath: path.join(app.getPath("downloads"), fileName),
        filters,
        properties: ["createDirectory", "showOverwriteConfirmation"]
      });
      if (result.canceled || !result.filePath) {
        return {
          success: false,
          cancelled: true,
          message: "Export cancelled"
        };
      }
      await fs.writeFile(result.filePath, Buffer.from(videoData));
      return {
        success: true,
        path: result.filePath,
        message: "Video exported successfully"
      };
    } catch (error) {
      console.error("Failed to save exported video:", error);
      return {
        success: false,
        message: "Failed to save exported video",
        error: String(error)
      };
    }
  });
  ipcMain.handle("open-video-file-picker", async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: "Select Video File",
        defaultPath: RECORDINGS_DIR,
        filters: [
          { name: "Video Files", extensions: ["webm", "mp4", "mov", "avi", "mkv"] },
          { name: "All Files", extensions: ["*"] }
        ],
        properties: ["openFile"]
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, cancelled: true };
      }
      return {
        success: true,
        path: result.filePaths[0]
      };
    } catch (error) {
      console.error("Failed to open file picker:", error);
      return {
        success: false,
        message: "Failed to open file picker",
        error: String(error)
      };
    }
  });
  let currentVideoPath = null;
  ipcMain.handle("set-current-video-path", (_, path2) => {
    currentVideoPath = path2;
    return { success: true };
  });
  ipcMain.handle("get-current-video-path", () => {
    return currentVideoPath ? { success: true, path: currentVideoPath } : { success: false };
  });
  ipcMain.handle("clear-current-video-path", () => {
    currentVideoPath = null;
    return { success: true };
  });
  ipcMain.handle("get-platform", () => {
    return process.platform;
  });
  ipcMain.handle("start-mouse-tracking", async (_, bounds) => {
    try {
      const result = await startTracking(bounds);
      return result;
    } catch (error) {
      console.error("Failed to start mouse tracking:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("check-accessibility-permission", async () => {
    return await checkAccessibilityPermission();
  });
  ipcMain.handle("request-accessibility-permission", async () => {
    return await requestAccessibilityPermission();
  });
  ipcMain.handle("stop-mouse-tracking", () => {
    try {
      const data = stopTracking();
      return { success: true, data };
    } catch (error) {
      console.error("Failed to stop mouse tracking:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("is-mouse-tracking", () => {
    return isCurrentlyTracking();
  });
  ipcMain.handle("record-mouse-click", (_, button = "left") => {
    try {
      recordClick(button);
      return { success: true };
    } catch (error) {
      console.error("Failed to record mouse click:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("save-mouse-events", async (_, mouseData, fileName) => {
    try {
      const filePath = path.join(RECORDINGS_DIR, fileName);
      await fs.writeFile(filePath, JSON.stringify(mouseData, null, 2));
      return { success: true, path: filePath };
    } catch (error) {
      console.error("Failed to save mouse events:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("load-mouse-events", async (_, videoPath) => {
    try {
      const mouseFilePath = videoPath.replace(/\.[^.]+$/, ".mouse.json");
      const data = await fs.readFile(mouseFilePath, "utf-8");
      const mouseData = JSON.parse(data);
      return { success: true, data: mouseData };
    } catch (error) {
      console.log("No mouse events file found for video");
      return { success: false, error: "No mouse events file found" };
    }
  });
  ipcMain.handle("save-keyframe-image", async (_, imageData, fileName) => {
    try {
      const keyframesDir = path.join(RECORDINGS_DIR, "keyframes");
      await fs.mkdir(keyframesDir, { recursive: true });
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const filePath = path.join(keyframesDir, fileName);
      await fs.writeFile(filePath, buffer);
      return { success: true, path: filePath };
    } catch (error) {
      console.error("Failed to save keyframe image:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("save-flow-graph", async (_, flowGraphJson, fileName) => {
    try {
      const flowGraphsDir = path.join(RECORDINGS_DIR, "flowgraphs");
      await fs.mkdir(flowGraphsDir, { recursive: true });
      const filePath = path.join(flowGraphsDir, fileName);
      await fs.writeFile(filePath, flowGraphJson, "utf-8");
      return { success: true, path: filePath };
    } catch (error) {
      console.error("Failed to save flow graph:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("load-flow-graph", async (_, filePath) => {
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return { success: true, data: JSON.parse(data) };
    } catch (error) {
      console.error("Failed to load flow graph:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("list-flow-graphs", async () => {
    try {
      const flowGraphsDir = path.join(RECORDINGS_DIR, "flowgraphs");
      try {
        await fs.access(flowGraphsDir);
      } catch {
        return { success: true, files: [] };
      }
      const files = await fs.readdir(flowGraphsDir);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));
      const flowGraphs = await Promise.all(
        jsonFiles.map(async (fileName) => {
          var _a, _b, _c, _d;
          const filePath = path.join(flowGraphsDir, fileName);
          const stat = await fs.stat(filePath);
          try {
            const content = await fs.readFile(filePath, "utf-8");
            const data = JSON.parse(content);
            return {
              fileName,
              path: filePath,
              name: data.name || fileName.replace(".json", ""),
              keyframeCount: ((_a = data.keyframes) == null ? void 0 : _a.length) || 0,
              connectionCount: ((_b = data.connections) == null ? void 0 : _b.length) || 0,
              createdAt: ((_c = data.metadata) == null ? void 0 : _c.createdAt) || stat.birthtime.getTime(),
              updatedAt: ((_d = data.metadata) == null ? void 0 : _d.updatedAt) || stat.mtime.getTime()
            };
          } catch {
            return {
              fileName,
              path: filePath,
              name: fileName.replace(".json", ""),
              keyframeCount: 0,
              connectionCount: 0,
              createdAt: stat.birthtime.getTime(),
              updatedAt: stat.mtime.getTime()
            };
          }
        })
      );
      return { success: true, files: flowGraphs };
    } catch (error) {
      console.error("Failed to list flow graphs:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("export-flow-graph-zip", async (_, zipData, fileName) => {
    try {
      const result = await dialog.showSaveDialog({
        title: "导出流程图",
        defaultPath: path.join(app.getPath("downloads"), fileName),
        filters: [
          { name: "ZIP Archive", extensions: ["zip"] }
        ],
        properties: ["createDirectory", "showOverwriteConfirmation"]
      });
      if (result.canceled || !result.filePath) {
        return { success: false, cancelled: true, message: "Export cancelled" };
      }
      await fs.writeFile(result.filePath, Buffer.from(zipData));
      return {
        success: true,
        path: result.filePath,
        message: "Flow graph exported successfully"
      };
    } catch (error) {
      console.error("Failed to export flow graph ZIP:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("delete-flow-graph", async (_, filePath) => {
    try {
      await fs.unlink(filePath);
      return { success: true };
    } catch (error) {
      console.error("Failed to delete flow graph:", error);
      return { success: false, error: String(error) };
    }
  });
}
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RECORDINGS_DIR = path.join(app.getPath("userData"), "recordings");
async function ensureRecordingsDir() {
  try {
    await fs.mkdir(RECORDINGS_DIR, { recursive: true });
    console.log("RECORDINGS_DIR:", RECORDINGS_DIR);
    console.log("User Data Path:", app.getPath("userData"));
  } catch (error) {
    console.error("Failed to create recordings directory:", error);
  }
}
process.env.APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let mainWindow = null;
let sourceSelectorWindow = null;
let tray = null;
let selectedSourceName = "";
const defaultTrayIcon = getTrayIcon("openscreen.png");
const recordingTrayIcon = getTrayIcon("rec-button.png");
function createWindow() {
  mainWindow = createHudOverlayWindow();
}
function createTray() {
  tray = new Tray(defaultTrayIcon);
}
function getTrayIcon(filename) {
  return nativeImage.createFromPath(path.join(process.env.VITE_PUBLIC || RENDERER_DIST, filename)).resize({
    width: 24,
    height: 24,
    quality: "best"
  });
}
function updateTrayMenu(recording = false) {
  if (!tray) return;
  const trayIcon = recording ? recordingTrayIcon : defaultTrayIcon;
  const trayToolTip = recording ? `Recording: ${selectedSourceName}` : "OpenScreen";
  const menuTemplate = recording ? [
    {
      label: "Stop Recording",
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("stop-recording-from-tray");
        }
      }
    }
  ] : [
    {
      label: "Open",
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.isMinimized() && mainWindow.restore();
        } else {
          createWindow();
        }
      }
    },
    {
      label: "Quit",
      click: () => {
        app.quit();
      }
    }
  ];
  tray.setImage(trayIcon);
  tray.setToolTip(trayToolTip);
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
}
function createEditorWindowWrapper() {
  if (mainWindow) {
    mainWindow.close();
    mainWindow = null;
  }
  mainWindow = createEditorWindow();
}
function createSourceSelectorWindowWrapper() {
  sourceSelectorWindow = createSourceSelectorWindow();
  sourceSelectorWindow.on("closed", () => {
    sourceSelectorWindow = null;
  });
  return sourceSelectorWindow;
}
app.on("window-all-closed", () => {
});
app.on("before-quit", () => {
  closeCameraPreviewWindow();
  cleanup();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(async () => {
  const { ipcMain: ipcMain2 } = await import("electron");
  ipcMain2.on("hud-overlay-close", () => {
    closeCameraPreviewWindow();
    app.quit();
  });
  createTray();
  updateTrayMenu();
  await ensureRecordingsDir();
  registerIpcHandlers(
    createEditorWindowWrapper,
    createSourceSelectorWindowWrapper,
    () => mainWindow,
    () => sourceSelectorWindow,
    (recording, sourceName) => {
      selectedSourceName = sourceName;
      if (!tray) createTray();
      updateTrayMenu(recording);
      if (!recording) {
        if (mainWindow) mainWindow.restore();
      }
    }
  );
  createWindow();
});
export {
  MAIN_DIST,
  RECORDINGS_DIR,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
