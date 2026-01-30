/**
 * FlowEditor - Main flow graph editor component
 * 
 * A canvas-based editor for creating and editing flow graphs
 * that visualize the relationships between captured keyframes.
 */

import { useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useKeyframeStore } from '@/pro/keyframe';
import { useFlowEditor } from './useFlowEditor';
import { FlowNode } from './FlowNode';
import { FlowRegion, REGION_COLORS } from './FlowRegion';
import { FlowEdge, FlowEdgePreview } from './FlowEdge';
import { FlowToolbar } from './FlowToolbar';
import type { FlowRegion as FlowRegionType } from '@/components/video-editor/types';

interface FlowEditorProps {
  /** Callback when editor is closed */
  onClose: () => void;
  /** Callback to export the flow graph */
  onExport?: () => void;
}

export function FlowEditor({ onClose, onExport }: FlowEditorProps) {
  const {
    flowGraph,
    selectedKeyframeIds,
    selectedRegionIds,
    selectedConnectionIds,
    selectKeyframe,
    selectRegion,
    selectConnection,
    clearSelection,
    addConnection,
    addRegion,
    removeKeyframe,
    removeRegion,
    removeConnection,
    updateKeyframe,
    updateKeyframePosition,
    updateRegionPosition,
    updateRegionSize,
    autoLayoutKeyframes,
    undo,
    redo,
    canUndo,
    canRedo,
    pushHistory,
  } = useKeyframeStore();

  const {
    containerRef,
    viewport,
    drag,
    hoveredNodeId,
    connectionPreview,
    drawMode,
    drawingRegion,
    setHoveredNodeId,
    setDrawMode,
    handleWheel,
    startCanvasDrag,
    startNodeDrag,
    startConnection,
    handleMouseMove,
    handleMouseUp,
    resetViewport,
    fitToView,
  } = useFlowEditor();

  const keyframes = flowGraph.keyframes;
  const regions = flowGraph.regions || [];
  const connections = flowGraph.connections;

  // Handle node position change (keyframes or regions)
  const handleNodeMove = useCallback((nodeId: string, deltaX: number, deltaY: number) => {
    // Check if it's a keyframe
    const keyframe = keyframes.find(kf => kf.id === nodeId);
    if (keyframe) {
      const currentPos = keyframe.flowPosition || { x: 0, y: 0 };
      updateKeyframePosition(nodeId, currentPos.x + deltaX, currentPos.y + deltaY);
      return;
    }
    // Check if it's a region
    const region = regions.find(r => r.id === nodeId);
    if (region) {
      updateRegionPosition(nodeId, region.position.x + deltaX, region.position.y + deltaY);
    }
  }, [keyframes, regions, updateKeyframePosition, updateRegionPosition]);

  // Handle connection creation with type info
  const handleConnectionCreate = useCallback((from: string, to: string, fromType?: 'keyframe' | 'region', toType?: 'keyframe' | 'region') => {
    addConnection(from, to, undefined, fromType, toType);
  }, [addConnection]);

  // Handle label change from sticky note (keyframes)
  const handleLabelChange = useCallback((id: string, label: string) => {
    updateKeyframe(id, { label });
  }, [updateKeyframe]);

  // Handle sticky note resize
  const handleStickyResize = useCallback((id: string, width: number, height: number) => {
    updateKeyframe(id, { stickySize: { width, height } });
  }, [updateKeyframe]);

  // Handle region resize
  const handleRegionResize = useCallback((id: string, width: number, height: number) => {
    updateRegionSize(id, width, height);
  }, [updateRegionSize]);

  // Handle region drawing complete
  const handleRegionDrawComplete = useCallback((x: number, y: number, width: number, height: number) => {
    // Save current state to history before adding region
    pushHistory(flowGraph);
    
    const newRegion: FlowRegionType = {
      id: uuidv4(),
      label: '',
      position: { x, y },
      size: { width, height },
      color: REGION_COLORS[regions.length % REGION_COLORS.length].value,
      borderStyle: 'dashed',
      createdAt: Date.now(),
    };
    addRegion(newRegion);
    selectRegion(newRegion.id);
  }, [flowGraph, regions.length, addRegion, selectRegion, pushHistory]);

  // Handle delete selected
  const handleDeleteSelected = useCallback(() => {
    if (selectedKeyframeIds.length === 0 && selectedRegionIds.length === 0 && selectedConnectionIds.length === 0) {
      return;
    }
    // Save current state to history before deleting
    pushHistory(flowGraph);
    
    selectedKeyframeIds.forEach(id => removeKeyframe(id));
    selectedRegionIds.forEach(id => removeRegion(id));
    selectedConnectionIds.forEach(id => removeConnection(id));
    clearSelection();
  }, [flowGraph, selectedKeyframeIds, selectedRegionIds, selectedConnectionIds, removeKeyframe, removeRegion, removeConnection, clearSelection, pushHistory]);

  // Handle zoom controls
  const handleZoomIn = useCallback(() => {
    const newZoom = Math.min(10, viewport.zoom * 1.2);
    // Zoom towards center
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const scaleFactor = newZoom / viewport.zoom;
      const newX = centerX - (centerX - viewport.x) * scaleFactor;
      const newY = centerY - (centerY - viewport.y) * scaleFactor;
      containerRef.current?.dispatchEvent(new CustomEvent('viewport-change', {
        detail: { x: newX, y: newY, zoom: newZoom }
      }));
    }
  }, [viewport, containerRef]);

  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(0.1, viewport.zoom / 1.2);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const scaleFactor = newZoom / viewport.zoom;
      const newX = centerX - (centerX - viewport.x) * scaleFactor;
      const newY = centerY - (centerY - viewport.y) * scaleFactor;
      containerRef.current?.dispatchEvent(new CustomEvent('viewport-change', {
        detail: { x: newX, y: newY, zoom: newZoom }
      }));
    }
  }, [viewport, containerRef]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedKeyframeIds.length > 0 || selectedRegionIds.length > 0 || selectedConnectionIds.length > 0) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }
      // Escape - clear selection or exit region draw mode
      if (e.key === 'Escape') {
        if (drawMode === 'region') {
          setDrawMode('select');
        } else {
          clearSelection();
        }
      }
      // Undo: Cmd/Ctrl + Z
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) {
          undo();
        }
      }
      // Redo: Cmd/Ctrl + Shift + Z
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        if (canRedo()) {
          redo();
        }
      }
      // Tool shortcuts
      if (e.key === 'v' || e.key === 'V') {
        setDrawMode('select');
      }
      if (e.key === 'r' || e.key === 'R') {
        setDrawMode('region');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedKeyframeIds, selectedRegionIds, selectedConnectionIds, handleDeleteSelected, clearSelection, drawMode, setDrawMode, undo, redo, canUndo, canRedo]);

  // Fit to view on initial render
  useEffect(() => {
    if (keyframes.length > 0) {
      setTimeout(() => fitToView(keyframes), 100);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasSelection = selectedKeyframeIds.length > 0 || selectedRegionIds.length > 0 || selectedConnectionIds.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-[#09090b] flex flex-col">
      {/* Toolbar */}
      <FlowToolbar
        zoom={viewport.zoom}
        hasSelection={hasSelection}
        keyframeCount={keyframes.length}
        regionCount={regions.length}
        connectionCount={connections.length}
        drawMode={drawMode}
        canUndo={canUndo()}
        canRedo={canRedo()}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitToView={() => fitToView(keyframes)}
        onResetView={resetViewport}
        onAutoLayout={autoLayoutKeyframes}
        onDeleteSelected={handleDeleteSelected}
        onSetDrawMode={setDrawMode}
        onUndo={undo}
        onRedo={redo}
        onExport={() => {
          console.log('[FlowEditor] Export clicked');
          onExport?.();
        }}
        onClose={() => {
          console.log('[FlowEditor] Close clicked');
          onClose();
        }}
      />

      {/* Canvas */}
      <div
        ref={containerRef}
        className={`flex-1 overflow-hidden relative mt-16 ${
          drawMode === 'region' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
        }`}
        onWheel={handleWheel}
        onMouseDown={(e) => {
          // Only handle canvas background clicks
          const target = e.target as HTMLElement;
          if (target === e.currentTarget || target.closest('[data-canvas-bg]')) {
            if (drawMode === 'select') {
              clearSelection();
            }
            startCanvasDrag(e);
          }
        }}
        onMouseMove={(e) => handleMouseMove(e, handleNodeMove)}
        onMouseUp={() => handleMouseUp(hoveredNodeId || undefined, handleConnectionCreate, handleRegionDrawComplete)}
        onMouseLeave={() => handleMouseUp(undefined, handleConnectionCreate, handleRegionDrawComplete)}
      >
        {/* Grid background */}
        <div
          data-canvas-bg
          className="absolute inset-0"
          style={{
            backgroundImage: `
              radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)
            `,
            backgroundSize: `${20 * viewport.zoom}px ${20 * viewport.zoom}px`,
            backgroundPosition: `${viewport.x}px ${viewport.y}px`,
          }}
        />

        {/* Transformed content */}
        <div
          className="absolute"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {/* Nodes layer */}
          {keyframes.map(keyframe => (
            <FlowNode
              key={keyframe.id}
              keyframe={keyframe}
              isSelected={selectedKeyframeIds.includes(keyframe.id)}
              isHovered={hoveredNodeId === keyframe.id}
              onMouseDown={(e) => {
                selectKeyframe(keyframe.id, e.metaKey || e.ctrlKey);
                startNodeDrag(e, keyframe.id);
              }}
              onMouseEnter={() => setHoveredNodeId(keyframe.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
              onConnectionStart={(e) => startConnection(e, keyframe.id)}
              onMouseUp={() => {
                if (drag.dragType === 'connection') {
                  // Determine the type of the source
                  const fromType = connectionPreview?.startId ? (keyframes.find(k => k.id === connectionPreview.startId) ? 'keyframe' : 'region') : 'keyframe';
                  handleConnectionCreate(connectionPreview?.startId || '', keyframe.id, fromType, 'keyframe');
                }
              }}
              onLabelChange={handleLabelChange}
              onStickyResize={handleStickyResize}
            />
          ))}

          {/* Regions layer (rendered last, on top of nodes) */}
          {regions.map(region => (
            <FlowRegion
              key={region.id}
              region={region}
              isSelected={selectedRegionIds.includes(region.id)}
              isHovered={hoveredNodeId === region.id}
              onMouseDown={(e) => {
                selectRegion(region.id, e.metaKey || e.ctrlKey);
                startNodeDrag(e, region.id);
              }}
              onMouseEnter={() => setHoveredNodeId(region.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
              onConnectionStart={(e) => startConnection(e, region.id)}
              onMouseUp={() => {
                if (drag.dragType === 'connection') {
                  // Determine the type of the target
                  handleConnectionCreate(
                    connectionPreview?.startId || '', 
                    region.id,
                    connectionPreview?.startId ? (keyframes.find(k => k.id === connectionPreview.startId) ? 'keyframe' : 'region') : 'keyframe',
                    'region'
                  );
                }
              }}
              onResize={handleRegionResize}
            />
          ))}

          {/* Edges SVG layer (on top of nodes and regions) */}
          <svg
            className="absolute"
            style={{
              width: 10000,
              height: 10000,
              left: -5000,
              top: -5000,
              overflow: 'visible',
              pointerEvents: 'none',
            }}
          >
            <g transform="translate(5000, 5000)">
              {/* Render connections */}
              {connections.map(conn => {
                // Find source node (keyframe or region)
                const fromKf = conn.fromType !== 'region' ? keyframes.find(kf => kf.id === conn.from) : null;
                const fromRegion = conn.fromType === 'region' ? regions.find(r => r.id === conn.from) : null;
                // Find target node (keyframe or region)
                const toKf = conn.toType !== 'region' ? keyframes.find(kf => kf.id === conn.to) : null;
                const toRegion = conn.toType === 'region' ? regions.find(r => r.id === conn.to) : null;
                
                if ((!fromKf && !fromRegion) || (!toKf && !toRegion)) return null;

                return (
                  <FlowEdge
                    key={conn.id}
                    connection={conn}
                    fromKeyframe={fromKf || undefined}
                    fromRegion={fromRegion || undefined}
                    toKeyframe={toKf || undefined}
                    toRegion={toRegion || undefined}
                    isSelected={selectedConnectionIds.includes(conn.id)}
                    onClick={() => selectConnection(conn.id)}
                  />
                );
              })}

              {/* Connection preview */}
              {connectionPreview && (
                <FlowEdgePreview
                  fromKeyframe={keyframes.find(kf => kf.id === connectionPreview.startId)}
                  fromRegion={regions.find(r => r.id === connectionPreview.startId)}
                  endX={connectionPreview.endX}
                  endY={connectionPreview.endY}
                />
              )}
            </g>
          </svg>

          {/* Drawing region preview */}
          {drawingRegion && (
            <div
              className="absolute border-2 border-dashed border-[#34B27B] bg-[#34B27B]/10 rounded-lg pointer-events-none"
              style={{
                left: Math.min(drawingRegion.startX, drawingRegion.endX),
                top: Math.min(drawingRegion.startY, drawingRegion.endY),
                width: Math.abs(drawingRegion.endX - drawingRegion.startX),
                height: Math.abs(drawingRegion.endY - drawingRegion.startY),
              }}
            />
          )}
        </div>

        {/* Empty state */}
        {keyframes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-slate-400">
              <p className="text-lg mb-2">暂无关键帧</p>
              <p className="text-sm">请先在视频编辑器中提取关键帧</p>
            </div>
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="absolute bottom-4 left-4 text-xs text-slate-500">
        <span>V 选择 • R 绘制区域 • 拖拽移动 • 从右侧拖出连线 • Cmd+Z 撤销 • Cmd+Shift+Z 重做</span>
      </div>
    </div>
  );
}

export default FlowEditor;
