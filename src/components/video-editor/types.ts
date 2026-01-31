export type ZoomDepth = 1 | 2 | 3 | 4 | 5 | 6;

export interface ZoomFocus {
  cx: number; // normalized horizontal center (0-1)
  cy: number; // normalized vertical center (0-1)
}

export interface ZoomRegion {
  id: string;
  startMs: number;
  endMs: number;
  depth: ZoomDepth;
  focus: ZoomFocus;
}

export interface TrimRegion {
  id: string;
  startMs: number;
  endMs: number;
}

export type AnnotationType = 'text' | 'image' | 'figure';

export type ArrowDirection = 'up' | 'down' | 'left' | 'right' | 'up-right' | 'up-left' | 'down-right' | 'down-left';

export interface FigureData {
  arrowDirection: ArrowDirection;
  color: string;
  strokeWidth: number;
}

export interface AnnotationPosition {
  x: number;
  y: number;
}

export interface AnnotationSize {
  width: number;
  height: number;
}

export interface AnnotationTextStyle {
  color: string;
  backgroundColor: string;
  fontSize: number; // pixels
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline';
  textAlign: 'left' | 'center' | 'right';
}

export interface AnnotationRegion {
  id: string;
  startMs: number;
  endMs: number;
  type: AnnotationType;
  content: string; // Legacy - still used for current type
  textContent?: string; // Separate storage for text
  imageContent?: string; // Separate storage for image data URL
  position: AnnotationPosition;
  size: AnnotationSize;
  style: AnnotationTextStyle;
  zIndex: number;
  figureData?: FigureData;
}

export const DEFAULT_ANNOTATION_POSITION: AnnotationPosition = {
  x: 50,
  y: 50,
};

export const DEFAULT_ANNOTATION_SIZE: AnnotationSize = {
  width: 30,
  height: 20,
};

export const DEFAULT_ANNOTATION_STYLE: AnnotationTextStyle = {
  color: '#ffffff',
  backgroundColor: 'transparent',
  fontSize: 32,
  fontFamily: 'Inter',
  fontWeight: 'bold',
  fontStyle: 'normal',
  textDecoration: 'none',
  textAlign: 'center',
};

export const DEFAULT_FIGURE_DATA: FigureData = {
  arrowDirection: 'right',
  color: '#34B27B',
  strokeWidth: 4,
};



export interface CropRegion {
  x: number; 
  y: number; 
  width: number; 
  height: number; 
}

export const DEFAULT_CROP_REGION: CropRegion = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

export const ZOOM_DEPTH_SCALES: Record<ZoomDepth, number> = {
  1: 1.25,
  2: 1.5,
  3: 1.8,
  4: 2.2,
  5: 3.5,
  6: 5.0,
};

export const DEFAULT_ZOOM_DEPTH: ZoomDepth = 3;

