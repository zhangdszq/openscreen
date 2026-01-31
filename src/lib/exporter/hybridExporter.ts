/**
 * Hybrid Video Exporter
 * Combines WebGPU rendering with segment-based parallel processing
 * for maximum performance on long, high-resolution videos
 * 
 * Architecture:
 * - Main thread: Coordinates segments, manages video decoding
 * - Worker threads: Each worker has its own WebGPU context for rendering
 * - Parallel encoding: Multiple segments encode simultaneously
 */

import type { ExportConfig, ExportProgress, ExportResult } from './types';
import { VideoFileDecoder } from './videoDecoder';
import { VideoMuxer } from './muxer';
import { AudioExtractor } from './audioExtractor';
import { isWebGPUAvailable } from './webgpu/webgpuRenderer';
import { FrameRenderer } from './frameRenderer';
import type { ZoomRegion, CropRegion, TrimRegion, AnnotationRegion, CameraOverlay } from '@/components/video-editor/types';

interface HybridExporterConfig extends ExportConfig {
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
  cropRegion: CropRegion;
  annotationRegions?: AnnotationRegion[];
  previewWidth?: number;
  previewHeight?: number;
  cameraOverlay?: CameraOverlay;
  onProgress?: (progress: ExportProgress) => void;
  // Hybrid options
  segmentCount?: number;
  maxConcurrency?: number;
  useWebGPU?: boolean;
}

interface ChunkWithMeta {
  chunk: EncodedVideoChunk;
  meta?: EncodedVideoChunkMetadata;
}

interface Segment {
  id: number;
  startFrame: number;
  endFrame: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  chunks: ChunkWithMeta[];
}

/**
 * Calculate optimal configuration for hybrid export
 */
export function calculateHybridConfig(
  durationSeconds: number,
  width: number,
  height: number,
  hardwareConcurrency: number = navigator.hardwareConcurrency || 4
): { segmentCount: number; maxConcurrency: number; useWebGPU: boolean } {
  const megapixels = (width * height) / 1_000_000;
  
  // Determine if WebGPU should be used (beneficial for high resolution)
  const useWebGPU = megapixels > 1;
  
  // Calculate segment count based on duration
  // Target ~3-5 seconds per segment for optimal parallelism
  const targetSegmentDuration = useWebGPU ? 3 : 5;
  let segmentCount = Math.ceil(durationSeconds / targetSegmentDuration);
  
  // Limit by hardware
  const maxSegments = Math.min(hardwareConcurrency, 8);
  segmentCount = Math.min(Math.max(2, segmentCount), maxSegments);
  
  // Concurrency limited by memory for high resolution
  let maxConcurrency: number;
  if (megapixels > 8) {
    maxConcurrency = Math.min(2, hardwareConcurrency - 1);
  } else if (megapixels > 4) {
    maxConcurrency = Math.min(3, Math.floor(hardwareConcurrency * 0.5));
  } else {
    maxConcurrency = Math.min(4, Math.floor(hardwareConcurrency * 0.75));
  }
  
  return { segmentCount, maxConcurrency, useWebGPU };
}

/**
 * Hybrid Exporter - WebGPU + Parallel Segments
 */
export class HybridVideoExporter {
  private config: HybridExporterConfig;
  private segments: Segment[] = [];
  private cancelled = false;
  private muxer: VideoMuxer | null = null;
  private audioExtractor: AudioExtractor | null = null;
  private webgpuAvailable = false;

  constructor(config: HybridExporterConfig) {
    this.config = config;
  }

  /**
   * Get effective duration excluding trim regions
   */
  private getEffectiveDuration(totalDuration: number): number {
    const trimRegions = this.config.trimRegions || [];
    return totalDuration - trimRegions.reduce((sum, r) => sum + (r.endMs - r.startMs) / 1000, 0);
  }

  /**
   * Map effective time to source time
   */
  private mapEffectiveToSourceTime(effectiveTimeMs: number): number {
    const trimRegions = this.config.trimRegions || [];
    const sortedTrims = [...trimRegions].sort((a, b) => a.startMs - b.startMs);
    let sourceTimeMs = effectiveTimeMs;

    for (const trim of sortedTrims) {
      if (sourceTimeMs < trim.startMs) break;
      sourceTimeMs += trim.endMs - trim.startMs;
    }
    return sourceTimeMs;
  }

