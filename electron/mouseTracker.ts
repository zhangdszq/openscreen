import { screen, systemPreferences, dialog } from 'electron';
import { createRequire } from 'node:module';

// Use createRequire for uiohook-napi to work in ES modules
const require = createRequire(import.meta.url);
const { uIOhook } = require('uiohook-napi');

interface UiohookMouseEvent {
  x: number;
  y: number;
  button: number;
}

// Type definitions for mouse tracking
export interface RecordedMouseEvent {
  id: string;
  timestampMs: number;
  x: number;
  y: number;
  type: 'click' | 'move';
  button?: 'left' | 'right' | 'middle';
}

export interface MouseTrackData {
  events: RecordedMouseEvent[];
  screenBounds: { width: number; height: number };
}

export interface RecordingBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Module state
let isTracking = false;
let events: RecordedMouseEvent[] = [];
let startTime = 0;
let recordingBounds: RecordingBounds | null = null;
let eventCounter = 0;
let hookStarted = false;

function generateEventId(): string {
  return `mouse-${Date.now()}-${eventCounter++}`;
}

function normalizeCoordinates(screenX: number, screenY: number): { x: number; y: number } | null {
  if (!recordingBounds) return null;
  
  const x = (screenX - recordingBounds.x) / recordingBounds.width;
  const y = (screenY - recordingBounds.y) / recordingBounds.height;
  
  // Only record if within recording bounds (0-1 range, with small tolerance)
  if (x < -0.1 || x > 1.1 || y < -0.1 || y > 1.1) {
    return null;
  }
  
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
  };
}

function getButtonName(button: number): 'left' | 'right' | 'middle' {
  switch (button) {
    case 1: return 'left';
    case 2: return 'right';
    case 3: return 'middle';
    default: return 'left';
  }
}

function handleMouseClick(event: UiohookMouseEvent) {
  if (!isTracking || !recordingBounds) return;
  
  const normalized = normalizeCoordinates(event.x, event.y);
  if (!normalized) return;
  
  const timestampMs = Date.now() - startTime;
  
  events.push({
    id: generateEventId(),
    timestampMs,
    x: normalized.x,
    y: normalized.y,
    type: 'click',
    button: getButtonName(event.button),
  });
  
  console.log(`Mouse tracker: ${getButtonName(event.button)} click at (${normalized.x.toFixed(3)}, ${normalized.y.toFixed(3)}) at ${timestampMs}ms`);
}

// Check if we have accessibility permissions (macOS only)
export async function checkAccessibilityPermission(): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return true; // Windows/Linux don't need special permission
  }
  
  const isTrusted = systemPreferences.isTrustedAccessibilityClient(false);
  return isTrusted;
}

// Request accessibility permission (macOS only)
export async function requestAccessibilityPermission(): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return true;
  }
  
  // Check if already granted
  if (systemPreferences.isTrustedAccessibilityClient(false)) {
    return true;
  }
  
  // Show dialog explaining why we need permission
  const result = await dialog.showMessageBox({
    type: 'info',
    title: '需要辅助功能权限',
    message: '为了追踪鼠标点击，需要授予辅助功能权限',
    detail: '点击"打开设置"后，请在「隐私与安全性 → 辅助功能」中勾选此应用。',
    buttons: ['打开设置', '取消'],
    defaultId: 0,
  });
  
  if (result.response === 0) {
    // This will prompt the user and open System Preferences
    systemPreferences.isTrustedAccessibilityClient(true);
  }
  
  // Return current status (user might have granted permission)
  return systemPreferences.isTrustedAccessibilityClient(false);
}

function setupHook() {
  if (hookStarted) return;
  
  uIOhook.on('mousedown', handleMouseClick);
  
  try {
    uIOhook.start();
    hookStarted = true;
    console.log('Mouse tracker: Global hook started successfully');
  } catch (error) {
    console.error('Mouse tracker: Failed to start global hook:', error);
    throw error;
  }
}

function stopHook() {
  if (!hookStarted) return;
  
  try {
    uIOhook.stop();
    hookStarted = false;
    console.log('Mouse tracker: Global hook stopped');
  } catch (error) {
    console.warn('Mouse tracker: Error stopping hook:', error);
  }
}

export async function startTracking(bounds: RecordingBounds): Promise<{ success: boolean; error?: string }> {
  if (isTracking) {
    console.warn('Mouse tracker: Already tracking, stopping previous session');
    stopTracking();
  }
  
  // Check accessibility permission on macOS
  if (process.platform === 'darwin') {
    const hasPermission = await checkAccessibilityPermission();
    if (!hasPermission) {
      const granted = await requestAccessibilityPermission();
      if (!granted) {
        return { 
          success: false, 
          error: '需要辅助功能权限才能追踪鼠标点击。请在系统设置中授权。' 
        };
      }
    }
  }
  
  console.log('Mouse tracker: Starting tracking with bounds:', bounds);
  
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

export function stopTracking(): MouseTrackData {
  console.log('Mouse tracker: Stopping tracking');
  
  isTracking = false;
  
  // Don't stop the hook here - keep it running for future recordings
  // This avoids the overhead of starting/stopping frequently
  
  const result: MouseTrackData = {
    events: [...events],
    screenBounds: recordingBounds 
      ? { width: recordingBounds.width, height: recordingBounds.height }
      : { width: 0, height: 0 },
  };
  
  console.log(`Mouse tracker: Captured ${result.events.length} click events`);
  
  // Clean up
  events = [];
  recordingBounds = null;
  
  return result;
}

export function isCurrentlyTracking(): boolean {
  return isTracking;
}

export function getClickEvents(): RecordedMouseEvent[] {
  return events.filter(e => e.type === 'click');
}

// Cleanup function to be called when app quits
export function cleanup() {
  stopHook();
}

// Manual click recording (fallback if hook doesn't work)
export function recordClick(button: 'left' | 'right' | 'middle' = 'left') {
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
    type: 'click',
    button,
  });
  
  console.log(`Mouse tracker: Manual ${button} click recorded at (${normalized.x.toFixed(3)}, ${normalized.y.toFixed(3)}) at ${timestampMs}ms`);
}
