
import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import VideoPlayback, { VideoPlaybackRef } from "./VideoPlayback";
import PlaybackControls from "./PlaybackControls";
import TimelineEditor from "./timeline/TimelineEditor";
import { SettingsPanel } from "./SettingsPanel";
import { ExportDialog } from "./ExportDialog";
import { LeftToolbar, type ActivePanel } from "./LeftToolbar";
import { getLayoutConfig } from "./types";

import type { Span } from "dnd-timeline";
import {
  DEFAULT_ZOOM_DEPTH,
  clampFocusToDepth,
  DEFAULT_CROP_REGION,
  DEFAULT_ANNOTATION_POSITION,
  DEFAULT_ANNOTATION_SIZE,
  DEFAULT_ANNOTATION_STYLE,
  DEFAULT_FIGURE_DATA,
  DEFAULT_CLICK_ZOOM_DURATION_MS,
  DEFAULT_CLICK_ZOOM_LEAD_MS,
  DEFAULT_CAMERA_OVERLAY,
  type ZoomDepth,
  type ZoomFocus,
  type ZoomRegion,
  type TrimRegion,
  type AnnotationRegion,
  type CropRegion,
  type FigureData,
  type RecordedMouseEvent,
  type MouseTrackData,
  type CameraOverlay,
} from "./types";
import PictureInPicture from "./PictureInPicture";
import { EditorTitleBar } from "./EditorTitleBar";
import { 
  VideoExporter, 
  GifExporter, 
  ExportManager,
  type ExportProgress, 
  type ExportQuality, 
  type ExportSettings, 
  type ExportFormat, 
  type GifFrameRate, 
  type GifSizePreset, 
  GIF_SIZE_PRESETS, 
  calculateOutputDimensions 
} from "@/lib/exporter";
import { type AspectRatio, getAspectRatioValue } from "@/utils/aspectRatioUtils";
import { getAssetPath } from "@/lib/assetPath";

// Pro Feature imports
import { Feature, isFeatureEnabled } from "@/lib/features";
import { FeatureGate } from "@/components/common/FeatureGate";
import { KeyframePanel, FlowEditor, useKeyframeStore, downloadFigmaPackage } from "@/pro";

const WALLPAPER_COUNT = 18;
const WALLPAPER_PATHS = Array.from({ length: WALLPAPER_COUNT }, (_, i) => `/wallpapers/wallpaper${i + 1}.jpg`);

/**
 * Compute normalized crop region (0-1) from saved region data and actual video dimensions.
 *
 * Prefers recomputing from raw screen coordinates + display bounds (accurate).
 * The key insight: the normalized crop = proportion of the display the region covers.
 * This is independent of the video resolution, avoiding getSettings() inaccuracy issues.
 *
 * Falls back to pre-computed pixel crop divided by video dimensions (legacy).
 */
function computeRegionCrop(
  regionData: any,
  videoWidth: number,
  videoHeight: number,
): CropRegion | null {
  if (!regionData || videoWidth <= 0 || videoHeight <= 0) return null;

  let cropX: number;
  let cropY: number;
  let cropW: number;
  let cropH: number;

  if (regionData.absoluteRegion && regionData.displayBounds) {
    // Accurate path: compute directly from screen coordinates / display bounds.
    // Since the video captures the ENTIRE display (scaled), the proportion of the
    // display that the region covers equals the proportion of the video to crop.
    const abs = regionData.absoluteRegion;
    const db = regionData.displayBounds;
    cropX = (abs.x - db.x) / db.width;
    cropY = (abs.y - db.y) / db.height;
    cropW = abs.width / db.width;
    cropH = abs.height / db.height;
    console.log('Region crop from raw screen data:', {
      absoluteRegion: abs,
      displayBounds: db,
      normalized: { x: cropX, y: cropY, w: cropW, h: cropH },
    });
  } else {
    // Legacy fallback: pre-computed pixel crop divided by video dimensions
    cropX = regionData.x / videoWidth;
    cropY = regionData.y / videoHeight;
    cropW = regionData.width / videoWidth;
    cropH = regionData.height / videoHeight;
    console.log('Region crop from legacy pixel data:', { cropX, cropY, cropW, cropH });
  }

  return {
    x: Math.max(0, Math.min(1, cropX)),
    y: Math.max(0, Math.min(1, cropY)),
    width: Math.max(0.01, Math.min(1 - Math.max(0, cropX), cropW)),
    height: Math.max(0.01, Math.min(1 - Math.max(0, cropY), cropH)),
  };
}

