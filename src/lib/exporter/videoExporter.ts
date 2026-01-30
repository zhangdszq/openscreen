import type { ExportConfig, ExportProgress, ExportResult } from './types';
import { VideoFileDecoder } from './videoDecoder';
import { FrameRenderer } from './frameRenderer';
import { VideoMuxer } from './muxer';
import { AudioExtractor } from './audioExtractor';
import type { ZoomRegion, CropRegion, TrimRegion, AnnotationRegion, CameraOverlay } from '@/components/video-editor/types';

interface VideoExporterConfig extends ExportConfig {
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

export class VideoExporter {
  private config: VideoExporterConfig;
  private decoder: VideoFileDecoder | null = null;
  private cameraDecoder: VideoFileDecoder | null = null;
  private renderer: FrameRenderer | null = null;
  private encoder: VideoEncoder | null = null;
  private muxer: VideoMuxer | null = null;
  private audioExtractor: AudioExtractor | null = null;
  private cancelled = false;
  private encodeQueue = 0;
  // Increased queue size for better throughput with hardware encoding
  private readonly MAX_ENCODE_QUEUE = 120;
  private videoDescription: Uint8Array | undefined;
  private videoColorSpace: VideoColorSpaceInit | undefined;
  // Track muxing promises for parallel processing
  private muxingPromises: Promise<void>[] = [];
  private chunkCount = 0;
  private hasAudio = false;
  // Camera overlay canvas for compositing
  private cameraCanvas: HTMLCanvasElement | null = null;
  private cameraCtx: CanvasRenderingContext2D | null = null;

  constructor(config: VideoExporterConfig) {
    this.config = config;
  }

  // Calculate the total duration excluding trim regions (in seconds)
  private getEffectiveDuration(totalDuration: number): number {
    const trimRegions = this.config.trimRegions || [];
    const totalTrimDuration = trimRegions.reduce((sum, region) => {
      return sum + (region.endMs - region.startMs) / 1000;
    }, 0);
    return totalDuration - totalTrimDuration;
  }

  private mapEffectiveToSourceTime(effectiveTimeMs: number): number {
    const trimRegions = this.config.trimRegions || [];
    // Sort trim regions by start time
    const sortedTrims = [...trimRegions].sort((a, b) => a.startMs - b.startMs);

    let sourceTimeMs = effectiveTimeMs;

    for (const trim of sortedTrims) {
      // If the source time hasn't reached this trim region yet, we're done
      if (sourceTimeMs < trim.startMs) {
        break;
      }

      // Add the duration of this trim region to the source time
      const trimDuration = trim.endMs - trim.startMs;
      sourceTimeMs += trimDuration;
    }

    return sourceTimeMs;
  }

