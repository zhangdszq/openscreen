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
let regionSelectorWindow: BrowserWindow | null = null;
let regionSelectionResolve: ((region: { x: number; y: number; width: number; height: number } | null) => void) | null = null;

ipcMain.on('hud-overlay-hide', () => {
  if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
    hudOverlayWindow.minimize();
  }
  // Also hide camera preview when HUD is hidden
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    cameraPreviewWindow.hide();
  }
});

// Camera Preview Window IPC handlers
ipcMain.handle('show-camera-preview', (_, options: { 
  size: number; 
  shape: 'circle' | 'rectangle';
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  borderStyle?: 'white' | 'shadow';
  shadowIntensity?: number;
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

// Export function to show camera preview window (used when HUD is restored)
export function showCameraPreviewWindowIfExists() {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    cameraPreviewWindow.show();
  }
}

// Export function to hide camera preview window
export function hideCameraPreviewWindow() {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    cameraPreviewWindow.hide();
  }
}

ipcMain.handle('update-camera-preview', (_, options: { 
  size?: number; 
  shape?: 'circle' | 'rectangle';
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  borderStyle?: 'white' | 'shadow';
  shadowIntensity?: number;
  recording?: boolean;
}) => {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    updateCameraPreviewWindow(options);
  }
  return { success: true };
});

// Store original camera position before recording
let originalCameraPosition: { x: number; y: number; width: number; height: number } | null = null;

// Move camera preview outside recording area when recording starts
ipcMain.handle('move-camera-outside-recording', (_, recordingDisplayId?: number) => {
  if (!cameraPreviewWindow || cameraPreviewWindow.isDestroyed()) {
    return { success: false, message: 'No camera preview window' };
  }
  
  const displays = screen.getAllDisplays();
  const currentBounds = cameraPreviewWindow.getBounds();
  
  // Save original position
  originalCameraPosition = { ...currentBounds };
  
  // Find the display being recorded
  const recordingDisplay = recordingDisplayId 
    ? displays.find(d => d.id === recordingDisplayId)
    : screen.getPrimaryDisplay();
  
  if (!recordingDisplay) {
    return { success: false, message: 'Recording display not found' };
  }
  
  // Try to find another display to move the camera to
  const otherDisplay = displays.find(d => d.id !== recordingDisplay.id);
  
  if (otherDisplay) {
    // Move to another display (bottom-right corner)
    const padding = 20;
    const newX = otherDisplay.workArea.x + otherDisplay.workArea.width - currentBounds.width - padding;
    const newY = otherDisplay.workArea.y + otherDisplay.workArea.height - currentBounds.height - padding;
    
    cameraPreviewWindow.setBounds({
      x: newX,
      y: newY,
      width: currentBounds.width,
      height: currentBounds.height,
    });
    
    return { success: true, movedToOtherDisplay: true };
  } else {
    // Single display - shrink and move to corner outside recording area
    // Move to the very edge of the screen where it won't be captured
    // (camera is recorded separately, so it just needs to stay visible to user)
    const miniSize = 80;
    const newX = recordingDisplay.workArea.x + recordingDisplay.workArea.width - miniSize - 10;
    const newY = recordingDisplay.workArea.y + 10;
    
    cameraPreviewWindow.setBounds({
      x: newX,
      y: newY,
      width: miniSize + SHADOW_PADDING * 2,
      height: miniSize + SHADOW_PADDING * 2,
    });
    
    // Send notification to renderer to show mini mode
    cameraPreviewWindow.webContents.send('camera-preview-update', { miniMode: true });
    
    return { success: true, movedToOtherDisplay: false, shrunk: true };
  }
});

// Restore camera preview to original position after recording
ipcMain.handle('restore-camera-position', () => {
  if (!cameraPreviewWindow || cameraPreviewWindow.isDestroyed()) {
    return { success: false, message: 'No camera preview window' };
  }
  
  if (originalCameraPosition) {
    cameraPreviewWindow.setBounds(originalCameraPosition);
    cameraPreviewWindow.webContents.send('camera-preview-update', { miniMode: false });
    originalCameraPosition = null;
  }
  
  return { success: true };
});

// Resize camera preview window (called from renderer during drag resize) - for circle (uniform)
ipcMain.handle('resize-camera-preview', (_, newSize: number) => {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    const contentSize = Math.round(newSize);
    const windowSize = contentSize + SHADOW_PADDING * 2;
    const bounds = cameraPreviewWindow.getBounds();
    
    // Keep the content centered at its current position during resize
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    
    const newX = Math.round(centerX - windowSize / 2);
    const newY = Math.round(centerY - windowSize / 2);
    
    cameraPreviewWindow.setBounds({
      x: newX,
      y: newY,
      width: windowSize,
      height: windowSize,
    });
  }
  return { success: true };
});

