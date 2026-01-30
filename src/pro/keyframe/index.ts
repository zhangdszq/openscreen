/**
 * Keyframe Module Entry Point
 * 
 * Exports all keyframe-related functionality for the Pro feature.
 */

// Types
export type {
  KeyframeExtractionOptions,
  KeyframeExtractionResult,
  BatchExtractionResult,
} from './types';
export { DEFAULT_EXTRACTION_OPTIONS } from './types';

// Extractor functions
export {
  extractFrameAtTime,
  extractKeyframesFromClicks,
  extractKeyframesAtTimes,
  drawMouseMarker,
  keyframeToBlob,
  getKeyframeFileExtension,
} from './keyframeExtractor';

// Store
export { useKeyframeStore, getKeyframeById, getConnectionById } from './keyframeStore';

// Components
export { KeyframePanel } from './KeyframePanel';

// Re-export types from main types file
export type {
  KeyframeCapture,
  KeyframeCaptureSource,
  KeyframeMetadata,
  FlowGraph,
  FlowConnection,
} from '@/components/video-editor/types';

export { createEmptyFlowGraph } from '@/components/video-editor/types';