  async export(): Promise<ExportResult> {
    try {
      this.cleanup();
      this.cancelled = false;

      // Initialize decoder and load video
      this.decoder = new VideoFileDecoder();
      const videoInfo = await this.decoder.loadVideo(this.config.videoUrl);

      // Initialize frame renderer
      this.renderer = new FrameRenderer({
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
      await this.renderer.initialize();

      // Initialize camera decoder if camera overlay is enabled
      let cameraVideoElement: HTMLVideoElement | null = null;
      if (this.config.cameraOverlay?.enabled && this.config.cameraOverlay.videoPath) {
        try {
          this.cameraDecoder = new VideoFileDecoder();
          const cameraUrl = this.config.cameraOverlay.videoPath.startsWith('file://')
            ? this.config.cameraOverlay.videoPath
            : `file:///${this.config.cameraOverlay.videoPath.replace(/\\/g, '/')}`;
          await this.cameraDecoder.loadVideo(cameraUrl);
          cameraVideoElement = this.cameraDecoder.getVideoElement();
          
          // Create camera canvas for compositing - use smaller size for better performance
          this.cameraCanvas = document.createElement('canvas');
          this.cameraCanvas.width = this.config.width;
          this.cameraCanvas.height = this.config.height;
          this.cameraCtx = this.cameraCanvas.getContext('2d', { 
            alpha: false,
            desynchronized: true // Improves performance
          });
          
          // Pre-seek camera video to start
          cameraVideoElement.currentTime = 0;
          
          console.log('[VideoExporter] Camera video loaded for compositing');
        } catch (error) {
          console.warn('[VideoExporter] Failed to load camera video:', error);
          this.cameraDecoder = null;
        }
      }

      // Start audio extraction in parallel (don't await yet)
      this.audioExtractor = new AudioExtractor({
        videoUrl: this.config.videoUrl,
        trimRegions: this.config.trimRegions,
      });
      const audioExtractionPromise = this.audioExtractor.extract().catch(error => {
        console.warn('[VideoExporter] Audio extraction failed:', error);
        return { audioBuffer: null as AudioBuffer | null, hasAudio: false };
      });

      // Initialize video encoder (parallel with audio extraction)
      await this.initializeEncoder();

      // Wait for audio extraction to complete
      const extractedAudio = await audioExtractionPromise;
      this.hasAudio = extractedAudio.hasAudio;
      console.log('[VideoExporter] Audio extraction:', this.hasAudio ? 'success' : 'no audio');

      // Initialize muxer with audio support
      this.muxer = new VideoMuxer(this.config, this.hasAudio);
      await this.muxer.initialize();

      // Start audio encoding in background (parallel with video encoding)
      let audioEncodingPromise: Promise<void> = Promise.resolve();
      if (this.hasAudio && extractedAudio.audioBuffer && this.audioExtractor) {
        console.log('[VideoExporter] Starting audio encoding in parallel...');
        audioEncodingPromise = this.audioExtractor.encodeToAAC(
          extractedAudio.audioBuffer,
          async (chunk, meta) => {
            if (this.muxer && !this.cancelled) {
              await this.muxer.addAudioChunk(chunk, meta);
            }
          }
        ).catch(error => {
          console.warn('[VideoExporter] Audio encoding failed:', error);
        });
      }

      // Get the video element for frame extraction
      const videoElement = this.decoder.getVideoElement();
      if (!videoElement) {
        throw new Error('Video element not available');
      }

      // Calculate effective duration and frame count (excluding trim regions)
      const effectiveDuration = this.getEffectiveDuration(videoInfo.duration);
      const totalFrames = Math.ceil(effectiveDuration * this.config.frameRate);
      
      console.log('[VideoExporter] Original duration:', videoInfo.duration, 's');
      console.log('[VideoExporter] Effective duration:', effectiveDuration, 's');
      console.log('[VideoExporter] Total frames to export:', totalFrames);

      // Process frames continuously without batching delays
      const frameDuration = 1_000_000 / this.config.frameRate; // in microseconds
      let frameIndex = 0;
      const timeStep = 1 / this.config.frameRate;

      while (frameIndex < totalFrames && !this.cancelled) {
        const i = frameIndex;
        const timestamp = i * frameDuration;

        // Map effective time to source time (accounting for trim regions)
        const effectiveTimeMs = (i * timeStep) * 1000;
        const sourceTimeMs = this.mapEffectiveToSourceTime(effectiveTimeMs);
        const videoTime = sourceTimeMs / 1000;
          
        // Seek to the correct time and wait for frame to be ready
        const needsSeek = Math.abs(videoElement.currentTime - videoTime) > 0.001;

        if (needsSeek) {
          videoElement.currentTime = videoTime;
          // Wait for the frame to be ready using requestVideoFrameCallback
          await new Promise<void>(resolve => {
            if ('requestVideoFrameCallback' in videoElement) {
              (videoElement as any).requestVideoFrameCallback(() => resolve());
            } else {
              // Fallback for browsers without requestVideoFrameCallback
              videoElement.addEventListener('seeked', () => resolve(), { once: true });
            }
          });
        } else if (i === 0) {
          // First frame - wait for it to be ready
          await new Promise<void>(resolve => {
            if ('requestVideoFrameCallback' in videoElement) {
              (videoElement as any).requestVideoFrameCallback(() => resolve());
            } else {
              setTimeout(resolve, 16);
            }
          });
        }

        // Create a VideoFrame from the video element (on GPU!)
        const videoFrame = new VideoFrame(videoElement, {
          timestamp,
        });

        // Render the frame with all effects using source timestamp
        const sourceTimestamp = sourceTimeMs * 1000; // Convert to microseconds
        await this.renderer!.renderFrame(videoFrame, sourceTimestamp);
        
        videoFrame.close();

        const canvas = this.renderer!.getCanvas();

        // Composite camera overlay if enabled
        if (cameraVideoElement && this.cameraCtx && this.cameraCanvas && this.config.cameraOverlay) {
          const overlay = this.config.cameraOverlay;
          
          // Sync camera video to main video time
          const camTimeDiff = Math.abs(cameraVideoElement.currentTime - videoTime);
          if (camTimeDiff > 0.05) {
            cameraVideoElement.currentTime = videoTime;
            // Wait for camera frame using requestVideoFrameCallback
            await new Promise<void>(resolve => {
              if ('requestVideoFrameCallback' in cameraVideoElement) {
                (cameraVideoElement as any).requestVideoFrameCallback(() => resolve());
              } else {
                cameraVideoElement.addEventListener('seeked', () => resolve(), { once: true });
              }
            });
          }
          
          // Calculate camera overlay dimensions and position
          const pipWidth = (overlay.size / 100) * this.config.width;
          const pipHeight = overlay.shape === 'circle' ? pipWidth : pipWidth * 0.75;
          const pipX = overlay.position.x * this.config.width - pipWidth / 2;
          const pipY = overlay.position.y * this.config.height - pipHeight / 2;
          
          // Clear camera canvas and copy main frame
          this.cameraCtx.clearRect(0, 0, this.config.width, this.config.height);
          this.cameraCtx.drawImage(canvas, 0, 0);
          
          // Draw camera overlay
          this.cameraCtx.save();
          this.cameraCtx.globalAlpha = overlay.opacity;
          
          // Create clipping path for shape
          this.cameraCtx.beginPath();
          if (overlay.shape === 'circle') {
            this.cameraCtx.arc(
              pipX + pipWidth / 2,
              pipY + pipHeight / 2,
              pipWidth / 2,
              0,
              Math.PI * 2
            );
          } else {
            // Rounded rectangle
            const radius = 12;
            this.cameraCtx.roundRect(pipX, pipY, pipWidth, pipHeight, radius);
          }
          this.cameraCtx.clip();
          
          // Draw camera video (mirrored) with object-fit: cover behavior
          this.cameraCtx.translate(pipX + pipWidth, pipY);
          this.cameraCtx.scale(-1, 1);
          
          // Calculate source crop to maintain aspect ratio (cover behavior)
          const srcWidth = cameraVideoElement.videoWidth;
          const srcHeight = cameraVideoElement.videoHeight;
          const srcAspect = srcWidth / srcHeight;
          const dstAspect = pipWidth / pipHeight;
          
          let sx = 0, sy = 0, sw = srcWidth, sh = srcHeight;
          
          if (srcAspect > dstAspect) {
            // Source is wider - crop sides
            sw = srcHeight * dstAspect;
            sx = (srcWidth - sw) / 2;
          } else {
            // Source is taller - crop top/bottom
            sh = srcWidth / dstAspect;
            sy = (srcHeight - sh) / 2;
          }
          
          this.cameraCtx.drawImage(cameraVideoElement, sx, sy, sw, sh, 0, 0, pipWidth, pipHeight);
          
          this.cameraCtx.restore();
          
          // Draw border based on style
          if (overlay.borderStyle === 'white') {
            this.cameraCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            this.cameraCtx.lineWidth = 3;
            this.cameraCtx.beginPath();
            if (overlay.shape === 'circle') {
              this.cameraCtx.arc(pipX + pipWidth / 2, pipY + pipHeight / 2, pipWidth / 2, 0, Math.PI * 2);
            } else {
              this.cameraCtx.roundRect(pipX, pipY, pipWidth, pipHeight, 12);
            }
            this.cameraCtx.stroke();
          } else if (overlay.borderStyle === 'shadow') {
            // Shadow is complex to render efficiently, skip for now
          }
        }
        
        // Use camera canvas if we have camera overlay, otherwise use renderer canvas
        const finalCanvas = (cameraVideoElement && this.cameraCanvas && this.config.cameraOverlay) 
          ? this.cameraCanvas 
          : canvas;

        // Create VideoFrame from canvas on GPU without reading pixels
        // @ts-ignore - colorSpace not in TypeScript definitions but works at runtime
        const exportFrame = new VideoFrame(finalCanvas, {
          timestamp,
          duration: frameDuration,
          colorSpace: {
            primaries: 'bt709',
            transfer: 'iec61966-2-1',
            matrix: 'rgb',
            fullRange: true,
          },
        });

        // Check encoder queue before encoding to keep it full
        while (this.encodeQueue >= this.MAX_ENCODE_QUEUE && !this.cancelled) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }

        if (this.encoder && this.encoder.state === 'configured') {
          this.encodeQueue++;
          this.encoder.encode(exportFrame, { keyFrame: i % 150 === 0 });
        } else {
          console.warn(`[Frame ${i}] Encoder not ready! State: ${this.encoder?.state}`);
        }

        exportFrame.close();

        frameIndex++;

        // Update progress
        if (this.config.onProgress) {
          this.config.onProgress({
            currentFrame: frameIndex,
            totalFrames,
            percentage: (frameIndex / totalFrames) * 100,
            estimatedTimeRemaining: 0,
          });
        }
      }

      if (this.cancelled) {
        return { success: false, error: 'Export cancelled' };
      }

      // Finalize video encoding
      if (this.encoder && this.encoder.state === 'configured') {
        await this.encoder.flush();
      }

      // Wait for all video muxing operations to complete
      await Promise.all(this.muxingPromises);

      // Wait for audio encoding to complete (was running in parallel)
      if (this.hasAudio) {
        console.log('[VideoExporter] Waiting for audio encoding to complete...');
        await audioEncodingPromise;
        console.log('[VideoExporter] Audio encoding complete');
      }

      // Finalize muxer and get output blob
      const blob = await this.muxer!.finalize();

      return { success: true, blob };
    } catch (error) {
      console.error('Export error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.cleanup();
    }
  }

  private async initializeEncoder(): Promise<void> {
    this.encodeQueue = 0;
    this.muxingPromises = [];
    this.chunkCount = 0;
    let videoDescription: Uint8Array | undefined;

    this.encoder = new VideoEncoder({
      output: (chunk, meta) => {
        // Capture decoder config metadata from encoder output
        if (meta?.decoderConfig?.description && !videoDescription) {
          const desc = meta.decoderConfig.description;
          videoDescription = new Uint8Array(desc instanceof ArrayBuffer ? desc : (desc as any));
          this.videoDescription = videoDescription;
        }
        // Capture colorSpace from encoder metadata if provided
        if (meta?.decoderConfig?.colorSpace && !this.videoColorSpace) {
          this.videoColorSpace = meta.decoderConfig.colorSpace;
        }

        // Stream chunk to muxer immediately (parallel processing)
        const isFirstChunk = this.chunkCount === 0;
        this.chunkCount++;

        const muxingPromise = (async () => {
          try {
            if (isFirstChunk && this.videoDescription) {
              // Add decoder config for the first chunk
              const colorSpace = this.videoColorSpace || {
                primaries: 'bt709',
                transfer: 'iec61966-2-1',
                matrix: 'rgb',
                fullRange: true,
              };

              const metadata: EncodedVideoChunkMetadata = {
                decoderConfig: {
                  codec: this.config.codec || 'avc1.640033',
                  codedWidth: this.config.width,
                  codedHeight: this.config.height,
                  description: this.videoDescription,
                  colorSpace,
                },
              };

              await this.muxer!.addVideoChunk(chunk, metadata);
            } else {
              await this.muxer!.addVideoChunk(chunk, meta);
            }
          } catch (error) {
            console.error('Muxing error:', error);
          }
        })();

        this.muxingPromises.push(muxingPromise);
        this.encodeQueue--;
      },
      error: (error) => {
        console.error('[VideoExporter] Encoder error:', error);
        // Stop export encoding failed
        this.cancelled = true;
      },
    });

    const codec = this.config.codec || 'avc1.640033';
    
    const encoderConfig: VideoEncoderConfig = {
      codec,
      width: this.config.width,
      height: this.config.height,
      bitrate: this.config.bitrate,
      framerate: this.config.frameRate,
      latencyMode: 'realtime',
      bitrateMode: 'variable',
      hardwareAcceleration: 'prefer-hardware',
    };

    // Check hardware support first
    const hardwareSupport = await VideoEncoder.isConfigSupported(encoderConfig);

    if (hardwareSupport.supported) {
      // Use hardware encoding
      console.log('[VideoExporter] Using hardware acceleration');
      this.encoder.configure(encoderConfig);
    } else {
      // Fall back to software encoding
      console.log('[VideoExporter] Hardware not supported, using software encoding');
      encoderConfig.hardwareAcceleration = 'prefer-software';
      
      const softwareSupport = await VideoEncoder.isConfigSupported(encoderConfig);
      if (!softwareSupport.supported) {
        throw new Error('Video encoding not supported on this system');
      }
      
      this.encoder.configure(encoderConfig);
    }
  }

  cancel(): void {
    this.cancelled = true;
    this.cleanup();
  }

  private cleanup(): void {
    if (this.encoder) {
      try {
        if (this.encoder.state === 'configured') {
          this.encoder.close();
        }
      } catch (e) {
        console.warn('Error closing encoder:', e);
      }
      this.encoder = null;
    }

    if (this.decoder) {
      try {
        this.decoder.destroy();
      } catch (e) {
        console.warn('Error destroying decoder:', e);
      }
      this.decoder = null;
    }

    if (this.cameraDecoder) {
      try {
        this.cameraDecoder.destroy();
      } catch (e) {
        console.warn('Error destroying camera decoder:', e);
      }
      this.cameraDecoder = null;
    }

    this.cameraCanvas = null;
    this.cameraCtx = null;

    if (this.renderer) {
      try {
        this.renderer.destroy();
      } catch (e) {
        console.warn('Error destroying renderer:', e);
      }
      this.renderer = null;
    }

    if (this.audioExtractor) {
      try {
        this.audioExtractor.destroy();
      } catch (e) {
        console.warn('Error destroying audio extractor:', e);
      }
      this.audioExtractor = null;
    }

    this.muxer = null;
    this.encodeQueue = 0;
    this.muxingPromises = [];
    this.chunkCount = 0;
    this.videoDescription = undefined;
    this.videoColorSpace = undefined;
    this.hasAudio = false;
  }
}
