import { BrowserWindow, screen } from 'electron'
import { ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const APP_ROOT = path.join(__dirname, '..')
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(APP_ROOT, 'dist')

let hudOverlayWindow: BrowserWindow | null = null;
let cameraPreviewWindow: BrowserWindow | null = null;

ipcMain.on('hud-overlay-hide', () => {
  if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
    hudOverlayWindow.minimize();
  }
});

// Camera Preview Window IPC handlers
ipcMain.handle('show-camera-preview', (_, options: { 
  size: number; 
  shape: 'circle' | 'rectangle';
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}) => {
  if (!cameraPreviewWindow || cameraPreviewWindow.isDestroyed()) {
    cameraPreviewWindow = createCameraPreviewWindow(options);
  } else {
    updateCameraPreviewWindow(options);
  }
  cameraPreviewWindow.show();
  return { success: true };
});

ipcMain.handle('hide-camera-preview', () => {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    cameraPreviewWindow.hide();
  }
  return { success: true };
});

ipcMain.handle('close-camera-preview', () => {
  closeCameraPreviewWindow();
  return { success: true };
});

// Export function to close camera preview window (used when app quits)
export function closeCameraPreviewWindow() {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    cameraPreviewWindow.close();
    cameraPreviewWindow = null;
  }
}

ipcMain.handle('update-camera-preview', (_, options: { 
  size?: number; 
  shape?: 'circle' | 'rectangle';
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  recording?: boolean;
}) => {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    updateCameraPreviewWindow(options);
  }
  return { success: true };
});

// Resize camera preview window (called from renderer during drag resize) - for circle (uniform)
ipcMain.handle('resize-camera-preview', (_, newSize: number) => {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    const pixelSize = Math.round(newSize);
    const bounds = cameraPreviewWindow.getBounds();
    
    // Keep the window centered at its current position during resize
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    
    const newX = Math.round(centerX - pixelSize / 2);
    const newY = Math.round(centerY - pixelSize / 2);
    
    cameraPreviewWindow.setBounds({
      x: newX,
      y: newY,
      width: pixelSize,
      height: pixelSize,
    });
  }
  return { success: true };
});

// Resize camera preview window with independent width/height (for rectangle)
ipcMain.handle('resize-camera-preview-rect', (_, newWidth: number, newHeight: number) => {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    const width = Math.round(newWidth);
    const height = Math.round(newHeight);
    const bounds = cameraPreviewWindow.getBounds();
    
    // Keep the window centered at its current position during resize
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    
    const newX = Math.round(centerX - width / 2);
    const newY = Math.round(centerY - height / 2);
    
    cameraPreviewWindow.setBounds({
      x: newX,
      y: newY,
      width,
      height,
    });
  }
  return { success: true };
});

// Position camera preview within a specific area (for recording)
ipcMain.handle('position-camera-preview-in-area', (_, options: {
  area: { x: number; y: number; width: number; height: number };
  size: number;
  shape: 'circle' | 'rectangle';
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}) => {
  if (!cameraPreviewWindow || cameraPreviewWindow.isDestroyed()) {
    return { success: false };
  }
  
  positionCameraInArea(options);
  return { success: true };
});


// Get display bounds for a source
ipcMain.handle('get-source-bounds', async (_, sourceId: string, _sourceName?: string, _videoDimensions?: { width: number; height: number }) => {
  // Check if it's a screen source
  if (sourceId.startsWith('screen:')) {
    const displayId = sourceId.replace('screen:', '').split(':')[0];
    const displays = screen.getAllDisplays();
    const display = displays.find(d => String(d.id) === displayId);
    
    if (display) {
      return {
        success: true,
        bounds: display.bounds,
        isScreen: true
      };
    }
  }
  
  // For window sources, just use primary display bounds
  // The camera preview will appear on the screen where recording happens
  const primaryDisplay = screen.getPrimaryDisplay();
  return {
    success: true,
    bounds: primaryDisplay.bounds,
    isScreen: false
  };
});

// Get the screen source ID for a window (used when camera is enabled with window recording)
ipcMain.handle('get-screen-for-window', async (_) => {
  try {
    // Get actual screen sources from desktopCapturer to get correct ID format
    const { desktopCapturer } = await import('electron');
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    
    if (sources.length > 0) {
      // Use the first (primary) screen
      const primaryScreen = sources[0];
      const primaryDisplay = screen.getPrimaryDisplay();
      return {
        success: true,
        screenId: primaryScreen.id,
        displayBounds: primaryDisplay.bounds
      };
    }
    
    // Fallback if no sources found
    return {
      success: false,
      screenId: null,
      displayBounds: null
    };
  } catch (error) {
    console.error('Failed to get screen for window:', error);
    return {
      success: false,
      screenId: null,
      displayBounds: null
    };
  }
});