export default function VideoEditor() {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [wallpaper, setWallpaper] = useState<string>(WALLPAPER_PATHS[0]);
  const [shadowIntensity, setShadowIntensity] = useState(0);
  const [showBlur, setShowBlur] = useState(false);
  const [motionBlurEnabled, setMotionBlurEnabled] = useState(false);
  const [borderRadius, setBorderRadius] = useState(0);
  const [padding, setPadding] = useState(50);
  const [cropRegion, setCropRegion] = useState<CropRegion>(DEFAULT_CROP_REGION);
  const [zoomRegions, setZoomRegions] = useState<ZoomRegion[]>([]);
  const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
  const [trimRegions, setTrimRegions] = useState<TrimRegion[]>([]);
  const [selectedTrimId, setSelectedTrimId] = useState<string | null>(null);
  const [annotationRegions, setAnnotationRegions] = useState<AnnotationRegion[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [exportQuality, setExportQuality] = useState<ExportQuality>('good');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('mp4');
  const [gifFrameRate, setGifFrameRate] = useState<GifFrameRate>(15);
  const [gifLoop, setGifLoop] = useState(true);
  const [gifSizePreset, setGifSizePreset] = useState<GifSizePreset>('medium');
  const [mouseClickEvents, setMouseClickEvents] = useState<RecordedMouseEvent[]>([]);
  
  // Camera overlay (picture-in-picture) state
  const [cameraOverlay, setCameraOverlay] = useState<CameraOverlay>(DEFAULT_CAMERA_OVERLAY);
  const [cameraVideoPath, setCameraVideoPath] = useState<string | null>(null);
  
  // Left toolbar panel state
  const [activeToolbarPanel, setActiveToolbarPanel] = useState<ActivePanel>(null);
  
  // Pro feature state
  const [showFlowEditor, setShowFlowEditor] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'settings' | 'keyframes'>('settings');
  const flowGraph = useKeyframeStore(state => state.flowGraph);

  const videoPlaybackRef = useRef<VideoPlaybackRef>(null);
  const splitCameraVideoRef = useRef<HTMLVideoElement>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [splitContainerSize, setSplitContainerSize] = useState({ width: 0, height: 0 });
  const nextZoomIdRef = useRef(1);
  const nextTrimIdRef = useRef(1);
  const nextAnnotationIdRef = useRef(1);
  const nextAnnotationZIndexRef = useRef(1); // Track z-index for stacking order
  const exporterRef = useRef<VideoExporter | ExportManager | null>(null);

  // Sync split-screen camera video play/pause state (avoid ref callback that runs every render)
  useEffect(() => {
    const el = splitCameraVideoRef.current;
    if (!el) return;
    if (isPlaying && el.paused) {
      el.play().catch(() => {});
    } else if (!isPlaying && !el.paused) {
      el.pause();
    }
  }, [isPlaying]);

  // Helper to convert file path to proper file:// URL
  const toFileUrl = (filePath: string): string => {
    // Normalize path separators to forward slashes
    const normalized = filePath.replace(/\\/g, '/');
    
    // Check if it's a Windows absolute path (e.g., C:/Users/...)
    if (normalized.match(/^[a-zA-Z]:/)) {
      const fileUrl = `file:///${normalized}`;
      return fileUrl;
    }
    
    // Unix-style absolute path
    const fileUrl = `file://${normalized}`;
    return fileUrl;
  };

  useEffect(() => {
    async function loadVideo() {
      try {
        const result = await window.electronAPI.getCurrentVideoPath();
        
        if (result.success && result.path) {
          // First, verify the main video file actually exists
          const checkFileExists = window.electronAPI.checkFileExists;
          if (checkFileExists) {
            const mainVideoExists = await checkFileExists(result.path);
            console.log('Main video file exists:', mainVideoExists, result.path);
            if (!mainVideoExists) {
              setError('Video file not found. Please record a new video.');
              setLoading(false);
              return;
            }
          }
          
          const videoUrl = toFileUrl(result.path);
          setVideoPath(videoUrl);
          
          // Try to load mouse events data
          if (window.electronAPI.loadMouseEvents) {
            try {
              const mouseResult = await window.electronAPI.loadMouseEvents(result.path);
              if (mouseResult.success && mouseResult.data) {
                const mouseData = mouseResult.data as MouseTrackData;
                // Filter to only click events
                const clickEvents = mouseData.events.filter(e => e.type === 'click');
                setMouseClickEvents(clickEvents);
                console.log(`Loaded ${clickEvents.length} mouse click events`);
              }
            } catch (mouseErr) {
              console.log('No mouse events data found for this video');
            }
          }
          
          // Try to load region info (for region recordings)
          if (window.electronAPI.loadRegionInfo) {
            try {
              const regionResult = await window.electronAPI.loadRegionInfo(result.path);
              if (regionResult.success && regionResult.data) {
                const region = regionResult.data as { x: number; y: number; width: number; height: number };
                console.log('Loaded region info:', region);
                // We'll apply crop after video loads and we know the dimensions
                // Store it temporarily
                (window as any).__pendingRegionCrop = region;
              }
            } catch (regionErr) {
              console.log('No region info found for this video');
            }
          }
          
          // Try to detect window recording (has .window.json marker)
          if (checkFileExists) {
            try {
              const windowInfoPath = result.path.replace(/\.[^.]+$/, '.window.json');
              const isWindowRecording = await checkFileExists(windowInfoPath);
              if (isWindowRecording) {
                console.log('Detected window recording, setting default borderRadius');
                setBorderRadius(10);
              }
            } catch (err) {
              console.log('Error checking window info:', err);
            }
          }

          // Try to load camera video (recorded separately)
          const cameraPath = result.path.replace('.webm', '.camera.webm');
          console.log('Checking for camera video at:', cameraPath);
          try {
            // Check if camera video file actually exists
            if (!checkFileExists) {
              console.log('checkFileExists API not available - please restart the app');
            } else {
              const cameraExists = await checkFileExists(cameraPath);
              console.log('Camera file exists:', cameraExists);
              if (cameraExists) {
                setCameraVideoPath(cameraPath);
                setCameraOverlay(prev => ({
                  ...prev,
                  enabled: true,
                  videoPath: cameraPath,
                }));
                console.log('Camera video enabled:', cameraPath);
              } else {
                console.log('No camera video found for this recording');
              }
            }
          } catch (cameraErr) {
            console.log('Error checking camera video:', cameraErr);
          }
        } else {
          setError('No video to load. Please record or select a video.');
        }
      } catch (err) {
        setError('Error loading video: ' + String(err));
      } finally {
        setLoading(false);
      }
    }
    loadVideo();
  }, []);

  // Initialize default wallpaper with resolved asset path
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resolvedPath = await getAssetPath('wallpapers/wallpaper1.jpg');
        if (mounted) {
          setWallpaper(resolvedPath);
        }
      } catch (err) {
        // If resolution fails, keep the fallback
        console.warn('Failed to resolve default wallpaper path:', err);
      }
    })();
    return () => { mounted = false };
  }, []);

  function togglePlayPause() {
    const playback = videoPlaybackRef.current;
    const video = playback?.video;
    if (!playback || !video) return;

    if (isPlaying) {
      playback.pause();
    } else {
      playback.play().catch(err => console.error('Video play failed:', err));
    }
  }

  function handleSeek(time: number) {
    const video = videoPlaybackRef.current?.video;
    if (!video) return;
    video.currentTime = time;
  }

  // Stable callback for onDurationChange — avoids re-creating inline functions that break React.memo
  const handleDurationChange = useCallback((dur: number) => {
    setDuration(dur);
    const pendingRegion = (window as any).__pendingRegionCrop;
    if (pendingRegion && videoPlaybackRef.current?.video) {
      const video = videoPlaybackRef.current.video;
      const crop = computeRegionCrop(pendingRegion, video.videoWidth, video.videoHeight);
      if (crop) {
        setCropRegion(crop);
        delete (window as any).__pendingRegionCrop;
      }
    }
  }, []);

  const handleSelectZoom = useCallback((id: string | null) => {
    setSelectedZoomId(id);
    if (id) setSelectedTrimId(null);
  }, []);

  const handleSelectTrim = useCallback((id: string | null) => {
    setSelectedTrimId(id);
    if (id) {
      setSelectedZoomId(null);
      setSelectedAnnotationId(null);
    }
  }, []);

  const handleSelectAnnotation = useCallback((id: string | null) => {
    setSelectedAnnotationId(id);
    if (id) {
      setSelectedZoomId(null);
      setSelectedTrimId(null);
    }
  }, []);

  const handleZoomAdded = useCallback((span: Span) => {
    const id = `zoom-${nextZoomIdRef.current++}`;
    const newRegion: ZoomRegion = {
      id,
      startMs: Math.round(span.start),
      endMs: Math.round(span.end),
      depth: DEFAULT_ZOOM_DEPTH,
      focus: { cx: 0.5, cy: 0.5 },
    };
    setZoomRegions((prev) => [...prev, newRegion]);
    setSelectedZoomId(id);
    setSelectedTrimId(null);
    setSelectedAnnotationId(null);
  }, []);

  const handleTrimAdded = useCallback((span: Span) => {
    const id = `trim-${nextTrimIdRef.current++}`;
    const newRegion: TrimRegion = {
      id,
      startMs: Math.round(span.start),
      endMs: Math.round(span.end),
    };
    setTrimRegions((prev) => [...prev, newRegion]);
    setSelectedTrimId(id);
    setSelectedZoomId(null);
    setSelectedAnnotationId(null);
  }, []);

  const handleZoomSpanChange = useCallback((id: string, span: Span) => {
    setZoomRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? {
              ...region,
              startMs: Math.round(span.start),
              endMs: Math.round(span.end),
            }
          : region,
      ),
    );
  }, []);

  const handleTrimSpanChange = useCallback((id: string, span: Span) => {
    setTrimRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? {
              ...region,
              startMs: Math.round(span.start),
              endMs: Math.round(span.end),
            }
          : region,
      ),
    );
  }, []);

  const handleZoomFocusChange = useCallback((id: string, focus: ZoomFocus) => {
    setZoomRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? {
              ...region,
              focus: clampFocusToDepth(focus, region.depth),
            }
          : region,
      ),
    );
  }, []);

  const handleZoomDepthChange = useCallback((depth: ZoomDepth) => {
    if (!selectedZoomId) return;
    setZoomRegions((prev) =>
      prev.map((region) =>
        region.id === selectedZoomId
          ? {
              ...region,
              depth,
              customScale: undefined, // Reset custom scale when depth preset is chosen
              focus: clampFocusToDepth(region.focus, depth),
            }
          : region,
      ),
    );
  }, [selectedZoomId]);

  const handleZoomScaleChange = useCallback((id: string, scale: number, focus: ZoomFocus) => {
    setZoomRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? {
              ...region,
              customScale: scale,
              focus,
            }
          : region,
      ),
    );
  }, []);

  const handleZoomDelete = useCallback((id: string) => {
    setZoomRegions((prev) => prev.filter((region) => region.id !== id));
    if (selectedZoomId === id) {
      setSelectedZoomId(null);
    }
  }, [selectedZoomId]);

  const handleTrimDelete = useCallback((id: string) => {
    setTrimRegions((prev) => prev.filter((region) => region.id !== id));
    if (selectedTrimId === id) {
      setSelectedTrimId(null);
    }
  }, [selectedTrimId]);

  const handleAnnotationAdded = useCallback((span: Span) => {
    const id = `annotation-${nextAnnotationIdRef.current++}`;
    const zIndex = nextAnnotationZIndexRef.current++; // Assign z-index based on creation order
    const newRegion: AnnotationRegion = {
      id,
      startMs: Math.round(span.start),
      endMs: Math.round(span.end),
      type: 'text',
      content: 'Enter text...',
      position: { ...DEFAULT_ANNOTATION_POSITION },
      size: { ...DEFAULT_ANNOTATION_SIZE },
      style: { ...DEFAULT_ANNOTATION_STYLE },
      zIndex,
    };
    setAnnotationRegions((prev) => [...prev, newRegion]);
    setSelectedAnnotationId(id);
    setSelectedZoomId(null);
    setSelectedTrimId(null);
  }, []);

  const handleAnnotationSpanChange = useCallback((id: string, span: Span) => {
    setAnnotationRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? {
              ...region,
              startMs: Math.round(span.start),
              endMs: Math.round(span.end),
            }
          : region,
      ),
    );
  }, []);

  const handleAnnotationDelete = useCallback((id: string) => {
    setAnnotationRegions((prev) => prev.filter((region) => region.id !== id));
    if (selectedAnnotationId === id) {
      setSelectedAnnotationId(null);
    }
  }, [selectedAnnotationId]);

  const handleAnnotationContentChange = useCallback((id: string, content: string) => {
    setAnnotationRegions((prev) => {
      const updated = prev.map((region) => {
        if (region.id !== id) return region;
        
        // Store content in type-specific fields
        if (region.type === 'text') {
          return { ...region, content, textContent: content };
        } else if (region.type === 'image') {
          return { ...region, content, imageContent: content };
        } else {
          return { ...region, content };
        }
      });
      return updated;
    });
  }, []);

  const handleAnnotationTypeChange = useCallback((id: string, type: AnnotationRegion['type']) => {
    setAnnotationRegions((prev) => {
      const updated = prev.map((region) => {
        if (region.id !== id) return region;
        
        const updatedRegion = { ...region, type };
        
        // Restore content from type-specific storage
        if (type === 'text') {
          updatedRegion.content = region.textContent || 'Enter text...';
        } else if (type === 'image') {
          updatedRegion.content = region.imageContent || '';
        } else if (type === 'figure') {
          updatedRegion.content = '';
          if (!region.figureData) {
            updatedRegion.figureData = { ...DEFAULT_FIGURE_DATA };
          }
        }
        
        return updatedRegion;
      });
      return updated;
    });
  }, []);

  const handleAnnotationStyleChange = useCallback((id: string, style: Partial<AnnotationRegion['style']>) => {
    setAnnotationRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? { ...region, style: { ...region.style, ...style } }
          : region,
      ),
    );
  }, []);

  const handleAnnotationFigureDataChange = useCallback((id: string, figureData: FigureData) => {
    setAnnotationRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? { ...region, figureData }
          : region,
      ),
    );
  }, []);

  const handleAnnotationPositionChange = useCallback((id: string, position: { x: number; y: number }) => {
    setAnnotationRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? { ...region, position }
          : region,
      ),
    );
  }, []);

  const handleAnnotationSizeChange = useCallback((id: string, size: { width: number; height: number }) => {
    setAnnotationRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? { ...region, size }
          : region,
      ),
    );
  }, []);

  // Auto-generate zoom regions from mouse click events
  const handleAutoZoomFromClicks = useCallback(() => {
    if (mouseClickEvents.length === 0) {
      toast.info('No mouse click events available');
      return;
    }

    const durationMs = Math.round(duration * 1000);
    if (durationMs <= 0) {
      toast.error('Video not loaded');
      return;
    }

    // Filter existing zoom regions to check for overlaps
    const existingZooms = [...zoomRegions].sort((a, b) => a.startMs - b.startMs);
    
    let addedCount = 0;
    const newZoomRegions: ZoomRegion[] = [];

    for (const clickEvent of mouseClickEvents) {
      // Calculate zoom region timing
      const zoomStartMs = Math.max(0, clickEvent.timestampMs - DEFAULT_CLICK_ZOOM_LEAD_MS);
      const zoomEndMs = Math.min(durationMs, clickEvent.timestampMs + DEFAULT_CLICK_ZOOM_DURATION_MS - DEFAULT_CLICK_ZOOM_LEAD_MS);

      // Skip if duration is too short
      if (zoomEndMs - zoomStartMs < 100) continue;

      // Check for overlap with existing zoom regions
      const hasOverlap = existingZooms.some(
        (z) => !(zoomEndMs <= z.startMs || zoomStartMs >= z.endMs)
      );

      if (hasOverlap) continue;

      // Check for overlap with newly added zoom regions
      const hasNewOverlap = newZoomRegions.some(
        (z) => !(zoomEndMs <= z.startMs || zoomStartMs >= z.endMs)
      );

      if (hasNewOverlap) continue;

      // Create new zoom region
      const id = `zoom-${nextZoomIdRef.current++}`;
      const newRegion: ZoomRegion = {
        id,
        startMs: Math.round(zoomStartMs),
        endMs: Math.round(zoomEndMs),
        depth: DEFAULT_ZOOM_DEPTH,
        focus: { cx: clickEvent.x, cy: clickEvent.y },
      };

      newZoomRegions.push(newRegion);
      addedCount++;
    }

    if (addedCount > 0) {
      setZoomRegions((prev) => [...prev, ...newZoomRegions]);
      toast.success(`Added ${addedCount} zoom regions from clicks`);
    } else {
      toast.info('No new zoom regions could be added (all positions overlap with existing)');
    }
  }, [mouseClickEvents, duration, zoomRegions]);

  // Camera overlay handlers
  const handleCameraOverlayChange = useCallback((overlay: CameraOverlay) => {
    setCameraOverlay(overlay);
    // 分屏模式时自动将 padding 设为 0
    if (overlay.layoutMode.startsWith('split-')) {
      setPadding(0);
    }
  }, []);

  // Pro feature handlers
  const handleOpenFlowEditor = useCallback(() => {
    setShowFlowEditor(true);
  }, []);

  const handleCloseFlowEditor = useCallback(() => {
    setShowFlowEditor(false);
  }, []);

  const handleExportFlowGraph = useCallback(async () => {
    try {
      await downloadFigmaPackage(flowGraph, {
        projectName: '竞品分析流程图',
        description: `从视频 ${videoPath} 提取的关键帧流程图`,
      });
      toast.success('流程图导出成功');
    } catch (error) {
      console.error('Failed to export flow graph:', error);
      toast.error('导出失败: ' + String(error));
    }
  }, [flowGraph, videoPath]);

  const handleSeekFromKeyframe = useCallback((timeMs: number) => {
    const video = videoPlaybackRef.current?.video;
    if (video) {
      video.currentTime = timeMs / 1000;
    }
  }, []);
  
  // Global Tab prevention
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        // Allow tab only in inputs/textareas
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
          return;
        }
        e.preventDefault();
      }

      if (e.key === ' ' || e.code === 'Space') {
        // Allow space only in inputs/textareas
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
          return;
        }
        e.preventDefault();
        
        const playback = videoPlaybackRef.current;
        if (playback?.video) {
          if (playback.video.paused) {
            playback.play().catch(console.error);
          } else {
            playback.pause();
          }
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);

  useEffect(() => {
    if (selectedZoomId && !zoomRegions.some((region) => region.id === selectedZoomId)) {
      setSelectedZoomId(null);
    }
  }, [selectedZoomId, zoomRegions]);

  useEffect(() => {
    if (selectedTrimId && !trimRegions.some((region) => region.id === selectedTrimId)) {
      setSelectedTrimId(null);
    }
  }, [selectedTrimId, trimRegions]);

  useEffect(() => {
    if (selectedAnnotationId && !annotationRegions.some((region) => region.id === selectedAnnotationId)) {
      setSelectedAnnotationId(null);
    }
  }, [selectedAnnotationId, annotationRegions]);

  // 监听分屏容器尺寸变化
  useEffect(() => {
    const container = splitContainerRef.current;
    if (!container) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSplitContainerSize({ width, height });
      }
    });
    
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const handleExport = useCallback(async (settings: ExportSettings) => {
    if (!videoPath) {
      toast.error('No video loaded');
      return;
    }

    const video = videoPlaybackRef.current?.video;
    if (!video) {
      toast.error('Video not ready');
      return;
    }

    setIsExporting(true);
    setExportProgress(null);
    setExportError(null);

    try {
      const wasPlaying = isPlaying;
      if (wasPlaying) {
        videoPlaybackRef.current?.pause();
      }

      // Get actual video dimensions to match recording resolution
      const video = videoPlaybackRef.current?.video;
      if (!video) {
        toast.error('Video not ready');
        return;
      }
      
      const aspectRatioValue = getAspectRatioValue(aspectRatio);
      const sourceWidth = video.videoWidth || 1920;
      const sourceHeight = video.videoHeight || 1080;
      
      // Get preview CONTAINER dimensions for scaling
      const playbackRef = videoPlaybackRef.current;
      const containerElement = playbackRef?.containerRef?.current;
      const previewWidth = containerElement?.clientWidth || 1920;
      const previewHeight = containerElement?.clientHeight || 1080;

      if (settings.format === 'gif' && settings.gifConfig) {
        // GIF Export
        const gifExporter = new GifExporter({
          videoUrl: videoPath,
          width: settings.gifConfig.width,
          height: settings.gifConfig.height,
          frameRate: settings.gifConfig.frameRate,
          loop: settings.gifConfig.loop,
          sizePreset: settings.gifConfig.sizePreset,
          wallpaper,
          zoomRegions,
          trimRegions,
          showShadow: shadowIntensity > 0,
          shadowIntensity,
          showBlur,
          motionBlurEnabled,
          borderRadius,
          padding,
          videoPadding: padding,
          cropRegion,
          annotationRegions,
          previewWidth,
          previewHeight,
          onProgress: (progress: ExportProgress) => {
            setExportProgress(progress);
          },
        });

        exporterRef.current = gifExporter as unknown as VideoExporter;
        const result = await gifExporter.export();

        if (result.success && result.blob) {
          const arrayBuffer = await result.blob.arrayBuffer();
          const timestamp = Date.now();
          const fileName = `export-${timestamp}.gif`;
          
          const saveResult = await window.electronAPI.saveExportedVideo(arrayBuffer, fileName);
          
          if (saveResult.cancelled) {
            toast.info('Export cancelled');
          } else if (saveResult.success) {
            toast.success(`GIF exported successfully to ${saveResult.path}`);
          } else {
            setExportError(saveResult.message || 'Failed to save GIF');
            toast.error(saveResult.message || 'Failed to save GIF');
          }
        } else {
          setExportError(result.error || 'GIF export failed');
          toast.error(result.error || 'GIF export failed');
        }
      } else {
        // MP4 Export - Using ExportManager for automatic optimization
        const quality = settings.quality || exportQuality;
        let exportWidth: number;
        let exportHeight: number;
        let bitrate: number;

        // Quality-based target resolution:
        // - medium (Low): 720p, 8 Mbps
        // - good (Medium): 1080p, 15 Mbps  
        // - source (High): 4K (2160p), 25 Mbps
        const targetHeight = quality === 'medium' ? 720 : quality === 'good' ? 1080 : 2160;
        
        // Calculate dimensions maintaining aspect ratio
        exportHeight = Math.floor(targetHeight / 2) * 2;
        exportWidth = Math.floor((exportHeight * aspectRatioValue) / 2) * 2;
        
        // Adjust bitrate based on resolution
        if (targetHeight <= 720) {
          bitrate = 8_000_000;   // 8 Mbps for 720p
        } else if (targetHeight <= 1080) {
          bitrate = 15_000_000;  // 15 Mbps for 1080p
        } else {
          bitrate = 25_000_000;  // 25 Mbps for 4K
        }

        // Use ExportManager for automatic strategy selection
        // It will choose between standard, parallel, or WebGPU based on video properties
        const exportManager = new ExportManager({
          videoUrl: videoPath,
          width: exportWidth,
          height: exportHeight,
          frameRate: 30,
          bitrate,
          codec: 'avc1.640033',
          wallpaper,
          zoomRegions,
          trimRegions,
          showShadow: shadowIntensity > 0,
          shadowIntensity,
          showBlur,
          motionBlurEnabled,
          borderRadius,
          padding,
          cropRegion,
          annotationRegions,
          previewWidth,
          previewHeight,
          cameraOverlay: cameraOverlay.enabled ? { ...cameraOverlay } : undefined,
          onProgress: (progress: ExportProgress) => {
            setExportProgress(progress);
          },
        });

        exporterRef.current = exportManager;
        
        // Get recommendations and log strategy (helpful for debugging)
        const capabilities = await exportManager.getCapabilities();
        console.log('[Export] Recommended strategy:', capabilities.recommendedStrategy.type);
        console.log('[Export] Reason:', capabilities.recommendedStrategy.reason);
        console.log('[Export] WebGPU available:', capabilities.webgpu);
        console.log('[Export] Hardware concurrency:', capabilities.hardwareConcurrency);
        
        // Export with automatic strategy selection
        // Will use hybrid/parallel for long videos, standard for camera overlay
        const result = await exportManager.export();

        // Log performance metrics after export
        const metrics = exportManager.getPerformanceMetrics();
        console.log('[Export] Performance:', {
          totalFrames: metrics.totalFrames,
          duration: `${(metrics.totalDuration / 1000).toFixed(2)}s`,
          fps: metrics.framesPerSecond.toFixed(2),
        });

        if (result.success && result.blob) {
          const arrayBuffer = await result.blob.arrayBuffer();
          const timestamp = Date.now();
          const fileName = `export-${timestamp}.mp4`;
          
          const saveResult = await window.electronAPI.saveExportedVideo(arrayBuffer, fileName);
          
          if (saveResult.cancelled) {
            toast.info('Export cancelled');
          } else if (saveResult.success) {
            toast.success(`Video exported successfully to ${saveResult.path}`);
          } else {
            setExportError(saveResult.message || 'Failed to save video');
            toast.error(saveResult.message || 'Failed to save video');
          }
        } else {
          setExportError(result.error || 'Export failed');
          toast.error(result.error || 'Export failed');
        }
      }

      if (wasPlaying) {
        videoPlaybackRef.current?.play();
      }
    } catch (error) {
      console.error('Export error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setExportError(errorMessage);
      toast.error(`Export failed: ${errorMessage}`);
    } finally {
      setIsExporting(false);
      exporterRef.current = null;
      // Reset dialog state to ensure it can be opened again on next export
      // This fixes the bug where second export doesn't show save dialog
      setShowExportDialog(false);
      setExportProgress(null);
    }
  }, [videoPath, wallpaper, zoomRegions, trimRegions, shadowIntensity, showBlur, motionBlurEnabled, borderRadius, padding, cropRegion, annotationRegions, isPlaying, aspectRatio, exportQuality, cameraOverlay]);

  const handleOpenExportDialog = useCallback(() => {
    if (!videoPath) {
      toast.error('No video loaded');
      return;
    }

    const video = videoPlaybackRef.current?.video;
    if (!video) {
      toast.error('Video not ready');
      return;
    }

    // Build export settings from current state
    const sourceWidth = video.videoWidth || 1920;
    const sourceHeight = video.videoHeight || 1080;
    const gifDimensions = calculateOutputDimensions(sourceWidth, sourceHeight, gifSizePreset, GIF_SIZE_PRESETS);

    const settings: ExportSettings = {
      format: exportFormat,
      quality: exportFormat === 'mp4' ? exportQuality : undefined,
      gifConfig: exportFormat === 'gif' ? {
        frameRate: gifFrameRate,
        loop: gifLoop,
        sizePreset: gifSizePreset,
        width: gifDimensions.width,
        height: gifDimensions.height,
      } : undefined,
    };

    setShowExportDialog(true);
    setExportError(null);
    
    // Start export immediately
    handleExport(settings);
  }, [videoPath, exportFormat, exportQuality, gifFrameRate, gifLoop, gifSizePreset, handleExport]);

  const handleCancelExport = useCallback(() => {
    if (exporterRef.current) {
      exporterRef.current.cancel();
      toast.info('Export cancelled');
      setShowExportDialog(false);
      setIsExporting(false);
      setExportProgress(null);
      setExportError(null);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-foreground">Loading video...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-destructive">{error}</div>
      </div>
    );
  }


  return (
    <div className="flex flex-col h-screen bg-[#09090b] text-slate-200 overflow-hidden selection:bg-[#34B27B]/30">
      <EditorTitleBar 
        onExport={handleOpenExportDialog}
      />

      <div className="flex-1 p-5 gap-4 flex min-h-0 relative">
        {/* Left Toolbar */}
        <LeftToolbar
          cameraOverlay={cameraOverlay}
          onCameraOverlayChange={handleCameraOverlayChange}
          cameraVideoPath={cameraVideoPath}
          activePanel={activeToolbarPanel}
          onActivePanelChange={setActiveToolbarPanel}
        />

        {/* Center Column - Video & Timeline */}
        <div className="flex-[7] flex flex-col gap-3 min-w-0 h-full transition-all duration-300">
          <PanelGroup direction="vertical" className="gap-3">
            {/* Top section: video preview and controls */}
            <Panel defaultSize={70} minSize={40}>
              <div className="w-full h-full flex flex-col items-center justify-center bg-black/40 rounded-2xl border border-white/5 shadow-2xl overflow-hidden">
                {/* Video preview */}
                <div className="w-full flex justify-center items-center" style={{ flex: '1 1 auto', margin: '6px 0 0' }}>
                  {(() => {
                    const layoutConfig = getLayoutConfig(cameraOverlay.layoutMode);
                    const isSplitMode = layoutConfig.isSplit && cameraOverlay.enabled && cameraOverlay.videoPath;
                    const splitRatio = cameraOverlay.splitRatio;
                    const isHorizontal = cameraOverlay.layoutMode === 'split-left' || cameraOverlay.layoutMode === 'split-right';
                    const cameraFirst = cameraOverlay.layoutMode === 'split-left' || cameraOverlay.layoutMode === 'split-top';

                    // 计算背景样式
                    const getBackgroundStyle = () => {
                      if (!wallpaper) return {};
                      const isImageUrl = wallpaper.startsWith('file://') || wallpaper.startsWith('http') || wallpaper.startsWith('/') || wallpaper.startsWith('data:');
                      return isImageUrl
                        ? { backgroundImage: `url(${wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                        : { background: wallpaper };
                    };

                    // 摄像头视频样式
                    const getCameraVideoStyle = () => {
                      const boxShadow = cameraOverlay.borderStyle === 'shadow' 
                        ? '0 4px 12px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3)'
                        : cameraOverlay.borderStyle === 'white'
                          ? '0 0 0 3px rgba(255,255,255,0.8)'
                          : 'none';
                      
                      return {
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover' as const,
                        transform: cameraOverlay.mirror ? 'scaleX(-1)' : 'none',
                        borderRadius: `${cameraOverlay.borderRadius}px`,
                        boxShadow,
                      };
                    };

                    // 获取缩放值和位置偏移（兼容旧数据）
                    const cameraScale = cameraOverlay.cameraScale ?? 0.9;
                    const screenScale = cameraOverlay.screenScale ?? 0.9;
                    const cameraOffset = cameraOverlay.cameraOffset ?? { x: 0, y: 0 };
                    const screenOffset = cameraOverlay.screenOffset ?? { x: 0, y: 0 };

                    // 拖拽处理 - 摄像头（直接跟随鼠标，无边界限制）
                    const handleCameraDragStart = (e: React.MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const startX = e.clientX;
                      const startY = e.clientY;
                      const startOffset = { ...cameraOffset };
                      
                      const handleMouseMove = (moveEvent: MouseEvent) => {
                        // 直接使用像素差值，无限制
                        const deltaX = moveEvent.clientX - startX;
                        const deltaY = moveEvent.clientY - startY;
                        const newOffset = {
                          x: startOffset.x + deltaX,
                          y: startOffset.y + deltaY,
                        };
                        setCameraOverlay(prev => ({ ...prev, cameraOffset: newOffset }));
                      };
                      
                      const handleMouseUp = () => {
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                        document.body.style.cursor = '';
                        document.body.style.userSelect = '';
                      };
                      
                      document.body.style.cursor = 'grabbing';
                      document.body.style.userSelect = 'none';
                      document.addEventListener('mousemove', handleMouseMove);
                      document.addEventListener('mouseup', handleMouseUp);
                    };

                    // 拖拽处理 - 录屏（直接跟随鼠标，无边界限制）
                    const handleScreenDragStart = (e: React.MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const startX = e.clientX;
                      const startY = e.clientY;
                      const startOffset = { ...screenOffset };
                      
                      const handleMouseMove = (moveEvent: MouseEvent) => {
                        // 直接使用像素差值，无限制
                        const deltaX = moveEvent.clientX - startX;
                        const deltaY = moveEvent.clientY - startY;
                        const newOffset = {
                          x: startOffset.x + deltaX,
                          y: startOffset.y + deltaY,
                        };
                        setCameraOverlay(prev => ({ ...prev, screenOffset: newOffset }));
                      };
                      
                      const handleMouseUp = () => {
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                        document.body.style.cursor = '';
                        document.body.style.userSelect = '';
                      };
                      
                      document.body.style.cursor = 'grabbing';
                      document.body.style.userSelect = 'none';
                      document.addEventListener('mousemove', handleMouseMove);
                      document.addEventListener('mouseup', handleMouseUp);
                    };

                    // 调整大小处理 - 摄像头
                    const handleCameraResizeStart = (e: React.MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const startY = e.clientY;
                      const startScale = cameraScale;
                      
                      const handleMouseMove = (moveEvent: MouseEvent) => {
                        const deltaY = (moveEvent.clientY - startY) / 200;
                        const newScale = Math.max(0.3, Math.min(1.5, startScale + deltaY));
                        setCameraOverlay(prev => ({ ...prev, cameraScale: newScale }));
                      };
                      
                      const handleMouseUp = () => {
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                        document.body.style.cursor = '';
                        document.body.style.userSelect = '';
                      };
                      
                      document.body.style.cursor = 'nwse-resize';
                      document.body.style.userSelect = 'none';
                      document.addEventListener('mousemove', handleMouseMove);
                      document.addEventListener('mouseup', handleMouseUp);
                    };

                    // 调整大小处理 - 录屏
                    const handleScreenResizeStart = (e: React.MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const startY = e.clientY;
                      const startScale = screenScale;
                      
                      const handleMouseMove = (moveEvent: MouseEvent) => {
                        const deltaY = (moveEvent.clientY - startY) / 200;
                        const newScale = Math.max(0.3, Math.min(1.5, startScale + deltaY));
                        setCameraOverlay(prev => ({ ...prev, screenScale: newScale }));
                      };
                      
                      const handleMouseUp = () => {
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                        document.body.style.cursor = '';
                        document.body.style.userSelect = '';
                      };
                      
                      document.body.style.cursor = 'nwse-resize';
                      document.body.style.userSelect = 'none';
                      document.addEventListener('mousemove', handleMouseMove);
                      document.addEventListener('mouseup', handleMouseUp);
                    };

                    // 调整大小手柄组件（隐藏图标，只保留点击区域）
                    const ResizeHandle = ({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) => (
                      <div
                        onMouseDown={onMouseDown}
                        style={{
                          position: 'absolute',
                          right: 0,
                          bottom: 0,
                          width: '24px',
                          height: '24px',
                          cursor: 'nwse-resize',
                          zIndex: 10,
                        }}
                      />
                    );

                    if (isSplitMode) {
                      // 分屏布局：间隔 1px，所有尺寸用像素值计算，最大化显示
                      const gapPx = 1;
                      const containerW = splitContainerSize.width || 800;
                      const containerH = splitContainerSize.height || 450;
                      
                      // 左右分屏：摄像头 9:16，录屏 16:9，两者高度一致
                      // 宽度比例：摄像头 9/16，录屏 16/9
                      // 总宽度比例 = 9/16 + 16/9 = (81 + 256) / 144 = 337/144 ≈ 2.34
                      const cameraRatio = 9 / 16; // 宽/高
                      const screenRatio = 16 / 9; // 宽/高
                      const totalWidthRatio = cameraRatio + screenRatio; // 约 2.34
                      
                      // 可用空间
                      const availableWidth = containerW - gapPx;
                      const availableHeight = containerH;
                      
                      // 方案1：用满高度，计算所需宽度
                      const heightBasedWidth = availableHeight * totalWidthRatio;
                      
                      // 方案2：用满宽度，计算所需高度
                      const widthBasedHeight = availableWidth / totalWidthRatio;
                      
                      // 选择最大化方案：取能完全容纳的最大尺寸
                      let finalHeightPx: number;
                      if (heightBasedWidth <= availableWidth) {
                        // 高度受限，用满高度
                        finalHeightPx = availableHeight;
                      } else {
                        // 宽度受限，用满宽度
                        finalHeightPx = widthBasedHeight;
                      }
                      
                      // 放大 20%
                      finalHeightPx = finalHeightPx * 1.32;
                      
                      // 计算最终宽度（像素）
                      const cameraWidthPx = Math.floor(finalHeightPx * cameraRatio);
                      const screenWidthPx = Math.floor(finalHeightPx * screenRatio);
                      finalHeightPx = Math.floor(finalHeightPx);
                      
                      // 摄像头组件 JSX
                      const cameraElement = (
                        <div 
                          style={{
                            position: 'relative',
                            width: cameraWidthPx,
                            height: finalHeightPx,
                            flexShrink: 0,
                            transform: `scale(${cameraScale}) translate(${cameraOffset.x}px, ${cameraOffset.y}px)`,
                            transformOrigin: 'center center',
                          }}
                        >
                          <div 
                            style={{ width: '100%', height: '100%', cursor: 'grab' }}
                            onMouseDown={handleCameraDragStart}
                          >
                            <video
                              src={`file://${cameraOverlay.videoPath}`}
                              style={getCameraVideoStyle()}
                              muted
                              playsInline
                              ref={splitCameraVideoRef}
                            />
                          </div>
                          <ResizeHandle onMouseDown={handleCameraResizeStart} />
                        </div>
                      );
                      
                      // 录屏组件 JSX - 高度与摄像头完全一致（像素值）
                      const screenElement = (
                        <div 
                          style={{
                            position: 'relative',
                            width: screenWidthPx,
                            height: finalHeightPx,
                            flexShrink: 0,
                            transform: `scale(${screenScale}) translate(${screenOffset.x}px, ${screenOffset.y}px)`,
                            transformOrigin: 'center center',
                          }}
                        >
                          <div
                            onMouseDown={handleScreenDragStart}
                            style={{
                              width: '100%',
                              height: '100%',
                              cursor: 'grab',
                            }}
                          >
                            <VideoPlayback
                              aspectRatio={aspectRatio}
                              ref={videoPlaybackRef}
                              videoPath={videoPath || ''}
                              hideBackground={true}
                              onDurationChange={handleDurationChange}
                              onTimeUpdate={setCurrentTime}
                              currentTime={currentTime}
                              onPlayStateChange={setIsPlaying}
                              onError={setError}
                              wallpaper={wallpaper}
                              zoomRegions={zoomRegions}
                              selectedZoomId={selectedZoomId}
                              onSelectZoom={handleSelectZoom}
                              onZoomFocusChange={handleZoomFocusChange}
                              onZoomScaleChange={handleZoomScaleChange}
                              isPlaying={isPlaying}
                              showShadow={shadowIntensity > 0}
                              shadowIntensity={shadowIntensity}
                              showBlur={false}
                              motionBlurEnabled={motionBlurEnabled}
                              borderRadius={borderRadius}
                              padding={padding}
                              cropRegion={cropRegion}
                              trimRegions={trimRegions}
                              annotationRegions={annotationRegions}
                              selectedAnnotationId={selectedAnnotationId}
                              onSelectAnnotation={handleSelectAnnotation}
                              onAnnotationPositionChange={handleAnnotationPositionChange}
                              onAnnotationSizeChange={handleAnnotationSizeChange}
                            />
                          </div>
                          <ResizeHandle onMouseDown={handleScreenResizeStart} />
                        </div>
                      );
                      
                      // 分屏布局：间隔 1px，所有宽高用像素值计算，居中最大化显示
                      return (
                        <div 
                          ref={splitContainerRef}
                          className="relative rounded-sm overflow-hidden"
                          style={{ 
                            width: '100%', 
                            height: '100%',
                          }}
                        >
                          {/* 背景层 */}
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              ...getBackgroundStyle(),
                              filter: showBlur ? 'blur(2px)' : 'none',
                            }}
                          />
                          
                          {/* 分屏内容容器 - 间隔 1px，高度一致（像素值），居中最大化 */}
                          <div 
                            style={{
                              position: 'absolute',
                              inset: 0,
                              zIndex: 1,
                              display: 'flex',
                              flexDirection: isHorizontal ? 'row' : 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: gapPx, // 间隔 1px
                              boxSizing: 'border-box',
                            }}
                          >
                            {/* 根据 cameraFirst 决定顺序 */}
                            {cameraFirst ? (
                              <>
                                {cameraElement}
                                {screenElement}
                              </>
                            ) : (
                              <>
                                {screenElement}
                                {cameraElement}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // 画中画模式
                    return (
                      <div className="relative" style={{ width: 'auto', height: '100%', aspectRatio: getAspectRatioValue(aspectRatio), maxWidth: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
                        {/* Camera overlay (picture-in-picture) */}
                        {cameraOverlay.enabled && cameraOverlay.videoPath && videoPlaybackRef.current?.containerRef?.current && (
                          <PictureInPicture
                            overlay={cameraOverlay}
                            onOverlayChange={handleCameraOverlayChange}
                            containerWidth={videoPlaybackRef.current.containerRef.current.clientWidth}
                            containerHeight={videoPlaybackRef.current.containerRef.current.clientHeight}
                            currentTimeMs={Math.round(currentTime * 1000)}
                            isPlaying={isPlaying}
                            videoDurationMs={Math.round(duration * 1000)}
                          />
                        )}
                        <VideoPlayback
                          aspectRatio={aspectRatio}
                          ref={videoPlaybackRef}
                          videoPath={videoPath || ''}
                          onDurationChange={handleDurationChange}
                          onTimeUpdate={setCurrentTime}
                          currentTime={currentTime}
                          onPlayStateChange={setIsPlaying}
                          onError={setError}
                          wallpaper={wallpaper}
                          zoomRegions={zoomRegions}
                          selectedZoomId={selectedZoomId}
                          onSelectZoom={handleSelectZoom}
                          onZoomFocusChange={handleZoomFocusChange}
                          onZoomScaleChange={handleZoomScaleChange}
                          isPlaying={isPlaying}
                          showShadow={shadowIntensity > 0}
                          shadowIntensity={shadowIntensity}
                          showBlur={showBlur}
                          motionBlurEnabled={motionBlurEnabled}
                          borderRadius={borderRadius}
                          padding={padding}
                          cropRegion={cropRegion}
                          trimRegions={trimRegions}
                          annotationRegions={annotationRegions}
                          selectedAnnotationId={selectedAnnotationId}
                          onSelectAnnotation={handleSelectAnnotation}
                          onAnnotationPositionChange={handleAnnotationPositionChange}
                          onAnnotationSizeChange={handleAnnotationSizeChange}
                        />
                      </div>
                    );
                  })()}
                </div>
                {/* Playback controls */}
                <div className="w-full flex justify-center items-center" style={{ height: '48px', flexShrink: 0, padding: '6px 12px', margin: '6px 0 6px 0' }}>
                  <div style={{ width: '100%', maxWidth: '700px' }}>
                    <PlaybackControls
                      isPlaying={isPlaying}
                      currentTime={currentTime}
                      duration={duration}
                      onTogglePlayPause={togglePlayPause}
                      onSeek={handleSeek}
                    />
                  </div>
                </div>
              </div>
            </Panel>

            <PanelResizeHandle className="h-3 bg-[#09090b]/80 hover:bg-[#09090b] transition-colors rounded-full mx-4 flex items-center justify-center">
              <div className="w-8 h-1 bg-white/20 rounded-full"></div>
            </PanelResizeHandle>

            {/* Timeline section */}
            <Panel defaultSize={30} minSize={20}>
              <div className="h-full bg-[#09090b] rounded-2xl border border-white/5 shadow-lg overflow-hidden flex flex-col">
                <TimelineEditor
              videoDuration={duration}
              currentTime={currentTime}
              onSeek={handleSeek}
              zoomRegions={zoomRegions}
              onZoomAdded={handleZoomAdded}
              onZoomSpanChange={handleZoomSpanChange}
              onZoomDelete={handleZoomDelete}
              selectedZoomId={selectedZoomId}
              onSelectZoom={handleSelectZoom}
              trimRegions={trimRegions}
              onTrimAdded={handleTrimAdded}
              onTrimSpanChange={handleTrimSpanChange}
              onTrimDelete={handleTrimDelete}
              selectedTrimId={selectedTrimId}
              onSelectTrim={handleSelectTrim}
              annotationRegions={annotationRegions}
              onAnnotationAdded={handleAnnotationAdded}
              onAnnotationSpanChange={handleAnnotationSpanChange}
              onAnnotationDelete={handleAnnotationDelete}
              selectedAnnotationId={selectedAnnotationId}
              onSelectAnnotation={handleSelectAnnotation}
              aspectRatio={aspectRatio}
              onAspectRatioChange={setAspectRatio}
              mouseClickEvents={mouseClickEvents}
              onAutoZoomFromClicks={handleAutoZoomFromClicks}
            />
              </div>
            </Panel>
          </PanelGroup>
        </div>

          {/* Right section: settings panel with Pro features tab */}
          <div className="flex-[2] min-w-0 flex flex-col h-full">
            {/* Tab switcher for Pro features */}
            <FeatureGate feature={Feature.PRO_KEYFRAME_EXTRACT}>
              <div className="flex mb-2 bg-white/5 rounded-lg p-1">
                <button
                  onClick={() => setRightPanelTab('settings')}
                  className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${
                    rightPanelTab === 'settings'
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  设置
                </button>
                <button
                  onClick={() => setRightPanelTab('keyframes')}
                  className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${
                    rightPanelTab === 'keyframes'
                      ? 'bg-[#34B27B]/20 text-[#34B27B]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  关键帧
                  <span className="ml-1 px-1 py-0.5 text-[9px] bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold rounded uppercase">Pro</span>
                </button>
              </div>
            </FeatureGate>

            {/* Panel content */}
            {rightPanelTab === 'settings' ? (
              <SettingsPanel
                selected={wallpaper}
                onWallpaperChange={setWallpaper}
                selectedZoomDepth={selectedZoomId ? zoomRegions.find(z => z.id === selectedZoomId)?.depth : null}
                onZoomDepthChange={(depth) => selectedZoomId && handleZoomDepthChange(depth)}
                selectedZoomId={selectedZoomId}
                onZoomDelete={handleZoomDelete}
                selectedTrimId={selectedTrimId}
                onTrimDelete={handleTrimDelete}
                shadowIntensity={shadowIntensity}
                onShadowChange={setShadowIntensity}
                showBlur={showBlur}
                onBlurChange={setShowBlur}
                motionBlurEnabled={motionBlurEnabled}
                onMotionBlurChange={setMotionBlurEnabled}
                borderRadius={borderRadius}
                onBorderRadiusChange={setBorderRadius}
                padding={padding}
                onPaddingChange={setPadding}
                cropRegion={cropRegion}
                onCropChange={setCropRegion}
                aspectRatio={aspectRatio}
                videoElement={videoPlaybackRef.current?.video || null}
                exportQuality={exportQuality}
                onExportQualityChange={setExportQuality}
                exportFormat={exportFormat}
                onExportFormatChange={setExportFormat}
                gifFrameRate={gifFrameRate}
                onGifFrameRateChange={setGifFrameRate}
                gifLoop={gifLoop}
                onGifLoopChange={setGifLoop}
                gifSizePreset={gifSizePreset}
                onGifSizePresetChange={setGifSizePreset}
                gifOutputDimensions={calculateOutputDimensions(
                  videoPlaybackRef.current?.video?.videoWidth || 1920,
                  videoPlaybackRef.current?.video?.videoHeight || 1080,
                  gifSizePreset,
                  GIF_SIZE_PRESETS
                )}
                onExport={handleOpenExportDialog}
                selectedAnnotationId={selectedAnnotationId}
                annotationRegions={annotationRegions}
                onAnnotationContentChange={handleAnnotationContentChange}
                onAnnotationTypeChange={handleAnnotationTypeChange}
                onAnnotationStyleChange={handleAnnotationStyleChange}
                onAnnotationFigureDataChange={handleAnnotationFigureDataChange}
                onAnnotationDelete={handleAnnotationDelete}
              />
            ) : (
              <div className="flex-1 bg-[#09090b] border border-white/5 rounded-2xl overflow-hidden">
                <KeyframePanel
                  videoRef={videoPlaybackRef}
                  currentTimeMs={Math.round(currentTime * 1000)}
                  mouseTrackData={{ events: mouseClickEvents, screenBounds: { width: 1920, height: 1080 } }}
                  aspectRatio={aspectRatio}
                  wallpaper={wallpaper}
                  onSeek={handleSeekFromKeyframe}
                  onOpenFlowEditor={handleOpenFlowEditor}
                  onExport={handleExportFlowGraph}
                />
              </div>
            )}
          </div>
      </div>

      <Toaster theme="dark" className="pointer-events-auto" />
      
      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        progress={exportProgress}
        isExporting={isExporting}
        error={exportError}
        onCancel={handleCancelExport}
        exportFormat={exportFormat}
      />

      {/* Pro Feature: Flow Editor Modal */}
      {showFlowEditor && isFeatureEnabled(Feature.PRO_FLOW_EDITOR) && (
        <FlowEditor
          onClose={handleCloseFlowEditor}
          onExport={handleExportFlowGraph}
        />
      )}
    </div>
  );
}