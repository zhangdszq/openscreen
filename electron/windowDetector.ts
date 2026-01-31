/**
 * Windows Window Detector
 * 使用 koffi 调用 Win32 API 获取鼠标下方窗口的信息
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// 只在 Windows 上启用
const isWindows = process.platform === 'win32';

// 初始化状态
let initialized = false;
let initError: string | null = null;

// Win32 类型和函数
let koffi: any = null;
let user32: any = null;
let dwmapi: any = null;
let POINT: any = null;
let RECT: any = null;
let GetCursorPos: any = null;
let WindowFromPoint: any = null;
let GetWindowRect: any = null;
let GetWindowTextW: any = null;
let GetWindowTextLengthW: any = null;
let IsWindowVisible: any = null;
let GetAncestor: any = null;
let GetClassNameW: any = null;
let DwmGetWindowAttribute: any = null;

// GA_ROOTOWNER 常量
const GA_ROOTOWNER = 3;
// DWMWA_EXTENDED_FRAME_BOUNDS 常量
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;

/**
 * 初始化 koffi 和 Win32 API
 */
function initialize(): boolean {
  if (initialized) return !!user32;
  initialized = true;

  if (!isWindows) {
    initError = 'Not Windows platform';
    console.log('[WindowDetector] Not Windows platform, skipping initialization');
    return false;
  }

  try {
    // 使用 createRequire 加载原生模块
    koffi = require('koffi');
    console.log('[WindowDetector] koffi loaded successfully');
  } catch (error) {
    initError = `Failed to load koffi: ${error}`;
    console.error('[WindowDetector]', initError);
    return false;
  }

  try {
    user32 = koffi.load('user32.dll');
    console.log('[WindowDetector] user32.dll loaded');
  } catch (error) {
    initError = `Failed to load user32.dll: ${error}`;
    console.error('[WindowDetector]', initError);
    return false;
  }

  try {
    dwmapi = koffi.load('dwmapi.dll');
    console.log('[WindowDetector] dwmapi.dll loaded');
  } catch (error) {
    console.warn('[WindowDetector] dwmapi.dll not available:', error);
    // dwmapi 不是必须的
  }

  try {
    // 定义结构体
    POINT = koffi.struct('POINT', {
      x: 'long',
      y: 'long'
    });

    RECT = koffi.struct('RECT', {
      left: 'long',
      top: 'long',
      right: 'long',
      bottom: 'long'
    });

    // 定义函数
    GetCursorPos = user32.func('bool GetCursorPos(_Out_ POINT *lpPoint)');
    WindowFromPoint = user32.func('void* WindowFromPoint(POINT Point)');
    GetWindowRect = user32.func('bool GetWindowRect(void *hWnd, _Out_ RECT *lpRect)');
    GetWindowTextLengthW = user32.func('int GetWindowTextLengthW(void *hWnd)');
    GetWindowTextW = user32.func('int GetWindowTextW(void *hWnd, _Out_ uint16 *lpString, int nMaxCount)');
    IsWindowVisible = user32.func('bool IsWindowVisible(void *hWnd)');
    GetAncestor = user32.func('void* GetAncestor(void *hwnd, unsigned int gaFlags)');
    GetClassNameW = user32.func('int GetClassNameW(void *hWnd, _Out_ uint16 *lpClassName, int nMaxCount)');

    if (dwmapi) {
      DwmGetWindowAttribute = dwmapi.func('long DwmGetWindowAttribute(void *hwnd, unsigned int dwAttribute, _Out_ RECT *pvAttribute, unsigned int cbAttribute)');
    }

    console.log('[WindowDetector] All functions defined successfully');
    return true;
  } catch (error) {
    initError = `Failed to define functions: ${error}`;
    console.error('[WindowDetector]', initError);
    return false;
  }
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedWindow {
  hwnd: string;
  title: string;
  className: string;
  bounds: WindowBounds;
  isVisible: boolean;
}

/**
 * 获取鼠标位置
 */
export function getCursorPosition(): { x: number; y: number } | null {
  if (!initialize() || !GetCursorPos) return null;

  try {
    const point = { x: 0, y: 0 };
    if (GetCursorPos(point)) {
      return { x: point.x, y: point.y };
    }
  } catch (error) {
    console.warn('[WindowDetector] GetCursorPos failed:', error);
  }
  return null;
}

/**
 * 获取窗口文本（标题）
 */
function getWindowText(hwnd: any): string {
  if (!GetWindowTextLengthW || !GetWindowTextW) return '';

  try {
    const length = GetWindowTextLengthW(hwnd);
    if (length > 0) {
      const buffer = new Uint16Array(length + 1);
      GetWindowTextW(hwnd, buffer, length + 1);
      // 转换 UTF-16 到字符串
      let result = '';
      for (let i = 0; i < length; i++) {
        if (buffer[i] === 0) break;
        result += String.fromCharCode(buffer[i]);
      }
      return result;
    }
  } catch (error) {
    console.warn('[WindowDetector] GetWindowText failed:', error);
  }
  return '';
}

/**
 * 获取窗口类名
 */
function getWindowClassName(hwnd: any): string {
  if (!GetClassNameW) return '';

  try {
    const buffer = new Uint16Array(256);
    const len = GetClassNameW(hwnd, buffer, 256);
    if (len > 0) {
      let result = '';
      for (let i = 0; i < len; i++) {
        if (buffer[i] === 0) break;
        result += String.fromCharCode(buffer[i]);
      }
      return result;
    }
  } catch (error) {
    console.warn('[WindowDetector] GetClassName failed:', error);
  }
  return '';
}

/**
 * 将 koffi 指针转换为数字 ID
 */
function pointerToId(ptr: any): string {
  if (!ptr) return '0';
  // koffi 指针可以通过 BigInt 转换
  try {
    if (typeof ptr === 'bigint') {
      return ptr.toString();
    }
    // 尝试获取指针的地址值
    if (koffi && koffi.address) {
      return koffi.address(ptr).toString();
    }
    // 如果都不行，使用时间戳作为唯一标识
    return Date.now().toString();
  } catch {
    return Date.now().toString();
  }
}

/**
 * 获取指定位置的窗口信息
 */
export function getWindowAtPoint(x: number, y: number): DetectedWindow | null {
  if (!initialize() || !WindowFromPoint) return null;

  try {
    const point = { x, y };
    let hwnd = WindowFromPoint(point);

    if (!hwnd) return null;

    // 获取根窗口（顶级窗口）
    if (GetAncestor) {
      const rootHwnd = GetAncestor(hwnd, GA_ROOTOWNER);
      if (rootHwnd) {
        hwnd = rootHwnd;
      }
    }

    // 检查窗口是否可见
    if (IsWindowVisible && !IsWindowVisible(hwnd)) {
      return null;
    }

    // 获取窗口标题
    const title = getWindowText(hwnd);

    // 获取窗口类名
    const className = getWindowClassName(hwnd);

    // 获取窗口边界 - 优先使用 DWM 扩展边界（更准确）
    let bounds: WindowBounds = { x: 0, y: 0, width: 0, height: 0 };

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
        // 回退到 GetWindowRect
      }
    }

    // 如果 DWM 失败，使用 GetWindowRect
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

    // 过滤掉太小的窗口或无效的窗口
    if (bounds.width < 50 || bounds.height < 50) {
      return null;
    }

    // 过滤掉系统窗口
    const systemClasses = ['Shell_TrayWnd', 'Progman', 'WorkerW', 'DV2ControlHost'];
    if (systemClasses.includes(className)) {
      return null;
    }

    // 使用标题和边界组合作为唯一标识（因为 hwnd 指针不好转字符串）
    const hwndId = `${title}-${bounds.x}-${bounds.y}-${bounds.width}-${bounds.height}`;

    return {
      hwnd: hwndId,
      title,
      className,
      bounds,
      isVisible: true
    };
  } catch (error) {
    console.warn('[WindowDetector] getWindowAtPoint failed:', error);
    return null;
  }
}

/**
 * 获取鼠标下方的窗口
 */
export function getWindowUnderCursor(): DetectedWindow | null {
  const cursor = getCursorPosition();
  if (!cursor) return null;
  return getWindowAtPoint(cursor.x, cursor.y);
}

/**
 * 检查是否在 Windows 平台且功能可用
 */
export function isWindowDetectionAvailable(): boolean {
  const result = initialize();
  console.log('[WindowDetector] isWindowDetectionAvailable:', result, 'initError:', initError);
  return result;
}

/**
 * 获取初始化错误信息
 */
export function getInitError(): string | null {
  return initError;
}