function updateCameraPreviewWindow(options: { 
  size?: number; 
  shape?: 'circle' | 'rectangle';
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  recording?: boolean;
}) {
  if (!cameraPreviewWindow || cameraPreviewWindow.isDestroyed()) return;

  // Only update bounds if size/shape/position changed (not for recording state changes)
  if (options.size !== undefined || options.shape !== undefined || options.position !== undefined) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { workArea } = primaryDisplay;
    
    // Calculate size based on percentage of screen width (max 200px, consistent with recording)
    const pixelSize = options.size ? Math.max(80, Math.min(200, Math.round((options.size / 100) * workArea.width))) : 150;
    const height = options.shape === 'rectangle' ? Math.round(pixelSize * 0.75) : pixelSize;
    
    // Calculate position
    const padding = 20;
    let x: number, y: number;
    
    switch (options.position) {
      case 'top-left':
        x = workArea.x + padding;
        y = workArea.y + padding;
        break;
      case 'top-right':
        x = workArea.x + workArea.width - pixelSize - padding;
        y = workArea.y + padding;
        break;
      case 'bottom-left':
        x = workArea.x + padding;
        y = workArea.y + workArea.height - height - padding - 60; // 60 for HUD
        break;
      case 'bottom-right':
      default:
        x = workArea.x + workArea.width - pixelSize - padding;
        y = workArea.y + workArea.height - height - padding - 60;
        break;
    }

    cameraPreviewWindow.setBounds({ x, y, width: pixelSize, height });
  }
  
  // Send update to renderer (including recording state)
  cameraPreviewWindow.webContents.send('camera-preview-update', options);
}

// Position camera preview within a specific area (screen bounds)
function positionCameraInArea(options: {
  area: { x: number; y: number; width: number; height: number };
  size: number;
  shape: 'circle' | 'rectangle';
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}) {
  if (!cameraPreviewWindow || cameraPreviewWindow.isDestroyed()) return;

  const { area, size, shape, position } = options;
  
  // Calculate pixel size based on percentage of the area width (max 200px)
  const pixelSize = Math.max(80, Math.min(200, Math.round((size / 100) * area.width)));
  const height = shape === 'rectangle' ? Math.round(pixelSize * 0.75) : pixelSize;
  
  // Calculate position within the screen area
  const padding = 20;
  let x: number, y: number;
  
  switch (position) {
    case 'top-left':
      x = area.x + padding;
      y = area.y + padding;
      break;
    case 'top-right':
      x = area.x + area.width - pixelSize - padding;
      y = area.y + padding;
      break;
    case 'bottom-left':
      x = area.x + padding;
      y = area.y + area.height - height - padding - 60; // 60 for HUD
      break;
    case 'bottom-right':
    default:
      x = area.x + area.width - pixelSize - padding;
      y = area.y + area.height - height - padding - 60;
      break;
  }
  
  console.log('Setting camera preview bounds:', { x, y, width: pixelSize, height, shape });
  cameraPreviewWindow.setBounds({ x, y, width: pixelSize, height });
  cameraPreviewWindow.webContents.send('camera-preview-update', { size, shape, position });
}

export function createHudOverlayWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;


  const windowWidth = 500;
  const windowHeight = 400; // Increased to allow popover menus to display

  const x = Math.floor(workArea.x + (workArea.width - windowWidth) / 2);
  const y = Math.floor(workArea.y + workArea.height - windowHeight - 5);

  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 500,
    maxWidth: 500,
    minHeight: 400,
    maxHeight: 400,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })


  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  hudOverlayWindow = win;

  win.on('closed', () => {
    if (hudOverlayWindow === win) {
      hudOverlayWindow = null;
    }
  });


  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL + '?windowType=hud-overlay')
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), { 
      query: { windowType: 'hud-overlay' } 
    })
  }

  return win
}

export function createEditorWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin';

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    ...(isMac && {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 12 },
    }),
    transparent: false,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    title: 'OpenScreen',
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false,
    },
  })

  // Maximize the window by default
  win.maximize();

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL + '?windowType=editor')
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), { 
      query: { windowType: 'editor' } 
    })
  }

  return win
}

export function createSourceSelectorWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  
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
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL + '?windowType=source-selector')
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), { 
      query: { windowType: 'source-selector' } 
    })
  }

  return win
}

export function createCameraPreviewWindow(options: { 
  size: number; 
  shape: 'circle' | 'rectangle';
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;
  
  // Calculate size based on percentage of screen width (max 200px, consistent with recording)
  const pixelSize = Math.max(80, Math.min(200, Math.round((options.size / 100) * workArea.width)));
  const height = options.shape === 'rectangle' ? Math.round(pixelSize * 0.75) : pixelSize;
  
  // Calculate position
  const padding = 20;
  let x: number, y: number;
  
  switch (options.position) {
    case 'top-left':
      x = workArea.x + padding;
      y = workArea.y + padding;
      break;
    case 'top-right':
      x = workArea.x + workArea.width - pixelSize - padding;
      y = workArea.y + padding;
      break;
    case 'bottom-left':
      x = workArea.x + padding;
      y = workArea.y + workArea.height - height - padding - 60;
      break;
    case 'bottom-right':
    default:
      x = workArea.x + workArea.width - pixelSize - padding;
      y = workArea.y + workArea.height - height - padding - 60;
      break;
  }

  const win = new BrowserWindow({
    width: pixelSize,
    height: height,
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
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  // Set to highest level (screen-saver level) to stay above all windows
  win.setAlwaysOnTop(true, 'screen-saver');

  // Make window click-through except for the video area
  win.setIgnoreMouseEvents(false);

  // Enable dragging
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('camera-preview-init', options);
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL + `?windowType=camera-preview&shape=${options.shape}&size=${options.size}&position=${options.position}`)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), { 
      query: { 
        windowType: 'camera-preview',
        shape: options.shape,
        size: String(options.size),
        position: options.position
      } 
    })
  }

  cameraPreviewWindow = win;

  win.on('closed', () => {
    if (cameraPreviewWindow === win) {
      cameraPreviewWindow = null;
    }
  });

  return win;
}
