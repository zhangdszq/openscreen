/**
 * 原生模块集成 (Electron 主进程)
 *
 * 加载和使用 Rust 原生视频导出模块
 */

import { ipcMain, app } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// ES 模块兼容性
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

/**
 * 获取 FFmpeg 目录路径
 * - 开发环境：项目根目录/ffmpeg/{platform}/
 * - 生产环境：resources/ffmpeg/{platform}/
 */
function getFfmpegDir(): string | undefined {
  const platform = process.platform === 'win32' ? 'win32' :
                   process.platform === 'darwin' ? 'darwin' : 'linux';
  
  const possiblePaths = [
    // 生产环境
    path.join(process.resourcesPath || '', 'ffmpeg', platform),
    // 开发环境
    path.join(__dirname, '..', 'ffmpeg', platform),
    path.join(__dirname, '..', '..', 'ffmpeg', platform),
    // 项目根目录
    path.join(app.getAppPath(), 'ffmpeg', platform),
  ];
  
  for (const ffmpegPath of possiblePaths) {
    const ffmpegExe = process.platform === 'win32' 
      ? path.join(ffmpegPath, 'ffmpeg.exe')
      : path.join(ffmpegPath, 'ffmpeg');
    
    if (fs.existsSync(ffmpegExe)) {
      console.log('[Native] Found bundled FFmpeg at:', ffmpegPath);
      return ffmpegPath;
    }
  }
  
  console.log('[Native] No bundled FFmpeg found, will use system PATH');
  return undefined;
}

// 原生模块类型定义
interface NativeModule {
  initLogger: (level?: string) => void;
  getAvailableEncoders: () => string[];
  checkGpuSupport: () => Promise<GpuInfo>;
  NativeVideoExporter: new (config: ExportConfig) => NativeVideoExporter;
}

interface NativeVideoExporter {
  export: (progressCallback: (progress: ExportProgress) => void) => Promise<ExportResult>;
  cancel: () => boolean;
  isRunning: () => boolean;
}

interface ExportConfig {
  inputPath: string;
  outputPath: string;
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
  codec?: string;
  wallpaper?: string;
  zoomRegions: ZoomRegion[];
  cropRegion?: CropRegion;
  trimRegions: TrimRegion[];
  annotationRegions: AnnotationRegion[];
  cameraOverlay?: CameraOverlay;
  showShadow: boolean;
  shadowIntensity: number;
  showBlur: boolean;
  motionBlurEnabled: boolean;
  borderRadius?: number;
  padding?: number;
  preferredEncoder?: string;
  useGpuRendering?: boolean;
  concurrency?: number;
  ffmpegDir?: string;
}

interface ExportProgress {
  currentFrame: number;
  totalFrames: number;
  percentage: number;
  stage: string;
  estimatedTimeRemaining?: number;
  fps?: number;
}

interface ExportResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  durationMs?: number;
  encoderUsed?: string;
  totalFrames?: number;
}

interface GpuInfo {
  supported: boolean;
  name?: string;
  backend?: string;
  memoryMb?: number;
}

interface ZoomRegion {
  id: string;
  startMs: number;
  endMs: number;
  targetX: number;
  targetY: number;
  scale: number;
  easing?: string;
}

interface CropRegion {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface TrimRegion {
  id: string;
  startMs: number;
  endMs: number;
}

interface AnnotationRegion {
  id: string;
  annotationType: string;
  startMs: number;
  endMs: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
  text?: string;
  strokeWidth?: number;
}

interface CameraOverlay {
  enabled: boolean;
  videoPath?: string;
  shape: string;
  size: number;
  position: { x: number; y: number };
  opacity: number;
  borderStyle: string;
}

// 全局状态
let nativeModule: NativeModule | null = null;
let currentExporter: NativeVideoExporter | null = null;
let isInitialized = false;

/**
 * 尝试加载原生模块
 */
function loadNativeModule(): NativeModule | null {
  if (nativeModule) {
    return nativeModule;
  }

  try {
    // 尝试不同的加载路径
    const possiblePaths = [
      // 开发环境
      path.join(__dirname, '..', 'native'),
      path.join(__dirname, '..', '..', 'native'),
      // 生产环境
      path.join(process.resourcesPath || '', 'native'),
      // node_modules
      'openscreen-native',
    ];

    for (const modulePath of possiblePaths) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const module = require(modulePath) as NativeModule;
        if (module && typeof module.NativeVideoExporter === 'function') {
          console.log('[Native] Loaded from:', modulePath);
          nativeModule = module;
          return module;
        }
      } catch {
        // 继续尝试下一个路径
      }
    }

