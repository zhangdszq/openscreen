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
export type CameraOverlayPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'custom';

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
  /** Size as percentage of video width (5-50%) */
  size: number;
  /** Shape of the camera overlay */
  shape: CameraOverlayShape;
  /** Opacity (0-1) */
  opacity: number;
  /** Border style */
  borderStyle: 'none' | 'white' | 'shadow';
}

/**
 * Default camera overlay settings
 */
export const DEFAULT_CAMERA_OVERLAY: CameraOverlay = {
  enabled: false,
  videoPath: '',
  position: { x: 0.95, y: 0.95 }, // Bottom-right by default
  size: 15, // 15% of video width
  shape: 'circle',
  opacity: 1,
  borderStyle: 'shadow',
};
