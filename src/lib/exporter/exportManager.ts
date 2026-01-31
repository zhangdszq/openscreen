/**
 * Export Manager
 * Unified interface for video export with automatic optimization selection
 * Inspired by Remotion's render strategy selection
 * 
 * Strategies:
 * - standard: Sequential processing, good for short videos
 * - parallel: Segment-based parallel, good for long videos
 * - webgpu: GPU-accelerated rendering, good for high resolution
 * - hybrid: WebGPU + Parallel combined, best for long high-res videos
 */

import { VideoExporter } from './videoExporter';
import { ParallelVideoExporter, shouldUseParallelExport, calculateOptimalSegments } from './parallelExporter';
import { HybridVideoExporter, shouldUseHybridExport, calculateHybridConfig } from './hybridExporter';
import { isWebGPUAvailable } from './webgpu/webgpuRenderer';
import { PerformanceMonitor, estimateOptimalConcurrency } from './performanceMonitor';
import type { ExportConfig, ExportProgress, ExportResult } from './types';
import type { ZoomRegion, CropRegion, TrimRegion, AnnotationRegion, CameraOverlay } from '@/components/video-editor/types';

export interface ExportManagerConfig extends ExportConfig {
  videoUrl: string;
  wallpaper: string;
  zoomRegions: ZoomRegion[];
  trimRegions?: TrimRegion[];
  showShadow: boolean;
  shadowIntensity: number;
  showBlur: boolean;
  motionBlurEnabled?: boolean;
  borderRadius?: number;
  padding?: number;
  videoPadding?: number;
  cropRegion: CropRegion;
  annotationRegions?: AnnotationRegion[];
  previewWidth?: number;
  previewHeight?: number;
  cameraOverlay?: CameraOverlay;
  onProgress?: (progress: ExportProgress) => void;
}

export interface ExportStrategy {
  type: 'standard' | 'parallel' | 'webgpu' | 'hybrid';
  reason: string;
  estimatedSpeedup?: number;
}

export interface ExportCapabilities {
  webgpu: boolean;
  parallelRendering: boolean;
  hardwareEncoding: boolean;
  hardwareConcurrency: number;
  recommendedStrategy: ExportStrategy;
}

/**
 * Detect system capabilities for export
 */
export async function detectCapabilities(
  config: { width: number; height: number; duration?: number }
): Promise<ExportCapabilities> {
  const hardwareConcurrency = navigator.hardwareConcurrency || 4;
  const webgpu = await isWebGPUAvailable();
  
  // Check hardware encoding support
  let hardwareEncoding = false;
  try {
    const testConfig: VideoEncoderConfig = {
      codec: 'avc1.640033',
      width: config.width,
      height: config.height,
      bitrate: 8_000_000,
      hardwareAcceleration: 'prefer-hardware',
    };
    const support = await VideoEncoder.isConfigSupported(testConfig);
    hardwareEncoding = support.supported || false;
  } catch {
    hardwareEncoding = false;
  }

  // Determine recommended strategy
  const duration = config.duration || 0;
  const pixels = config.width * config.height;
  const megapixels = pixels / 1_000_000;

  let recommendedStrategy: ExportStrategy;

  // Priority: hybrid > parallel > webgpu > standard
  // Hybrid is preferred for long/high-res videos (WebGPU availability handled internally)
  if (shouldUseHybridExport(duration, config.width, config.height)) {
    // Hybrid: Parallel processing + optional WebGPU for long/high-res videos
    const hybridConfig = calculateHybridConfig(duration, config.width, config.height, hardwareConcurrency);
    const webgpuNote = webgpu ? 'with WebGPU' : 'without WebGPU';
    recommendedStrategy = {
      type: 'hybrid',
      reason: `Long/high-res video (${duration.toFixed(1)}s, ${megapixels.toFixed(1)}MP), using ${hybridConfig.segmentCount} segments ${webgpuNote}`,
      estimatedSpeedup: Math.min(hybridConfig.segmentCount * (webgpu ? 1.2 : 0.9), hardwareConcurrency * 0.8),
    };
  } else if (duration > 10 && shouldUseParallelExport(duration, config.width, config.height)) {
    // Parallel for long videos
    const segments = calculateOptimalSegments(duration, hardwareConcurrency);
    recommendedStrategy = {
      type: 'parallel',
      reason: `Long video detected (${duration.toFixed(1)}s), using ${segments} parallel segments`,
      estimatedSpeedup: Math.min(segments * 0.7, hardwareConcurrency * 0.6),
    };
  } else if (webgpu && megapixels > 2) {
    // WebGPU for high resolution short videos
    recommendedStrategy = {
      type: 'webgpu',
      reason: 'WebGPU available and high resolution detected',
      estimatedSpeedup: 1.5,
    };
  } else {
    // Standard for short videos or limited hardware
    recommendedStrategy = {
      type: 'standard',
      reason: 'Standard export optimal for this configuration',
      estimatedSpeedup: 1,
    };
  }

  return {
    webgpu,
    parallelRendering: hardwareConcurrency >= 4,
    hardwareEncoding,
    hardwareConcurrency,
    recommendedStrategy,
  };
}

/**
 * Export Manager - Unified export interface with automatic optimization
 */
export class ExportManager {
  private config: ExportManagerConfig;
  private currentExporter: VideoExporter | ParallelVideoExporter | null = null;
  private performanceMonitor: PerformanceMonitor;
  private capabilities: ExportCapabilities | null = null;

  constructor(config: ExportManagerConfig) {
    this.config = config;
    this.performanceMonitor = new PerformanceMonitor();
  }

