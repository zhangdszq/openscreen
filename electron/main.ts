import { app, BrowserWindow, Tray, Menu, nativeImage, systemPreferences, dialog, session, screen, desktopCapturer, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createHudOverlayWindow, createEditorWindow, createSourceSelectorWindow, closeCameraPreviewWindow, showCameraPreviewWindowIfExists, hideCameraPreviewWindow } from './windows'
import { registerIpcHandlers, getSelectedSource } from './ipc/handlers'
import { cleanup as cleanupMouseTracker } from './mouseTracker'

// Enable GPU hardware acceleration for video decoding and WebGL rendering
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-hardware-overlays', 'single-fullscreen,single-on-top,underlay')

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

// ============================================================
// macOS System Audio via AudioTee (native Core Audio Taps)
// ============================================================

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
  // Stop audio capture on quit
  if (audioTeeInstance) {
    try { audioTeeInstance.stop() } catch {}
    audioTeeInstance = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Check and request screen recording permission on macOS
async function checkScreenCapturePermission(): Promise<boolean> {
  if (process.platform !== 'darwin') return true;
  
  const status = systemPreferences.getMediaAccessStatus('screen');
  console.log('Screen capture permission status:', status);
  
  // @ts-ignore
  if (status === 'granted') {
    return true;
  }
  
  // Show dialog to guide user
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: '需要屏幕录制权限',
    message: 'OpenScreen 需要屏幕录制权限才能录制屏幕。',
    detail: '请在系统设置中授予权限：\n系统设置 → 隐私与安全性 → 屏幕录制 → 启用 Electron/Openscreen',
    buttons: ['打开系统设置', '稍后'],
    defaultId: 0,
  });
  
  if (result.response === 0) {
    const { shell } = await import('electron');
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  }
  
  // @ts-ignore
  return status === 'granted';
}

// ============================================================
// Native System Audio Capture via AudioTee
// Uses Core Audio Taps API (macOS 14.2+) — bypasses broken Electron loopback
// ============================================================
let audioTeeInstance: any = null
let audioTeeStarted = false

