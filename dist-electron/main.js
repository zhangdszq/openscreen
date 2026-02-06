import { ipcMain, BrowserWindow, screen, systemPreferences, dialog, desktopCapturer, shell, app, nativeImage, Tray, Menu } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { createRequire } from "module";
import { createRequire as createRequire$1 } from "node:module";
const require$1 = createRequire(import.meta.url);
const isWindows = process.platform === "win32";
let initialized = false;
let initError = null;
let koffi = null;
let user32 = null;
let dwmapi = null;
let POINT = null;
let RECT = null;
let GetCursorPos = null;
let WindowFromPoint = null;
let GetWindowRect = null;
let GetWindowTextW = null;
let GetWindowTextLengthW = null;
let IsWindowVisible = null;
let GetAncestor = null;
let GetClassNameW = null;
let DwmGetWindowAttribute = null;
const GA_ROOTOWNER = 3;
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
function initialize() {
  if (initialized) return !!user32;
  initialized = true;
  if (!isWindows) {
    initError = "Not Windows platform";
    console.log("[WindowDetector] Not Windows platform, skipping initialization");
    return false;
  }
  try {
    koffi = require$1("koffi");
    console.log("[WindowDetector] koffi loaded successfully");
  } catch (error) {
    initError = `Failed to load koffi: ${error}`;
    console.error("[WindowDetector]", initError);
    return false;
  }
  try {
    user32 = koffi.load("user32.dll");
    console.log("[WindowDetector] user32.dll loaded");
  } catch (error) {
    initError = `Failed to load user32.dll: ${error}`;
    console.error("[WindowDetector]", initError);
    return false;
  }
  try {
    dwmapi = koffi.load("dwmapi.dll");
    console.log("[WindowDetector] dwmapi.dll loaded");
  } catch (error) {
    console.warn("[WindowDetector] dwmapi.dll not available:", error);
  }
  try {
    POINT = koffi.struct("POINT", {
      x: "long",
      y: "long"
    });
    RECT = koffi.struct("RECT", {
      left: "long",
      top: "long",
      right: "long",
      bottom: "long"
    });
    GetCursorPos = user32.func("bool GetCursorPos(_Out_ POINT *lpPoint)");
    WindowFromPoint = user32.func("void* WindowFromPoint(POINT Point)");
    GetWindowRect = user32.func("bool GetWindowRect(void *hWnd, _Out_ RECT *lpRect)");
    GetWindowTextLengthW = user32.func("int GetWindowTextLengthW(void *hWnd)");
    GetWindowTextW = user32.func("int GetWindowTextW(void *hWnd, _Out_ uint16 *lpString, int nMaxCount)");
    IsWindowVisible = user32.func("bool IsWindowVisible(void *hWnd)");
    GetAncestor = user32.func("void* GetAncestor(void *hwnd, unsigned int gaFlags)");
    GetClassNameW = user32.func("int GetClassNameW(void *hWnd, _Out_ uint16 *lpClassName, int nMaxCount)");
    if (dwmapi) {
      DwmGetWindowAttribute = dwmapi.func("long DwmGetWindowAttribute(void *hwnd, unsigned int dwAttribute, _Out_ RECT *pvAttribute, unsigned int cbAttribute)");
    }
    console.log("[WindowDetector] All functions defined successfully");
    return true;
  } catch (error) {
    initError = `Failed to define functions: ${error}`;
    console.error("[WindowDetector]", initError);
    return false;
  }
}
function getCursorPosition() {
  if (!initialize() || !GetCursorPos) return null;
  try {
    const point = { x: 0, y: 0 };
    if (GetCursorPos(point)) {
      return { x: point.x, y: point.y };
    }
  } catch (error) {
    console.warn("[WindowDetector] GetCursorPos failed:", error);
  }
  return null;
}
function getWindowText(hwnd) {
  if (!GetWindowTextLengthW || !GetWindowTextW) return "";
  try {
    const length = GetWindowTextLengthW(hwnd);
    if (length > 0) {
      const buffer = new Uint16Array(length + 1);
      GetWindowTextW(hwnd, buffer, length + 1);
      let result = "";
      for (let i = 0; i < length; i++) {
        if (buffer[i] === 0) break;
        result += String.fromCharCode(buffer[i]);
      }
      return result;
    }
  } catch (error) {
    console.warn("[WindowDetector] GetWindowText failed:", error);
  }
  return "";
}
function getWindowClassName(hwnd) {
  if (!GetClassNameW) return "";
  try {
    const buffer = new Uint16Array(256);
    const len = GetClassNameW(hwnd, buffer, 256);
    if (len > 0) {
      let result = "";
      for (let i = 0; i < len; i++) {
        if (buffer[i] === 0) break;
        result += String.fromCharCode(buffer[i]);
      }
      return result;
    }
  } catch (error) {
    console.warn("[WindowDetector] GetClassName failed:", error);
  }
  return "";
}
function getWindowAtPoint(x, y) {
  if (!initialize() || !WindowFromPoint) return null;
  try {
    const point = { x, y };
    let hwnd = WindowFromPoint(point);
    if (!hwnd) return null;
    if (GetAncestor) {
      const rootHwnd = GetAncestor(hwnd, GA_ROOTOWNER);
      if (rootHwnd) {
        hwnd = rootHwnd;
      }
    }
    if (IsWindowVisible && !IsWindowVisible(hwnd)) {
      return null;
    }
    const title = getWindowText(hwnd);
    const className = getWindowClassName(hwnd);
    let bounds = { x: 0, y: 0, width: 0, height: 0 };
    if (DwmGetWindowAttribute) {
      try {
        const rect = { left: 0, top: 0, right: 0, bottom: 0 };
        const result = DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, rect, 16);
        if (result === 0) {
          bounds = {
            x: rect.left,
            y: rect.top,
            width: rect.right - rect.left,
            height: rect.bottom - rect.top
          };
        }
      } catch {
      }
    }
    if (bounds.width === 0 && GetWindowRect) {
      const rect = { left: 0, top: 0, right: 0, bottom: 0 };
      if (GetWindowRect(hwnd, rect)) {
        bounds = {
          x: rect.left,
          y: rect.top,
          width: rect.right - rect.left,
          height: rect.bottom - rect.top
        };
      }
    }
    if (bounds.width < 50 || bounds.height < 50) {
      return null;
    }
    const systemClasses = ["Shell_TrayWnd", "Progman", "WorkerW", "DV2ControlHost"];
    if (systemClasses.includes(className)) {
      return null;
    }
    const hwndId = `${title}-${bounds.x}-${bounds.y}-${bounds.width}-${bounds.height}`;
    return {
      hwnd: hwndId,
      title,
      className,
      bounds,
      isVisible: true
    };
  } catch (error) {
    console.warn("[WindowDetector] getWindowAtPoint failed:", error);
    return null;
  }
}
function getWindowUnderCursor() {
  const cursor = getCursorPosition();
  if (!cursor) return null;
  return getWindowAtPoint(cursor.x, cursor.y);
}
function isWindowDetectionAvailable() {
  const result = initialize();
  console.log("[WindowDetector] isWindowDetectionAvailable:", result, "initError:", initError);
  return result;
}
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL$1 = process.env["VITE_DEV_SERVER_URL"];
const RENDERER_DIST$1 = path.join(APP_ROOT, "dist");
let hudOverlayWindow = null;
let cameraPreviewWindow = null;
let regionSelectorWindow = null;
let regionIndicatorWindow = null;
let regionSelectionResolve = null;
let windowPickerWindow = null;
let windowPickerResolve = null;
let teleprompterWindow = null;
ipcMain.on("window-minimize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.minimize();
  }
});
ipcMain.on("window-maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});
ipcMain.on("window-close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.close();
  }
});
ipcMain.on("hud-overlay-hide", () => {
  if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
    hudOverlayWindow.minimize();
  }
});
ipcMain.handle("show-teleprompter", () => {
  if (!teleprompterWindow || teleprompterWindow.isDestroyed()) {
    teleprompterWindow = createTeleprompterWindow();
  } else {
    teleprompterWindow.show();
  }
  return { success: true };
});
ipcMain.handle("hide-teleprompter", () => {
  if (teleprompterWindow && !teleprompterWindow.isDestroyed()) {
    teleprompterWindow.hide();
  }
  return { success: true };
});
ipcMain.handle("close-teleprompter", () => {
  if (teleprompterWindow && !teleprompterWindow.isDestroyed()) {
    teleprompterWindow.close();
    teleprompterWindow = null;
  }
  return { success: true };
});
ipcMain.handle("is-teleprompter-visible", () => {
  return teleprompterWindow && !teleprompterWindow.isDestroyed() && teleprompterWindow.isVisible();
});
ipcMain.handle("update-teleprompter-content", (_, content) => {
  if (teleprompterWindow && !teleprompterWindow.isDestroyed()) {
    teleprompterWindow.webContents.send("teleprompter-content-update", content);
  }
  return { success: true };
});
let teleprompterResizeStart = null;
ipcMain.handle("teleprompter-resize-start", () => {
  if (teleprompterWindow && !teleprompterWindow.isDestroyed()) {
    teleprompterResizeStart = teleprompterWindow.getBounds();
  }
  return { success: true };
});
ipcMain.handle("teleprompter-resize-move", (_, data) => {
  if (!teleprompterWindow || teleprompterWindow.isDestroyed() || !teleprompterResizeStart) {
    return { success: false };
  }
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;
  const start = teleprompterResizeStart;
  const dir = data.direction;
  let newX = start.x;
  let newY = start.y;
  let newWidth = start.width;
  let newHeight = start.height;
  if (dir === "e" || dir === "se" || dir === "ne") {
    newWidth = start.width + data.deltaX;
  }
  if (dir === "w" || dir === "sw" || dir === "nw") {
    newWidth = start.width - data.deltaX;
    newX = start.x + data.deltaX;
  }
  if (dir === "s" || dir === "se" || dir === "sw") {
    newHeight = start.height + data.deltaY;
  }
  if (dir === "n" || dir === "ne" || dir === "nw") {
    newHeight = start.height - data.deltaY;
    newY = start.y + data.deltaY;
  }
  const minWidth = 280;
  const minHeight = 200;
  if (newWidth < minWidth) {
    if (dir === "w" || dir === "sw" || dir === "nw") {
      newX = start.x + start.width - minWidth;
    }
    newWidth = minWidth;
  }
  if (newHeight < minHeight) {
    if (dir === "n" || dir === "ne" || dir === "nw") {
      newY = start.y + start.height - minHeight;
    }
    newHeight = minHeight;
  }
  if (newX < workArea.x) {
    newWidth = newWidth - (workArea.x - newX);
    newX = workArea.x;
  }
  if (newY < workArea.y) {
    newHeight = newHeight - (workArea.y - newY);
    newY = workArea.y;
  }
  if (newX + newWidth > workArea.x + workArea.width) {
    newWidth = workArea.x + workArea.width - newX;
  }
  if (newY + newHeight > workArea.y + workArea.height) {
    newHeight = workArea.y + workArea.height - newY;
  }
  teleprompterWindow.setBounds({
    x: Math.round(newX),
    y: Math.round(newY),
    width: Math.round(newWidth),
    height: Math.round(newHeight)
  });
  return { success: true };
});
ipcMain.handle("teleprompter-resize-end", () => {
  teleprompterResizeStart = null;
  return { success: true };
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
ipcMain.handle("show-region-indicator", (_, region) => {
  if (!regionIndicatorWindow || regionIndicatorWindow.isDestroyed()) {
    regionIndicatorWindow = createRegionIndicatorWindow(region);
  } else {
    updateRegionIndicatorWindow(region);
    regionIndicatorWindow.show();
  }
  return { success: true };
});
ipcMain.handle("hide-region-indicator", () => {
  if (regionIndicatorWindow && !regionIndicatorWindow.isDestroyed()) {
    regionIndicatorWindow.hide();
  }
  return { success: true };
});
ipcMain.handle("close-region-indicator", () => {
  closeRegionIndicatorWindow();
  return { success: true };
});
ipcMain.handle("update-region-indicator", (_, data) => {
  if (regionIndicatorWindow && !regionIndicatorWindow.isDestroyed()) {
    if (data.region) {
      updateRegionIndicatorWindow(data.region);
    }
    regionIndicatorWindow.webContents.send("region-indicator-update", data);
  }
  return { success: true };
});
function closeRegionIndicatorWindow() {
  if (regionIndicatorWindow && !regionIndicatorWindow.isDestroyed()) {
    regionIndicatorWindow.close();
    regionIndicatorWindow = null;
  }
}
function closeCameraPreviewWindow() {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    cameraPreviewWindow.close();
    cameraPreviewWindow = null;
  }
}
function showCameraPreviewWindowIfExists() {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    cameraPreviewWindow.show();
  }
}
function hideCameraPreviewWindow() {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    cameraPreviewWindow.hide();
  }
}
ipcMain.handle("update-camera-preview", (_, options) => {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    updateCameraPreviewWindow(options);
  }
  return { success: true };
});
let originalCameraPosition = null;
ipcMain.handle("move-camera-outside-recording", (_, recordingDisplayId) => {
  if (!cameraPreviewWindow || cameraPreviewWindow.isDestroyed()) {
    return { success: false, message: "No camera preview window" };
  }
  const displays = screen.getAllDisplays();
  const currentBounds = cameraPreviewWindow.getBounds();
  originalCameraPosition = { ...currentBounds };
  const recordingDisplay = recordingDisplayId ? displays.find((d) => d.id === recordingDisplayId) : screen.getPrimaryDisplay();
  if (!recordingDisplay) {
    return { success: false, message: "Recording display not found" };
  }
  const otherDisplay = displays.find((d) => d.id !== recordingDisplay.id);
  if (otherDisplay) {
    const padding = 20;
    const newX = otherDisplay.workArea.x + otherDisplay.workArea.width - currentBounds.width - padding;
    const newY = otherDisplay.workArea.y + otherDisplay.workArea.height - currentBounds.height - padding;
    cameraPreviewWindow.setBounds({
      x: newX,
      y: newY,
      width: currentBounds.width,
      height: currentBounds.height
    });
    return { success: true, movedToOtherDisplay: true };
  } else {
    const miniSize = 80;
    const newX = recordingDisplay.workArea.x + recordingDisplay.workArea.width - miniSize - 10;
    const newY = recordingDisplay.workArea.y + 10;
    cameraPreviewWindow.setBounds({
      x: newX,
      y: newY,
      width: miniSize + SHADOW_PADDING * 2,
      height: miniSize + SHADOW_PADDING * 2
    });
    cameraPreviewWindow.webContents.send("camera-preview-update", { miniMode: true });
    return { success: true, movedToOtherDisplay: false, shrunk: true };
  }
});
ipcMain.handle("restore-camera-position", () => {
  if (!cameraPreviewWindow || cameraPreviewWindow.isDestroyed()) {
    return { success: false, message: "No camera preview window" };
  }
  if (originalCameraPosition) {
    cameraPreviewWindow.setBounds(originalCameraPosition);
    cameraPreviewWindow.webContents.send("camera-preview-update", { miniMode: false });
    originalCameraPosition = null;
  }
  return { success: true };
});
ipcMain.handle("resize-camera-preview", (_, newSize) => {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    const contentSize = Math.round(newSize);
    const windowSize = contentSize + SHADOW_PADDING * 2;
    const bounds = cameraPreviewWindow.getBounds();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const newX = Math.round(centerX - windowSize / 2);
    const newY = Math.round(centerY - windowSize / 2);
    cameraPreviewWindow.setBounds({
      x: newX,
      y: newY,
      width: windowSize,
      height: windowSize
    });
  }
  return { success: true };
});
ipcMain.handle("resize-camera-preview-rect", (_, newWidth, newHeight) => {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    const contentWidth = Math.round(newWidth);
    const contentHeight = Math.round(newHeight);
    const windowWidth = contentWidth + SHADOW_PADDING * 2;
    const windowHeight = contentHeight + SHADOW_PADDING * 2;
    const bounds = cameraPreviewWindow.getBounds();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const newX = Math.round(centerX - windowWidth / 2);
    const newY = Math.round(centerY - windowHeight / 2);
    cameraPreviewWindow.setBounds({
      x: newX,
      y: newY,
      width: windowWidth,
      height: windowHeight
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
  const shouldReposition = options.position !== void 0;
  const shouldResize = options.size !== void 0 || options.shape !== void 0;
  if (shouldReposition) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { workArea } = primaryDisplay;
    const bounds = cameraPreviewWindow.getBounds();
    const contentSize = bounds.width - SHADOW_PADDING * 2;
    const contentHeight = bounds.height - SHADOW_PADDING * 2;
    const padding = 20;
    let x, y;
    switch (options.position) {
      case "top-left":
        x = workArea.x + padding - SHADOW_PADDING;
        y = workArea.y + padding - SHADOW_PADDING;
        break;
      case "top-right":
        x = workArea.x + workArea.width - contentSize - padding - SHADOW_PADDING;
        y = workArea.y + padding - SHADOW_PADDING;
        break;
      case "bottom-left":
        x = workArea.x + padding - SHADOW_PADDING;
        y = workArea.y + workArea.height - contentHeight - padding - 60 - SHADOW_PADDING;
        break;
      case "bottom-right":
      default:
        x = workArea.x + workArea.width - contentSize - padding - SHADOW_PADDING;
        y = workArea.y + workArea.height - contentHeight - padding - 60 - SHADOW_PADDING;
        break;
    }
    cameraPreviewWindow.setBounds({ x, y, width: bounds.width, height: bounds.height });
  } else if (shouldResize) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { workArea } = primaryDisplay;
    const bounds = cameraPreviewWindow.getBounds();
    const contentSize = options.size ? Math.max(80, Math.min(200, Math.round(options.size / 100 * workArea.width))) : bounds.width - SHADOW_PADDING * 2;
    const contentHeight = options.shape === "rectangle" ? Math.round(contentSize * 0.75) : contentSize;
    const windowWidth = contentSize + SHADOW_PADDING * 2;
    const windowHeight = contentHeight + SHADOW_PADDING * 2;
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const newX = Math.round(centerX - windowWidth / 2);
    const newY = Math.round(centerY - windowHeight / 2);
    cameraPreviewWindow.setBounds({ x: newX, y: newY, width: windowWidth, height: windowHeight });
  }
  cameraPreviewWindow.webContents.send("camera-preview-update", options);
}
function positionCameraInArea(options) {
  if (!cameraPreviewWindow || cameraPreviewWindow.isDestroyed()) return;
  const { area, size, shape, position } = options;
  const contentSize = Math.max(80, Math.min(200, Math.round(size / 100 * area.width)));
  const contentHeight = shape === "rectangle" ? Math.round(contentSize * 0.75) : contentSize;
  const windowWidth = contentSize + SHADOW_PADDING * 2;
  const windowHeight = contentHeight + SHADOW_PADDING * 2;
  const padding = 20;
  let x, y;
  switch (position) {
    case "top-left":
      x = area.x + padding - SHADOW_PADDING;
      y = area.y + padding - SHADOW_PADDING;
      break;
    case "top-right":
      x = area.x + area.width - contentSize - padding - SHADOW_PADDING;
      y = area.y + padding - SHADOW_PADDING;
      break;
    case "bottom-left":
      x = area.x + padding - SHADOW_PADDING;
      y = area.y + area.height - contentHeight - padding - 60 - SHADOW_PADDING;
      break;
    case "bottom-right":
    default:
      x = area.x + area.width - contentSize - padding - SHADOW_PADDING;
      y = area.y + area.height - contentHeight - padding - 60 - SHADOW_PADDING;
      break;
  }
  console.log("Setting camera preview bounds:", { x, y, width: windowWidth, height: windowHeight, shape });
  cameraPreviewWindow.setBounds({ x, y, width: windowWidth, height: windowHeight });
  cameraPreviewWindow.webContents.send("camera-preview-update", { size, shape, position });
}
function createHudOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;
  const windowWidth = 800;
  const windowHeight = 800;
  const x = Math.floor(workArea.x + (workArea.width - windowWidth) / 2);
  const y = Math.floor(workArea.y + workArea.height - windowHeight);
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 800,
    maxWidth: 800,
    minHeight: 400,
    maxHeight: 800,
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
  win.setAlwaysOnTop(true, isMac ? "pop-up-menu" : "screen-saver", 0);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setContentProtection(true);
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
    frame: false,
    // 无边框窗口，使用自定义标题栏
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    ...isMac && {
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
ipcMain.handle("get-window-bounds", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    return win.getBounds();
  }
  return null;
});
ipcMain.handle("open-region-selector", async () => {
  return new Promise((resolve) => {
    regionSelectionResolve = resolve;
    if (regionSelectorWindow && !regionSelectorWindow.isDestroyed()) {
      regionSelectorWindow.focus();
      return;
    }
    createRegionSelectorWindow();
  });
});
ipcMain.handle("confirm-region-selection", (_, region) => {
  if (regionSelectionResolve) {
    regionSelectionResolve(region);
    regionSelectionResolve = null;
  }
  if (regionSelectorWindow && !regionSelectorWindow.isDestroyed()) {
    regionSelectorWindow.close();
    regionSelectorWindow = null;
  }
  if (!regionIndicatorWindow || regionIndicatorWindow.isDestroyed()) {
    regionIndicatorWindow = createRegionIndicatorWindow(region);
  } else {
    updateRegionIndicatorWindow(region);
    regionIndicatorWindow.show();
  }
  return { success: true };
});
ipcMain.handle("cancel-region-selection", () => {
  if (regionSelectionResolve) {
    regionSelectionResolve(null);
    regionSelectionResolve = null;
  }
  if (regionSelectorWindow && !regionSelectorWindow.isDestroyed()) {
    regionSelectorWindow.close();
    regionSelectorWindow = null;
  }
  return { success: true };
});
ipcMain.handle("open-window-picker", async () => {
  return new Promise((resolve) => {
    windowPickerResolve = resolve;
    if (windowPickerWindow && !windowPickerWindow.isDestroyed()) {
      windowPickerWindow.focus();
      return;
    }
    createWindowPickerWindow();
  });
});
ipcMain.handle("confirm-window-picker", (_, windowInfo) => {
  if (windowPickerResolve) {
    windowPickerResolve(windowInfo);
    windowPickerResolve = null;
  }
  if (windowPickerWindow && !windowPickerWindow.isDestroyed()) {
    windowPickerWindow.close();
    windowPickerWindow = null;
  }
  return { success: true };
});
ipcMain.handle("cancel-window-picker", () => {
  if (windowPickerResolve) {
    windowPickerResolve(null);
    windowPickerResolve = null;
  }
  if (windowPickerWindow && !windowPickerWindow.isDestroyed()) {
    windowPickerWindow.close();
    windowPickerWindow = null;
  }
  return { success: true };
});
ipcMain.handle("hide-window-picker", () => {
  if (windowPickerWindow && !windowPickerWindow.isDestroyed()) {
    windowPickerWindow.hide();
  }
  return { success: true };
});
ipcMain.handle("show-window-picker", () => {
  if (windowPickerWindow && !windowPickerWindow.isDestroyed()) {
    windowPickerWindow.show();
    windowPickerWindow.focus();
  }
  return { success: true };
});
ipcMain.handle("set-window-picker-ignore-mouse", (_, ignore) => {
  if (windowPickerWindow && !windowPickerWindow.isDestroyed()) {
    windowPickerWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
  return { success: true };
});
ipcMain.handle("get-active-window-source", async () => {
  const { desktopCapturer: desktopCapturer2 } = await import("electron");
  const sources = await desktopCapturer2.getSources({
    types: ["window"],
    thumbnailSize: { width: 400, height: 300 },
    fetchWindowIcons: true
  });
  const filteredSources = sources.filter(
    (s) => !s.name.includes("InsightView") && !s.name.includes("Electron") && !s.name.includes("WindowPicker") && s.name.trim() !== ""
  );
  if (filteredSources.length > 0) {
    const source = filteredSources[0];
    return {
      id: source.id,
      name: source.name.includes(" — ") ? source.name.split(" — ")[1] || source.name : source.name,
      thumbnail: source.thumbnail ? source.thumbnail.toDataURL() : null,
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null
    };
  }
  return null;
});
ipcMain.handle("is-window-detection-available", () => {
  return isWindowDetectionAvailable();
});
ipcMain.handle("get-window-under-cursor", () => {
  return getWindowUnderCursor();
});
ipcMain.handle("find-window-source", async (_, title) => {
  const { desktopCapturer: desktopCapturer2 } = await import("electron");
  const sources = await desktopCapturer2.getSources({
    types: ["window"],
    thumbnailSize: { width: 400, height: 300 },
    fetchWindowIcons: true
  });
  let source = sources.find((s) => s.name === title || s.name.includes(title));
  if (!source) {
    source = sources.find(
      (s) => s.name.toLowerCase().includes(title.toLowerCase()) || title.toLowerCase().includes(s.name.toLowerCase())
    );
  }
  if (source) {
    return {
      id: source.id,
      name: source.name.includes(" — ") ? source.name.split(" — ")[1] || source.name : source.name,
      thumbnail: source.thumbnail ? source.thumbnail.toDataURL() : null,
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null
    };
  }
  return null;
});
function createWindowPickerWindow() {
  const displays = screen.getAllDisplays();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const display of displays) {
    minX = Math.min(minX, display.bounds.x);
    minY = Math.min(minY, display.bounds.y);
    maxX = Math.max(maxX, display.bounds.x + display.bounds.width);
    maxY = Math.max(maxY, display.bounds.y + display.bounds.height);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    x: minX,
    y: minY,
    width,
    height,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreen: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  win.setAlwaysOnTop(true, isMac ? "pop-up-menu" : "screen-saver", 1);
  win.setContentProtection(true);
  if (VITE_DEV_SERVER_URL$1) {
    win.loadURL(VITE_DEV_SERVER_URL$1 + "?windowType=window-picker");
  } else {
    win.loadFile(path.join(RENDERER_DIST$1, "index.html"), {
      query: { windowType: "window-picker" }
    });
  }
  windowPickerWindow = win;
  win.on("closed", () => {
    if (windowPickerWindow === win) {
      windowPickerWindow = null;
    }
    if (windowPickerResolve) {
      windowPickerResolve(null);
      windowPickerResolve = null;
    }
  });
  return win;
}
function createRegionSelectorWindow() {
  const displays = screen.getAllDisplays();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const display of displays) {
    minX = Math.min(minX, display.bounds.x);
    minY = Math.min(minY, display.bounds.y);
    maxX = Math.max(maxX, display.bounds.x + display.bounds.width);
    maxY = Math.max(maxY, display.bounds.y + display.bounds.height);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const win = new BrowserWindow({
    x: minX,
    y: minY,
    width,
    height,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreen: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  const isMac = process.platform === "darwin";
  win.setAlwaysOnTop(true, isMac ? "pop-up-menu" : "screen-saver", 1);
  win.setContentProtection(true);
  if (VITE_DEV_SERVER_URL$1) {
    win.loadURL(VITE_DEV_SERVER_URL$1 + "?windowType=region-selector");
  } else {
    win.loadFile(path.join(RENDERER_DIST$1, "index.html"), {
      query: { windowType: "region-selector" }
    });
  }
  regionSelectorWindow = win;
  win.on("closed", () => {
    if (regionSelectorWindow === win) {
      regionSelectorWindow = null;
    }
    if (regionSelectionResolve) {
      regionSelectionResolve(null);
      regionSelectionResolve = null;
    }
  });
  return win;
}
function createRegionIndicatorWindow(region) {
  const padding = 4;
  const labelHeight = 32;
  const win = new BrowserWindow({
    x: region.x - padding,
    y: region.y - padding - labelHeight,
    width: region.width + padding * 2,
    height: region.height + padding * 2 + labelHeight,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    // Don't steal focus
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  const isMac = process.platform === "darwin";
  win.setAlwaysOnTop(true, isMac ? "pop-up-menu" : "screen-saver", 1);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setContentProtection(true);
  if (VITE_DEV_SERVER_URL$1) {
    win.loadURL(VITE_DEV_SERVER_URL$1 + "?windowType=region-indicator");
  } else {
    win.loadFile(path.join(RENDERER_DIST$1, "index.html"), {
      query: { windowType: "region-indicator" }
    });
  }
  win.webContents.once("did-finish-load", () => {
    win.webContents.send("region-indicator-update", {
      region,
      isRecording: false,
      // 初始状态：待录制
      isPaused: false
    });
  });
  regionIndicatorWindow = win;
  win.on("closed", () => {
    if (regionIndicatorWindow === win) {
      regionIndicatorWindow = null;
    }
  });
  return win;
}
function updateRegionIndicatorWindow(region) {
  if (!regionIndicatorWindow || regionIndicatorWindow.isDestroyed()) return;
  const padding = 4;
  const labelHeight = 32;
  regionIndicatorWindow.setBounds({
    x: region.x - padding,
    y: region.y - padding - labelHeight,
    width: region.width + padding * 2,
    height: region.height + padding * 2 + labelHeight
  });
}
function createSourceSelectorWindow(mode) {
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
  const selectorMode = mode || "all";
  if (VITE_DEV_SERVER_URL$1) {
    win.loadURL(VITE_DEV_SERVER_URL$1 + `?windowType=source-selector&mode=${selectorMode}`);
  } else {
    win.loadFile(path.join(RENDERER_DIST$1, "index.html"), {
      query: { windowType: "source-selector", mode: selectorMode }
    });
  }
  return win;
}
const SHADOW_PADDING = 5;
function createCameraPreviewWindow(options) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;
  const contentSize = Math.max(80, Math.min(200, Math.round(options.size / 100 * workArea.width)));
  const contentHeight = options.shape === "rectangle" ? Math.round(contentSize * 0.75) : contentSize;
  const windowWidth = contentSize + SHADOW_PADDING * 2;
  const windowHeight = contentHeight + SHADOW_PADDING * 2;
  const padding = 20;
  let x, y;
  switch (options.position) {
    case "top-left":
      x = workArea.x + padding - SHADOW_PADDING;
      y = workArea.y + padding - SHADOW_PADDING;
      break;
    case "top-right":
      x = workArea.x + workArea.width - contentSize - padding - SHADOW_PADDING;
      y = workArea.y + padding - SHADOW_PADDING;
      break;
    case "bottom-left":
      x = workArea.x + padding - SHADOW_PADDING;
      y = workArea.y + workArea.height - contentHeight - padding - 60 - SHADOW_PADDING;
      break;
    case "bottom-right":
    default:
      x = workArea.x + workArea.width - contentSize - padding - SHADOW_PADDING;
      y = workArea.y + workArea.height - contentHeight - padding - 60 - SHADOW_PADDING;
      break;
  }
  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    backgroundColor: "#00000000",
    // Fully transparent background
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });
  const isMac = process.platform === "darwin";
  win.setAlwaysOnTop(true, isMac ? "floating" : "screen-saver");
  win.setContentProtection(true);
  win.setIgnoreMouseEvents(false);
  win.webContents.on("did-finish-load", () => {
    win.webContents.send("camera-preview-init", options);
  });
  const borderStyle = options.borderStyle || "shadow";
  const shadowIntensity = options.shadowIntensity ?? 60;
  if (VITE_DEV_SERVER_URL$1) {
    win.loadURL(VITE_DEV_SERVER_URL$1 + `?windowType=camera-preview&shape=${options.shape}&size=${options.size}&position=${options.position}&borderStyle=${borderStyle}&shadowIntensity=${shadowIntensity}`);
  } else {
    win.loadFile(path.join(RENDERER_DIST$1, "index.html"), {
      query: {
        windowType: "camera-preview",
        shape: options.shape,
        size: String(options.size),
        position: options.position,
        borderStyle,
        shadowIntensity: String(shadowIntensity)
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
function createTeleprompterWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;
  const windowWidth = 400;
  const windowHeight = 500;
  const padding = 20;
  const x = workArea.x + workArea.width - windowWidth - padding;
  const y = workArea.y + padding;
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    // 禁用系统 resize，使用自定义 resize handles
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    minWidth: 300,
    minHeight: 300,
    maxWidth: 600,
    maxHeight: 800,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });
  win.setAlwaysOnTop(true, isMac ? "floating" : "screen-saver", 0);
  win.setContentProtection(true);
  if (VITE_DEV_SERVER_URL$1) {
    win.loadURL(VITE_DEV_SERVER_URL$1 + "?windowType=teleprompter");
  } else {
    win.loadFile(path.join(RENDERER_DIST$1, "index.html"), {
      query: { windowType: "teleprompter" }
    });
  }
  teleprompterWindow = win;
  win.on("closed", () => {
    if (teleprompterWindow === win) {
      teleprompterWindow = null;
    }
  });
  return win;
}
const require2 = createRequire$1(import.meta.url);
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
  ipcMain.on("set-ignore-mouse-events", (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win == null ? void 0 : win.setIgnoreMouseEvents(ignore, options);
  });
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
  ipcMain.handle("open-source-selector", (_, mode) => {
    const sourceSelectorWin = getSourceSelectorWindow();
    if (sourceSelectorWin) {
      sourceSelectorWin.focus();
      return;
    }
    createSourceSelectorWindow2(mode);
  });
  ipcMain.handle("switch-to-editor", () => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.close();
    }
    closeCameraPreviewWindow();
    createEditorWindow2();
  });
  ipcMain.handle("store-recorded-video", async (_, videoData, fileName) => {
    try {
      const videoPath = path.join(RECORDINGS_DIR, fileName);
      await fs.writeFile(videoPath, Buffer.from(videoData));
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
  ipcMain.handle("open-screen-recording-settings", async () => {
    try {
      await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
      return { success: true };
    } catch (error) {
      console.error("Failed to open Screen Recording settings:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("get-screen-capture-status", async () => {
    try {
      if (process.platform !== "darwin") {
        return { status: "granted" };
      }
      const status = systemPreferences.getMediaAccessStatus("screen");
      return { status };
    } catch (error) {
      console.error("Failed to get screen capture status:", error);
      return { status: "unknown", error: String(error) };
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
  ipcMain.handle("check-file-exists", async (_, filePath) => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle("save-region-info", async (_, regionInfo, fileName) => {
    try {
      const filePath = path.join(RECORDINGS_DIR, fileName);
      await fs.writeFile(filePath, JSON.stringify(regionInfo, null, 2));
      return { success: true, path: filePath };
    } catch (error) {
      console.error("Failed to save region info:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("load-region-info", async (_, videoPath) => {
    try {
      const regionFilePath = videoPath.replace(/\.[^.]+$/, ".region.json");
      const data = await fs.readFile(regionFilePath, "utf-8");
      const regionInfo = JSON.parse(data);
      return { success: true, data: regionInfo };
    } catch {
      return { success: false, error: "No region info found" };
    }
  });
  ipcMain.handle("get-screen-for-region", async (_, region) => {
    try {
      const { screen: screen2 } = await import("electron");
      const displays = screen2.getAllDisplays();
      const centerX = region.x + region.width / 2;
      const centerY = region.y + region.height / 2;
      for (const display of displays) {
        const { x, y, width, height } = display.bounds;
        if (centerX >= x && centerX < x + width && centerY >= y && centerY < y + height) {
          const sources2 = await desktopCapturer.getSources({ types: ["screen"] });
          const matchingSource = sources2.find((s) => s.display_id === String(display.id));
          if (matchingSource) {
            return {
              success: true,
              screenId: matchingSource.id,
              displayBounds: display.bounds,
              scaleFactor: display.scaleFactor
            };
          }
        }
      }
      const primaryDisplay = screen2.getPrimaryDisplay();
      const sources = await desktopCapturer.getSources({ types: ["screen"] });
      if (sources.length > 0) {
        return {
          success: true,
          screenId: sources[0].id,
          displayBounds: primaryDisplay.bounds,
          scaleFactor: primaryDisplay.scaleFactor
        };
      }
      return { success: false, error: "No screen found for region" };
    } catch (error) {
      console.error("Failed to get screen for region:", error);
      return { success: false, error: String(error) };
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
function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
    showCameraPreviewWindowIfExists();
  } else {
    createWindow();
  }
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
      label: "打开中控台",
      click: () => {
        showMainWindow();
      }
    },
    {
      label: "退出",
      click: () => {
        app.quit();
      }
    }
  ];
  tray.setImage(trayIcon);
  tray.setToolTip(trayToolTip);
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
  tray.removeAllListeners("click");
  tray.on("click", () => {
    showMainWindow();
  });
}
function createEditorWindowWrapper() {
  if (mainWindow) {
    mainWindow.close();
    mainWindow = null;
  }
  mainWindow = createEditorWindow();
}
function createSourceSelectorWindowWrapper(mode) {
  sourceSelectorWindow = createSourceSelectorWindow(mode);
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
  if (audioTeeInstance) {
    try {
      audioTeeInstance.stop();
    } catch {
    }
    audioTeeInstance = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
async function checkScreenCapturePermission() {
  if (process.platform !== "darwin") return true;
  const status = systemPreferences.getMediaAccessStatus("screen");
  console.log("Screen capture permission status:", status);
  if (status === "granted") {
    return true;
  }
  const result = await dialog.showMessageBox({
    type: "warning",
    title: "需要屏幕录制权限",
    message: "OpenScreen 需要屏幕录制权限才能录制屏幕。",
    detail: "请在系统设置中授予权限：\n系统设置 → 隐私与安全性 → 屏幕录制 → 启用 Electron/Openscreen",
    buttons: ["打开系统设置", "稍后"],
    defaultId: 0
  });
  if (result.response === 0) {
    const { shell: shell2 } = await import("electron");
    shell2.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
  }
  return status === "granted";
}
let audioTeeInstance = null;
let audioTeeStarted = false;
function registerSystemAudioIPC() {
  if (process.platform !== "darwin") return;
  console.log("[SystemAudio] macOS version:", process.getSystemVersion());
  console.log("[SystemAudio] Method: native AudioTee (Core Audio Taps)");
  ipcMain.handle("start-system-audio-capture", async (_event, options) => {
    try {
      if (audioTeeStarted && audioTeeInstance) {
        console.log("[SystemAudio] Already capturing, stopping first...");
        await audioTeeInstance.stop();
        audioTeeInstance = null;
        audioTeeStarted = false;
      }
      const { AudioTee } = await import("./index-D6oA_hCw.js");
      let binaryPath;
      if (app.isPackaged) {
        binaryPath = path.join(process.resourcesPath, "audiotee");
      } else {
        binaryPath = path.join(process.env.APP_ROOT || "", "node_modules", "audiotee", "bin", "audiotee");
      }
      console.log("[SystemAudio] AudioTee binary path:", binaryPath);
      const sampleRate = (options == null ? void 0 : options.sampleRate) || 48e3;
      const config = {
        sampleRate,
        chunkDurationMs: 100,
        // 100ms chunks for low latency
        mute: false
      };
      if (binaryPath) {
        config.binaryPath = binaryPath;
      }
      audioTeeInstance = new AudioTee(config);
      const senderWindow = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
      let dataChunkCount = 0;
      audioTeeInstance.on("data", (chunk) => {
        dataChunkCount++;
        if (dataChunkCount <= 3 || dataChunkCount % 50 === 0) {
          let maxVal = 0;
          const view = new Int16Array(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength / 2);
          for (let i = 0; i < Math.min(view.length, 100); i++) {
            maxVal = Math.max(maxVal, Math.abs(view[i]));
          }
          console.log(`[SystemAudio] Data chunk #${dataChunkCount}: ${chunk.data.byteLength} bytes, maxAmplitude=${maxVal}`);
        }
        if (senderWindow && !senderWindow.isDestroyed()) {
          senderWindow.webContents.send("system-audio-data", chunk.data);
        }
      });
      audioTeeInstance.on("error", (error) => {
        console.error("[SystemAudio] AudioTee error:", error.message);
        if (senderWindow && !senderWindow.isDestroyed()) {
          senderWindow.webContents.send("system-audio-error", error.message);
        }
      });
      audioTeeInstance.on("start", () => {
        console.log("[SystemAudio] AudioTee capture started");
      });
      audioTeeInstance.on("stop", () => {
        console.log("[SystemAudio] AudioTee capture stopped");
      });
      await audioTeeInstance.start();
      audioTeeStarted = true;
      console.log("[SystemAudio] AudioTee started at", sampleRate, "Hz");
      return { success: true, sampleRate };
    } catch (error) {
      console.error("[SystemAudio] Failed to start AudioTee:", error);
      return { success: false, error: error.message || String(error) };
    }
  });
  ipcMain.handle("stop-system-audio-capture", async () => {
    try {
      if (audioTeeInstance) {
        await audioTeeInstance.stop();
        audioTeeInstance = null;
        audioTeeStarted = false;
        console.log("[SystemAudio] AudioTee stopped");
      }
      return { success: true };
    } catch (error) {
      console.error("[SystemAudio] Failed to stop AudioTee:", error);
      return { success: false, error: error.message || String(error) };
    }
  });
  ipcMain.handle("test-system-audio", async () => {
    return {
      platform: process.platform,
      macosVersion: process.getSystemVersion(),
      electronVersion: process.versions.electron,
      screenPermission: systemPreferences.getMediaAccessStatus("screen"),
      audioTeeStarted,
      method: "native-audiotee"
    };
  });
}
app.whenReady().then(async () => {
  await checkScreenCapturePermission();
  registerSystemAudioIPC();
  ipcMain.on("hud-overlay-close", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
    hideCameraPreviewWindow();
    updateTrayMenu();
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
        showCameraPreviewWindowIfExists();
      }
    }
  );
  createWindow();
  const forwardRendererLogs = (win) => {
    if (!win || win.isDestroyed()) return;
    win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      if (message.includes("SystemAudio") || message.includes("loopback") || message.includes("system audio")) {
        const prefix = ["[V]", "[I]", "[W]", "[E]"][level] || "[?]";
        const src = sourceId ? sourceId.split("/").pop() : "";
        console.log(`[Renderer${prefix}] ${src}:${line} ${message}`);
      }
    });
  };
  if (mainWindow) forwardRendererLogs(mainWindow);
  app.on("browser-window-created", (_event, win) => {
    forwardRendererLogs(win);
  });
});
export {
  MAIN_DIST,
  RECORDINGS_DIR,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
