/**
 * Parallel Video Exporter
 * Splits video into segments and processes them in parallel
 * Inspired by Remotion Lambda's distributed rendering approach
 */

import type { ExportConfig, ExportProgress, ExportResult } from './types';
import { VideoFileDecoder } from './videoDecoder';
import { FrameRenderer } from './frameRenderer';
import { VideoMuxer } from './muxer';
import { AudioExtractor } from './audioExtractor';
import type { ZoomRegion, CropRegion, TrimRegion, AnnotationRegion } from '@/components/video-editor/types';

interface ParallelExporterConfig extends ExportConfig {
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
  onProgress?: (progress: ExportProgress) => void;
  // Parallel processing options
  segmentCount?: number; // Number of segments to split into
  maxConcurrency?: number; // Max parallel segments being processed
}

interface VideoSegment {
  id: number;
  startFrame: number;
  endFrame: number;
  startTimeMs: number;
  endTimeMs: number;
  frames: EncodedVideoChunk[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
}

interface SegmentResult {
  segmentId: number;
  chunks: EncodedVideoChunk[];
  success: boolean;
  error?: string;
}

/**
 * Calculate optimal segment count based on video duration and hardware
 */
export function calculateOptimalSegments(
  durationSeconds: number,
  hardwareConcurrency: number = navigator.hardwareConcurrency || 4
): number {
  // Target ~5 seconds per segment for optimal parallelism
  const targetSegmentDuration = 5;
  const segmentsByDuration = Math.ceil(durationSeconds / targetSegmentDuration);
  
  // Limit by available cores (leave some for main thread and encoding)
  const maxSegments = Math.max(2, hardwareConcurrency - 1);
  
  // Balance between parallelism and overhead
  return Math.min(Math.max(2, segmentsByDuration), maxSegments, 8);
}

/**
 * Parallel video exporter using segment-based processing
 */
export class ParallelVideoExporter {
  private config: ParallelExporterConfig;
  private segments: VideoSegment[] = [];
  private cancelled = false;
  private audioExtractor: AudioExtractor | null = null;
  private muxer: VideoMuxer | null = null;

  constructor(config: ParallelExporterConfig) {
    this.config = config;
  }

  /**
   * Calculate effective duration excluding trim regions
   */
  private getEffectiveDuration(totalDuration: number): number {
    const trimRegions = this.config.trimRegions || [];
    const totalTrimDuration = trimRegions.reduce((sum, region) => {
      return sum + (region.endMs - region.startMs) / 1000;
    }, 0);
    return totalDuration - totalTrimDuration;
  }

  /**
   * Map effective time to source time (accounting for trim regions)
   */
  private mapEffectiveToSourceTime(effectiveTimeMs: number): number {
    const trimRegions = this.config.trimRegions || [];
    const sortedTrims = [...trimRegions].sort((a, b) => a.startMs - b.startMs);

    let sourceTimeMs = effectiveTimeMs;

    for (const trim of sortedTrims) {
      if (sourceTimeMs < trim.startMs) {
        break;
      }
      const trimDuration = trim.endMs - trim.startMs;
      sourceTimeMs += trimDuration;
    }

    return sourceTimeMs;
  }

  /**
   * Split video into segments for parallel processing
   */
  private createSegments(totalFrames: number, effectiveDurationMs: number): void {
    const segmentCount = this.config.segmentCount || 
      calculateOptimalSegments(effectiveDurationMs / 1000);
    
    const framesPerSegment = Math.ceil(totalFrames / segmentCount);
    const msPerFrame = effectiveDurationMs / totalFrames;

    this.segments = [];

    for (let i = 0; i < segmentCount; i++) {
      const startFrame = i * framesPerSegment;
      const endFrame = Math.min((i + 1) * framesPerSegment, totalFrames);
      
      if (startFrame >= totalFrames) break;

      this.segments.push({
        id: i,
        startFrame,
        endFrame,
        startTimeMs: startFrame * msPerFrame,
        endTimeMs: endFrame * msPerFrame,
        frames: [],
        status: 'pending',
        progress: 0,
      });
    }

    console.log(`[ParallelExporter] Created ${this.segments.length} segments for ${totalFrames} frames`);
  }