function registerSystemAudioIPC() {
  if (process.platform !== 'darwin') {
    // Register stub handlers on non-macOS to prevent "No handler registered" crash
    ipcMain.handle('start-system-audio-capture', async () => {
      return { success: false, error: 'System audio capture via AudioTee is only supported on macOS' }
    })
    ipcMain.handle('stop-system-audio-capture', async () => {
      return { success: true }
    })
    ipcMain.handle('test-system-audio', async () => {
      return {
        platform: process.platform,
        macosVersion: null,
        electronVersion: process.versions.electron,
        screenPermission: 'not-applicable',
        audioTeeStarted: false,
        method: 'none',
      }
    })
    return
  }

  console.log('[SystemAudio] macOS version:', process.getSystemVersion())
  console.log('[SystemAudio] Method: native AudioTee (Core Audio Taps)')

  // Start capturing system audio and stream PCM data to renderer
  ipcMain.handle('start-system-audio-capture', async (_event, options?: { sampleRate?: number }) => {
    try {
      if (audioTeeStarted && audioTeeInstance) {
        console.log('[SystemAudio] Already capturing, stopping first...')
        await audioTeeInstance.stop()
        audioTeeInstance = null
        audioTeeStarted = false
      }

      const { AudioTee } = await import('audiotee')

      // Resolve binary path — works in dev and packaged builds
      let binaryPath: string | undefined
      if (app.isPackaged) {
        binaryPath = path.join(process.resourcesPath, 'audiotee')
      } else {
        // Dev mode: binary is in node_modules
        binaryPath = path.join(process.env.APP_ROOT || '', 'node_modules', 'audiotee', 'bin', 'audiotee')
      }
      console.log('[SystemAudio] AudioTee binary path:', binaryPath)

      const sampleRate = options?.sampleRate || 48000
      const config: any = {
        sampleRate,
        chunkDurationMs: 100, // 100ms chunks for low latency
        mute: false,
      }
      if (binaryPath) {
        config.binaryPath = binaryPath
      }

      audioTeeInstance = new AudioTee(config)

      // Send audio data to the main window (NOT any overlay/indicator window)
      const senderWindow = mainWindow && !mainWindow.isDestroyed()
        ? mainWindow
        : BrowserWindow.getAllWindows().find(w => !w.isDestroyed())

      let dataChunkCount = 0
      audioTeeInstance.on('data', (chunk: { data: Buffer }) => {
        dataChunkCount++
        // Log first few chunks and then every 50th
        if (dataChunkCount <= 3 || dataChunkCount % 50 === 0) {
          // Check if audio is silent (all zeros)
          let maxVal = 0
          const view = new Int16Array(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength / 2)
          for (let i = 0; i < Math.min(view.length, 100); i++) {
            maxVal = Math.max(maxVal, Math.abs(view[i]))
          }
          console.log(`[SystemAudio] Data chunk #${dataChunkCount}: ${chunk.data.byteLength} bytes, maxAmplitude=${maxVal}`)
        }
        if (senderWindow && !senderWindow.isDestroyed()) {
          senderWindow.webContents.send('system-audio-data', chunk.data)
        }
      })

      audioTeeInstance.on('error', (error: Error) => {
        console.error('[SystemAudio] AudioTee error:', error.message)
        if (senderWindow && !senderWindow.isDestroyed()) {
          senderWindow.webContents.send('system-audio-error', error.message)
        }
      })

      audioTeeInstance.on('start', () => {
        console.log('[SystemAudio] AudioTee capture started')
      })

      audioTeeInstance.on('stop', () => {
        console.log('[SystemAudio] AudioTee capture stopped')
      })

      await audioTeeInstance.start()
      audioTeeStarted = true

      console.log('[SystemAudio] AudioTee started at', sampleRate, 'Hz')
      return { success: true, sampleRate }
    } catch (error: any) {
      console.error('[SystemAudio] Failed to start AudioTee:', error)
      return { success: false, error: error.message || String(error) }
    }
  })

  // Stop capturing
  ipcMain.handle('stop-system-audio-capture', async () => {
    try {
      if (audioTeeInstance) {
        await audioTeeInstance.stop()
        audioTeeInstance = null
        audioTeeStarted = false
        console.log('[SystemAudio] AudioTee stopped')
      }
      return { success: true }
    } catch (error: any) {
      console.error('[SystemAudio] Failed to stop AudioTee:', error)
      return { success: false, error: error.message || String(error) }
    }
  })

  // Diagnostic
  ipcMain.handle('test-system-audio', async () => {
    return {
      platform: process.platform,
      macosVersion: process.getSystemVersion(),
      electronVersion: process.versions.electron,
      screenPermission: systemPreferences.getMediaAccessStatus('screen'),
      audioTeeStarted,
      method: 'native-audiotee',
    }
  })
}

// Register all IPC handlers when app is ready
app.whenReady().then(async () => {
    // Check screen capture permission first
    await checkScreenCapturePermission();
    
    // Register native system audio capture IPC
    registerSystemAudioIPC()
    
    // Listen for HUD overlay close event - hide to tray instead of quitting
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

  // Forward renderer console logs to main process stdout for debugging
  const forwardRendererLogs = (win: BrowserWindow | null) => {
    if (!win || win.isDestroyed()) return
    win.webContents.on('console-message', (event) => {
      const { level, message, lineNumber: line, sourceId } = event as any
      if (message && (message.includes('SystemAudio') || message.includes('loopback') || message.includes('system audio') || message.includes('[Perf:'))) {
        const prefix = ['[V]', '[I]', '[W]', '[E]'][level] || '[?]'
        const src = sourceId ? sourceId.split('/').pop() : ''
        console.log(`[Renderer${prefix}] ${src}:${line} ${message}`)
      }
    })
  }
  if (mainWindow) forwardRendererLogs(mainWindow)
  app.on('browser-window-created', (_event, win) => {
    forwardRendererLogs(win)
  })
})
