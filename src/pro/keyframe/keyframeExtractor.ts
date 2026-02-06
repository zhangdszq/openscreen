/**
 * Keyframe Extractor
 * 
 * Extracts frames from video at specified timestamps, typically at mouse click events.
 * This is a Pro feature for competitive analysis workflows.
 * 
 * Supports two extraction modes:
 * 1. Preview-based: Captures from the PixiJS preview canvas (exact match with what user sees)
 * 2. Raw video: Direct extraction from video element (fallback when preview unavailable)
 */

import { v4 as uuidv4 } from 'uuid';
import type { Application } from 'pixi.js';
import type { KeyframeCapture, MouseTrackData } from '@/components/video-editor/types';
import type { 
  KeyframeExtractionOptions, 
  KeyframeExtractionResult, 
  BatchExtractionResult 
} from './types';
import { DEFAULT_EXTRACTION_OPTIONS } from './types';
import { getAssetPath } from '@/lib/assetPath';

// ---- Seek helper ----

async function seekVideoToTime(video: HTMLVideoElement, timestampMs: number): Promise<void> {
  video.currentTime = timestampMs / 1000;
  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      reject(new Error('Video seek failed'));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
  });
}

// ---- Wallpaper drawing helpers ----

async function resolveWallpaperUrl(wallpaper: string): Promise<string> {
  if (wallpaper.startsWith('#') || wallpaper.startsWith('linear-gradient') || wallpaper.startsWith('radial-gradient')) {
    return wallpaper;
  }
  if (wallpaper.startsWith('data:') || wallpaper.startsWith('file://') || wallpaper.startsWith('http')) {
    return wallpaper;
  }
  if (wallpaper.startsWith('/')) {
    return await getAssetPath(wallpaper.replace(/^\//, ''));
  }
  return await getAssetPath(wallpaper);
}

async function drawWallpaperOnCanvas(
  ctx: CanvasRenderingContext2D,
  wallpaper: string,
  width: number,
  height: number,
): Promise<void> {
  const resolved = await resolveWallpaperUrl(wallpaper);

  if (resolved.startsWith('#')) {
    ctx.fillStyle = resolved;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  if (resolved.startsWith('linear-gradient') || resolved.startsWith('radial-gradient')) {
    const gradientMatch = resolved.match(/(linear|radial)-gradient\((.+)\)/);
    if (gradientMatch) {
      const [, type, params] = gradientMatch;
      const parts = params.split(',').map(s => s.trim());
      let gradient: CanvasGradient;
      if (type === 'linear') {
        gradient = ctx.createLinearGradient(0, 0, 0, height);
      } else {
        gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) / 2);
      }
      parts.forEach((part, index) => {
        if (part.startsWith('to ') || part.includes('deg')) return;
        const colorMatch = part.match(/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|[a-z]+)/);
        if (colorMatch) {
          gradient.addColorStop(index / Math.max(parts.length - 1, 1), colorMatch[1]);
        }
      });
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
    }
    return;
  }

  // Image wallpaper
  try {
    const img = new Image();
    if (resolved.startsWith('http') && !resolved.startsWith(window.location.origin)) {
      img.crossOrigin = 'anonymous';
    }
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load wallpaper'));
      img.src = resolved;
    });
    // Cover: scale to fill, center
    const imgAR = img.width / img.height;
    const canvasAR = width / height;
    let drawW: number, drawH: number, drawX: number, drawY: number;
    if (imgAR > canvasAR) {
      drawH = height;
      drawW = drawH * imgAR;
      drawX = (width - drawW) / 2;
      drawY = 0;
    } else {
      drawW = width;
      drawH = drawW / imgAR;
      drawX = 0;
      drawY = (height - drawH) / 2;
    }
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  } catch {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
  }
}

// ---- Preview-based extraction (captures PixiJS canvas — exact match with preview) ----

/**
 * Extract a single frame from the PixiJS preview canvas.
 * This captures exactly what the user sees (crop, padding, border-radius, mask).
 */