  /**
   * Process a single segment
   */
  private async processSegment(
    segment: VideoSegment,
    videoElement: HTMLVideoElement,
    renderer: FrameRenderer,
    encoder: VideoEncoder
  ): Promise<SegmentResult> {
    segment.status = 'processing';
    const chunks: EncodedVideoChunk[] = [];
    
    try {
      const frameDuration = 1_000_000 / this.config.frameRate;
      const timeStep = 1 / this.config.frameRate;

      for (let frameIndex = segment.startFrame; frameIndex < segment.endFrame && !this.cancelled; frameIndex++) {
        const i = frameIndex;
        const timestamp = i * frameDuration;

        // Map to source time
        const effectiveTimeMs = (i * timeStep) * 1000;
        const sourceTimeMs = this.mapEffectiveToSourceTime(effectiveTimeMs);
        const videoTime = sourceTimeMs / 1000;

        // Seek to correct time
        if (Math.abs(videoElement.currentTime - videoTime) > 0.001) {
          videoElement.currentTime = videoTime;
          await new Promise<void>(resolve => {
            if ('requestVideoFrameCallback' in videoElement) {
              (videoElement as any).requestVideoFrameCallback(() => resolve());
            } else {
              videoElement.addEventListener('seeked', () => resolve(), { once: true });
            }
          });
        }

        // Create and render frame
        const videoFrame = new VideoFrame(videoElement, { timestamp });
        const sourceTimestamp = sourceTimeMs * 1000;
        await renderer.renderFrame(videoFrame, sourceTimestamp);
        videoFrame.close();

        // Encode frame
        const canvas = renderer.getCanvas();
        const exportFrame = new VideoFrame(canvas, {
          timestamp,
          duration: frameDuration,
        });

        encoder.encode(exportFrame, { keyFrame: (i - segment.startFrame) % 90 === 0 });
        exportFrame.close();

        // Update segment progress
        const segmentFrames = segment.endFrame - segment.startFrame;
        segment.progress = ((frameIndex - segment.startFrame + 1) / segmentFrames) * 100;
      }

      segment.status = 'completed';
      return { segmentId: segment.id, chunks, success: true };
    } catch (error) {
      segment.status = 'failed';
      return {
        segmentId: segment.id,
        chunks: [],
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Process segments with controlled concurrency
   */
  private async processSegmentsParallel(
    videoInfo: { width: number; height: number; duration: number },
    totalFrames: number
  ): Promise<EncodedVideoChunk[]> {
    const maxConcurrency = this.config.maxConcurrency || 
      Math.min(this.segments.length, Math.max(2, navigator.hardwareConcurrency - 2));

    console.log(`[ParallelExporter] Processing ${this.segments.length} segments with concurrency ${maxConcurrency}`);

    const allChunks: Map<number, EncodedVideoChunk[]> = new Map();
    let activeSegments = 0;
    let nextSegmentIndex = 0;

    // Create shared resources for each concurrent slot
    const slots: Array<{
      decoder: VideoFileDecoder;
      renderer: FrameRenderer;
      encoder: VideoEncoder;
      chunks: EncodedVideoChunk[];
    }> = [];

    // Initialize slots
    for (let i = 0; i < maxConcurrency; i++) {
      const decoder = new VideoFileDecoder();
      await decoder.loadVideo(this.config.videoUrl);

      const renderer = new FrameRenderer({
        width: this.config.width,
        height: this.config.height,
        wallpaper: this.config.wallpaper,
        zoomRegions: this.config.zoomRegions,
        showShadow: this.config.showShadow,
        shadowIntensity: this.config.shadowIntensity,
        showBlur: this.config.showBlur,
        motionBlurEnabled: this.config.motionBlurEnabled,
        borderRadius: this.config.borderRadius,
        padding: this.config.padding,
        cropRegion: this.config.cropRegion,
        videoWidth: videoInfo.width,
        videoHeight: videoInfo.height,
        annotationRegions: this.config.annotationRegions,
        previewWidth: this.config.previewWidth,
        previewHeight: this.config.previewHeight,
      });
      await renderer.initialize();

      const chunks: EncodedVideoChunk[] = [];
      
      const encoder = new VideoEncoder({
        output: (chunk) => {
          chunks.push(chunk);
        },
        error: (error) => {
          console.error('[ParallelExporter] Encoder error:', error);
        },
      });

      encoder.configure({
        codec: this.config.codec || 'avc1.640033',
        width: this.config.width,
        height: this.config.height,
        bitrate: this.config.bitrate,
        framerate: this.config.frameRate,
        latencyMode: 'realtime',
        hardwareAcceleration: 'prefer-hardware',
      });

      slots.push({ decoder, renderer, encoder, chunks });
    }

    // Process segments using available slots
    const processWithSlot = async (slotIndex: number): Promise<void> => {
      while (nextSegmentIndex < this.segments.length && !this.cancelled) {
        const segmentIndex = nextSegmentIndex++;
        const segment = this.segments[segmentIndex];
        const slot = slots[slotIndex];

        slot.chunks = []; // Reset chunks for this segment
        
        const videoElement = slot.decoder.getVideoElement();
        if (!videoElement) continue;

        await this.processSegment(segment, videoElement, slot.renderer, slot.encoder);
        
        // Flush encoder for this segment
        await slot.encoder.flush();
        
        // Store chunks for this segment
        allChunks.set(segment.id, [...slot.chunks]);

        // Update overall progress
        this.updateProgress(totalFrames);
      }
    };

    // Start processing with all slots
    const slotPromises = slots.map((_, index) => processWithSlot(index));
    await Promise.all(slotPromises);

    // Cleanup slots
    for (const slot of slots) {
      slot.encoder.close();
      slot.renderer.destroy();
      slot.decoder.destroy();
    }

    // Combine chunks in order
    const orderedChunks: EncodedVideoChunk[] = [];
    for (let i = 0; i < this.segments.length; i++) {
      const segmentChunks = allChunks.get(i) || [];
      orderedChunks.push(...segmentChunks);
    }

    return orderedChunks;
  }

  /**
   * Update overall progress based on segment progress
   */
  private updateProgress(totalFrames: number): void {
    if (!this.config.onProgress) return;

    const completedFrames = this.segments.reduce((sum, segment) => {
      const segmentFrames = segment.endFrame - segment.startFrame;
      return sum + Math.floor((segment.progress / 100) * segmentFrames);
    }, 0);

    this.config.onProgress({
      currentFrame: completedFrames,
      totalFrames,
      percentage: (completedFrames / totalFrames) * 100,
      estimatedTimeRemaining: 0,
    });
  }

  /**
   * Main export function
   */
  async export(): Promise<ExportResult> {
    try {
      this.cancelled = false;

      // Load video info
      const tempDecoder = new VideoFileDecoder();
      const videoInfo = await tempDecoder.loadVideo(this.config.videoUrl);
      tempDecoder.destroy();

      // Calculate frames and segments
      const effectiveDuration = this.getEffectiveDuration(videoInfo.duration);
      const totalFrames = Math.ceil(effectiveDuration * this.config.frameRate);

      console.log(`[ParallelExporter] Effective duration: ${effectiveDuration}s, Total frames: ${totalFrames}`);

      // Create segments
      this.createSegments(totalFrames, effectiveDuration * 1000);

      // Start audio extraction in parallel
      this.audioExtractor = new AudioExtractor({
        videoUrl: this.config.videoUrl,
        trimRegions: this.config.trimRegions,
      });
      const audioPromise = this.audioExtractor.extract().catch(error => {
        console.warn('[ParallelExporter] Audio extraction failed:', error);
        return { audioBuffer: null as AudioBuffer | null, hasAudio: false };
      });

      // Process segments in parallel
      const videoChunks = await this.processSegmentsParallel(videoInfo, totalFrames);

      if (this.cancelled) {
        return { success: false, error: 'Export cancelled' };
      }

      // Wait for audio
      const audioResult = await audioPromise;
      const hasAudio = audioResult.hasAudio;

      // Initialize muxer
      this.muxer = new VideoMuxer(this.config, hasAudio);
      await this.muxer.initialize();

      // Add video chunks to muxer
      for (const chunk of videoChunks) {
        await this.muxer.addVideoChunk(chunk, undefined);
      }

      // Add audio if available
      if (hasAudio && audioResult.audioBuffer && this.audioExtractor) {
        await this.audioExtractor.encodeToAAC(
          audioResult.audioBuffer,
          async (chunk, meta) => {
            if (this.muxer && !this.cancelled) {
              await this.muxer.addAudioChunk(chunk, meta);
            }
          }
        );
      }

      // Finalize
      const blob = await this.muxer.finalize();

      return { success: true, blob };
    } catch (error) {
      console.error('[ParallelExporter] Export error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.cleanup();
    }
  }

  /**
   * Cancel export
   */
  cancel(): void {
    this.cancelled = true;
    this.cleanup();
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.audioExtractor) {
      this.audioExtractor.destroy();
      this.audioExtractor = null;
    }
    this.muxer = null;
    this.segments = [];
  }
}

/**
 * Check if parallel export is beneficial
 * Returns true if video is long enough to benefit from parallelization
 */
export function shouldUseParallelExport(
  durationSeconds: number,
  width: number,
  height: number
): boolean {
  // Parallel export is beneficial for videos > 10 seconds
  // and resolutions that aren't too high (to avoid memory pressure)
  const pixels = width * height;
  const megapixels = pixels / 1_000_000;

  if (megapixels > 4) {
    // For 4K+, only use parallel for very long videos
    return durationSeconds > 30;
  } else if (megapixels > 2) {
    // For 1080p-4K
    return durationSeconds > 15;
  } else {
    // For lower resolutions
    return durationSeconds > 10;
  }
}