    console.warn('[Native] Module not found in any path');
    return null;
  } catch (error) {
    console.error('[Native] Failed to load module:', error);
    return null;
  }
}

/**
 * 初始化原生模块
 */
export function initializeNativeModule(): boolean {
  if (isInitialized) {
    return nativeModule !== null;
  }

  const module = loadNativeModule();
  if (module) {
    try {
      module.initLogger('info');
      console.log('[Native] Module initialized');
      console.log('[Native] Available encoders:', module.getAvailableEncoders());
      isInitialized = true;
      return true;
    } catch (error) {
      console.error('[Native] Initialization failed:', error);
      return false;
    }
  }

  isInitialized = true;
  return false;
}

/**
 * 注册 IPC 处理程序
 */
export function registerNativeIpcHandlers(): void {
  // 检查原生模块是否可用
  ipcMain.handle('native:check', async () => {
    return loadNativeModule() !== null;
  });

  // 获取可用编码器
  ipcMain.handle('native:encoders', async () => {
    const module = loadNativeModule();
    if (module) {
      return module.getAvailableEncoders();
    }
    return ['x264'];
  });

  // 获取 GPU 信息
  ipcMain.handle('native:gpu-info', async () => {
    const module = loadNativeModule();
    if (module) {
      try {
        return await module.checkGpuSupport();
      } catch (error) {
        console.error('[Native] GPU check failed:', error);
      }
    }
    return { supported: false };
  });

  // 执行导出
  ipcMain.handle('native:export', async (event, config: ExportConfig) => {
    const module = loadNativeModule();
    if (!module) {
      return {
        success: false,
        error: 'Native module not available',
      };
    }

    try {
      // 自动添加 FFmpeg 路径（如果有打包的 FFmpeg）
      const ffmpegDir = getFfmpegDir();
      
      // 处理 wallpaper 路径
      let wallpaperPath = config.wallpaper;
      if (wallpaperPath) {
        if (wallpaperPath.startsWith('/')) {
          // 开发模式：URL 路径如 /wallpapers/wallpaper1.jpg
          // 转换为实际文件路径
          const publicDir = app.isPackaged 
            ? path.join(process.resourcesPath, 'public')
            : path.join(app.getAppPath(), 'public');
          wallpaperPath = path.join(publicDir, wallpaperPath);
          console.log('[Native] Resolved wallpaper path:', wallpaperPath);
        } else if (wallpaperPath.startsWith('file://')) {
          wallpaperPath = decodeURIComponent(wallpaperPath.replace('file:///', '').replace(/\//g, path.sep));
        }
      }
      
      const finalConfig: ExportConfig = {
        ...config,
        ffmpegDir: config.ffmpegDir || ffmpegDir,
        wallpaper: wallpaperPath,
      };
      
      console.log('[Native] Export config:', JSON.stringify(finalConfig, null, 2));
      
      // napi-rs 会自动处理 camelCase 到 snake_case 的转换
      // 直接传递 JavaScript 对象即可
      currentExporter = new module.NativeVideoExporter(finalConfig);

      const result = await currentExporter.export((progress) => {
        // 发送进度到渲染进程
        event.sender.send('native:progress', {
          currentFrame: progress.currentFrame,
          totalFrames: progress.totalFrames,
          percentage: progress.percentage,
          stage: progress.stage,
          estimatedTimeRemaining: progress.estimatedTimeRemaining,
          fps: progress.fps,
        });
      });

      currentExporter = null;

      return {
        success: result.success,
        outputPath: result.outputPath,
        error: result.error,
        durationMs: result.durationMs,
        encoderUsed: result.encoderUsed,
        totalFrames: result.totalFrames,
      };
    } catch (error) {
      currentExporter = null;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // 取消导出
  ipcMain.handle('native:cancel', async () => {
    if (currentExporter) {
      return currentExporter.cancel();
    }
    return false;
  });

  console.log('[Native] IPC handlers registered');
}
