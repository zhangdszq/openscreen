/**
 * Keyframe module types
 */

export type {
  KeyframeCapture,
  KeyframeCaptureSource,
  KeyframeMetadata,
} from '@/components/video-editor/types';

/**
 * Options for extracting keyframes from video
 */
export interface KeyframeExtractionOptions {
  /** Output image format */
  format: 'png' | 'jpeg' | 'webp';
  /** Image quality (0-1, for jpeg/webp) */
  quality?: number;
  /** Maximum image width (maintains aspect ratio) */
  maxWidth?: number;
  /** Maximum image height (maintains aspect ratio) */
  maxHeight?: number;
  /** Whether to include mouse position marker in output */
  includeMouseMarker?: boolean;
}

/**
 * Result of keyframe extraction
 */
export interface KeyframeExtractionResult {
  success: boolean;
  keyframe?: import('@/components/video-editor/types').KeyframeCapture;
  error?: string;
}

/**
 * Batch extraction result
 */
export interface BatchExtractionResult {
  total: number;
  successful: number;
  failed: number;
  keyframes: import('@/components/video-editor/types').KeyframeCapture[];
  errors: Array<{ timestampMs: number; error: string }>;
}

/**
 * Default extraction options
 */
export const DEFAULT_EXTRACTION_OPTIONS: KeyframeExtractionOptions = {
  format: 'png',
  quality: 0.92,
  maxWidth: 1920,
  maxHeight: 1080,
  includeMouseMarker: false,
};
