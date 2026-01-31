/**
 * Video Exporter Module
 * 
 * This module provides multiple export strategies optimized for different scenarios:
 * 
 * 1. Standard Export (VideoExporter)
 *    - Sequential frame processing
 *    - Good for short videos and simple cases
 *    - Uses adaptive queue sizing
 * 
 * 2. Parallel Export (ParallelVideoExporter)
 *    - Splits video into segments
 *    - Processes segments in parallel
 *    - Best for longer videos (>10s)
 * 
 * 3. WebGPU Rendering (WebGPURenderer)
 *    - High-performance GPU rendering
 *    - Better than WebGL for high resolutions
 *    - Falls back to PixiJS if unavailable
 * 
 * 4. Worker-based Rendering
 *    - Offloads rendering to Web Workers
 *    - Prevents UI blocking
 *    - Uses OffscreenCanvas
 * 
 * Usage:
 * ```typescript
 * import { ExportManager, quickExport, getExportRecommendations } from './exporter';
 * 
 * // Automatic strategy selection
 * const manager = new ExportManager(config);
 * const result = await manager.export();
 * 
 * // Or quick export
 * const result = await quickExport(config);
 * 
 * // Get recommendations
 * const recommendations = await getExportRecommendations({
 *   width: 1920,
 *   height: 1080,
 *   duration: 30,
 * });
 * ```
 */

// Main exporters
export { VideoExporter } from './videoExporter';
export { GifExporter, calculateOutputDimensions } from './gifExporter';
export { ParallelVideoExporter, shouldUseParallelExport, calculateOptimalSegments } from './parallelExporter';
export { HybridVideoExporter, shouldUseHybridExport, calculateHybridConfig } from './hybridExporter';

// Export manager (recommended entry point)
export {
  ExportManager,
  quickExport,
  getExportRecommendations,
  detectCapabilities,
  type ExportManagerConfig,
  type ExportStrategy,
  type ExportCapabilities,
} from './exportManager';

// WebGPU renderer
export {
  WebGPURenderer,
  isWebGPUAvailable,
  createBestRenderer,
  type WebGPURendererConfig,
} from './webgpu/webgpuRenderer';

// Worker pool
export {
  WorkerPool,
  calculateOptimalWorkerCount,
  type WorkerPoolConfig,
  type PooledWorker,
} from './workers/workerPool';

// Performance monitoring
export {
  PerformanceMonitor,
  estimateOptimalConcurrency,
  type FrameMetrics,
  type ExportMetrics,
} from './performanceMonitor';

// Types
export {
  type ExportConfig,
  type ExportProgress,
  type ExportResult,
  type ExportQuality,
  type ExportFormat,
  type GifFrameRate,
  type GifSizePreset,
  type GifExportConfig,
  type ExportSettings,
  GIF_SIZE_PRESETS,
  GIF_FRAME_RATES,
  VALID_GIF_FRAME_RATES,
  PERFORMANCE_PRESETS,
  isValidGifFrameRate,
} from './types';

// Internal modules (for advanced usage)
export { VideoFileDecoder } from './videoDecoder';
export { FrameRenderer } from './frameRenderer';
export { VideoMuxer } from './muxer';
export { AudioExtractor } from './audioExtractor';