export async function extractFrameFromPreview(
  video: HTMLVideoElement,
  app: Application,
  timestampMs: number,
  options: Partial<KeyframeExtractionOptions> = {},
  wallpaper?: string,
): Promise<KeyframeExtractionResult> {
  const opts = { ...DEFAULT_EXTRACTION_OPTIONS, ...options };

  try {
    // Pre-load wallpaper image if needed (async, before synchronous capture)
    let wallpaperReady: ((ctx: CanvasRenderingContext2D, w: number, h: number) => void) | null = null;
    if (wallpaper) {
      const resolved = await resolveWallpaperUrl(wallpaper);
      // Pre-load image wallpaper
      if (!resolved.startsWith('#') && !resolved.startsWith('linear-gradient') && !resolved.startsWith('radial-gradient')) {
        try {
          const img = new Image();
          if (resolved.startsWith('http') && !resolved.startsWith(window.location.origin)) {
            img.crossOrigin = 'anonymous';
          }
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject();
            img.src = resolved;
          });
          wallpaperReady = (ctx, w, h) => {
            const imgAR = img.width / img.height;
            const canvasAR = w / h;
            let drawW: number, drawH: number, drawX: number, drawY: number;
            if (imgAR > canvasAR) {
              drawH = h; drawW = drawH * imgAR; drawX = (w - drawW) / 2; drawY = 0;
            } else {
              drawW = w; drawH = drawW / imgAR; drawX = 0; drawY = (h - drawH) / 2;
            }
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
          };
        } catch {
          wallpaperReady = (ctx, w, h) => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); };
        }
      } else {
        // Color/gradient — can be drawn synchronously
        wallpaperReady = (ctx, w, h) => {
          if (resolved.startsWith('#')) {
            ctx.fillStyle = resolved;
            ctx.fillRect(0, 0, w, h);
          } else {
            // Gradient
            const gradientMatch = resolved.match(/(linear|radial)-gradient\((.+)\)/);
            if (gradientMatch) {
              const [, type, params] = gradientMatch;
              const parts = params.split(',').map(s => s.trim());
              let gradient: CanvasGradient;
              if (type === 'linear') {
                gradient = ctx.createLinearGradient(0, 0, 0, h);
              } else {
                gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
              }
              parts.forEach((part, index) => {
                if (part.startsWith('to ') || part.includes('deg')) return;
                const colorMatch = part.match(/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|[a-z]+)/);
                if (colorMatch) {
                  gradient.addColorStop(index / Math.max(parts.length - 1, 1), colorMatch[1]);
                }
              });
              ctx.fillStyle = gradient;
              ctx.fillRect(0, 0, w, h);
            } else {
              ctx.fillStyle = '#000';
              ctx.fillRect(0, 0, w, h);
            }
          }
        };
      }
    }

    // Seek video to the target time
    await seekVideoToTime(video, timestampMs);

    // Wait one animation frame so PixiJS ticker updates the video texture
    await new Promise(resolve => requestAnimationFrame(resolve));

    // Force PixiJS to render the stage (ensures fresh frame)
    app.renderer.render(app.stage);

    // Get the PixiJS canvas (actual pixel dimensions include devicePixelRatio)
    const pixiCanvas = app.canvas as HTMLCanvasElement;
    const pixiWidth = pixiCanvas.width;
    const pixiHeight = pixiCanvas.height;

    // Calculate output dimensions
    let outputWidth = pixiWidth;
    let outputHeight = pixiHeight;

    if (opts.maxWidth && outputWidth > opts.maxWidth) {
      const ratio = opts.maxWidth / outputWidth;
      outputWidth = opts.maxWidth;
      outputHeight = Math.round(outputHeight * ratio);
    }
    if (opts.maxHeight && outputHeight > opts.maxHeight) {
      const ratio = opts.maxHeight / outputHeight;
      outputHeight = opts.maxHeight;
      outputWidth = Math.round(outputWidth * ratio);
    }

    // Create composite canvas
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { success: false, error: 'Failed to create canvas context' };
    }

    // Draw wallpaper background (sync — already pre-loaded)
    if (wallpaperReady) {
      wallpaperReady(ctx, outputWidth, outputHeight);
    }

    // Draw the PixiJS canvas on top (video with crop/mask/padding/border-radius)
    ctx.drawImage(pixiCanvas, 0, 0, outputWidth, outputHeight);

    // Convert to data URL
    const mimeType = `image/${opts.format}`;
    const quality = opts.format === 'png' ? undefined : opts.quality;
    const imageData = canvas.toDataURL(mimeType, quality);

    const keyframe: KeyframeCapture = {
      id: uuidv4(),
      timestampMs,
      source: 'manual',
      imageData,
      imageDimensions: { width: outputWidth, height: outputHeight },
      createdAt: Date.now(),
    };

    return { success: true, keyframe };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Extract keyframes from mouse click events using the PixiJS preview canvas.
 */
export async function extractKeyframesFromClicksPreview(
  video: HTMLVideoElement,
  app: Application,
  mouseData: MouseTrackData,
  options: Partial<KeyframeExtractionOptions> = {},
  wallpaper?: string,
  onProgress?: (current: number, total: number) => void,
): Promise<BatchExtractionResult> {
  const clickEvents = mouseData.events.filter(e => e.type === 'click');

  const result: BatchExtractionResult = {
    total: clickEvents.length,
    successful: 0,
    failed: 0,
    keyframes: [],
    errors: [],
  };

  for (let i = 0; i < clickEvents.length; i++) {
    const event = clickEvents[i];
    onProgress?.(i + 1, clickEvents.length);

    const extractResult = await extractFrameFromPreview(video, app, event.timestampMs, options, wallpaper);

    if (extractResult.success && extractResult.keyframe) {
      const keyframe: KeyframeCapture = {
        ...extractResult.keyframe,
        source: 'click',
        mousePosition: { x: event.x, y: event.y },
        label: `点击 #${i + 1}`,
      };
      result.keyframes.push(keyframe);
      result.successful++;
    } else {
      result.errors.push({
        timestampMs: event.timestampMs,
        error: extractResult.error || 'Unknown error',
      });
      result.failed++;
    }
  }

  return result;
}

// ---- Raw video extraction (fallback when preview unavailable) ----