  /**
   * Create segments for parallel processing
   */
  private createSegments(totalFrames: number): void {
    const segmentCount = this.config.segmentCount || 4;
    const framesPerSegment = Math.ceil(totalFrames / segmentCount);

    this.segments = [];
    for (let i = 0; i < segmentCount; i++) {
      const startFrame = i * framesPerSegment;
      const endFrame = Math.min((i + 1) * framesPerSegment, totalFrames);
      if (startFrame >= totalFrames) break;

      this.segments.push({
        id: i,
        startFrame,
        endFrame,
        status: 'pending',
        progress: 0,
        chunks: [],
      });
    }

    console.log(`[HybridExporter] Created ${this.segments.length} segments, WebGPU: ${this.webgpuAvailable}`);
  }

  /**
   * Process a segment with dedicated resources
   */
  private async processSegment(
    segment: Segment,
    videoInfo: { width: number; height: number; duration: number }
  ): Promise<void> {
    segment.status = 'processing';

    // Create dedicated decoder for this segment
    const decoder = new VideoFileDecoder();
    await decoder.loadVideo(this.config.videoUrl);
    const videoElement = decoder.getVideoElement();

    if (!videoElement) {
      segment.status = 'failed';
      decoder.destroy();
      return;
    }

    // Create camera decoder if camera overlay is enabled
    let cameraDecoder: VideoFileDecoder | null = null;
    let cameraVideoElement: HTMLVideoElement | null = null;
    let cameraCanvas: HTMLCanvasElement | null = null;
    let cameraCtx: CanvasRenderingContext2D | null = null;
    
    // Camera playback state for continuous frame extraction
    let cameraStartTime = 0;
    let cameraFrameIndex = 0;
    
    if (this.config.cameraOverlay?.enabled && this.config.cameraOverlay.videoPath) {
      try {
        cameraDecoder = new VideoFileDecoder();
        const cameraUrl = this.config.cameraOverlay.videoPath.startsWith('file://')
          ? this.config.cameraOverlay.videoPath
          : `file:///${this.config.cameraOverlay.videoPath.replace(/\\/g, '/')}`;
        await cameraDecoder.loadVideo(cameraUrl);
        cameraVideoElement = cameraDecoder.getVideoElement();
        
        // Create camera canvas for compositing
        cameraCanvas = document.createElement('canvas');
        cameraCanvas.width = this.config.width;
        cameraCanvas.height = this.config.height;
        cameraCtx = cameraCanvas.getContext('2d', { alpha: false, desynchronized: true });
        
        // Calculate the start time for this segment's camera frames
        const firstFrameTime = segment.startFrame / this.config.frameRate;
        cameraStartTime = this.mapEffectiveToSourceTime(firstFrameTime * 1000) / 1000;
        
        // Seek camera to segment start time once
        cameraVideoElement.currentTime = cameraStartTime;
        await new Promise<void>(resolve => {
          const onSeeked = () => {
            cameraVideoElement!.removeEventListener('seeked', onSeeked);
            resolve();
          };
          cameraVideoElement!.addEventListener('seeked', onSeeked);
          setTimeout(resolve, 1000);
        });
        
        console.log(`[Segment ${segment.id}] Camera video loaded, start time: ${cameraStartTime.toFixed(2)}s`);
      } catch (error) {
        console.warn(`[Segment ${segment.id}] Failed to load camera video:`, error);
        cameraDecoder?.destroy();
        cameraDecoder = null;
        cameraVideoElement = null;
      }
    }

    // Create dedicated renderer
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

    // Create dedicated encoder with metadata capture
    const chunks: { chunk: EncodedVideoChunk; meta?: EncodedVideoChunkMetadata }[] = [];
    let decoderConfig: VideoDecoderConfig | null = null;
    
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        // Capture decoder config from first chunk
        if (meta?.decoderConfig && !decoderConfig) {
          decoderConfig = meta.decoderConfig;
        }
        chunks.push({ chunk, meta });
      },
      error: (error) => console.error(`[Segment ${segment.id}] Encoder error:`, error),
    });

    encoder.configure({
      codec: this.config.codec || 'avc1.640033',
      width: this.config.width,
      height: this.config.height,
      bitrate: this.config.bitrate,
      framerate: this.config.frameRate,
      latencyMode: 'quality',
      hardwareAcceleration: 'prefer-hardware',
    });

    try {
      const frameDuration = 1_000_000 / this.config.frameRate;
      const timeStep = 1 / this.config.frameRate;
      const segmentFrameCount = segment.endFrame - segment.startFrame;

      // Helper to wait for seek with timeout
      const seekToTime = async (video: HTMLVideoElement, time: number): Promise<void> => {
        return new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            // Small delay to ensure frame is decoded
            setTimeout(resolve, 20);
          };
          video.addEventListener('seeked', onSeeked);
          video.currentTime = time;
          // Timeout fallback
          setTimeout(() => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          }, 2000);
        });
      };

      for (let i = segment.startFrame; i < segment.endFrame && !this.cancelled; i++) {
        const timestamp = i * frameDuration;
        const effectiveTimeMs = i * timeStep * 1000;
        const sourceTimeMs = this.mapEffectiveToSourceTime(effectiveTimeMs);
        const videoTime = sourceTimeMs / 1000;

        // Seek if needed
        const needsSeek = i === segment.startFrame || Math.abs(videoElement.currentTime - videoTime) > 0.05;

        if (needsSeek) {
          await seekToTime(videoElement, videoTime);
        }

        // Create and render frame
        try {
          const videoFrame = new VideoFrame(videoElement, { timestamp });
          await renderer.renderFrame(videoFrame, sourceTimeMs * 1000);
          videoFrame.close();
        } catch (frameError) {
          console.warn(`[Segment ${segment.id}] Frame ${i} error, retrying...`, frameError);
          // Retry after a short delay
          await new Promise(r => setTimeout(r, 100));
          await seekToTime(videoElement, videoTime);
          const videoFrame = new VideoFrame(videoElement, { timestamp });
          await renderer.renderFrame(videoFrame, sourceTimeMs * 1000);
          videoFrame.close();
        }

        // Get rendered canvas
        const canvas = renderer.getCanvas();
        
        // Composite camera overlay if enabled
        let finalCanvas: HTMLCanvasElement = canvas;
        if (cameraVideoElement && cameraCtx && cameraCanvas && this.config.cameraOverlay) {
          const overlay = this.config.cameraOverlay;
          
          // Use sequential frame extraction for smooth playback
          // Calculate target time for this frame relative to segment start
          const targetCameraTime = cameraStartTime + (cameraFrameIndex / this.config.frameRate);
          
          // Only seek if we've drifted too far (> 0.5s), otherwise rely on sequential playback
          const currentCameraTime = cameraVideoElement.currentTime;
          const drift = Math.abs(currentCameraTime - targetCameraTime);
          
          if (drift > 0.5) {
            // Large drift - need to seek
            cameraVideoElement.currentTime = targetCameraTime;
            await new Promise<void>(resolve => {
              cameraVideoElement!.addEventListener('seeked', () => resolve(), { once: true });
              setTimeout(resolve, 300);
            });
          } else if (drift > 0.1 && cameraFrameIndex > 0) {
            // Small drift - adjust playback rate temporarily or small seek
            cameraVideoElement.currentTime = targetCameraTime;
            // Don't wait for seeked event for small adjustments
            await new Promise(r => setTimeout(r, 16));
          }
          
          cameraFrameIndex++;
          
          // Calculate camera overlay dimensions and position
          const pipWidth = (overlay.size / 100) * this.config.width;
          const pipHeight = overlay.shape === 'circle' ? pipWidth : pipWidth * 0.75;
          const pipX = overlay.position.x * this.config.width - pipWidth / 2;
          const pipY = overlay.position.y * this.config.height - pipHeight / 2;
          
          // Clear camera canvas and copy main frame
          cameraCtx.clearRect(0, 0, this.config.width, this.config.height);
          cameraCtx.drawImage(canvas, 0, 0);
          
          // Draw camera overlay
          cameraCtx.save();
          cameraCtx.globalAlpha = overlay.opacity;
          
          // Create clipping path for shape
          cameraCtx.beginPath();
          if (overlay.shape === 'circle') {
            cameraCtx.arc(pipX + pipWidth / 2, pipY + pipHeight / 2, pipWidth / 2, 0, Math.PI * 2);
          } else {
            const radius = 12;
            cameraCtx.roundRect(pipX, pipY, pipWidth, pipHeight, radius);
          }
          cameraCtx.clip();
          
          // Draw camera video (mirrored) with cover behavior
          cameraCtx.translate(pipX + pipWidth, pipY);
          cameraCtx.scale(-1, 1);
          
          const srcWidth = cameraVideoElement.videoWidth;
          const srcHeight = cameraVideoElement.videoHeight;
          const srcAspect = srcWidth / srcHeight;
          const dstAspect = pipWidth / pipHeight;
          
          let sx = 0, sy = 0, sw = srcWidth, sh = srcHeight;
          if (srcAspect > dstAspect) {
            sw = srcHeight * dstAspect;
            sx = (srcWidth - sw) / 2;
          } else {
            sh = srcWidth / dstAspect;
            sy = (srcHeight - sh) / 2;
          }
          
          cameraCtx.drawImage(cameraVideoElement, sx, sy, sw, sh, 0, 0, pipWidth, pipHeight);
          cameraCtx.restore();
          
          // Draw border
          if (overlay.borderStyle === 'white') {
            cameraCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            cameraCtx.lineWidth = 3;
            cameraCtx.beginPath();
            if (overlay.shape === 'circle') {
              cameraCtx.arc(pipX + pipWidth / 2, pipY + pipHeight / 2, pipWidth / 2, 0, Math.PI * 2);
            } else {
              cameraCtx.roundRect(pipX, pipY, pipWidth, pipHeight, 12);
            }
            cameraCtx.stroke();
          }
          
          finalCanvas = cameraCanvas;
        }

        // Encode
        const exportFrame = new VideoFrame(finalCanvas, { timestamp, duration: frameDuration });
        
        // First frame of segment is keyframe
        const isKeyFrame = i === segment.startFrame || (i - segment.startFrame) % 90 === 0;
        encoder.encode(exportFrame, { keyFrame: isKeyFrame });
        exportFrame.close();

        // Update progress
        segment.progress = ((i - segment.startFrame + 1) / segmentFrameCount) * 100;
        this.updateProgress();
      }

      console.log(`[Segment ${segment.id}] Flushing encoder, current chunks: ${chunks.length}`);
      await encoder.flush();
      console.log(`[Segment ${segment.id}] After flush, chunks: ${chunks.length}`);
      segment.chunks = chunks;
      segment.status = 'completed';
      console.log(`[Segment ${segment.id}] Completed with ${chunks.length} chunks`);
    } catch (error) {
      console.error(`[Segment ${segment.id}] Processing error:`, error);
      segment.status = 'failed';
    } finally {
      encoder.close();
      renderer.destroy();
      decoder.destroy();
      cameraDecoder?.destroy();
    }
  }

  /**
   * Update overall progress
   */
  private updateProgress(): void {
    if (!this.config.onProgress) return;

    const totalFrames = this.segments.reduce((sum, s) => sum + (s.endFrame - s.startFrame), 0);
    const completedFrames = this.segments.reduce((sum, s) => {
      return sum + Math.floor((s.progress / 100) * (s.endFrame - s.startFrame));
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

      // Check WebGPU availability
      this.webgpuAvailable = this.config.useWebGPU !== false && await isWebGPUAvailable();

      // Load video info
      const tempDecoder = new VideoFileDecoder();
      const videoInfo = await tempDecoder.loadVideo(this.config.videoUrl);
      tempDecoder.destroy();

      // Calculate frames
      const effectiveDuration = this.getEffectiveDuration(videoInfo.duration);
      const totalFrames = Math.ceil(effectiveDuration * this.config.frameRate);

      // Auto-configure if not specified
      if (!this.config.segmentCount || !this.config.maxConcurrency) {
        const autoConfig = calculateHybridConfig(
          effectiveDuration,
          this.config.width,
          this.config.height
        );
        this.config.segmentCount = this.config.segmentCount || autoConfig.segmentCount;
        this.config.maxConcurrency = this.config.maxConcurrency || autoConfig.maxConcurrency;
      }

      console.log(`[HybridExporter] Duration: ${effectiveDuration.toFixed(2)}s, Frames: ${totalFrames}`);
      console.log(`[HybridExporter] Segments: ${this.config.segmentCount}, Concurrency: ${this.config.maxConcurrency}`);

      // Create segments
      this.createSegments(totalFrames);

      // Start audio extraction in parallel
      this.audioExtractor = new AudioExtractor({
        videoUrl: this.config.videoUrl,
        trimRegions: this.config.trimRegions,
      });
      const audioPromise = this.audioExtractor.extract().catch(error => {
        console.warn('[HybridExporter] Audio extraction failed:', error);
        return { audioBuffer: null as AudioBuffer | null, hasAudio: false };
      });

      // Process segments with controlled concurrency
      const maxConcurrency = this.config.maxConcurrency || 2;
      let nextSegmentIndex = 0;

      const processNext = async (): Promise<void> => {
        while (nextSegmentIndex < this.segments.length && !this.cancelled) {
          const segmentIndex = nextSegmentIndex++;
          const segment = this.segments[segmentIndex];
          await this.processSegment(segment, videoInfo);
        }
      };

      // Start concurrent processors
      const processors: Promise<void>[] = [];
      for (let i = 0; i < Math.min(maxConcurrency, this.segments.length); i++) {
        processors.push(processNext());
      }
      await Promise.all(processors);

      if (this.cancelled) {
        return { success: false, error: 'Export cancelled' };
      }

      // Check for failed segments
      const failedSegments = this.segments.filter(s => s.status === 'failed');
      if (failedSegments.length > 0) {
        return { success: false, error: `${failedSegments.length} segments failed to process` };
      }

      // Wait for audio
      const audioResult = await audioPromise;
      const hasAudio = audioResult.hasAudio;

      // Initialize muxer
      this.muxer = new VideoMuxer(this.config, hasAudio);
      await this.muxer.initialize();

      // Add video chunks in order with proper metadata
      let isFirstChunk = true;
      let totalChunks = 0;
      
      // Count total chunks first
      for (const segment of this.segments) {
        console.log(`[HybridExporter] Segment ${segment.id}: ${segment.chunks.length} chunks, status: ${segment.status}`);
        totalChunks += segment.chunks.length;
      }
      console.log(`[HybridExporter] Total video chunks to mux: ${totalChunks}`);
      
      if (totalChunks === 0) {
        return { success: false, error: 'No video chunks were encoded' };
      }
      
      for (const segment of this.segments) {
        for (const { chunk, meta } of segment.chunks) {
          // First chunk needs decoder config metadata
          if (isFirstChunk && meta?.decoderConfig) {
            await this.muxer.addVideoChunk(chunk, meta);
            isFirstChunk = false;
          } else {
            await this.muxer.addVideoChunk(chunk, meta);
          }
        }
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

      console.log('[HybridExporter] Export completed successfully');
      return { success: true, blob };
    } catch (error) {
      console.error('[HybridExporter] Export error:', error);
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
   * Cleanup
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
 * Check if hybrid export is beneficial for given parameters
 */
export function shouldUseHybridExport(
  durationSeconds: number,
  width: number,
  height: number
): boolean {
  const megapixels = (width * height) / 1_000_000;
  
  // Hybrid is best for:
  // - Long videos (>15s) at any resolution
  // - Medium videos (>8s) at high resolution (>2MP)
  // - Short videos (>5s) at very high resolution (>4MP)
  
  if (megapixels > 4) return durationSeconds > 5;
  if (megapixels > 2) return durationSeconds > 8;
  return durationSeconds > 15;
}