// Resize camera preview window with independent width/height (for rectangle)
ipcMain.handle('resize-camera-preview-rect', (_, newWidth: number, newHeight: number) => {
  if (cameraPreviewWindow && !cameraPreviewWindow.isDestroyed()) {
    const contentWidth = Math.round(newWidth);
    const contentHeight = Math.round(newHeight);
    const windowWidth = contentWidth + SHADOW_PADDING * 2;
    const windowHeight = contentHeight + SHADOW_PADDING * 2;
    const bounds = cameraPreviewWindow.getBounds();
    
    // Keep the content centered at its current position during resize
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    
    const newX = Math.round(centerX - windowWidth / 2);
    const newY = Math.round(centerY - windowHeight / 2);
    
    cameraPreviewWindow.setBounds({
      x: newX,
      y: newY,
      width: windowWidth,
      height: windowHeight,
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
  borderStyle?: 'white' | 'shadow';
  shadowIntensity?: number;
  recording?: boolean;
}) {
  if (!cameraPreviewWindow || cameraPreviewWindow.isDestroyed()) return;

  // Only reposition if position changed
  // Size/shape changes only resize the window, keeping it centered
  const shouldReposition = options.position !== undefined;
  const shouldResize = options.size !== undefined || options.shape !== undefined;
  
  if (shouldReposition) {
    // Position changed - recalculate position
    const primaryDisplay = screen.getPrimaryDisplay();
    const { workArea } = primaryDisplay;
    
    const bounds = cameraPreviewWindow.getBounds();
    const contentSize = bounds.width - SHADOW_PADDING * 2;
    const contentHeight = bounds.height - SHADOW_PADDING * 2;
    
    const padding = 20;
    let x: number, y: number;
    
    switch (options.position) {
      case 'top-left':
        x = workArea.x + padding - SHADOW_PADDING;
        y = workArea.y + padding - SHADOW_PADDING;
        break;
      case 'top-right':
        x = workArea.x + workArea.width - contentSize - padding - SHADOW_PADDING;
        y = workArea.y + padding - SHADOW_PADDING;
        break;
      case 'bottom-left':
        x = workArea.x + padding - SHADOW_PADDING;
        y = workArea.y + workArea.height - contentHeight - padding - 60 - SHADOW_PADDING;
        break;
      case 'bottom-right':
      default:
        x = workArea.x + workArea.width - contentSize - padding - SHADOW_PADDING;
        y = workArea.y + workArea.height - contentHeight - padding - 60 - SHADOW_PADDING;
        break;
    }

    cameraPreviewWindow.setBounds({ x, y, width: bounds.width, height: bounds.height });
  } else if (shouldResize) {
    // Size/shape changed - resize but keep centered at current position
    const primaryDisplay = screen.getPrimaryDisplay();
    const { workArea } = primaryDisplay;
    const bounds = cameraPreviewWindow.getBounds();
    
    const contentSize = options.size ? Math.max(80, Math.min(200, Math.round((options.size / 100) * workArea.width))) : (bounds.width - SHADOW_PADDING * 2);
    const contentHeight = options.shape === 'rectangle' ? Math.round(contentSize * 0.75) : contentSize;
    
    const windowWidth = contentSize + SHADOW_PADDING * 2;
    const windowHeight = contentHeight + SHADOW_PADDING * 2;
    
    // Keep centered at current position
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    
    const newX = Math.round(centerX - windowWidth / 2);
    const newY = Math.round(centerY - windowHeight / 2);
    
    cameraPreviewWindow.setBounds({ x: newX, y: newY, width: windowWidth, height: windowHeight });
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
  
  // Calculate content size based on percentage of the area width (max 200px)
  const contentSize = Math.max(80, Math.min(200, Math.round((size / 100) * area.width)));
  const contentHeight = shape === 'rectangle' ? Math.round(contentSize * 0.75) : contentSize;
  
  // Add padding for shadow
  const windowWidth = contentSize + SHADOW_PADDING * 2;
  const windowHeight = contentHeight + SHADOW_PADDING * 2;
  
  // Calculate position within the screen area (account for shadow padding)
  const padding = 20;
  let x: number, y: number;
  
  switch (position) {
    case 'top-left':
      x = area.x + padding - SHADOW_PADDING;
      y = area.y + padding - SHADOW_PADDING;
      break;
    case 'top-right':
      x = area.x + area.width - contentSize - padding - SHADOW_PADDING;
      y = area.y + padding - SHADOW_PADDING;
      break;
    case 'bottom-left':
      x = area.x + padding - SHADOW_PADDING;
      y = area.y + area.height - contentHeight - padding - 60 - SHADOW_PADDING; // 60 for HUD
      break;
    case 'bottom-right':
    default:
      x = area.x + area.width - contentSize - padding - SHADOW_PADDING;
      y = area.y + area.height - contentHeight - padding - 60 - SHADOW_PADDING;
      break;
  }
  
  console.log('Setting camera preview bounds:', { x, y, width: windowWidth, height: windowHeight, shape });
  cameraPreviewWindow.setBounds({ x, y, width: windowWidth, height: windowHeight });
  cameraPreviewWindow.webContents.send('camera-preview-update', { size, shape, position });
}

export function createHudOverlayWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;


  const windowWidth = 500;
  const windowHeight = 400; // Increased to allow popover menus to display

  const x = Math.floor(workArea.x + (workArea.width - windowWidth) / 2);
  const y = Math.floor(workArea.y + workArea.height - windowHeight - 5);

  const isMac = process.platform === 'darwin';
  
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
  
  // Set HUD overlay to higher level than camera preview window
  // Camera uses 'floating' on Mac and 'screen-saver' on Windows
  // HUD should be above camera, use 'pop-up-menu' on Mac and 'screen-saver' on Windows (but set after camera)
  win.setAlwaysOnTop(true, isMac ? 'pop-up-menu' : 'screen-saver');


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

// ============================================================================
// Region Selector Window
// ============================================================================

// IPC handler to open region selector
ipcMain.handle('open-region-selector', async () => {
  return new Promise((resolve) => {
    regionSelectionResolve = resolve;
    
    if (regionSelectorWindow && !regionSelectorWindow.isDestroyed()) {
      regionSelectorWindow.focus();
      return;
    }
    
    createRegionSelectorWindow();
  });
});

// IPC handler for confirming region selection
ipcMain.handle('confirm-region-selection', (_, region: { x: number; y: number; width: number; height: number }) => {
  if (regionSelectionResolve) {
    regionSelectionResolve(region);
    regionSelectionResolve = null;
  }
  
  if (regionSelectorWindow && !regionSelectorWindow.isDestroyed()) {
    regionSelectorWindow.close();
    regionSelectorWindow = null;
  }
  
  return { success: true };
});

// IPC handler for canceling region selection
ipcMain.handle('cancel-region-selection', () => {
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

export function createRegionSelectorWindow(): BrowserWindow {
  // Get all displays and create a window that covers all of them
  const displays = screen.getAllDisplays();
  
  // Calculate bounds that cover all displays
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
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  
  // Make sure it's on top
  win.setAlwaysOnTop(true, 'screen-saver');
  
  // Don't let it be captured
  win.setContentProtection(true);
  
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL + '?windowType=region-selector');
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), {
      query: { windowType: 'region-selector' }
    });
  }
  
  regionSelectorWindow = win;
  
  win.on('closed', () => {
    if (regionSelectorWindow === win) {
      regionSelectorWindow = null;
    }
    // If window was closed without confirming, resolve with null
    if (regionSelectionResolve) {
      regionSelectionResolve(null);
      regionSelectionResolve = null;
    }
  });
  
  return win;
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

// Shadow padding for camera preview window (to accommodate drop-shadow)
// Minimal padding for tight shadow
const SHADOW_PADDING = 5;

export function createCameraPreviewWindow(options: { 
  size: number; 
  shape: 'circle' | 'rectangle';
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  borderStyle?: 'white' | 'shadow';
  shadowIntensity?: number;
}): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;
  
  // Calculate content size based on percentage of screen width (max 200px, consistent with recording)
  const contentSize = Math.max(80, Math.min(200, Math.round((options.size / 100) * workArea.width)));
  const contentHeight = options.shape === 'rectangle' ? Math.round(contentSize * 0.75) : contentSize;
  
  // Add padding for shadow
  const windowWidth = contentSize + SHADOW_PADDING * 2;
  const windowHeight = contentHeight + SHADOW_PADDING * 2;
  
  // Calculate position (account for shadow padding)
  const padding = 20;
  let x: number, y: number;
  
  switch (options.position) {
    case 'top-left':
      x = workArea.x + padding - SHADOW_PADDING;
      y = workArea.y + padding - SHADOW_PADDING;
      break;
    case 'top-right':
      x = workArea.x + workArea.width - contentSize - padding - SHADOW_PADDING;
      y = workArea.y + padding - SHADOW_PADDING;
      break;
    case 'bottom-left':
      x = workArea.x + padding - SHADOW_PADDING;
      y = workArea.y + workArea.height - contentHeight - padding - 60 - SHADOW_PADDING;
      break;
    case 'bottom-right':
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
    backgroundColor: '#00000000', // Fully transparent background
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  // Set to highest level to stay above all windows
  // Use 'floating' on macOS (more compatible) and 'screen-saver' on Windows
  const isMac = process.platform === 'darwin';
  win.setAlwaysOnTop(true, isMac ? 'floating' : 'screen-saver');

  // Prevent window from being captured during screen recording
  // This works on Windows 10 2004+ and macOS
  win.setContentProtection(true);

  // Make window click-through except for the video area
  win.setIgnoreMouseEvents(false);

  // Enable dragging
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('camera-preview-init', options);
  });

  const borderStyle = options.borderStyle || 'shadow';
  const shadowIntensity = options.shadowIntensity ?? 60;
  
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL + `?windowType=camera-preview&shape=${options.shape}&size=${options.size}&position=${options.position}&borderStyle=${borderStyle}&shadowIntensity=${shadowIntensity}`)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), { 
      query: { 
        windowType: 'camera-preview',
        shape: options.shape,
        size: String(options.size),
        position: options.position,
        borderStyle: borderStyle,
        shadowIntensity: String(shadowIntensity)
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