/**
 * Extract a single frame from video at specified timestamp (raw, no preview effects).
 */
export async function extractFrameAtTime(
  video: HTMLVideoElement,
  timestampMs: number,
  options: Partial<KeyframeExtractionOptions> = {}
): Promise<KeyframeExtractionResult> {
  const opts = { ...DEFAULT_EXTRACTION_OPTIONS, ...options };
  
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      return { success: false, error: 'Failed to create canvas context' };
    }

    await seekVideoToTime(video, timestampMs);

    let outputWidth = video.videoWidth;
    let outputHeight = video.videoHeight;

    if (opts.maxWidth && outputWidth > opts.maxWidth) {
      const ratio = opts.maxWidth / outputWidth;
      outputWidth = opts.maxWidth;
      outputHeight = Math.round(outputHeight * ratio);
    }

    if (opts.maxHeight && outputHeight > opts.maxHeight) {
      const ratio = opts.maxHeight / outputHeight;
      outputHeight = opts.maxHeight;
      outputWidth = Math.round(outputWidth * ratio);
    }

    canvas.width = outputWidth;
    canvas.height = outputHeight;

    ctx.drawImage(video, 0, 0, outputWidth, outputHeight);

    const mimeType = `image/${opts.format}`;
    const quality = opts.format === 'png' ? undefined : opts.quality;
    const imageData = canvas.toDataURL(mimeType, quality);

    const keyframe: KeyframeCapture = {
      id: uuidv4(),
      timestampMs,
      source: 'manual',
      imageData,
      imageDimensions: { width: outputWidth, height: outputHeight },
      createdAt: Date.now(),
    };

    return { success: true, keyframe };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Extract keyframes from video based on mouse click events (raw, no preview effects).
 */
export async function extractKeyframesFromClicks(
  video: HTMLVideoElement,
  mouseData: MouseTrackData,
  options: Partial<KeyframeExtractionOptions> = {},
  onProgress?: (current: number, total: number) => void
): Promise<BatchExtractionResult> {
  const clickEvents = mouseData.events.filter(e => e.type === 'click');
  
  const result: BatchExtractionResult = {
    total: clickEvents.length,
    successful: 0,
    failed: 0,
    keyframes: [],
    errors: [],
  };

  for (let i = 0; i < clickEvents.length; i++) {
    const event = clickEvents[i];
    onProgress?.(i + 1, clickEvents.length);

    const extractResult = await extractFrameAtTime(video, event.timestampMs, options);
    
    if (extractResult.success && extractResult.keyframe) {
      const keyframe: KeyframeCapture = {
        ...extractResult.keyframe,
        source: 'click',
        mousePosition: { x: event.x, y: event.y },
        label: `点击 #${i + 1}`,
      };
      result.keyframes.push(keyframe);
      result.successful++;
    } else {
      result.errors.push({
        timestampMs: event.timestampMs,
        error: extractResult.error || 'Unknown error',
      });
      result.failed++;
    }
  }

  return result;
}

/**
 * Extract keyframes at specified timestamps
 */
export async function extractKeyframesAtTimes(
  video: HTMLVideoElement,
  timestamps: number[],
  options: Partial<KeyframeExtractionOptions> = {},
  onProgress?: (current: number, total: number) => void
): Promise<BatchExtractionResult> {
  const result: BatchExtractionResult = {
    total: timestamps.length,
    successful: 0,
    failed: 0,
    keyframes: [],
    errors: [],
  };

  for (let i = 0; i < timestamps.length; i++) {
    const timestampMs = timestamps[i];
    onProgress?.(i + 1, timestamps.length);

    const extractResult = await extractFrameAtTime(video, timestampMs, options);
    
    if (extractResult.success && extractResult.keyframe) {
      result.keyframes.push(extractResult.keyframe);
      result.successful++;
    } else {
      result.errors.push({
        timestampMs,
        error: extractResult.error || 'Unknown error',
      });
      result.failed++;
    }
  }

  return result;
}

/**
 * Draw mouse position marker on canvas
 */
export function drawMouseMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  options: { color?: string; size?: number } = {}
): void {
  const { color = '#FF4444', size = 20 } = options;
  
  const pixelX = x * canvasWidth;
  const pixelY = y * canvasHeight;

  // Draw click ripple effect
  ctx.beginPath();
  ctx.arc(pixelX, pixelY, size, 0, Math.PI * 2);
  ctx.fillStyle = `${color}44`;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(pixelX, pixelY, size * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = `${color}88`;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(pixelX, pixelY, size * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * Convert keyframe image data to blob for saving
 */
export function keyframeToBlob(keyframe: KeyframeCapture): Blob | null {
  if (!keyframe.imageData) return null;

  const [header, base64] = keyframe.imageData.split(',');
  const mimeMatch = header.match(/data:([^;]+)/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }

  return new Blob([array], { type: mimeType });
}

/**
 * Get file extension for keyframe format
 */
export function getKeyframeFileExtension(format: KeyframeExtractionOptions['format']): string {
  switch (format) {
    case 'jpeg': return '.jpg';
    case 'webp': return '.webp';
    case 'png':
    default: return '.png';
  }
}