  /**
   * Get system capabilities
   */
  async getCapabilities(): Promise<ExportCapabilities> {
    if (!this.capabilities) {
      // Estimate duration from video URL
      let duration = 0;
      try {
        const video = document.createElement('video');
        video.src = this.config.videoUrl;
        video.preload = 'metadata';
        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => {
            duration = video.duration;
            resolve();
          };
          video.onerror = () => resolve();
          setTimeout(resolve, 5000); // Timeout fallback
        });
        video.src = '';
      } catch {
        duration = 30; // Default estimate
      }

      this.capabilities = await detectCapabilities({
        width: this.config.width,
        height: this.config.height,
        duration,
      });
    }
    return this.capabilities;
  }

  /**
   * Export with automatic strategy selection
   */
  async export(forceStrategy?: ExportStrategy['type']): Promise<ExportResult> {
    const capabilities = await this.getCapabilities();
    let strategy = forceStrategy || capabilities.recommendedStrategy.type;

    // Camera overlay is now supported in hybrid/parallel
    const hasCameraOverlay = this.config.cameraOverlay?.enabled && this.config.cameraOverlay?.videoPath;
    if (hasCameraOverlay) {
      console.log(`[ExportManager] Camera overlay detected, will be composited in export`);
    }

    console.log(`[ExportManager] Using ${strategy} strategy`);
    console.log(`[ExportManager] Capabilities:`, capabilities);

    this.performanceMonitor.start();

    let result: ExportResult;

    try {
      switch (strategy) {
        case 'hybrid':
          result = await this.exportHybrid();
          break;
        case 'parallel':
          result = await this.exportParallel();
          break;
        case 'webgpu':
          // WebGPU renderer can be used with standard exporter
          // For now, fall through to standard with WebGPU flag
          result = await this.exportStandard();
          break;
        case 'standard':
        default:
          result = await this.exportStandard();
          break;
      }
    } finally {
      this.performanceMonitor.logSummary();
    }

    return result;
  }

  /**
   * Standard export using VideoExporter
   */
  private async exportStandard(): Promise<ExportResult> {
    this.currentExporter = new VideoExporter(this.config);
    return this.currentExporter.export();
  }

  /**
   * Parallel export using ParallelVideoExporter
   */
  private async exportParallel(): Promise<ExportResult> {
    const capabilities = await this.getCapabilities();
    const { recommendation } = estimateOptimalConcurrency(
      { width: this.config.width, height: this.config.height },
      capabilities.hardwareConcurrency
    );

    console.log(`[ExportManager] Parallel export: ${recommendation}`);

    this.currentExporter = new ParallelVideoExporter({
      ...this.config,
      segmentCount: calculateOptimalSegments(30, capabilities.hardwareConcurrency), // Will be recalculated with actual duration
      maxConcurrency: Math.max(2, Math.floor(capabilities.hardwareConcurrency * 0.5)),
    });

    return this.currentExporter.export();
  }

  /**
   * Hybrid export using HybridVideoExporter (WebGPU + Parallel)
   */
  private async exportHybrid(): Promise<ExportResult> {
    const capabilities = await this.getCapabilities();
    const hybridConfig = calculateHybridConfig(
      30, // Will be recalculated with actual duration
      this.config.width,
      this.config.height,
      capabilities.hardwareConcurrency
    );

    console.log(`[ExportManager] Hybrid export: ${hybridConfig.segmentCount} segments, concurrency: ${hybridConfig.maxConcurrency}, WebGPU: ${hybridConfig.useWebGPU}`);

    const exporter = new HybridVideoExporter({
      ...this.config,
      cameraOverlay: this.config.cameraOverlay,
      segmentCount: hybridConfig.segmentCount,
      maxConcurrency: hybridConfig.maxConcurrency,
      useWebGPU: hybridConfig.useWebGPU,
    });

    // Store reference for cancel
    this.currentExporter = exporter as unknown as VideoExporter;

    return exporter.export();
  }

  /**
   * Cancel ongoing export
   */
  cancel(): void {
    if (this.currentExporter) {
      this.currentExporter.cancel();
      this.currentExporter = null;
    }
  }

  /**
   * Get performance metrics from last export
   */
  getPerformanceMetrics() {
    return this.performanceMonitor.getMetrics();
  }
}

/**
 * Quick export function with automatic optimization
 */
export async function quickExport(
  config: ExportManagerConfig,
  strategy?: ExportStrategy['type']
): Promise<ExportResult> {
  const manager = new ExportManager(config);
  return manager.export(strategy);
}

/**
 * Get export recommendations based on video properties
 */
export async function getExportRecommendations(config: {
  width: number;
  height: number;
  duration: number;
}): Promise<{
  strategy: ExportStrategy;
  estimatedTime: number;
  tips: string[];
}> {
  const capabilities = await detectCapabilities(config);
  const strategyType = capabilities.recommendedStrategy.type;

  const tips: string[] = [];

  // Calculate estimated time (rough estimate)
  const frameCount = config.duration * 30; // Assume 30fps
  const framesPerSecond = capabilities.hardwareEncoding ? 60 : 30;
  let estimatedTime = frameCount / framesPerSecond;

  if (strategyType === 'parallel' && capabilities.recommendedStrategy.estimatedSpeedup) {
    estimatedTime /= capabilities.recommendedStrategy.estimatedSpeedup;
  }

  // Generate tips
  if (config.width * config.height > 2_000_000 && !capabilities.webgpu) {
    tips.push('Consider using a lower resolution for faster export');
  }

  if (!capabilities.hardwareEncoding) {
    tips.push('Hardware encoding not available - export may be slower');
  }

  if (config.duration > 60) {
    tips.push('Long video detected - parallel export recommended');
  }

  if (capabilities.hardwareConcurrency < 4) {
    tips.push('Limited CPU cores detected - consider closing other applications');
  }

  return {
    strategy: capabilities.recommendedStrategy,
    estimatedTime,
    tips,
  };
}
