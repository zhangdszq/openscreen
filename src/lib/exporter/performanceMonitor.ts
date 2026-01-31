/**
 * Performance monitoring utilities for export optimization
 * Inspired by Remotion's benchmark and performance tracking
 */

export interface FrameMetrics {
  frameIndex: number;
  renderTime: number;
  encodeTime: number;
  totalTime: number;
  queueSize: number;
}

export interface ExportMetrics {
  totalFrames: number;
  totalDuration: number;
  averageFrameTime: number;
  slowestFrame: FrameMetrics | null;
  fastestFrame: FrameMetrics | null;
  framesPerSecond: number;
  encoderUtilization: number;
  peakQueueSize: number;
}

/**
 * Performance monitor for tracking export metrics
 * Similar to Remotion's --log=verbose output
 */
export class PerformanceMonitor {
  private frameMetrics: FrameMetrics[] = [];
  private startTime = 0;
  private peakQueueSize = 0;
  private totalEncoderOutput = 0;

  start(): void {
    this.frameMetrics = [];
    this.startTime = performance.now();
    this.peakQueueSize = 0;
    this.totalEncoderOutput = 0;
  }

  recordFrame(metrics: FrameMetrics): void {
    this.frameMetrics.push(metrics);
    if (metrics.queueSize > this.peakQueueSize) {
      this.peakQueueSize = metrics.queueSize;
    }
  }

  recordEncoderOutput(): void {
    this.totalEncoderOutput++;
  }

  updateQueueSize(size: number): void {
    if (size > this.peakQueueSize) {
      this.peakQueueSize = size;
    }
  }

  getMetrics(): ExportMetrics {
    const totalDuration = performance.now() - this.startTime;
    const totalFrames = this.frameMetrics.length;

    if (totalFrames === 0) {
      return {
        totalFrames: 0,
        totalDuration,
        averageFrameTime: 0,
        slowestFrame: null,
        fastestFrame: null,
        framesPerSecond: 0,
        encoderUtilization: 0,
        peakQueueSize: this.peakQueueSize,
      };
    }

    const averageFrameTime = this.frameMetrics.reduce((sum, m) => sum + m.totalTime, 0) / totalFrames;
    
    let slowestFrame = this.frameMetrics[0];
    let fastestFrame = this.frameMetrics[0];

    for (const metric of this.frameMetrics) {
      if (metric.totalTime > slowestFrame.totalTime) {
        slowestFrame = metric;
      }
      if (metric.totalTime < fastestFrame.totalTime) {
        fastestFrame = metric;
      }
    }

    const framesPerSecond = totalFrames / (totalDuration / 1000);
    const encoderUtilization = this.totalEncoderOutput / totalFrames;

    return {
      totalFrames,
      totalDuration,
      averageFrameTime,
      slowestFrame,
      fastestFrame,
      framesPerSecond,
      encoderUtilization,
      peakQueueSize: this.peakQueueSize,
    };
  }

  /**
   * Log performance summary (similar to Remotion's verbose output)
   */
  logSummary(): void {
    const metrics = this.getMetrics();
    
    console.log('\n=== Export Performance Summary ===');
    console.log(`Total frames: ${metrics.totalFrames}`);
    console.log(`Total duration: ${(metrics.totalDuration / 1000).toFixed(2)}s`);
    console.log(`Average frame time: ${metrics.averageFrameTime.toFixed(2)}ms`);
    console.log(`Frames per second: ${metrics.framesPerSecond.toFixed(2)}`);
    console.log(`Peak queue size: ${metrics.peakQueueSize}`);
    console.log(`Encoder utilization: ${(metrics.encoderUtilization * 100).toFixed(1)}%`);
    
    if (metrics.slowestFrame) {
      console.log(`Slowest frame: #${metrics.slowestFrame.frameIndex} (${metrics.slowestFrame.totalTime.toFixed(2)}ms)`);
    }
    if (metrics.fastestFrame) {
      console.log(`Fastest frame: #${metrics.fastestFrame.frameIndex} (${metrics.fastestFrame.totalTime.toFixed(2)}ms)`);
    }
    console.log('==================================\n');
  }

  reset(): void {
    this.frameMetrics = [];
    this.startTime = 0;
    this.peakQueueSize = 0;
    this.totalEncoderOutput = 0;
  }
}

/**
 * Utility to estimate optimal concurrency/queue size
 * Similar to Remotion's benchmark command
 */
export function estimateOptimalConcurrency(
  resolution: { width: number; height: number },
  hardwareConcurrency: number = navigator.hardwareConcurrency || 4
): { queueSize: number; recommendation: string } {
  const pixels = resolution.width * resolution.height;
  const megapixels = pixels / 1_000_000;
  
  // Base calculation on resolution and available cores
  let queueSize: number;
  let recommendation: string;

  if (megapixels > 8) {
    // 4K or higher
    queueSize = Math.max(30, Math.floor(hardwareConcurrency * 8));
    recommendation = 'High resolution detected. Using smaller queue to avoid memory pressure.';
  } else if (megapixels > 2) {
    // 1080p to 4K
    queueSize = Math.max(60, Math.floor(hardwareConcurrency * 15));
    recommendation = 'Standard resolution. Using balanced queue size.';
  } else {
    // Below 1080p
    queueSize = Math.max(120, Math.floor(hardwareConcurrency * 30));
    recommendation = 'Lower resolution detected. Using larger queue for better throughput.';
  }

  return { queueSize, recommendation };
}
