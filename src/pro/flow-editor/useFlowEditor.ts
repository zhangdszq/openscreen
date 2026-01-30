/**
 * Flow Editor Hook
 * 
 * Manages the state and interactions for the flow graph editor.
 */

import { useState, useCallback, useRef } from 'react';
import type { KeyframeCapture } from '@/components/video-editor/types';

export type DrawMode = 'select' | 'region';

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface DragState {
  isDragging: boolean;
  dragType: 'node' | 'canvas' | 'connection' | 'draw-region' | null;
  startX: number;
  startY: number;
  nodeId?: string;
  connectionStart?: string;
}

export interface DrawingRegion {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface FlowEditorState {
  viewport: ViewportState;
  drag: DragState;
  hoveredNodeId: string | null;
  connectionPreview: { startId: string; endX: number; endY: number } | null;
  drawMode: DrawMode;
  drawingRegion: DrawingRegion | null;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const ZOOM_SENSITIVITY = 0.001;

export function useFlowEditor() {
  const [viewport, setViewport] = useState<ViewportState>({ x: 0, y: 0, zoom: 1 });
  const [drag, setDrag] = useState<DragState>({
    isDragging: false,
    dragType: null,
    startX: 0,
    startY: 0,
  });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [connectionPreview, setConnectionPreview] = useState<{
    startId: string;
    endX: number;
    endY: number;
  } | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>('select');
  const [drawingRegion, setDrawingRegion] = useState<DrawingRegion | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Convert screen coordinates to canvas coordinates
  const screenToCanvas = useCallback((screenX: number, screenY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };

    return {
      x: (screenX - rect.left - viewport.x) / viewport.zoom,
      y: (screenY - rect.top - viewport.y) / viewport.zoom,
    };
  }, [viewport]);

  // Convert canvas coordinates to screen coordinates
  const canvasToScreen = useCallback((canvasX: number, canvasY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };

    return {
      x: canvasX * viewport.zoom + viewport.x + rect.left,
      y: canvasY * viewport.zoom + viewport.y + rect.top,
    };
  }, [viewport]);

  // Handle zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();