export function clampFocusToDepth(focus: ZoomFocus, _depth: ZoomDepth): ZoomFocus {
  return {
    cx: clamp(focus.cx, 0, 1),
    cy: clamp(focus.cy, 0, 1),
  };
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

// Mouse tracking types for auto-zoom feature
export type MouseButtonType = 'left' | 'right' | 'middle';

export interface RecordedMouseEvent {
  id: string;
  timestampMs: number;  // relative to recording start
  x: number;            // normalized coordinate 0-1
  y: number;            // normalized coordinate 0-1
  type: 'click' | 'move';
  button?: MouseButtonType;
}

export interface MouseTrackData {
  events: RecordedMouseEvent[];
  screenBounds: { width: number; height: number };
}

export const DEFAULT_CLICK_ZOOM_DURATION_MS = 2000; // total duration of zoom for a click
export const DEFAULT_CLICK_ZOOM_LEAD_MS = 300;      // start zoom this many ms before click

// ============================================================================
// Keyframe Capture Types (Pro Feature)
// ============================================================================

/**
 * Source of keyframe capture
 */
export type KeyframeCaptureSource = 'click' | 'manual' | 'auto' | 'mcp';

/**
 * Metadata associated with a keyframe
 */
export interface KeyframeMetadata {
  /** Page URL (available in MCP browser mode) */
  pageUrl?: string;
  /** Page title (available in MCP browser mode) */
  pageTitle?: string;
  /** Description of the clicked element */
  elementInfo?: string;
  /** Custom user notes */
  notes?: string;
}

/**
 * A captured keyframe from the video
 */
export interface KeyframeCapture {
  /** Unique identifier */
  id: string;
  /** Timestamp in milliseconds relative to video start */
  timestampMs: number;
  /** How this keyframe was captured */
  source: KeyframeCaptureSource;
  /** Exported image file path (if saved to disk) */
  imagePath?: string;
  /** Base64 encoded image data (for in-memory use) */
  imageData?: string;
  /** Image dimensions */
  imageDimensions?: { width: number; height: number };
  /** Mouse position at capture time (normalized 0-1) */
  mousePosition?: { x: number; y: number };
  /** Additional metadata */
  metadata?: KeyframeMetadata;
  /** User-defined label for this keyframe */
  label?: string;
  /** Position in flow graph canvas */
  flowPosition?: { x: number; y: number };
  /** Sticky note size (width, height) */
  stickySize?: { width: number; height: number };
  /** Creation timestamp */
  createdAt: number;
}

/**
 * A region/area in the flow graph (rectangle for grouping)
 */
export interface FlowRegion {
  /** Unique identifier */
  id: string;
  /** Region label */
  label?: string;
  /** Position on canvas */
  position: { x: number; y: number };
  /** Size of the region */
  size: { width: number; height: number };
  /** Background color */
  color?: string;
  /** Border style */
  borderStyle?: 'solid' | 'dashed';
  /** Creation timestamp */
  createdAt: number;
}

/**
 * Connection endpoint type
 */
export type FlowEndpointType = 'keyframe' | 'region';

/**
 * A group of items in the flow graph that can be moved together
 */
export interface FlowGroup {
  /** Unique identifier */
  id: string;
  /** Group name/label */
  label?: string;
  /** IDs of keyframes in this group */
  keyframeIds: string[];
  /** IDs of regions in this group */
  regionIds: string[];
  /** Creation timestamp */
  createdAt: number;
}

/**
 * Connection between nodes (keyframes or regions) in a flow graph
 */
export interface FlowConnection {
  /** Unique identifier */
  id: string;
  /** Source node ID */
  from: string;
  /** Source node type */
  fromType?: FlowEndpointType;
  /** Target node ID */
  to: string;
  /** Target node type */
  toType?: FlowEndpointType;
  /** Optional label for the connection */
  label?: string;
  /** Connection line style */
  style?: {
    color?: string;
    strokeWidth?: number;
    dashed?: boolean;
  };
}

/**
 * Flow graph containing keyframes, regions and their connections
 */
export interface FlowGraph {
  /** Graph identifier */
  id: string;
  /** Graph name */
  name: string;
  /** All keyframes in the graph */
  keyframes: KeyframeCapture[];
  /** All regions in the graph */
  regions?: FlowRegion[];
  /** Groups of items */
  groups?: FlowGroup[];
  /** Connections between keyframes/regions */
  connections: FlowConnection[];
  /** Graph metadata */
  metadata?: {
    /** Associated video path */
    videoPath?: string;
    /** Project name */
    projectName?: string;
    /** Description */
    description?: string;
    /** Creation timestamp */
    createdAt: number;
    /** Last modified timestamp */
    updatedAt: number;
  };
  /** Canvas viewport state */
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
}

/**
 * Default values for keyframe capture
 */
export const DEFAULT_KEYFRAME_LABEL = '关键帧';

/**
 * Default flow graph viewport
 */
export const DEFAULT_FLOW_VIEWPORT = {
  x: 0,
  y: 0,
  zoom: 1,
};

/**
 * Create a new empty flow graph
 */
export function createEmptyFlowGraph(name: string = '未命名流程图'): FlowGraph {
  const now = Date.now();
  return {
    id: `flow-${now}`,
    name,
    keyframes: [],
    connections: [],
    metadata: {
      createdAt: now,
      updatedAt: now,
    },
    viewport: { ...DEFAULT_FLOW_VIEWPORT },
  };
}

// ============================================================================
// Camera Overlay (Picture-in-Picture) Types
// ============================================================================

export type CameraOverlayShape = 'circle' | 'rectangle';
export type CameraOverlayPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'custom';
export type CameraBackgroundMode = 'original' | 'remove' | 'blur' | 'custom';

/**
 * Layout mode for camera and screen arrangement
 * - pip-*: Picture-in-picture mode (camera as small overlay)
 * - split-*: Split screen mode (camera and screen side by side)
 */
export type CameraLayoutMode = 
  | 'pip-top-left' 
  | 'pip-top-center' 
  | 'pip-top-right' 
  | 'pip-bottom-left' 
  | 'pip-bottom-center' 
  | 'pip-bottom-right'
  | 'split-left'      // Camera on left, screen on right
  | 'split-right'     // Screen on left, camera on right
  | 'split-top'       // Camera on top, screen on bottom
  | 'split-bottom';   // Screen on top, camera on bottom

/**
 * Layout configuration for each mode
 */
export interface CameraLayoutConfig {
  mode: CameraLayoutMode;
  label: string;
  /** For PiP modes: position of camera overlay */
  pipPosition?: { x: number; y: number };
  /** For split modes: ratio of camera area (0-1) */
  splitRatio?: number;
  /** Whether this is a split mode */
  isSplit: boolean;
}

/**
 * All available layout configurations
 */
export const CAMERA_LAYOUT_CONFIGS: CameraLayoutConfig[] = [
  // PiP modes (first row in UI)
  { mode: 'pip-top-left', label: '左上', pipPosition: { x: 0.08, y: 0.12 }, isSplit: false },
  { mode: 'pip-top-center', label: '上中', pipPosition: { x: 0.5, y: 0.12 }, isSplit: false },
  { mode: 'pip-top-right', label: '右上', pipPosition: { x: 0.92, y: 0.12 }, isSplit: false },
  // PiP modes (second row in UI)
  { mode: 'pip-bottom-left', label: '左下', pipPosition: { x: 0.08, y: 0.88 }, isSplit: false },
  { mode: 'pip-bottom-center', label: '下中', pipPosition: { x: 0.5, y: 0.88 }, isSplit: false },
  { mode: 'pip-bottom-right', label: '右下', pipPosition: { x: 0.92, y: 0.88 }, isSplit: false },
  // Split modes
  { mode: 'split-left', label: '左分屏', splitRatio: 0.3, isSplit: true },
  { mode: 'split-right', label: '右分屏', splitRatio: 0.3, isSplit: true },
  { mode: 'split-top', label: '上分屏', splitRatio: 0.25, isSplit: true },
  { mode: 'split-bottom', label: '下分屏', splitRatio: 0.25, isSplit: true },
];

/**
 * Get layout config by mode
 */
export function getLayoutConfig(mode: CameraLayoutMode): CameraLayoutConfig {
  return CAMERA_LAYOUT_CONFIGS.find(c => c.mode === mode) || CAMERA_LAYOUT_CONFIGS[5]; // default to pip-bottom-right
}

/**
 * Preset position configurations for camera overlay (legacy, for backward compatibility)
 */
export const CAMERA_POSITION_PRESETS: Record<Exclude<CameraOverlayPosition, 'custom'>, { x: number; y: number }> = {
  'top-left': { x: 0.08, y: 0.12 },
  'top-center': { x: 0.5, y: 0.12 },
  'top-right': { x: 0.92, y: 0.12 },
  'bottom-left': { x: 0.08, y: 0.88 },
  'bottom-center': { x: 0.5, y: 0.88 },
  'bottom-right': { x: 0.92, y: 0.88 },
};

/**
 * Camera overlay settings for picture-in-picture effect
 */
export interface CameraOverlay {
  /** Whether camera overlay is enabled */
  enabled: boolean;
  /** Path to camera video file */
  videoPath: string;
  /** Position (normalized 0-1, relative to video dimensions) */
  position: { x: number; y: number };
  /** Preset position name (legacy) */
  positionPreset: CameraOverlayPosition;
  /** Layout mode - controls how camera and screen are arranged */
  layoutMode: CameraLayoutMode;
  /** Size as percentage of video width (5-50%) for PiP modes */
  size: number;
  /** Split ratio (0-1) for split modes */
  splitRatio: number;
  /** Camera scale (0.3-1) for split modes - independent camera size */
  cameraScale: number;
  /** Screen scale (0.3-1) for split modes - independent screen recording size */
  screenScale: number;
  /** Camera offset in split modes (normalized -1 to 1, 0 = center) */
  cameraOffset: { x: number; y: number };
  /** Screen offset in split modes (normalized -1 to 1, 0 = center) */
  screenOffset: { x: number; y: number };
  /** Shape of the camera overlay */
  shape: CameraOverlayShape;
  /** Opacity (0-1) */
  opacity: number;
  /** Border style */
  borderStyle: 'none' | 'white' | 'shadow';
  /** Border radius in pixels (for rectangle shape) */
  borderRadius: number;
  /** Whether to mirror/flip horizontally */
  mirror: boolean;
  /** Background removal mode */
  backgroundMode: CameraBackgroundMode;
  /** Custom background color (when backgroundMode is 'custom') */
  customBackgroundColor?: string;
}

/**
 * Default camera overlay settings
 */
export const DEFAULT_CAMERA_OVERLAY: CameraOverlay = {
  enabled: false,
  videoPath: '',
  position: { x: 0.92, y: 0.88 }, // Bottom-right by default
  positionPreset: 'bottom-right',
  layoutMode: 'pip-bottom-right',
  size: 15, // 15% of video width
  splitRatio: 0.3, // 30% for split modes
  cameraScale: 0.9, // 90% camera size in split modes
  screenScale: 0.9, // 90% screen size in split modes
  cameraOffset: { x: 0, y: 0 }, // center by default
  screenOffset: { x: 0, y: 0 }, // center by default
  shape: 'circle',
  opacity: 1,
  borderStyle: 'shadow',
  borderRadius: 8,
  mirror: false,
  backgroundMode: 'original',
};
