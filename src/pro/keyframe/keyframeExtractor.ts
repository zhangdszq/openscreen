/**
 * Keyframe Extractor
 * 
 * Extracts frames from video at specified timestamps, typically at mouse click events.
 * This is a Pro feature for competitive analysis workflows.
 */

import { v4 as uuidv4 } from 'uuid';
import type { KeyframeCapture, MouseTrackData } from '@/components/video-editor/types';
import type { 
  KeyframeExtractionOptions, 
  KeyframeExtractionResult, 
  BatchExtractionResult 
} from './types';
import { DEFAULT_EXTRACTION_OPTIONS } from './types';

/**
 * Extract a single frame from video at specified timestamp
 */
export async function extractFrameAtTime(
  video: HTMLVideoElement,
  timestampMs: number,
  options: Partial<KeyframeExtractionOptions> = {}
): Promise<KeyframeExtractionResult> {
  const opts = { ...DEFAULT_EXTRACTION_OPTIONS, ...options };
  
  try {
    // Create canvas for frame extraction
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      return { success: false, error: 'Failed to create canvas context' };
    }

    // Seek to the target time
    video.currentTime = timestampMs / 1000;
    
    // Wait for seek to complete
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

    // Calculate output dimensions
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

    // Draw the video frame
    ctx.drawImage(video, 0, 0, outputWidth, outputHeight);

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
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Extract keyframes from video based on mouse click events
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
      // Enhance keyframe with click event data
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