    const delta = -e.deltaY * ZOOM_SENSITIVITY;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom * (1 + delta)));

    // Zoom towards cursor position
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const scaleFactor = newZoom / viewport.zoom;
      const newX = cursorX - (cursorX - viewport.x) * scaleFactor;
      const newY = cursorY - (cursorY - viewport.y) * scaleFactor;

      setViewport({
        x: newX,
        y: newY,
        zoom: newZoom,
      });
    }
  }, [viewport]);

  // Start canvas drag or region drawing
  const startCanvasDrag = useCallback((e: React.MouseEvent) => {
    if (drawMode === 'region') {
      // Start drawing a region
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      setDrag({
        isDragging: true,
        dragType: 'draw-region',
        startX: e.clientX,
        startY: e.clientY,
      });
      setDrawingRegion({
        startX: canvasPos.x,
        startY: canvasPos.y,
        endX: canvasPos.x,
        endY: canvasPos.y,
      });
    } else {
      // Normal canvas pan
      setDrag({
        isDragging: true,
        dragType: 'canvas',
        startX: e.clientX - viewport.x,
        startY: e.clientY - viewport.y,
      });
    }
  }, [viewport, drawMode, screenToCanvas]);

  // Start node drag
  const startNodeDrag = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setDrag({
      isDragging: true,
      dragType: 'node',
      startX: e.clientX,
      startY: e.clientY,
      nodeId,
    });
  }, []);

  // Start connection creation
  const startConnection = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setDrag({
      isDragging: true,
      dragType: 'connection',
      startX: e.clientX,
      startY: e.clientY,
      connectionStart: nodeId,
    });
    
    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    setConnectionPreview({
      startId: nodeId,
      endX: canvasPos.x,
      endY: canvasPos.y,
    });
  }, [screenToCanvas]);

  // Handle mouse move
  const handleMouseMove = useCallback((
    e: React.MouseEvent,
    onNodeMove?: (nodeId: string, deltaX: number, deltaY: number) => void
  ) => {
    if (!drag.isDragging) return;

    if (drag.dragType === 'canvas') {
      setViewport(v => ({
        ...v,
        x: e.clientX - drag.startX,
        y: e.clientY - drag.startY,
      }));
    } else if (drag.dragType === 'node' && drag.nodeId && onNodeMove) {
      const deltaX = (e.clientX - drag.startX) / viewport.zoom;
      const deltaY = (e.clientY - drag.startY) / viewport.zoom;
      onNodeMove(drag.nodeId, deltaX, deltaY);
      setDrag(d => ({
        ...d,
        startX: e.clientX,
        startY: e.clientY,
      }));
    } else if (drag.dragType === 'connection' && drag.connectionStart) {
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      setConnectionPreview({
        startId: drag.connectionStart,
        endX: canvasPos.x,
        endY: canvasPos.y,
      });
    } else if (drag.dragType === 'draw-region' && drawingRegion) {
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      setDrawingRegion(prev => prev ? {
        ...prev,
        endX: canvasPos.x,
        endY: canvasPos.y,
      } : null);
    }
  }, [drag, viewport.zoom, screenToCanvas, drawingRegion]);

  // Handle mouse up
  const handleMouseUp = useCallback((
    targetNodeId?: string,
    onConnectionCreate?: (from: string, to: string) => void,
    onRegionDrawComplete?: (x: number, y: number, width: number, height: number) => void
  ) => {
    if (drag.dragType === 'connection' && drag.connectionStart && targetNodeId) {
      if (drag.connectionStart !== targetNodeId) {
        onConnectionCreate?.(drag.connectionStart, targetNodeId);
      }
    } else if (drag.dragType === 'draw-region' && drawingRegion && onRegionDrawComplete) {
      // Calculate region bounds (normalize to ensure positive width/height)
      const x = Math.min(drawingRegion.startX, drawingRegion.endX);
      const y = Math.min(drawingRegion.startY, drawingRegion.endY);
      const width = Math.abs(drawingRegion.endX - drawingRegion.startX);
      const height = Math.abs(drawingRegion.endY - drawingRegion.startY);
      
      // Only create if region is large enough
      if (width > 20 && height > 20) {
        onRegionDrawComplete(x, y, width, height);
      }
      
      // Switch back to select mode after drawing
      setDrawMode('select');
    }

    setDrag({
      isDragging: false,
      dragType: null,
      startX: 0,
      startY: 0,
    });
    setConnectionPreview(null);
    setDrawingRegion(null);
  }, [drag, drawingRegion]);

  // Reset viewport
  const resetViewport = useCallback(() => {
    setViewport({ x: 0, y: 0, zoom: 1 });
  }, []);

  // Fit content to view
  const fitToView = useCallback((keyframes: KeyframeCapture[], padding = 50) => {
    if (keyframes.length === 0) return;

    const nodeWidth = 180;
    const nodeHeight = 120;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    keyframes.forEach(kf => {
      const pos = kf.flowPosition || { x: 0, y: 0 };
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + nodeWidth);
      maxY = Math.max(maxY, pos.y + nodeHeight);
    });

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const viewWidth = rect.width - padding * 2;
    const viewHeight = rect.height - padding * 2;

    const zoom = Math.min(
      viewWidth / contentWidth,
      viewHeight / contentHeight,
      1
    );

    const x = (rect.width - contentWidth * zoom) / 2 - minX * zoom;
    const y = (rect.height - contentHeight * zoom) / 2 - minY * zoom;

    setViewport({ x, y, zoom });
  }, []);

  return {
    containerRef,
    viewport,
    drag,
    hoveredNodeId,
    connectionPreview,
    drawMode,
    drawingRegion,
    setHoveredNodeId,
    setDrawMode,
    screenToCanvas,
    canvasToScreen,
    handleWheel,
    startCanvasDrag,
    startNodeDrag,
    startConnection,
    handleMouseMove,
    handleMouseUp,
    resetViewport,
    fitToView,
  };
}
