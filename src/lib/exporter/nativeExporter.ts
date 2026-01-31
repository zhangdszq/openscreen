/**
 * 原生视频导出器集成
 *
 * 在 Electron 主进程中使用 Rust 原生模块进行高性能视频导出
 */

import type { CropRegion, CameraOverlay } from '@/components/video-editor/types';

// 简化的 Zoom 区域接口（与 Rust 侧对应）
export interface NativeZoomRegion {
  id: string;
  startMs: number;
  endMs: number;
  targetX: number;
  targetY: number;
  scale: number;
  easing?: string;
}

// 简化的 Trim 区域接口
export interface NativeTrimRegion {
  id: string;
  startMs: number;
  endMs: number;
}

// 简化的标注区域接口
export interface NativeAnnotationRegion {
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

// 导出配置接口（与 Rust 侧类型对应）
export interface NativeExportConfig {
  inputPath: string;
  outputPath: string;
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
  codec?: string;
  wallpaper?: string;
  zoomRegions: NativeZoomRegion[];
  cropRegion?: CropRegion;
  trimRegions: NativeTrimRegion[];
  annotationRegions: NativeAnnotationRegion[];
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
}

// 导出进度接口
export interface NativeExportProgress {
  currentFrame: number;
  totalFrames: number;
  percentage: number;
  stage: string;
  estimatedTimeRemaining?: number;
  fps?: number;
}

// 导出结果接口
export interface NativeExportResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  durationMs?: number;
  encoderUsed?: string;
  totalFrames?: number;
}

// GPU 信息接口
export interface GpuInfo {
  supported: boolean;
  name?: string;
  backend?: string;
  memoryMb?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getElectronAPI = () => (window as any).electronAPI;

/**
 * 检查原生模块是否可用
 */
export async function isNativeExporterAvailable(): Promise<boolean> {
  try {
    // 通过 IPC 检查主进程是否加载了原生模块
    const result = await getElectronAPI()?.checkNativeExporter?.();
    return result === true;
  } catch {
    return false;
  }
}

/**
 * 获取可用的硬件编码器
 */
export async function getAvailableEncoders(): Promise<string[]> {
  try {
    const encoders = await getElectronAPI()?.getNativeEncoders?.();
    return encoders || ['x264'];
  } catch {
    return ['x264'];
  }
}

/**
 * 获取 GPU 信息
 */
export async function getGpuInfo(): Promise<GpuInfo> {
  try {
    const info = await getElectronAPI()?.getNativeGpuInfo?.();
    return info || { supported: false };
  } catch {
    return { supported: false };
  }
}

/**
 * 使用原生模块导出视频
 */
export async function exportWithNative(
  config: NativeExportConfig,
  onProgress?: (progress: NativeExportProgress) => void
): Promise<NativeExportResult> {
  try {
    // 通过 IPC 调用主进程的原生导出
    const result = await getElectronAPI()?.nativeExport?.(config, onProgress);

    if (!result) {
      return {
        success: false,
        error: 'Native exporter not available',
      };
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 取消原生导出
 */
export async function cancelNativeExport(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (window as any).electronAPI?.cancelNativeExport?.();
    return result === true;
  } catch {
    return false;
  }
}
