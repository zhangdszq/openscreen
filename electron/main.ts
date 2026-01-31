import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createHudOverlayWindow, createEditorWindow, createSourceSelectorWindow, closeCameraPreviewWindow, showCameraPreviewWindowIfExists, hideCameraPreviewWindow } from './windows'
import { registerIpcHandlers } from './ipc/handlers'
import { cleanup as cleanupMouseTracker } from './mouseTracker'


const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const RECORDINGS_DIR = path.join(app.getPath('userData'), 'recordings')


async function ensureRecordingsDir() {
  try {
    await fs.mkdir(RECORDINGS_DIR, { recursive: true })
    console.log('RECORDINGS_DIR:', RECORDINGS_DIR)
    console.log('User Data Path:', app.getPath('userData'))
  } catch (error) {
    console.error('Failed to create recordings directory:', error)
  }
}

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

// Window references
let mainWindow: BrowserWindow | null = null
let sourceSelectorWindow: BrowserWindow | null = null
let tray: Tray | null = null
let selectedSourceName = ''

// Tray Icons
const defaultTrayIcon = getTrayIcon('openscreen.png');
const recordingTrayIcon = getTrayIcon('rec-button.png');

function createWindow() {
  mainWindow = createHudOverlayWindow()
}

function createTray() {
  tray = new Tray(defaultTrayIcon);
}

function getTrayIcon(filename: string) {
  return nativeImage.createFromPath(path.join(process.env.VITE_PUBLIC || RENDERER_DIST, filename)).resize({
    width: 24,
    height: 24,
    quality: 'best'
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

function updateTrayMenu(recording: boolean = false) {
  if (!tray) return;
  const trayIcon = recording ? recordingTrayIcon : defaultTrayIcon;
  const trayToolTip = recording ? `Recording: ${selectedSourceName}` : "OpenScreen";
  const menuTemplate = recording
    ? [
        {
          label: "Stop Recording",
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("stop-recording-from-tray");
            }
          },
        },
      ]
    : [
        {
          label: "打开中控台",
          click: () => {
            showMainWindow();
          },
        },
        {
          label: "退出",
          click: () => {
            app.quit();
          },
        },
      ];
  tray.setImage(trayIcon);
  tray.setToolTip(trayToolTip);
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
  
  // Add click event to show window when clicking tray icon
  tray.removeAllListeners('click');
  tray.on('click', () => {
    showMainWindow();
  });
}

function createEditorWindowWrapper() {
  if (mainWindow) {
    mainWindow.close()
    mainWindow = null
  }
  mainWindow = createEditorWindow()
}

function createSourceSelectorWindowWrapper(mode?: 'window' | 'region' | 'all') {
  sourceSelectorWindow = createSourceSelectorWindow(mode)
  sourceSelectorWindow.on('closed', () => {
    sourceSelectorWindow = null
  })
  return sourceSelectorWindow
}

// On macOS, applications and their menu bar stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // Keep app running (macOS behavior)
})

// Close camera preview window and cleanup before app quits
app.on('before-quit', () => {
  closeCameraPreviewWindow();
  cleanupMouseTracker();
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})



// Register all IPC handlers when app is ready
app.whenReady().then(async () => {
    // Listen for HUD overlay close event - hide to tray instead of quitting
    const { ipcMain } = await import('electron');
    ipcMain.on('hud-overlay-close', () => {
      // Hide windows instead of quitting - go to tray mode
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
      }
      hideCameraPreviewWindow(); // Hide camera preview
      updateTrayMenu(); // Update tray menu
    });
    createTray()
    updateTrayMenu()
  // Ensure recordings directory exists
  await ensureRecordingsDir()

  registerIpcHandlers(
    createEditorWindowWrapper,
    createSourceSelectorWindowWrapper,
    () => mainWindow,
    () => sourceSelectorWindow,
    (recording: boolean, sourceName: string) => {
      selectedSourceName = sourceName
      if (!tray) createTray();
      updateTrayMenu(recording);
      if (!recording) {
        if (mainWindow) mainWindow.restore();
        showCameraPreviewWindowIfExists();
      }
    }
  )
  createWindow()
})
